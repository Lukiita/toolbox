#!/usr/bin/env python3
"""Trigger eval for ddd-tactical's description, against the skills really installed.

Maintainer tooling: it lives outside skills/ so no project install carries it; a skill
folder holds only what the skill needs to work.

Each query runs in `claude -p` inside a throwaway copy of a small project and the run
records every skill the agent loads. A query names its project in `fixture`: the
TypeScript one (trigger-fixture.json, the default) or the Java/Spring Boot one
(trigger-fixture-java.json), so a Java phrase meets a Java codebase. The installed
skills compete as they do in daily use, so a miss can be a neighbour winning: the
report prints which skill each run loaded.

What it measures: the GLOBAL install (`~/.claude/skills`), since every run starts in a
fresh temporary folder that holds no project copy. Install the description under test
there first. The runs also load the user's global CLAUDE.md/AGENTS.md, on purpose: the
eval measures the skill in daily use, so a score is tied to that setup.

Why the fixture, not an empty folder: a query like "the rule is scattered in the billing
service" makes the agent look for that service first; in an empty folder it asks where
the code is and never reaches the skill (5 of 6 false misses, 2026-11-21). It is packed
as one JSON, not as source files, so the fake project stays out of the toolbox's own
prettier and lint runs, and its deliberately anemic code is never mistaken for real code.
Why Sonnet by default: Haiku barely loads any skill, neighbours included, so it measures
the model, not the description (same date).

Why --transcripts: a score says THAT a query missed, not why. A miss has three causes
that call for different fixes - the agent answered directly (the description never
looked relevant), explored until --max-turns (relevant, but the files came first), or
loaded a neighbour (the descriptions overlap) - and only the run's steps tell them
apart. A run that loads the target is cut short there, so its transcript ends at the hit.
A transcript holds the agent's own text and the tool inputs, local paths included, and
the runs load the user's global CLAUDE.md: write them under a `runs/` folder, which git
ignores anywhere in the repo, or outside it - never where a commit picks them up.

Usage:
    python3 -I run_triggers.py                        # all queries, 3 runs each
    python3 -I run_triggers.py --ids 9,10 --runs 5 --out result.json
    python3 -I run_triggers.py --ids 9 --runs 5 --transcripts runs/q9   # one JSON per run
"""

import argparse
import json
import os
import select
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterator, TypedDict

TARGET_SKILL = "ddd-tactical"
HERE = Path(__file__).resolve().parent
QUERIES_FILE = HERE / "triggers.json"
FIXTURE_FILES = {"typescript": HERE / "trigger-fixture.json", "java": HERE / "trigger-fixture-java.json"}
DEFAULT_FIXTURE = "typescript"
# Writing tools are removed so no run edits the fixture; the trigger decision comes first anyway.
DISALLOWED_TOOLS = ["Bash", "Write", "Edit", "NotebookEdit"]
# Reaching --max-turns is an answer (the agent explored and never loaded the skill);
# any other error result (rate limit, overload, auth) measured nothing.
MAX_TURNS_SUBTYPE = "error_max_turns"
# How a run ended when no `result` event says it: the runner stopped it on the hit, the
# output ended (or the timeout passed) first, or `claude` never started.
TARGET_LOADED = "target_loaded"
NO_RESULT = "no_result"
NOT_STARTED = "not_started"

Event = dict[str, object]
# One thing the agent did, in order: {"tool": name, "input": {...}}, {"text": ...} or {"thinking": ...},
# plus its "turn" - or "subagent_call" when a subagent did it.
Step = dict[str, object]


class _TriggerQueryKeys(TypedDict):
    id: int
    should_trigger: bool
    query: str


# total=False: `fixture` may be absent (Python 3.10 has no NotRequired); absent means DEFAULT_FIXTURE.
class TriggerQuery(_TriggerQueryKeys, total=False):
    fixture: str


class QueryResult(TriggerQuery):
    hits: int
    runs: int
    invalid: int
    inconclusive: bool
    passed: bool
    loaded: list[list[str]]


@dataclass(frozen=True)
class RunSettings:
    model: str
    timeout: int


@dataclass(frozen=True)
class RunJob:
    query: TriggerQuery
    run: int  # 1-based, names the transcript file


def fixture_of(query: TriggerQuery) -> str:
    """The project a query runs in; a query that names none runs in the TypeScript one."""
    return query.get("fixture", DEFAULT_FIXTURE)


def load_queries(ids: set[int]) -> list[TriggerQuery]:
    queries: list[TriggerQuery] = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))
    unknown = ids - {query["id"] for query in queries}
    if unknown:
        sys.exit(f"unknown query ids {sorted(unknown)}, expected ids from {QUERIES_FILE.name}")
    unknown_fixtures = {fixture_of(query) for query in queries} - FIXTURE_FILES.keys()
    if unknown_fixtures:
        sys.exit(f"unknown fixtures {sorted(unknown_fixtures)}, expected one of {sorted(FIXTURE_FILES)}")
    return [query for query in queries if not ids or query["id"] in ids]


def materialize_fixture(target: Path, fixture: str) -> None:
    files: dict[str, str] = json.loads(FIXTURE_FILES[fixture].read_text(encoding="utf-8"))
    for relative, content in files.items():
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def claude_command(query: str, settings: RunSettings) -> list[str]:
    return [
        "claude", "-p", query, "--model", settings.model,
        "--output-format", "stream-json", "--verbose",
        "--max-turns", "5",
        "--disallowedTools", *DISALLOWED_TOOLS,
        # No MCP servers and no hooks: faster start, and no memory hook records the runs.
        "--strict-mcp-config",
        "--settings", json.dumps({"disableAllHooks": True}),
    ]


def read_chunk(proc: subprocess.Popen[bytes]) -> str | None:
    """The next piece of output: "" while none arrived yet, None once the output ended."""
    assert proc.stdout is not None  # Popen below always sets stdout=PIPE
    ready, _, _ = select.select([proc.stdout], [], [], 1.0)
    if not ready:
        return None if proc.poll() is not None else ""
    chunk = os.read(proc.stdout.fileno(), 65536)
    return chunk.decode("utf-8", errors="replace") if chunk else None


def parse_event(line: str) -> Event | None:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return None  # claude -p can print non-JSON noise; only events matter here
    return event if isinstance(event, dict) else None


def stream_events(proc: subprocess.Popen[bytes], timeout: int) -> Iterator[Event]:
    """Yield each JSON event `claude -p` prints until its output ends or the timeout passes."""
    buffer = ""
    deadline = time.time() + timeout
    while time.time() < deadline and (chunk := read_chunk(proc)) is not None:
        lines = (buffer + chunk).split("\n")
        buffer = lines.pop()
        yield from (event for event in map(parse_event, lines) if event is not None)


def skill_of_tool_call(item: object) -> str:
    """The skill a tool call loads (a Skill call, or a Read of some SKILL.md), else ""."""
    if not isinstance(item, dict) or item.get("type") != "tool_use":
        return ""
    tool_input = item.get("input") if isinstance(item.get("input"), dict) else {}
    if item.get("name") == "Skill":
        return str(tool_input.get("skill", ""))
    file_path = str(tool_input.get("file_path", ""))
    return Path(file_path).parent.name if item.get("name") == "Read" and file_path.endswith("SKILL.md") else ""


def assistant_message(event: Event) -> dict[str, object]:
    message = event.get("message")
    return message if event.get("type") == "assistant" and isinstance(message, dict) else {}


def assistant_blocks(event: Event) -> list[object]:
    """The content blocks of an assistant message (text, thinking, tool calls); [] for any other event."""
    content = assistant_message(event).get("content", [])
    return content if isinstance(content, list) else []


def skills_in_event(event: Event) -> list[str]:
    return [skill for skill in map(skill_of_tool_call, assistant_blocks(event)) if skill]


def step_of_block(block: object) -> Step | None:
    """A content block as a transcript step; None for a block that is not something the agent did."""
    if not isinstance(block, dict):
        return None
    if block.get("type") == "tool_use":
        return {"tool": block.get("name"), "input": block.get("input")}
    # `claude -p` streams thinking blocks with their text redacted to ""; an empty step says nothing.
    if block.get("type") in ("text", "thinking") and block.get(block["type"]):
        return {block["type"]: block[block["type"]]}
    return None


def run_measured_something(result_event: Event) -> bool:
    return not result_event.get("is_error") or result_event.get("subtype") == MAX_TURNS_SUBTYPE


@dataclass
class RunTrace:
    """One run as it happened: the skills it loaded, its steps in order, and how it ended.

    Each step carries its `turn`, so a transcript shows how late the skill loaded, not
    only whether it did: --max-turns cuts a run that explores first, and a late load
    is the miss waiting to happen. `measured` stays False when the run proves nothing
    either way (no result before the timeout, an API error, no start); summarize()
    leaves those runs out of the vote.
    """

    loaded: list[str] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    final_answer: str = ""
    ending: str = NO_RESULT
    measured: bool = False
    turn_message_ids: list[str] = field(default_factory=list)  # one per turn, in order

    def record(self, event: Event) -> None:
        self.loaded += skills_in_event(event)
        steps = [step for step in map(step_of_block, assistant_blocks(event)) if step]
        # --verbose streams a subagent's messages too, each with its own message id: they are
        # kept, tagged with the call that spawned them, and never counted as turns of the run.
        subagent_call = event.get("parent_tool_use_id")
        if subagent_call:
            self.steps += [{"subagent_call": subagent_call, **step} for step in steps]
        elif steps:
            self.count_turn(str(assistant_message(event).get("id") or ""))
            self.steps += [{"turn": len(self.turn_message_ids), **step} for step in steps]

    def count_turn(self, message_id: str) -> None:
        """One API response is one turn; its blocks can arrive as separate events that share
        the message id, so parallel tool calls stay in one turn."""
        if not message_id or not self.turn_message_ids or self.turn_message_ids[-1] != message_id:
            self.turn_message_ids.append(message_id)

    def finish(self, ending: str, measured: bool, final_answer: str = "") -> "RunTrace":
        """Close the trace; with no final answer given, the agent's last text stands in for it."""
        texts = [str(step["text"]) for step in self.steps if "text" in step and "turn" in step]
        self.ending, self.measured = ending, measured
        self.final_answer = final_answer or (texts[-1] if texts else "")
        return self


def watch_run(proc: subprocess.Popen[bytes], timeout: int) -> RunTrace:
    """What the run did, cut short as soon as it loads the target skill.

    A hit is final as soon as it shows up. Otherwise the run counts only once its
    `result` event arrives and is not an API error; a run killed by the timeout (a slow
    startup on WSL takes ~50 s) proves nothing either way.
    """
    trace = RunTrace()
    for event in stream_events(proc, timeout):
        trace.record(event)
        if TARGET_SKILL in trace.loaded:
            return trace.finish(TARGET_LOADED, measured=True)
        if event.get("type") == "result":
            answer = str(event.get("result") or "")
            return trace.finish(str(event.get("subtype")), run_measured_something(event), answer)
    return trace.finish(NO_RESULT, measured=False)


def stop_process(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None:
        return
    if proc.poll() is None:
        proc.kill()
    proc.wait()


def run_query(query: TriggerQuery, settings: RunSettings) -> RunTrace:
    workdir = Path(tempfile.mkdtemp(prefix="ddd-trigger-"))
    proc: subprocess.Popen[bytes] | None = None
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    try:
        materialize_fixture(workdir, fixture_of(query))
        proc = subprocess.Popen(claude_command(query["query"], settings), stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=workdir, env=env)
        return watch_run(proc, settings.timeout)
    except OSError as error:  # e.g. `claude` not on PATH: one invalid run, not a crashed eval
        print(f"run could not start: {error}", file=sys.stderr)
        return RunTrace().finish(NOT_STARTED, measured=False)
    finally:
        stop_process(proc)
        shutil.rmtree(workdir, ignore_errors=True)


def summarize(query: TriggerQuery, traces: list[RunTrace]) -> QueryResult:
    """Majority vote over the valid runs; a tie (or no valid run) is inconclusive, never a pass."""
    valid = [trace.loaded for trace in traces if trace.measured]
    hits = sum(TARGET_SKILL in loaded for loaded in valid)
    misses = len(valid) - hits
    inconclusive = hits == misses
    passed = not inconclusive and (hits > misses) == query["should_trigger"]
    return {**query, "hits": hits, "runs": len(valid), "invalid": len(traces) - len(valid),
            "inconclusive": inconclusive, "passed": passed, "loaded": valid}


def save_transcripts(folder: Path, jobs: list[RunJob], traces: list[RunTrace]) -> None:
    """One JSON per run, q<id>-run<n>.json; a folder reused by a later eval is overwritten, not mixed."""
    folder.mkdir(parents=True, exist_ok=True)
    for stale in folder.glob("q*-run*.json"):
        stale.unlink()
    for job, trace in zip(jobs, traces):
        transcript = {"id": job.query["id"], "fixture": fixture_of(job.query), "query": job.query["query"],
                      "run": job.run, **asdict(trace)}
        path = folder / f"q{job.query['id']:02d}-run{job.run}.json"
        path.write_text(json.dumps(transcript, indent=2, ensure_ascii=False), encoding="utf-8")


def print_report(results: list[QueryResult]) -> None:
    for result in results:
        verdict = "TIE " if result["inconclusive"] else "PASS" if result["passed"] else "FAIL"
        expect = "yes" if result["should_trigger"] else "no "
        print(f"[{verdict}] {result['id']:>2} {fixture_of(result):<10} {result['hits']}/{result['runs']} invalid={result['invalid']} "
              f"expect={expect} {result['query'][:60]} | {result['loaded']}")
    print(f"passed {sum(result['passed'] for result in results)}/{len(results)}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ids", default="", help="comma-separated query ids (default: all)")
    parser.add_argument("--runs", type=int, default=3, help="runs per query; odd avoids ties")
    parser.add_argument("--model", default="sonnet", help="model alias for claude -p")
    parser.add_argument("--timeout", type=int, default=300, help="seconds per run, startup included")
    parser.add_argument("--workers", type=int, default=3, help="parallel runs; more slows each startup")
    parser.add_argument("--out", default="", help="write the full results as JSON here")
    parser.add_argument("--transcripts", default="", help="save one JSON per run here: its steps and final answer")
    return parser.parse_args()


def main() -> None:
    args = parse_arguments()
    settings = RunSettings(model=args.model, timeout=args.timeout)
    queries = load_queries({int(i) for i in args.ids.split(",") if i})
    jobs = [RunJob(query, run) for query in queries for run in range(1, args.runs + 1)]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        traces = list(pool.map(lambda job: run_query(job.query, settings), jobs))
    results = [summarize(query, [trace for job, trace in zip(jobs, traces) if job.query is query]) for query in queries]
    print_report(results)
    if args.transcripts:
        save_transcripts(Path(args.transcripts), jobs, traces)
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    sys.exit(0 if all(result["passed"] for result in results) else 1)


if __name__ == "__main__":
    main()

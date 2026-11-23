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

Usage:
    python3 -I run_triggers.py                        # all queries, 3 runs each
    python3 -I run_triggers.py --ids 9,10 --runs 5 --out result.json
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
from dataclasses import dataclass
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

Event = dict[str, object]


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


def skills_in_event(event: Event) -> list[str]:
    message = event.get("message")
    if event.get("type") != "assistant" or not isinstance(message, dict):
        return []
    return [skill for skill in map(skill_of_tool_call, message.get("content", [])) if skill]


def run_measured_something(result_event: Event) -> bool:
    return not result_event.get("is_error") or result_event.get("subtype") == MAX_TURNS_SUBTYPE


def watch_run(proc: subprocess.Popen[bytes], timeout: int) -> list[str] | None:
    """Skills the run loaded, or None when it never reached a usable answer.

    A hit is final as soon as it shows up. Otherwise the run counts only once its
    `result` event arrives and is not an API error; a run killed by the timeout (a slow
    startup on WSL takes ~50 s) proves nothing either way.
    """
    loaded: list[str] = []
    for event in stream_events(proc, timeout):
        loaded += skills_in_event(event)
        if TARGET_SKILL in loaded:
            return loaded
        if event.get("type") == "result":
            return loaded if run_measured_something(event) else None
    return None


def stop_process(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None:
        return
    if proc.poll() is None:
        proc.kill()
    proc.wait()


def skills_loaded(query: TriggerQuery, settings: RunSettings) -> list[str] | None:
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
        return None
    finally:
        stop_process(proc)
        shutil.rmtree(workdir, ignore_errors=True)


def summarize(query: TriggerQuery, outcomes: list[list[str] | None]) -> QueryResult:
    """Majority vote over the valid runs; a tie (or no valid run) is inconclusive, never a pass."""
    valid = [loaded for loaded in outcomes if loaded is not None]
    hits = sum(TARGET_SKILL in loaded for loaded in valid)
    misses = len(valid) - hits
    inconclusive = hits == misses
    passed = not inconclusive and (hits > misses) == query["should_trigger"]
    return {**query, "hits": hits, "runs": len(valid), "invalid": len(outcomes) - len(valid),
            "inconclusive": inconclusive, "passed": passed, "loaded": valid}


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
    return parser.parse_args()


def main() -> None:
    args = parse_arguments()
    settings = RunSettings(model=args.model, timeout=args.timeout)
    queries = load_queries({int(i) for i in args.ids.split(",") if i})
    jobs = [query for query in queries for _ in range(args.runs)]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        outcomes = list(pool.map(lambda job: skills_loaded(job, settings), jobs))
    results = [summarize(query, [o for job, o in zip(jobs, outcomes) if job is query]) for query in queries]
    print_report(results)
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    sys.exit(0 if all(result["passed"] for result in results) else 1)


if __name__ == "__main__":
    main()

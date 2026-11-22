#!/usr/bin/env python3
"""Trigger eval for ddd-tactical's description, against the skills really installed.

Each query runs in `claude -p` inside a throwaway copy of a small TypeScript project
(trigger-fixture.json) and the run records every skill the agent loads. The installed
skills compete as they do in daily use, so a miss can be a neighbour winning — the
report prints which skill each run loaded.

It measures the ddd-tactical that `claude` loads (the global install or the project's
copy), not this folder: install the description under test first.

Why the fixture, not an empty folder: a query like "the rule is scattered in the
billing service" makes the agent look for that service first; in an empty folder it
asks where the code is and never reaches the skill (5 of 6 false misses, 2026-11-21).
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
from pathlib import Path
from typing import Iterator, TypedDict

TARGET_SKILL = "ddd-tactical"
HERE = Path(__file__).resolve().parent
QUERIES_FILE = HERE / "triggers.json"
FIXTURE_FILE = HERE / "trigger-fixture.json"
# Writing tools are removed so no run edits the fixture; the trigger decision comes first anyway.
DISALLOWED_TOOLS = ["Bash", "Write", "Edit", "NotebookEdit"]


class TriggerQuery(TypedDict):
    id: int
    should_trigger: bool
    query: str


class QueryResult(TypedDict):
    id: int
    should_trigger: bool
    query: str
    hits: int
    runs: int
    invalid: int
    passed: bool
    loaded: list[list[str]]


def load_queries(ids: set[int]) -> list[TriggerQuery]:
    queries: list[TriggerQuery] = json.loads(QUERIES_FILE.read_text())
    if not ids:
        return queries
    unknown = ids - {q["id"] for q in queries}
    if unknown:
        sys.exit(f"unknown query ids {sorted(unknown)}, expected ids from {QUERIES_FILE.name}")
    return [q for q in queries if q["id"] in ids]


def materialize_fixture(target: Path) -> None:
    files: dict[str, str] = json.loads(FIXTURE_FILE.read_text())
    for relative, content in files.items():
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


def claude_command(query: str, model: str) -> list[str]:
    return [
        "claude", "-p", query, "--model", model,
        "--output-format", "stream-json", "--verbose",
        "--max-turns", "5",
        "--disallowedTools", *DISALLOWED_TOOLS,
        # No MCP servers and no hooks: faster start, and no memory hook records the runs.
        "--strict-mcp-config",
        "--settings", json.dumps({"disableAllHooks": True}),
    ]


def stream_events(proc: subprocess.Popen[bytes], timeout: int) -> Iterator[dict[str, object]]:
    """Yield each JSON event `claude -p` prints until it exits or the timeout passes."""
    buffer = ""
    deadline = time.time() + timeout
    while time.time() < deadline:
        ready, _, _ = select.select([proc.stdout], [], [], 1.0)
        if not ready:
            if proc.poll() is not None:
                return
            continue
        chunk = os.read(proc.stdout.fileno(), 65536)  # type: ignore[union-attr]
        if not chunk:
            return
        buffer += chunk.decode("utf-8", errors="replace")
        lines = buffer.split("\n")
        buffer = lines.pop()
        for line in lines:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue  # claude -p can print non-JSON noise; only events matter here


def skills_in_event(event: dict[str, object]) -> list[str]:
    """Skills an assistant event loads: a Skill call, or a Read of some SKILL.md."""
    message = event.get("message")
    content = message.get("content", []) if isinstance(message, dict) else []
    found: list[str] = []
    for item in (c for c in content if c.get("type") == "tool_use"):
        tool_input = item.get("input", {})
        if item.get("name") == "Skill":
            found.append(str(tool_input.get("skill", "")))
        elif item.get("name") == "Read" and str(tool_input.get("file_path", "")).endswith("SKILL.md"):
            found.append(Path(tool_input["file_path"]).parent.name)
    return found


def skills_loaded(query: str, model: str, timeout: int) -> list[str] | None:
    """Skills one run loaded, or None when the run never got a model answer (invalid).

    A run killed during `claude`'s startup (slow on WSL, ~50 s) proves nothing, so it is
    reported apart instead of counting as a miss.
    """
    workdir = Path(tempfile.mkdtemp(prefix="ddd-trigger-"))
    materialize_fixture(workdir)
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    proc = subprocess.Popen(claude_command(query, model), stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, cwd=workdir, env=env)
    loaded: list[str] = []
    answered = False
    try:
        for event in stream_events(proc, timeout):
            answered = answered or event.get("type") in ("assistant", "result")
            loaded += skills_in_event(event) if event.get("type") == "assistant" else []
            if TARGET_SKILL in loaded:
                break
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
        shutil.rmtree(workdir, ignore_errors=True)
    return loaded if answered else None


def summarize(query: TriggerQuery, outcomes: list[list[str] | None]) -> QueryResult:
    valid = [o for o in outcomes if o is not None]
    hits = sum(TARGET_SKILL in o for o in valid)
    triggered = bool(valid) and hits / len(valid) >= 0.5
    return {**query, "hits": hits, "runs": len(valid), "invalid": len(outcomes) - len(valid),
            "passed": bool(valid) and triggered == query["should_trigger"], "loaded": valid}


def print_report(results: list[QueryResult]) -> None:
    for r in results:
        verdict = "PASS" if r["passed"] else "FAIL"
        expect = "yes" if r["should_trigger"] else "no "
        print(f"[{verdict}] {r['id']:>2} {r['hits']}/{r['runs']} invalid={r['invalid']} "
              f"expect={expect} {r['query'][:60]} | {r['loaded']}")
    print(f"passed {sum(r['passed'] for r in results)}/{len(results)}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ids", default="", help="comma-separated query ids (default: all)")
    parser.add_argument("--runs", type=int, default=3, help="runs per query")
    parser.add_argument("--model", default="sonnet", help="model alias for claude -p")
    parser.add_argument("--timeout", type=int, default=300, help="seconds per run, startup included")
    parser.add_argument("--workers", type=int, default=3, help="parallel runs; more slows each startup")
    parser.add_argument("--out", default="", help="write the full results as JSON here")
    return parser.parse_args()


def main() -> None:
    args = parse_arguments()
    queries = load_queries({int(i) for i in args.ids.split(",") if i})
    jobs = [q for q in queries for _ in range(args.runs)]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        outcomes = list(pool.map(lambda q: skills_loaded(q["query"], args.model, args.timeout), jobs))
    results = [summarize(q, [o for j, o in zip(jobs, outcomes) if j is q]) for q in queries]
    print_report(results)
    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2, ensure_ascii=False))
    sys.exit(0 if all(r["passed"] for r in results) else 1)


if __name__ == "__main__":
    main()

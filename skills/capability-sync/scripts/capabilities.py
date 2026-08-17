#!/usr/bin/env python3
"""
capabilities.py — deterministic structure gate for the capability-sync layer.

The LLM supplies judgment (which verified behavior belongs to which capability,
how to phrase a requirement). This script owns the mechanical part: verifying
that every capability file in `.specs/capabilities/` follows the canonical
Requirement/Scenario format. Format drift is silent by nature — a missing
scenario or a requirement without a normative statement never fails loudly on
its own. This gate makes it loud.

Canonical format (one capability per file, owned by the capability-sync skill):

    # <capability-name>              <- H1 == filename stem, kebab-case
    ## Purpose                       <- 1-3 sentences, non-empty
    ## Requirements
    ### Requirement: <name>          <- >=1 per file; statement uses SHALL/MUST
    #### Scenario: <name>            <- >=1 per requirement; WHEN + THEN present

Pure standard library. No dependencies. Run from the project root (the dir
that contains .specs), or pass --root. Mirrors scripts/lessons.py from
tlc-spec-driven: same design language, same exit codes.

Commands:
  check      Validate every capability file. Exit 0 = OK, 2 = violations.
  list       One line per capability with requirement/scenario counts.
  init       Create the .specs/capabilities/ directory.

Exit codes: 0 ok, 2 validation/usage error.
"""

import argparse
import os
import re
import sys

CAPS_REL = os.path.join(".specs", "capabilities")

FILENAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.md$")
NORMATIVE_RE = re.compile(r"\b(SHALL|MUST)\b")
WHEN_RE = re.compile(r"\bWHEN\b")
THEN_RE = re.compile(r"\bTHEN\b")


def _caps_dir(root):
    return os.path.join(root, CAPS_REL)


def _capability_files(caps_dir):
    return sorted(
        f for f in os.listdir(caps_dir)
        if f.endswith(".md") and os.path.isfile(os.path.join(caps_dir, f))
    )


class _FileCheck:
    """Line-based state machine over one capability file."""

    def __init__(self, path, relpath):
        self.path = path
        self.relpath = relpath
        self.errors = []  # (line_number, message)
        self.requirements = 0
        self.scenarios = 0

    def err(self, line_no, msg):
        self.errors.append((line_no, msg))

    def run(self):
        with open(self.path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()

        stem = os.path.splitext(os.path.basename(self.path))[0]
        if not FILENAME_RE.match(os.path.basename(self.path)):
            self.err(0, "filename must be kebab-case (a-z, 0-9, hyphens)")

        h1_lines = []          # (line_no, text)
        section = None         # current H2 section title
        purpose_body = False   # Purpose has at least one non-empty body line
        has_requirements_section = False
        req_names = {}         # name -> line_no (dedup per file)
        current_req = None     # dict(name, line_no, statement_lines, scenarios)
        current_scn = None     # dict(name, line_no, body)
        in_fence = False

        def close_scenario():
            nonlocal current_scn
            if current_scn is None:
                return
            body = "\n".join(current_scn["body"])
            if not WHEN_RE.search(body):
                self.err(current_scn["line_no"], f"scenario '{current_scn['name']}' has no WHEN")
            if not THEN_RE.search(body):
                self.err(current_scn["line_no"], f"scenario '{current_scn['name']}' has no THEN")
            current_scn = None

        def close_requirement():
            nonlocal current_req
            close_scenario()
            if current_req is None:
                return
            statement = "\n".join(current_req["statement_lines"])
            if not NORMATIVE_RE.search(statement):
                self.err(
                    current_req["line_no"],
                    f"requirement '{current_req['name']}' has no normative statement (SHALL/MUST)",
                )
            if current_req["scenarios"] == 0:
                self.err(
                    current_req["line_no"],
                    f"requirement '{current_req['name']}' has no scenario",
                )
            current_req = None

        for i, raw in enumerate(lines, start=1):
            line = raw.rstrip()

            if line.lstrip().startswith("```"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue

            if re.match(r"^#{5,}\s", line):
                self.err(i, "heading level too deep (H5+ is not part of the format)")
                continue

            if line.startswith("# ") and not line.startswith("## "):
                h1_lines.append((i, line[2:].strip()))
                continue

            if line.startswith("## ") and not line.startswith("### "):
                close_requirement()
                section = line[3:].strip()
                if section == "Requirements":
                    has_requirements_section = True
                continue

            if line.startswith("### ") and not line.startswith("#### "):
                close_requirement()
                m = re.match(r"^### Requirement:\s*(.*)$", line)
                if not m:
                    if section == "Requirements":
                        self.err(i, f"H3 inside Requirements must be '### Requirement: <name>' (got '{line}')")
                    continue
                if section != "Requirements":
                    self.err(i, "'### Requirement:' outside the '## Requirements' section")
                name = m.group(1).strip()
                if not name:
                    self.err(i, "requirement has an empty name")
                    name = f"<unnamed@{i}>"
                if name in req_names:
                    self.err(i, f"duplicate requirement name '{name}' (first at line {req_names[name]})")
                else:
                    req_names[name] = i
                self.requirements += 1
                current_req = {"name": name, "line_no": i, "statement_lines": [], "scenarios": 0}
                continue

            if line.startswith("#### "):
                m = re.match(r"^#### Scenario:\s*(.*)$", line)
                if not m:
                    self.err(i, f"H4 must be '#### Scenario: <name>' (got '{line}')")
                    continue
                if current_req is None:
                    self.err(i, "'#### Scenario:' outside a requirement")
                    continue
                close_scenario()
                name = m.group(1).strip()
                if not name:
                    self.err(i, "scenario has an empty name")
                    name = f"<unnamed@{i}>"
                if name in current_req.setdefault("scenario_names", {}):
                    self.err(i, f"duplicate scenario name '{name}' in requirement '{current_req['name']}'")
                else:
                    current_req["scenario_names"][name] = i
                current_req["scenarios"] += 1
                self.scenarios += 1
                current_scn = {"name": name, "line_no": i, "body": []}
                continue

            # Plain content line: route to whichever block is open.
            if current_scn is not None:
                current_scn["body"].append(line)
            elif current_req is not None:
                current_req["statement_lines"].append(line)
            elif section == "Purpose" and line.strip():
                purpose_body = True

        close_requirement()

        if len(h1_lines) != 1:
            self.err(h1_lines[1][0] if len(h1_lines) > 1 else 0, f"expected exactly one H1, found {len(h1_lines)}")
        elif h1_lines[0][1] != stem:
            self.err(h1_lines[0][0], f"H1 '{h1_lines[0][1]}' must equal the filename stem '{stem}'")

        if not purpose_body:
            self.err(0, "missing or empty '## Purpose' section")
        if not has_requirements_section:
            self.err(0, "missing '## Requirements' section")
        elif self.requirements == 0:
            self.err(0, "capability has no requirement (needs >=1 '### Requirement:')")

        return self.errors


def cmd_check(root, args):
    caps_dir = _caps_dir(root)
    if not os.path.isdir(caps_dir):
        print(f"ERROR: {os.path.relpath(caps_dir, root)} not found. Run 'capabilities.py init' first.", file=sys.stderr)
        return 2
    files = _capability_files(caps_dir)
    if not files:
        print("OK: 0 capabilities (empty directory)")
        return 0

    total_errors = 0
    total_reqs = 0
    total_scns = 0
    for fname in files:
        fc = _FileCheck(os.path.join(caps_dir, fname), os.path.join(CAPS_REL, fname))
        errors = fc.run()
        total_reqs += fc.requirements
        total_scns += fc.scenarios
        for line_no, msg in sorted(errors):
            loc = f"{fc.relpath}:{line_no}" if line_no else fc.relpath
            print(f"{loc}: {msg}", file=sys.stderr)
        total_errors += len(errors)

    if total_errors:
        print(f"FAIL: {total_errors} error(s) across {len(files)} file(s)", file=sys.stderr)
        return 2
    print(f"OK: {len(files)} capabilities, {total_reqs} requirements, {total_scns} scenarios")
    return 0


def cmd_list(root, args):
    caps_dir = _caps_dir(root)
    if not os.path.isdir(caps_dir):
        print(f"ERROR: {os.path.relpath(caps_dir, root)} not found. Run 'capabilities.py init' first.", file=sys.stderr)
        return 2
    files = _capability_files(caps_dir)
    if not files:
        print("(no capabilities)")
        return 0
    total_reqs = 0
    total_scns = 0
    for fname in files:
        fc = _FileCheck(os.path.join(caps_dir, fname), os.path.join(CAPS_REL, fname))
        fc.run()
        total_reqs += fc.requirements
        total_scns += fc.scenarios
        print(f"{os.path.splitext(fname)[0]}  requirements={fc.requirements} scenarios={fc.scenarios}")
    print(f"total: {len(files)} capabilities, {total_reqs} requirements, {total_scns} scenarios")
    return 0


def cmd_init(root, args):
    caps_dir = _caps_dir(root)
    os.makedirs(caps_dir, exist_ok=True)
    print(f"Initialized {caps_dir}")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="capabilities.py", description="Deterministic structure gate for .specs/capabilities/.")
    p.add_argument("--root", default=".", help="Project root containing .specs/ (default: current dir)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("check", help="Validate every capability file (exit 0 ok, 2 violations)")
    sp.set_defaults(fn=cmd_check)

    sp = sub.add_parser("list", help="One line per capability with counts")
    sp.set_defaults(fn=cmd_list)

    sp = sub.add_parser("init", help="Create the .specs/capabilities/ directory")
    sp.set_defaults(fn=cmd_init)

    args = p.parse_args(argv)
    root = os.path.abspath(args.root)
    return args.fn(root, args)


if __name__ == "__main__":
    raise SystemExit(main())

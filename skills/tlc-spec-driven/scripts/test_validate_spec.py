#!/usr/bin/env python3
"""
Tests for validate_spec.py - stdlib unittest, zero dependencies, like the script.

Run from the repo root:
  python3 -m unittest discover -s skills/tlc-spec-driven/scripts -p 'test_*.py'

Provenance: toolbox issue #9. The AC scan closed its block on the first blank
line, and every markdown formatter puts one between the header and the list, so
the SHALL check never ran on a formatted spec. A second blindness of the same
family: the header regex only matched the bare `**Acceptance Criteria**:`, and
the skill's own P1 template writes `**Acceptance Criteria** (each line is one
EARS pattern):`, so the block never opened there either.
"""

import os
import tempfile
import unittest

from validate_spec import check

VALID_AC = "WHEN the user submits the form THEN the system SHALL save it _(FORM-01)_"
AC_WITHOUT_SHALL = "The kernel returns something nice and we trust it _(FORM-99)_"


def spec_with_story(header, gap, criteria, trailing=""):
    """A minimal spec that passes every check except what the story carries.

    `gap` is the text between the header and the numbered list ("" or "\\n").
    `trailing` is appended after the story, before the traceability section.
    """
    numbered = "\n".join(f"{i}. {c}" for i, c in enumerate(criteria, start=1))
    return f"""# Feature: Form

## Problem Statement

People lose forms.

## Out of Scope

- Printing.

## Assumptions & Open Questions

| Assumption | Chosen default | Rationale |
| ---------- | -------------- | --------- |
| Users are logged in | yes | the form lives behind auth |

Open questions: none

## User Stories

### P1: Save a form

**User Story**: As a user, I want to save so that I keep my work.

{header}
{gap}{numbered}

**Independent Test**: submit and reload.

---
{trailing}
## Requirement Traceability

| ID | Story | Status |
| -- | ----- | ------ |
| FORM-01 | P1 | pending |
"""


def check_text(text):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "spec.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return check(path)


def no_shall_errors(errors):
    return [e for e in errors if "no SHALL" in e]


class AcceptanceCriteriaScan(unittest.TestCase):
    def test_blank_line_after_header_still_flags_a_criterion_without_shall(self):
        errors, _ = check_text(spec_with_story("**Acceptance Criteria**:", "\n", [VALID_AC, AC_WITHOUT_SHALL]))
        flagged = no_shall_errors(errors)
        self.assertEqual(len(flagged), 1, errors)
        self.assertIn("The kernel returns something nice", flagged[0])

    def test_no_blank_line_keeps_flagging_a_criterion_without_shall(self):
        errors, _ = check_text(spec_with_story("**Acceptance Criteria**:", "", [AC_WITHOUT_SHALL]))
        self.assertEqual(len(no_shall_errors(errors)), 1, errors)

    def test_blank_line_with_only_valid_criteria_reports_nothing(self):
        errors, _ = check_text(spec_with_story("**Acceptance Criteria**:", "\n", [VALID_AC]))
        self.assertEqual(errors, [])

    def test_template_header_with_parenthetical_opens_the_block(self):
        header = "**Acceptance Criteria** (each line is one EARS pattern):"
        errors, _ = check_text(spec_with_story(header, "\n", [AC_WITHOUT_SHALL]))
        self.assertEqual(len(no_shall_errors(errors)), 1, errors)

    def test_numbered_lines_of_the_next_section_are_not_criteria(self):
        # "1. ..." under a heading after the story is prose, not an AC.
        trailing = "\n## Notes\n\n1. Ship it before Friday.\n"
        errors, _ = check_text(spec_with_story("**Acceptance Criteria**:", "\n", [VALID_AC], trailing))
        self.assertEqual(no_shall_errors(errors), [])

    def test_numbered_lines_after_independent_test_are_not_criteria(self):
        # "**Independent Test**:" is the terminator that follows every story.
        text = spec_with_story("**Acceptance Criteria**:", "\n", [VALID_AC]).replace(
            "**Independent Test**: submit and reload.", "**Independent Test**: steps\n\n1. Open the page."
        )
        errors, _ = check_text(text)
        self.assertEqual(no_shall_errors(errors), [], errors)

    def test_wrapped_criterion_with_shall_on_a_continuation_line_is_not_flagged(self):
        # A hand-wrapped item is valid markdown: the continuation lines belong
        # to the item, so the SHALL on the second line counts.
        wrapped = "WHEN the user opens the page\n   THEN the system SHALL show the form"
        errors, _ = check_text(spec_with_story("**Acceptance Criteria**:", "\n", [wrapped]))
        self.assertEqual(no_shall_errors(errors), [], errors)

    def test_wrapped_criterion_without_shall_on_any_line_is_flagged_once(self):
        wrapped = "WHEN the user opens the page\n   THEN the form appears"
        errors, _ = check_text(spec_with_story("**Acceptance Criteria**:", "\n", [wrapped]))
        self.assertEqual(len(no_shall_errors(errors)), 1, errors)


if __name__ == "__main__":
    unittest.main()

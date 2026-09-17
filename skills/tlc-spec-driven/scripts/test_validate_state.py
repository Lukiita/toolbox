#!/usr/bin/env python3
"""
Tests for validate_state.py - stdlib unittest, zero dependencies.

Run from the repo root:
  python3 -m unittest discover -s skills/tlc-spec-driven/scripts -p 'test_*.py'

Provenance: toolbox issue #1 (the public repo). The verdict detector read every
`Result:` line, so the discrimination sensor's own `**Result**: N/N killed - PASS`
was taken as the report's verdict: a FAIL report exited 0. Underneath it, the
report template had no verdict line at all - the `## Validation: X - PASS` heading
is the chat summary, not the file - so the 15 real reports across the projects
each invented their own. The standard is now one literal line in the report
header, `**Verdict**: PASS ✅` or `**Verdict**: FAIL ❌`, and nothing else counts.
"""

import os
import tempfile
import unittest

from validate_state import _check_feature, _verdict

HEADER = "# Fee calculation Validation\n\n**Date**: 2026-09-17\n**Verifier**: independent sub-agent\n"
SENSOR_PASS = "\n## Discrimination Sensor\n\n**Result**: 5/5 killed - PASS ✅\n"
EVIDENCE = "\n| WHEN x THEN y | 10 | `src/fee.test.ts:12` - `expect(fee(100)).toBe(10)` | ✅ PASS |\n"


class VerdictLine(unittest.TestCase):
    def test_pass_verdict_line(self):
        self.assertEqual(_verdict(HEADER + "**Verdict**: PASS ✅\n" + SENSOR_PASS), "pass")

    def test_fail_verdict_line_wins_over_a_passing_sensor(self):
        self.assertEqual(_verdict(HEADER + "**Verdict**: FAIL ❌\n" + SENSOR_PASS), "fail")

    def test_template_placeholder_is_unfilled(self):
        self.assertEqual(_verdict(HEADER + "**Verdict**: [PASS ✅ | FAIL ❌]\n"), "unfilled")

    def test_the_sensor_result_alone_is_not_a_verdict(self):
        self.assertIsNone(_verdict(HEADER + SENSOR_PASS))

    def test_the_chat_summary_heading_is_not_the_file_verdict(self):
        self.assertIsNone(_verdict(HEADER + "## Validation: Fee - PASS ✅\n"))

    def test_a_translated_label_is_off_standard(self):
        # One standard: the label is English whatever language the prose is in.
        self.assertIsNone(_verdict(HEADER + "**Veredito**: PASS ✅\n"))

    def test_a_verdict_line_without_the_token_is_no_verdict(self):
        self.assertIsNone(_verdict(HEADER + "**Verdict**: looks fine\n"))

    def test_two_verdict_lines_are_off_standard(self):
        self.assertEqual(_verdict(HEADER + "**Verdict**: PASS ✅\n**Verdict**: FAIL ❌\n"), "duplicated")


class CheckFeature(unittest.TestCase):
    def feature(self, report):
        tmp = tempfile.mkdtemp()
        with open(os.path.join(tmp, "validation.md"), "w", encoding="utf-8") as f:
            f.write(report)
        return tmp

    def test_missing_verdict_line_names_the_exact_line_expected(self):
        errors = _check_feature(self.feature(HEADER + SENSOR_PASS + EVIDENCE), "fee")
        self.assertEqual(len(errors), 1, errors)
        self.assertIn("**Verdict**: PASS ✅", errors[0])
        self.assertIn("sensor", errors[0])

    def test_pass_with_evidence_is_clean(self):
        errors = _check_feature(self.feature(HEADER + "**Verdict**: PASS ✅\n" + SENSOR_PASS + EVIDENCE), "fee")
        self.assertEqual(errors, [])

    def test_fail_is_an_error_even_with_a_passing_sensor(self):
        errors = _check_feature(self.feature(HEADER + "**Verdict**: FAIL ❌\n" + SENSOR_PASS + EVIDENCE), "fee")
        self.assertEqual(len(errors), 1, errors)
        self.assertIn("FAIL", errors[0])


if __name__ == "__main__":
    unittest.main()

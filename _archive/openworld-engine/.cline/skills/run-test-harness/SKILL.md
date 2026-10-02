---
name: run-test-harness
description: Run the Node test suite and summarize results with failures called out.
---

# Run Test Harness

Run `node --test` across the test tree and report pass/fail with any failures
called out by name.

## Steps

1. Confirm the test layout: unit tests in `tests/unit/`, integration tests in
   `tests/integration/`. File naming: `[system]_[feature]_test.js`.
2. Run the harness:
   - `node --test tests/unit/*_test.js tests/integration/*_test.js`
   - If a subfolder pattern is clearer, run per folder instead.
   - No test dependencies are expected; the harness is built-in to Node.
3. Read the output:
   - Total tests, passes, failures, positives/negatives.
   - For any failure: test name, assertion that failed, and the error message.
4. Report:
   - Command run.
   - Summary line: X tests, Y passed, Z failed.
   - For each failure: the test name and the failing assertion text.
   - If everything passed, say so plainly.
5. If there are no tests yet, report that explicitly (not a failure of the
   skill — just the current state). The skill's value is in running whatever
   exists.

## When to use

Use this after implementing logic/integration stories, before `/story-done`.
Per the testing rule, logic stories need a passing automated test to be done;
this skill is how you get the result to verify against.

## Bundled reference

- Testing rule (evidence table + standards): `.cline/rules/03-testing.md`

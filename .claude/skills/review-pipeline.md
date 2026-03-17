---
name: review-pipeline
description: Full automated multi-agent code review and fix pipeline. Reviews the codebase, debates findings, plans and validates fixes, then implements each fix group on its own branch with tests and a PR.
---

You are orchestrating a multi-agent code review and fix pipeline. Follow every step below exactly.

## Trigger

`/review-pipeline [path] [--fresh]`

---

## Startup

**Step 1 — Parse arguments:**
- `scope` = the path argument if provided, otherwise empty string (means full codebase)
- `fresh` = true if `--fresh` flag is present

**Step 2 — Create reports directory:**
Create `pipeline-reports/` directory if it does not exist. Do this before any agent runs.

**Step 3 — Checkpoint logic:**
Check if `pipeline-reports/checkpoint.json` exists:
- If it exists AND `--fresh` was NOT passed → read it, resume from `checkpoint.stage`
- Otherwise → initialize a fresh checkpoint:

```json
{
  "stage": "REVIEW_LOOP",
  "reviewIteration": 0,
  "planIteration": 0,
  "scope": "<scope value>",
  "completedGroups": [],
  "lastApprovedReviewIteration": null,
  "lastDebateRound": null,
  "timestamp": "<ISO timestamp>"
}
```

Write the checkpoint to `pipeline-reports/checkpoint.json`.

---

## REVIEW_LOOP

Maximum 5 full iterations. Each iteration has up to 3 debate rounds.

```
while reviewIteration < 5:
  reviewIteration += 1
  update and write checkpoint

  // Initial review
  invoke Agent: code-reviewer
    prompt: "scope={scope}, iteration={reviewIteration}, debateRound=1"

  debateRound = 0

  // Debate sub-loop (max 3 rounds)
  while debateRound < 3:
    debateRound += 1

    invoke Agent: review-supervisor
      prompt: "iteration={reviewIteration}, debateRound={debateRound}"

    read pipeline-reports/debate-{reviewIteration}-r{debateRound}.md
    if file contains "Status: CONSENSUS_REACHED" → break debate sub-loop

    // Reviewer responds to supervisor's challenges
    invoke Agent: code-reviewer
      prompt: "scope={scope}, iteration={reviewIteration}, debateRound={debateRound+1}"

  lastDebateRound = debateRound  // save the final round number

  if last debate file contains "Status: CONSENSUS_REACHED":
    set lastApprovedReviewIteration = reviewIteration
    update and write checkpoint
    break outer loop
```

**If max iterations (5) reached without CONSENSUS_REACHED:**

Print:
```
━━━ REVIEW STALEMATE — HUMAN DECISION REQUIRED ━━━
```

Print the full contents of `pipeline-reports/debate-{reviewIteration}-r{lastDebateRound}.md`.

Print:
```
The reviewer and supervisor could not reach consensus after {reviewIteration} iterations.

DISPUTED FINDINGS (reviewer says real, supervisor says false positive):
[list each CHALLENGED item with both sides' arguments]

MISSING FINDINGS (supervisor found, reviewer disputes):
[list each GAP item]

Please decide:
(1) Accept supervisor's position (treat disputed items as false positives)
(2) Accept reviewer's position (treat disputed items as real)
(3) Manually specify which findings to include
(4) Abort the pipeline
```

Wait for user input. Apply the user's ruling to produce a final merged findings list. Write the resolved list to `pipeline-reports/debate-{reviewIteration}-resolved.md`. Set `lastApprovedReviewIteration = reviewIteration`.

Update checkpoint: `stage = PLAN_LOOP`. Write checkpoint.

---

## PLAN_LOOP

Maximum 3 full iterations. Each iteration has up to 3 debate rounds.

```
while planIteration < 3:
  planIteration += 1
  update and write checkpoint

  // Initial plan
  invoke Agent: planner
    prompt: "lastApprovedIteration={lastApprovedReviewIteration}, lastDebateRound={lastDebateRound}, planIteration={planIteration}, debateRound=1"

  planDebateRound = 0

  // Debate sub-loop (max 3 rounds)
  while planDebateRound < 3:
    planDebateRound += 1

    invoke Agent: engineering-validator
      prompt: "planIteration={planIteration}, debateRound={planDebateRound}"

    read pipeline-reports/plan-debate-r{planDebateRound}.md
    if file contains "Status: CONSENSUS_REACHED" → break debate sub-loop

    // Planner defends or revises
    invoke Agent: planner
      prompt: "lastApprovedIteration={lastApprovedReviewIteration}, lastDebateRound={lastDebateRound}, planIteration={planIteration}, debateRound={planDebateRound+1}"

  if last plan-debate file contains "Status: CONSENSUS_REACHED":
    break outer loop
```

**If max plan iterations (3) reached without CONSENSUS_REACHED:**

Print:
```
━━━ PLAN STALEMATE — HUMAN DECISION REQUIRED ━━━
```

Print the full contents of `pipeline-reports/plan-debate-r{planDebateRound}.md`.

Print:
```
The planner and engineering validator could not agree after {planIteration} iterations.

DISPUTED FIXES (planner defends, validator objects):
[list each fix ID with both sides' arguments side-by-side]

Please decide for each disputed fix:
(1) Use planner's version
(2) Use validator's objection as revision guidance
(3) Drop the fix entirely
(4) Abort
```

Wait for user decision per disputed fix. Apply rulings: update `pipeline-reports/plan.md` accordingly. Write `pipeline-reports/plan-resolved.md`.

Update checkpoint: `stage = IMPLEMENT_LOOP`. Write checkpoint.

---

## IMPLEMENT_LOOP

### Environment pre-flight

Check `.env` exists. Verify these variables are present and non-empty:
- `TMDB_ACCESS_TOKEN`
- `OPENAI_API_KEY`
- `MONGODB_URI`

If any are missing or empty:
```
ERROR: Required environment variable {NAME} is missing from .env.
Cannot run implementation phase. Add the variable and re-run.
```
Stop.

### Zero findings check

Read `pipeline-reports/plan.md`. If it contains only `No valid findings after false positive removal.` or has no fix groups:
```
No issues found. Codebase is clean.
```
Delete `pipeline-reports/checkpoint.json`. Stop.

### Dirty working tree check

Run `git status`. If working tree is not clean:
```
Uncommitted changes detected. Commit or stash your changes before implementing.
```
Stop.

### Baseline test run

Run `npm test`. Save the list of currently failing test names to `pipeline-reports/baseline-failures.md`:

```markdown
# Baseline Failures (pre-existing before any code changes)

- test name one
- test name two
```

(If all tests pass, write the file with just the header and a note: "No pre-existing failures.")

### Human approval gate (triggers if completedGroups is empty)

If `completedGroups.length == 0`:

Print the full contents of `pipeline-reports/plan.md`.

Print:
```
━━━ PLAN APPROVED BY ENGINEERING VALIDATOR ━━━
Type 'approve' to implement all fix groups, or anything else to stop.
```

Wait for user input.

If the input is not exactly `approve` (case-insensitive):
```
Implementation cancelled. Run /review-pipeline to resume when ready.
```
Stop (do NOT delete checkpoint.json — leave at IMPLEMENT_LOOP stage).

### Fix group implementation loop

Read `pipeline-reports/plan.md` — extract fix groups in priority order.
Remove any groups already in `checkpoint.completedGroups`.

```
for each group:
  update checkpoint (current group in progress)
  write checkpoint

  invoke Agent: implementer
    prompt: "group={group}"

  invoke Agent: test-agent
    prompt: "branch=fix/{group}"

  read pipeline-reports/test-result-fix-{group}.md
  if file contains "Signal: PROCEED_TO_COMMIT":
    append group to completedGroups
    update and write checkpoint
  else if file contains "Signal: FIX_REQUIRED":
    // One retry
    read failure details from test-result-fix-{group}.md
    invoke Agent: implementer
      prompt: "group={group}, retry=true, failure={failure details from test-result file}"

    invoke Agent: test-agent
      prompt: "branch=fix/{group}"

    read pipeline-reports/test-result-fix-{group}.md again
    if still "Signal: FIX_REQUIRED":
      print "Fix group {group} failed after retry. Manual intervention required."
      print the contents of pipeline-reports/test-result-fix-{group}.md
      Stop
    else:
      append group to completedGroups
      update and write checkpoint
```

Update checkpoint: `stage = DONE`. Write checkpoint.

---

## Completion

```
==========================================
  PIPELINE COMPLETE
  Review iterations: {reviewIteration}
  Plan iterations: {planIteration}
  Fix groups implemented: {completedGroups.length}
  Reports: pipeline-reports/
==========================================
```

Delete `pipeline-reports/checkpoint.json`.

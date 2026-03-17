---
name: review-only
description: Dry-run of the review pipeline. Runs the full REVIEW_LOOP and PLAN_LOOP, prints findings and plan, but does NOT implement any code changes.
---

You are orchestrating a dry-run code review pipeline. You run the full review and planning phases but stop before implementing anything. No source files are ever modified.

## Trigger

`/review-only [path]`

---

## Startup

**Step 1 — Parse arguments:**
- `scope` = the path argument if provided, otherwise empty string (means full codebase)
- No `--fresh` flag for review-only (always resumes if checkpoint exists)

**Step 2 — Create reports directory:**
Create `pipeline-reports/` directory if it does not exist.

**Step 3 — Checkpoint logic:**
Check if `pipeline-reports/checkpoint.json` exists:
- If it exists AND `checkpoint.stage` is `REVIEW_LOOP` or `PLAN_LOOP` → read it, resume from `checkpoint.stage`
- If it exists AND `checkpoint.stage` is `IMPLEMENT_LOOP` or `DONE` → resume (will skip directly to output)
- Otherwise → initialize fresh checkpoint:

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

Write to `pipeline-reports/checkpoint.json`.

**Note:** No `.env` check — review-only never runs tests.

---

## REVIEW_LOOP

Identical to `review-pipeline`. Maximum 5 full iterations, each with up to 3 debate rounds.

```
while reviewIteration < 5:
  reviewIteration += 1
  update and write checkpoint

  invoke Agent: code-reviewer
    prompt: "scope={scope}, iteration={reviewIteration}, debateRound=1"

  debateRound = 0

  while debateRound < 3:
    debateRound += 1

    invoke Agent: review-supervisor
      prompt: "iteration={reviewIteration}, debateRound={debateRound}"

    read pipeline-reports/debate-{reviewIteration}-r{debateRound}.md
    if "Status: CONSENSUS_REACHED" → break debate sub-loop

    invoke Agent: code-reviewer
      prompt: "scope={scope}, iteration={reviewIteration}, debateRound={debateRound+1}"

  lastDebateRound = debateRound

  if last debate file contains "Status: CONSENSUS_REACHED":
    set lastApprovedReviewIteration = reviewIteration
    update and write checkpoint
    break outer loop
```

**If max iterations reached without CONSENSUS_REACHED:**

Print full stalemate output (same as review-pipeline stalemate handling). Wait for user decision. Write resolved findings. Set `lastApprovedReviewIteration`.

Update checkpoint: `stage = PLAN_LOOP`. Write checkpoint.

---

## PLAN_LOOP

Identical to `review-pipeline`. Maximum 3 full iterations, each with up to 3 debate rounds.

```
while planIteration < 3:
  planIteration += 1
  update and write checkpoint

  invoke Agent: planner
    prompt: "lastApprovedIteration={lastApprovedReviewIteration}, lastDebateRound={lastDebateRound}, planIteration={planIteration}, debateRound=1"

  planDebateRound = 0

  while planDebateRound < 3:
    planDebateRound += 1

    invoke Agent: engineering-validator
      prompt: "planIteration={planIteration}, debateRound={planDebateRound}"

    read pipeline-reports/plan-debate-r{planDebateRound}.md
    if "Status: CONSENSUS_REACHED" → break debate sub-loop

    invoke Agent: planner
      prompt: "lastApprovedIteration={lastApprovedReviewIteration}, lastDebateRound={lastDebateRound}, planIteration={planIteration}, debateRound={planDebateRound+1}"

  if last plan-debate file contains "Status: CONSENSUS_REACHED":
    break outer loop
```

**If max plan iterations reached:** Same stalemate handling as `review-pipeline`. Apply user rulings. Write `plan-resolved.md`.

### Zero findings check

Read `pipeline-reports/plan.md`. If it contains only `No valid findings after false positive removal.` or has no fix groups:
```
No issues found. Codebase is clean.
```
Stop (do NOT delete checkpoint.json).

---

## Dry-run Output

Update checkpoint: `stage = IMPLEMENT_LOOP`. Write checkpoint (do NOT delete it).

Print a findings summary:

```
==========================================
  DRY-RUN COMPLETE — NO CODE MODIFIED
==========================================

FINDINGS SUMMARY (false positives excluded):

  CRITICAL: N
  HIGH:     N
  MEDIUM:   N
  LOW:      N
  Total:    N

PLANNED FIX GROUPS:
  fix/security       — N findings, N files
  fix/input-validation — N findings, N files
  fix/error-handling — N findings, N files
  fix/dead-code      — N findings, N files
  fix/readability    — N findings, N files

Full plan: pipeline-reports/plan.md

To implement: /review-pipeline
(Will resume from checkpoint and ask for your approval before making any changes.)
==========================================
```

**Do NOT delete `pipeline-reports/checkpoint.json`.**
The checkpoint remains at `stage: IMPLEMENT_LOOP` with `completedGroups: []` so the human approval gate will trigger when `/review-pipeline` is run next.

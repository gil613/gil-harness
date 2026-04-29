---
description: Run all stages automatically until DONE or retry limit
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
---

# /harness:run

**Auto-loop**: Runs stages sequentially until DONE is reached or the retry limit is exceeded. No manual intervention needed.

Loop order: REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE

---

## Loop Procedure

**Repeat the following until DONE is reached or a stop condition occurs.**

---

### LOOP-1. Load state

- Read `.harness/state.json` and `.harness/config.json`
- If `state.stage === 'DONE'`, print and stop the loop:
  - "All stages complete. /harness:retro recommended"
- If `state.iteration >= state.maxRetries`, print and stop the loop:
  - "Retry limit reached — modify agent instructions or requirements, then /harness:reset"

All subsequent output follows `config.uiLanguage`.

---

### LOOP-2. Acknowledge previous failure (if any)

If the last entry in `state.failures` matches the current stage, print:

```
Previous failure cause: <cause>
Fix plan:               <plan>
```

This information is also passed to the worker sub-agent (LOOP-3).

---

### LOOP-3. Call worker sub-agent

Check `config.uiLanguage` to determine the sub-agent. If `"en"`, use the `-en` suffix agent.

stage → sub-agent mapping:

| stage | uiLanguage=ko | uiLanguage=en |
|-------|---------------|---------------|
| REQUIREMENTS | requirements-collector | requirements-collector-en |
| ROADMAP | roadmap-designer | roadmap-designer-en |
| DEVELOPMENT | developer | developer-en |
| REVIEW | reviewer | reviewer-en |

If `config.uiLanguage` is missing or `"ko"`, use the Korean agents.

#### Load overrides

If `.harness/agents-overrides/<subagent_type>.md` exists, read it. Otherwise use an empty string.

#### Task prompt template

Call via the `Task` tool. Omit blocks that do not apply:

```
[STAGE]
<current stage name>

[CONFIG]
<full .harness/config.json>

[PREVIOUS ARTIFACTS]
ROADMAP: requirements.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md (if present)
REVIEW: requirements.md, roadmap.md, progress.md
(inline each file's content inside ``` fences)

[PREVIOUS FAILURE]   ← only when the last state.failures entry matches the current stage
Cause: <cause>
Fix plan: <plan>

[OVERRIDE]   ← only when agents-overrides file exists
<file contents verbatim>

[INSTRUCTIONS]
Save the artifact to .harness/<artifact name>.md.
Artifact names: requirements / roadmap / progress / review-report
Report in one line when done.
```

#### Worker failure handling

If the sub-agent fails or aborts, do not change state and stop the loop:

```
Worker agent failed: <reason>
Re-run /harness:run to retry
```

(Distinguish from a validation failure — do not increment the iteration counter)

---

### LOOP-4. Run validation (inline validate.md procedure)

If the worker finishes normally, **execute the validate.md procedure inline within this session**.

Perform the full validate.md procedure inline and hold the PASS / FAIL result as an internal variable.

---

### LOOP-5. Loop branch

Branch based on the validate result and updated state.

#### 5a. PASS

`state.json` is already updated to the next stage. Re-read the state.

- If new `state.stage === 'DONE'`:
  - "✓ Full pipeline complete (REQUIREMENTS→ROADMAP→DEVELOPMENT→REVIEW→DONE)\n   Run /harness:retro"
  - Stop loop
- Otherwise, print one line of progress and **return to LOOP-1**:
  - "✓ <prev stage> done → starting <new stage>"

#### 5b. FAIL

`state.json`'s `iteration` is already incremented by 1.

- If `state.iteration < state.maxRetries`:
  - "✗ <stage> validation failed (attempt <iteration>/<maxRetries>)\n   Cause: <cause>\n   Fix plan: <plan>\n   → Retrying same stage..."
  - **Return to LOOP-1** (state is already updated, re-run the same stage)
- If `state.iteration >= state.maxRetries`:
  - "✗ <stage> retry limit reached — user intervention required\n   Modify agent overrides (.harness/agents-overrides/) or requirements,\n   then reset with /harness:reset"
  - Stop loop

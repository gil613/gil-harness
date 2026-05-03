---
description: Validate current stage artifacts (deterministic + inferential)
allowed-tools: Read, Edit, Bash, Task
---

# /harness:validate

Judges whether the current stage artifacts meet the quality bar to advance to the next stage. Proceeds in two phases:

1. **Deterministic validation** — run typecheck/lint/test/build directly via Bash in the parent session
2. **Inferential validation** — a validation sub-agent (Task) judges artifact quality

## Procedure

### 1. Load state

- Read `.harness/state.json` and `.harness/config.json`
- If the current stage is `DONE`, print "Done. /harness:retro recommended" and exit

All subsequent output follows `config.uiLanguage`.

### 2. Deterministic validation (DEVELOPMENT and REVIEW stages only)

Run only when stage is `DEVELOPMENT` or `REVIEW`. Skip for REQUIREMENTS/ROADMAP.

Ensure the log directory exists first: `mkdir -p .harness/logs` (safe to run even if it already exists).

Run the following commands from `config.json` sequentially via Bash:

1. `typecheckCmd` — type check
2. `lintCmd` — lint
3. `testCmd` — test
4. `buildCmd` — build

For each command:

- If empty string: SKIP
- Timeout: 10 minutes
- exit 0 → PASS
- non-zero exit → FAIL
- spawn failure → ERROR

Print each result to the console and accumulate in a results table:

```
[PASS|FAIL|SKIP|ERROR] <label>: <command> (exit <code>, <ms>ms)
```

**Preserve only the last 80 lines of stdout/stderr** — save the full log to `.harness/logs/<stage>-<YYYYMMDD-HHmmss>.log` and display only the tail in console/state.

#### Deterministic failure handling

If any FAIL/ERROR/TIMEOUT occurs, do not proceed to inferential validation and fail immediately:

- `cause` = "Deterministic validation failed — <label>=<status>(exit <code>) ..."
- `plan` = "Resolve <first failed label>(<command>) failure first. Log: <log file path>"
- If current stage is `REVIEW`, also set internal flag `regressTo = "DEVELOPMENT"` (broken code requires the developer agent, not another reviewer pass)
- Proceed to the "failure handling" procedure (step 5 below)

### 3. Inferential validation — call validation sub-agent

Check `config.uiLanguage` to determine the sub-agent. If `"en"`, use the `-en` suffix agent.

stage → sub-agent:

| stage | uiLanguage=ko | uiLanguage=en |
|-------|---------------|---------------|
| REQUIREMENTS | requirements-validator | requirements-validator-en |
| ROADMAP | roadmap-validator | roadmap-validator-en |
| DEVELOPMENT | development-validator | development-validator-en |
| REVIEW | review-validator | review-validator-en |

If `config.uiLanguage` is missing or `"ko"`, use the existing Korean agents.

#### 3-1. Load overrides

If `.harness/agents-overrides/<subagent_type>.md` exists, read it. Otherwise treat as an empty string. This content is inlined into the `[OVERRIDE]` block of the Task prompt.

#### 3-2. Task prompt template

Call via the `Task` tool. Use the structure below exactly (omit blocks that do not apply):

```
[STAGE]
<current stage name>

[CONFIG]
<full .harness/config.json>

[ATTACHED ARTIFACTS]
REQUIREMENTS: requirements.md
ROADMAP: requirements.md, roadmap.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md
REVIEW: requirements.md, roadmap.md, review-report.md
(inline each file's content inside ``` fences)

[DETERMINISTIC VALIDATION RESULTS]   ← DEVELOPMENT/REVIEW only
| Label | Status | exit | ms |
| --- | --- | --- | --- |
| typecheck | ... | ... | ... |
...
(inline the full table)

[OVERRIDE]   ← only when agents-overrides file exists
<file contents verbatim>

[INSTRUCTIONS]
Output the verdict on the last line block in exactly one of these formats:
  VALIDATION_RESULT: PASS
or
  VALIDATION_RESULT: FAIL
  REASON: <one line>
  FIX_PLAN: <remediation direction>
or (regress to a previous stage — only when the validator agent supports it; e.g., review-validator)
  VALIDATION_RESULT: FAIL
  REASON: <one line>
  FIX_PLAN: <remediation direction>
  REGRESS_TO: <STAGE NAME>
```

### 4. Parse result

From the text returned by the sub-agent:

- Extract `VALIDATION_RESULT: (PASS|FAIL)`
- If neither matches, **treat as a runtime error, do not increment iteration**. Report to the user and exit.
- If `VALIDATION_RESULT: FAIL`, also try to extract `REGRESS_TO: <STAGE>`. If present and the value is one of `REQUIREMENTS|ROADMAP|DEVELOPMENT|REVIEW`, set the internal flag `regressTo = <STAGE>` (overrides any value set in step 2). Otherwise leave `regressTo` unset.

### 5a. PASS handling

Update `state.json` (Edit):

- `stage` → next stage (`STAGES[indexOf+1]`)
- `iteration` → 0
- `lastValidated` → current ISO 8601 timestamp
- `failures` → `[]` (reset accumulated failures on PASS)
- `history` → append `{ stage, completedAt }` to the existing array

Output:

```
Validation passed: <prev stage> -> <next stage>
```

Only when invoked directly (`/harness:validate` standalone), also print the hint:

```
Next: /harness:run    (or /harness:retro if DONE)
```

Omit this hint when called inline within the `/harness:run` loop — run will continue the loop automatically.

### 5b. FAIL handling

Extract `REASON: <one line>` and `FIX_PLAN: <block>` from the sub-agent response. Also use the `regressTo` flag set in step 2 (deterministic) or step 4 (REGRESS_TO).

Update `state.json` (Edit):

- `iteration` → +1
- If `regressTo` is set AND `new iteration < maxRetries`:
  - `stage` → `regressTo` (regress to the specified earlier stage; the developer/etc. handles remediation in the next loop)
  - iteration carries over (each FAIL counts toward the global retry budget regardless of stage)
- Otherwise: `stage` unchanged (same-stage retry)
- `failures` → append the following object to the end of the existing array. **If the length exceeds maxRetries, remove the oldest entries (keep only the most recent maxRetries entries)**:
  ```json
  {
    "stage": "<stage at time of failure>",
    "attempt": <new iteration>,
    "cause": "<REASON>",
    "plan": "<FIX_PLAN>",
    "timestamp": "<ISO timestamp>",
    "deterministic": [<label/status/exit summary if deterministic validation ran>],
    "regressedTo": "<regressTo if set, omit otherwise>"
  }
  ```

Output (when `regressTo` is unset):

```
Validation failed: <stage>
Cause:      <cause>
Fix plan:   <plan>

Retries remaining: <maxRetries - new iteration>
```

Output (when `regressTo` is set and applied):

```
Validation failed: <stage>  → regressing to <regressTo>
Cause:      <cause>
Fix plan:   <plan>

Retries remaining: <maxRetries - new iteration>
```

If `new iteration >= maxRetries`, add:

```
Retry limit reached — user intervention required.
Modify agent instructions (.harness/agents or plugin agents/) or requirements,
then reset with /harness:reset.
```

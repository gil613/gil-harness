---
description: Force-advance to the next stage skipping validation (emergency use)
allowed-tools: Read, Edit
---

# /harness:advance

Marks the current stage as passed without validation and moves to the next stage. **Use only in emergencies.**

## Procedure

### 1. User confirmation

Read `.harness/config.json` to check `uiLanguage`, then determine the output language for all subsequent output. If missing or `"ko"`, use Korean.

Ask the user explicitly once:

> Skipping validation and force-advancing to the next stage. Continue? (yes/no)

Stop if the answer is not `yes`/`y`.

### 2. Read state.json and evaluate

- If `.harness/state.json` is missing: print "Not initialized" and exit
- If `state.stage === 'DONE'`: print "Already at the last stage" and exit

### 3. Calculate next stage

```
STAGES = ['REQUIREMENTS','ROADMAP','DEVELOPMENT','REVIEW','DONE']
next = STAGES[STAGES.indexOf(state.stage) + 1]
```

### 4. Update state.json (Edit tool)

Update the following fields:

- `stage`: next
- `iteration`: 0
- `history`: append the following entry to the existing array
  ```json
  {
    "stage": "<current stage>",
    "completedAt": "<current ISO 8601 time>",
    "skippedValidation": true
  }
  ```

Do not touch other fields (`failures`, `lastValidated`, `maxRetries`, `schemaVersion`).

### 5. Output

`<prev stage> -> <next> (validation skipped)`

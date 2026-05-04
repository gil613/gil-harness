---
description: Force-advance to the next stage skipping validation (emergency use)
allowed-tools: Read, Edit
---

# /harness:advance

Marks the current stage as passed without validation and moves to the next stage. **Use only in emergencies.**

## Procedure

### 1. User confirmation

Read `.harness/config.json` to obtain `uiLanguage`. All subsequent user-facing output uses messages from the `## Messages` table below, keyed by this value.

Ask the user explicitly once: print `messages.confirm`. Stop if the answer is not `yes`/`y`.

### 2. Read state.json and evaluate

- If `.harness/state.json` is missing: print `messages.not_initialized` and exit
- If `state.stage === 'DONE'`: print `messages.already_at_end` and exit

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

Print `messages.advanced` populated with `<prev>` and `<next>`.

---

## Messages

Look up by `config.uiLanguage`. Substitute `{...}` placeholders before printing.

### `confirm`

- **en**: `Skipping validation and force-advancing to the next stage. Continue? (yes/no)`
- **ko**: `검증을 건너뛰고 다음 단계로 강제 진행합니다. 계속? (yes/no)`

### `not_initialized`

- **en**: `Not initialized — run /harness:init first`
- **ko**: `초기화되지 않음 — 먼저 /harness:init 실행`

### `already_at_end`

- **en**: `Already at the last stage`
- **ko**: `이미 마지막 단계입니다`

### `advanced`

- **en**: `{prev} -> {next} (validation skipped)`
- **ko**: `{prev} -> {next} (검증 건너뜀)`

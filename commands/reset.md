---
description: Reset iteration/failures (for retrying after maxRetries is exceeded)
allowed-tools: Read, Edit
argument-hint: "[--iteration|--failures|--all]"
---

# /harness:reset

When the validation retry limit has been reached, use this command to reset the counters after modifying agent instructions or requirements, enabling a retry.

## Arguments

- `--iteration` (default): reset `iteration` to 0 only
- `--failures`: clear the `failures` array
- `--all`: reset both iteration and failures
- `--stage <STAGE>`: additional option — force move to a specific stage (dangerous, requires explicit confirmation)

If no argument is provided, both `--iteration` and `--failures` are reset (the most common case).

## Procedure

### 1. Read state.json

Read `.harness/config.json` first to obtain `uiLanguage`. All subsequent user-facing output uses messages from the `## Messages` table below.

If `.harness/state.json` is missing: print `messages.not_initialized` and exit.

### 2. User confirmation (only when --stage is used)

If `--stage` argument is present, ask for explicit confirmation by printing `messages.confirm_stage` populated with `<X>`.

### 3. Update state.json with Edit

Default (no argument or `--iteration` + `--failures`):

```diff
- "iteration": <old value>,
+ "iteration": 0,
- "failures": [...],
+ "failures": [],
```

`--all` is identical to the above.

If `--stage <STAGE>` is also provided, update the `stage` field as well.

Never touch `schemaVersion`, `maxRetries`, `lastValidated`, or `history`.

### 4. Output

Print `messages.complete` populated with `<stage>`.

---

## Messages

Look up by `config.uiLanguage`. Substitute `{...}` placeholders before printing.

### `not_initialized`

- **en**: `Not initialized — run /harness:init first`
- **ko**: `초기화되지 않음 — 먼저 /harness:init 실행`

### `confirm_stage`

- **en**: `Force-changing stage to {X}. Outputs and history will be preserved. Continue? (yes/no)`
- **ko**: `단계를 {X}로 강제 변경합니다. 산출물과 이력은 보존됩니다. 계속? (yes/no)`

### `complete`

- **en**:
  ```
  Reset complete: iteration=0, failures=[]
  Current stage: {stage}
  Next: /harness:run
  ```
- **ko**:
  ```
  초기화 완료: iteration=0, failures=[]
  현재 단계: {stage}
  다음: /harness:run
  ```

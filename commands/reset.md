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

Read `.harness/config.json` first to check `uiLanguage`. If missing or `"ko"`, use Korean.

If `.harness/state.json` is missing: print "Not initialized" and exit.

### 2. User confirmation (only when --stage is used)

If `--stage` argument is present, ask for explicit confirmation one more time:

> Force-changing stage to <X>. Outputs and history will be preserved. Continue? (yes/no)

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

```
Reset complete: iteration=0, failures=[]
Current stage: <stage>
Next: /harness:run
```

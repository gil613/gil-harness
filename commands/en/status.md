---
description: Print harness progress status
allowed-tools: Read
---

# /harness:status

Prints a one-screen summary of the current harness progress.

## Procedure

### 1. Read state files

- `.harness/state.json` — if missing, print "Not initialized. Run /harness:init first" and exit
- `.harness/config.json` — if missing, print "config missing" warning

Read `config.uiLanguage` to determine the output language for all subsequent output. If missing or `"ko"`, use Korean.

### 2. Output format

```
Project:  <projectName>
Language: <language>

Stage [<progress bar>] <done>/4
Current:  <stage>
Retries:  <iteration>/<maxRetries>
Last validated: <lastValidated or "none">
```

The progress bar represents only the **4 work stages** (REQUIREMENTS, ROADMAP, DEVELOPMENT, REVIEW). DONE is a terminal state and is not drawn as a bar slot.

- Completed stages: `█`
- Current stage: `▶`
- Not yet started: `░`

If `stage === 'DONE'`, the bar shows `[████]`, numerator is `4/4`, and "Current" shows `DONE`.

### 3. Additional information

Print the last 3 entries from the `failures` array:

`Recent failures: / [<stage>] #<attempt> — <cause>`

Print all entries from the `history` array:

`History: / <stage> — <YYYY-MM-DD> [(validation skipped)]`

### 4. Extra hints

- If `iteration >= maxRetries`: print "Retry limit reached — run /harness:reset or modify agent instructions"
- If `stage === 'DONE'`: print "Done. Run /harness:retro for retrospective"

Only output status; do not modify any files.

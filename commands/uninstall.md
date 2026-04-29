---
description: Completely remove harness from the current project (deletes .harness/)
allowed-tools: Read, Bash
---

# /harness:uninstall

Completely removes the harness from the current project. Deletes the `.harness/` directory and all files within it (config, state, artifacts, logs, retrospectives).

## Procedure

### 1. Check language

Read `.harness/config.json` to check `uiLanguage`. If the file is missing or unreadable, default to Korean.

All subsequent output is shown in the language determined by `uiLanguage`.

### 2. Check initialization

If `.harness/state.json` is missing, print and exit:

"Harness is not initialized"

### 3. Display deletion list and confirm

List the items to be deleted and ask for explicit user confirmation.

```
The following will be permanently deleted:

  .harness/
  ├── config.json
  ├── state.json
  ├── requirements.md       (if present)
  ├── roadmap.md            (if present)
  ├── progress.md           (if present)
  ├── review-report.md      (if present)
  ├── logs/                 (if present)
  ├── agents-overrides/     (if present)
  └── retrospectives/       (if present)

Continue? (yes/no)
```

If the answer is not `yes`/`y`, print "Cancelled" and stop.

### 4. Execute deletion

```bash
rm -rf .harness/
```

### 5. Completion report

```
Uninstalled: .harness/ deleted
To fully remove the plugin: claude plugin remove harness
```

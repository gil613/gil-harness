---
description: Apply plugin update contents to the current project
allowed-tools: Read, Edit, Write, Bash, Glob
---

# /harness:update

Run this after updating the plugin (`claude plugin update harness` or `git pull`) to synchronize already-initialized project files with the current version.

What gets updated:
- `.harness/config.json` — fill in fields added in the new version
- `.harness/` subdirectories — create any directories required by the new version

What is never touched:
- `.harness/state.json` (progress state)
- `.harness/*.md` artifacts (requirements, roadmap, progress, review-report)
- `.harness/retrospectives/`
- `.harness/agents-overrides/`

## Procedure

### 1. Check initialization

Read `.harness/config.json` and `.harness/state.json`. If missing, print and exit:

"Not initialized — run /harness:init first"

Read `uiLanguage` to determine the output language for all subsequent output.

### 2. Patch config.json schema

Detect fields missing from the current `config.json` and add them. **Never overwrite existing fields.**

Required fields based on the current schema:

```
projectName, language, uiLanguage,
testCmd, lintCmd, typecheckCmd, buildCmd, devCmd
```

If fields are missing:
1. Re-scan project files using the same method as `init.md` step 3 to auto-detect values
2. If detection fails, add as empty string (`""`)

Use the Edit tool to insert only the missing fields.

### 3. Patch directories

If directories required by the current version are missing, create them:

```bash
mkdir -p .harness/logs
```

Add to this list when new directories are introduced in future versions.

### 4. Completion report

Output only changed items. If nothing changed, report "already up to date".

```
Update complete:
  config.json  — <added fields> (or "no changes")
  Directories  — <created list> (or "no changes")
```

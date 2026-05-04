---
description: Apply plugin update contents to the current project
allowed-tools: Read, Edit, Write, Bash, Glob
---

# /harness:update

Run this after updating the plugin (`claude plugin update harness` or `git pull`) to synchronize already-initialized project files with the current version.

What gets updated:
- `.harness/config.json` — fill in fields added in the new version
- `.harness/` subdirectories — create any directories required by the new version
- `.harness/agents-overrides/*-en.md` — rename to `*.md` (sub-agent name change in v0.3.0)

What is never touched:
- `.harness/state.json` (progress state)
- `.harness/*.md` artifacts (requirements, roadmap, progress, review-report)
- `.harness/retrospectives/`
- `.harness/agents-overrides/` body content (only filenames are renamed when needed)

## Procedure

### 1. Check initialization

Read `.harness/config.json` and `.harness/state.json`. If missing, print `messages.not_initialized` and exit.

Read `uiLanguage`. All subsequent user-facing output uses messages from the `## Messages` table below.

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

### 4. Migrate agents-overrides filenames (v0.3.0 breaking change)

In v0.3.0, sub-agent names lost the `-en` suffix (e.g., `developer-en` → `developer`). User overrides keyed by the old name become orphans. Rename them.

Glob `.harness/agents-overrides/*-en.md`. For each match:

- Compute new path: drop the `-en` segment immediately before `.md` (e.g., `developer-en.md` → `developer.md`)
- If the new path does not exist: rename the file
  ```bash
  mv .harness/agents-overrides/<old>.md .harness/agents-overrides/<new>.md
  ```
- If the new path already exists: do **not** overwrite. Add the file to a `conflicts` list to surface in the completion report.

Track the rename count and conflicts list for the completion report.

If the `.harness/agents-overrides/` directory does not exist, skip this step entirely.

### 5. Completion report

Print `messages.complete` populated with `<configChanges>`, `<dirChanges>`, `<renameCount>`, `<conflicts>`. Substitute `messages.no_changes` for any subsection with no work done.

---

## Messages

Look up by `uiLanguage`. Substitute `{...}` placeholders before printing.

### `not_initialized`

- **en**: `Not initialized — run /harness:init first`
- **ko**: `초기화되지 않음 — 먼저 /harness:init 실행`

### `no_changes`

- **en**: `no changes`
- **ko**: `변경 없음`

### `complete`

- **en**:
  ```
  Update complete:
    config.json        — {configChanges}
    Directories        — {dirChanges}
    Overrides renamed  — {renameCount}
    Rename conflicts   — {conflicts}
  ```
- **ko**:
  ```
  업데이트 완료:
    config.json        — {configChanges}
    디렉터리           — {dirChanges}
    오버라이드 rename  — {renameCount}
    rename 충돌        — {conflicts}
  ```

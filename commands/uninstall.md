---
description: Completely remove harness from the current project (deletes .harness/)
allowed-tools: Read, Bash
---

# /harness:uninstall

Completely removes the harness from the current project. Deletes the `.harness/` directory and all files within it (config, state, artifacts, logs, retrospectives).

## Procedure

### 1. Check language

Read `.harness/config.json` to obtain `uiLanguage`. If the file is missing or unreadable, default to `"en"`. All subsequent user-facing output uses messages from the `## Messages` table below.

### 2. Check initialization

If `.harness/state.json` is missing, print `messages.not_initialized` and exit.

### 3. Display deletion list and confirm

Print `messages.confirm_delete`. If the answer is not `yes`/`y`, print `messages.cancelled` and stop.

### 4. Execute deletion

```bash
rm -rf .harness/
```

### 5. Completion report

Print `messages.complete`.

---

## Messages

Look up by `uiLanguage`.

### `not_initialized`

- **en**: `Harness is not initialized`
- **ko**: `하네스가 초기화되지 않음`

### `confirm_delete`

- **en**:
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
- **ko**:
  ```
  다음 항목이 영구 삭제됩니다:

    .harness/
    ├── config.json
    ├── state.json
    ├── requirements.md       (있으면)
    ├── roadmap.md            (있으면)
    ├── progress.md           (있으면)
    ├── review-report.md      (있으면)
    ├── logs/                 (있으면)
    ├── agents-overrides/     (있으면)
    └── retrospectives/       (있으면)

  계속? (yes/no)
  ```

### `cancelled`

- **en**: `Cancelled`
- **ko**: `취소됨`

### `complete`

- **en**:
  ```
  Uninstalled: .harness/ deleted
  To fully remove the plugin: claude plugin remove harness
  ```
- **ko**:
  ```
  제거 완료: .harness/ 삭제됨
  플러그인 완전 제거: claude plugin remove harness
  ```

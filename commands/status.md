---
description: Print harness progress status
allowed-tools: Read
---

# /harness:status

Prints a one-screen summary of the current harness progress.

## Procedure

### 1. Read state files

- `.harness/state.json` — if missing, print `messages.not_initialized` and exit
- `.harness/config.json` — if missing, print `messages.config_missing` warning and continue with `uiLanguage` defaulted to `"en"`

Read `config.uiLanguage`. All subsequent user-facing output uses messages from the `## Messages` table below.

### 2. Output format

Print `messages.summary` populated with the relevant state values.

The progress bar represents only the **4 work stages** (REQUIREMENTS, ROADMAP, DEVELOPMENT, REVIEW). DONE is a terminal state and is not drawn as a bar slot.

- Completed stages: `█`
- Current stage: `▶`
- Not yet started: `░`

If `stage === 'DONE'`, the bar shows `[████]`, numerator is `4/4`, and "Current" shows `DONE`.

### 3. Additional information

Print the last 3 entries from the `failures` array under the `messages.recent_failures_header` heading, one per line as:

`[<stage>] #<attempt> — <cause>`

Print all entries from the `history` array under the `messages.history_header` heading, one per line as:

`<stage> — <YYYY-MM-DD>` (append ` (validation skipped)` / ` (검증 건너뜀)` localized via `messages.skipped_suffix` when `skippedValidation: true`)

### 4. Extra hints

- If `iteration >= maxRetries`: print `messages.retry_limit_hint`
- If `stage === 'DONE'`: print `messages.done_hint`

Only output status; do not modify any files.

---

## Messages

Look up by `config.uiLanguage`. Substitute `{...}` placeholders before printing.

### `not_initialized`

- **en**: `Not initialized. Run /harness:init first`
- **ko**: `초기화되지 않음. 먼저 /harness:init 실행`

### `config_missing`

- **en**: `Warning: .harness/config.json missing — defaulting display language to en`
- **ko**: `경고: .harness/config.json 없음 — 표시 언어를 en으로 처리`

### `summary`

- **en**:
  ```
  Project:  {projectName}
  Language: {language}

  Stage [{progressBar}] {done}/4
  Current:  {stage}
  Retries:  {iteration}/{maxRetries}
  Last validated: {lastValidated}
  ```
- **ko**:
  ```
  프로젝트:  {projectName}
  언어:      {language}

  단계 [{progressBar}] {done}/4
  현재:      {stage}
  재시도:    {iteration}/{maxRetries}
  마지막 검증: {lastValidated}
  ```

### `last_validated_none`

(use this string in place of `{lastValidated}` when the value is null)

- **en**: `none`
- **ko**: `없음`

### `recent_failures_header`

- **en**: `Recent failures:`
- **ko**: `최근 실패:`

### `history_header`

- **en**: `History:`
- **ko**: `이력:`

### `skipped_suffix`

- **en**: ` (validation skipped)`
- **ko**: ` (검증 건너뜀)`

### `retry_limit_hint`

- **en**: `Retry limit reached — run /harness:reset or modify agent instructions`
- **ko**: `재시도 한도 도달 — /harness:reset 실행 또는 에이전트 지침 수정`

### `done_hint`

- **en**: `Done. Run /harness:retro for retrospective`
- **ko**: `완료. /harness:retro로 회고 실행`

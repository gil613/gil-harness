---
description: Run all stages automatically until DONE or retry limit
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
---

# /harness:run

**Auto-loop**: Runs stages sequentially until DONE is reached or the retry limit is exceeded. No manual intervention needed.

Loop order: REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE

---

## Loop Procedure

**Repeat the following until DONE is reached or a stop condition occurs.**

---

### LOOP-1. Load state

- Read `.harness/state.json` and `.harness/config.json`
- Read `config.uiLanguage` — all subsequent user-facing output uses messages from the `## Messages` table below, keyed by this value
- If `state.stage === 'DONE'`, print `messages.all_done` and stop the loop
- If `state.iteration >= state.maxRetries`, print `messages.retry_limit` and stop the loop

---

### LOOP-2. Acknowledge previous failure (if any)

If the last entry in `state.failures` matches the current stage, print `messages.previous_failure` populated with `<cause>` and `<plan>`. This information is also passed to the worker sub-agent (LOOP-3).

---

### LOOP-3. Call worker sub-agent

stage → sub-agent mapping:

| stage | sub-agent |
|-------|-----------|
| REQUIREMENTS | requirements-collector |
| ROADMAP | roadmap-designer |
| DEVELOPMENT | developer |
| REVIEW | reviewer |

#### Load overrides

If `.harness/agents-overrides/<subagent_type>.md` exists, read it. Otherwise use an empty string.

#### Task prompt template

Call via the `Task` tool. Omit blocks that do not apply:

```
[STAGE]
<current stage name>

[CONFIG]
<full .harness/config.json>

[OUTPUT LANGUAGE]
{config.uiLanguage}

All free-form text in your artifact bodies, your one-line caller report, and any user-visible
narrative MUST be in this language. Protocol identifiers (section headers like "## Done",
result labels like "VALIDATION_RESULT:", task IDs like "T01", AC IDs like "AC1") MUST stay
verbatim in English. See your agent's "Output Language" section for the exact list.

[PREVIOUS ARTIFACTS]
ROADMAP: requirements.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md (if present)
REVIEW: requirements.md, roadmap.md, progress.md
(inline each file's content inside ``` fences)

[PREVIOUS FAILURE]   ← only when the last state.failures entry matches the current stage
Cause: <cause>
Fix plan: <plan>

[OVERRIDE]   ← only when agents-overrides file exists
<file contents verbatim>

[INSTRUCTIONS]
Save the artifact to .harness/<artifact name>.md.
Artifact names: requirements / roadmap / progress / review-report
Report in one line when done.
```

#### Worker failure handling

If the sub-agent fails or aborts, do not change state and stop the loop. Print `messages.worker_failed` populated with `<reason>`.

(Distinguish from a validation failure — do not increment the iteration counter)

---

### LOOP-4. Run validation (inline validate.md procedure)

If the worker finishes normally, **execute the validate.md procedure inline within this session**.

Perform the full validate.md procedure inline and hold the PASS / FAIL result as an internal variable.

---

### LOOP-5. Loop branch

Branch based on the validate result and updated state.

#### 5a. PASS

`state.json` is already updated to the next stage. Re-read the state.

- If new `state.stage === 'DONE'`:
  - Print `messages.full_pipeline_done`
  - **Execute the retro.md procedure inline within this session** (skip the dirty-tree check — step 1 of retro.md)
  - Stop the loop after retro completes
- Otherwise: print `messages.stage_advanced` populated with `<prev>` and `<new>`, then **WITHOUT generating any further text, immediately call `Read .harness/state.json` as the very next action to execute LOOP-1 — do NOT stop, do NOT return control to the user, do NOT wait for input**

#### 5b. FAIL

`state.json`'s `iteration` is already incremented by 1. Re-read `state.json` now — validate may have regressed to an earlier stage.

- If `state.iteration < state.maxRetries`:
  - If `state.stage` differs from the stage that just ran (regression occurred):
    - Print `messages.stage_regressed_retry` populated with `<fromStage>`, `<toStage>`, `<iteration>`, `<maxRetries>`, `<cause>`, `<plan>`
  - Else (same-stage retry):
    - Print `messages.stage_failed_retry` populated with `<stage>`, `<iteration>`, `<maxRetries>`, `<cause>`, `<plan>`
  - **WITHOUT generating any further text, immediately call `Read .harness/state.json` as the very next action to execute LOOP-1 — do NOT stop, do NOT ask the user for action**
- If `state.iteration >= state.maxRetries`:
  - Print `messages.retry_limit_reached` populated with `<stage>`
  - Stop loop

---

## Messages

Look up by `config.uiLanguage`. Substitute `{...}` placeholders before printing.

### `all_done`

- **en**: `All stages complete. /harness:retro recommended`
- **ko**: `모든 단계 완료. /harness:retro 권장`

### `retry_limit`

- **en**: `Retry limit reached — modify agent instructions or requirements, then /harness:reset`
- **ko**: `재시도 한도 도달 — 에이전트 지침이나 요구사항을 수정한 뒤 /harness:reset`

### `previous_failure`

- **en**:
  ```
  Previous failure cause: {cause}
  Fix plan:               {plan}
  ```
- **ko**:
  ```
  이전 실패 원인: {cause}
  수정 계획:      {plan}
  ```

### `worker_failed`

- **en**:
  ```
  Worker agent failed: {reason}
  Re-run /harness:run to retry
  ```
- **ko**:
  ```
  작업 에이전트 실패: {reason}
  /harness:run을 다시 실행해 재시도하세요
  ```

### `full_pipeline_done`

- **en**: `✓ Full pipeline complete (REQUIREMENTS→ROADMAP→DEVELOPMENT→REVIEW→DONE) — running retrospective…`
- **ko**: `✓ 전체 파이프라인 완료 (REQUIREMENTS→ROADMAP→DEVELOPMENT→REVIEW→DONE) — 회고 실행 중…`

### `stage_advanced`

- **en**: `✓ {prev} done → starting {new}`
- **ko**: `✓ {prev} 완료 → {new} 시작`

### `stage_failed_retry`

- **en**:
  ```
  ✗ {stage} validation failed (attempt {iteration}/{maxRetries})
     Cause: {cause}
     Fix plan: {plan}
     → Retrying same stage...
  ```
- **ko**:
  ```
  ✗ {stage} 검증 실패 (시도 {iteration}/{maxRetries})
     원인: {cause}
     수정 계획: {plan}
     → 같은 단계 재시도...
  ```

### `stage_regressed_retry`

- **en**:
  ```
  ✗ {fromStage} validation failed (attempt {iteration}/{maxRetries}) — regressing to {toStage}
     Cause: {cause}
     Fix plan: {plan}
     → Developer agent will remediate automatically — continuing loop...
  ```
- **ko**:
  ```
  ✗ {fromStage} 검증 실패 (시도 {iteration}/{maxRetries}) — {toStage}로 자동 회귀
     원인: {cause}
     수정 계획: {plan}
     → 개발자 에이전트가 자동으로 수정합니다 — 루프 계속...
  ```

### `retry_limit_reached`

- **en**:
  ```
  ✗ {stage} retry limit reached — user intervention required
     Modify agent overrides (.harness/agents-overrides/) or requirements,
     then reset with /harness:reset
  ```
- **ko**:
  ```
  ✗ {stage} 재시도 한도 도달 — 사용자 개입 필요
     에이전트 오버라이드(.harness/agents-overrides/)나 요구사항을 수정한 뒤
     /harness:reset으로 초기화
  ```

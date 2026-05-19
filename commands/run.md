---
description: Run all stages automatically until DONE or retry limit
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
argument-hint: "[free-form intent for this cycle, e.g. 'T08 추가' or 'fix login bug']"
---

# /harness:run

**Auto-loop**: Runs stages sequentially until DONE is reached or the retry limit is exceeded. No manual intervention needed.

Loop order: REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE

### User intent capture

If the user passed any text after `/harness:run` (i.e. `$ARGUMENTS` is non-empty), capture it once at the very start of this command as `userIntent`. It is **not** a directive that overrides stage logic — it is a hint forwarded to the worker sub-agent (see LOOP-3) so requirements collection / development can focus on what the user actually asked for this cycle. Trim whitespace; if the result is empty, treat as no intent.

---

## Loop Procedure

**Repeat the following until DONE is reached or a stop condition occurs.**

### Loop discipline (CRITICAL — ZERO TOLERANCE)

You have a **0-character output budget between tool calls**. The ONLY user-visible text allowed in this entire procedure is the literal `messages.*` strings the procedure explicitly mandates printing (e.g. `messages.previous_failure`, `messages.stage_advanced`). After every tool return, the next action MUST be either (a) a tool call, or (b) a mandated `messages.*` print followed immediately by the next tool call. No exceptions.

**Forbidden patterns — DO NOT generate ANY of these, even once:**

- Intro / greeting before first tool call: ❌ `상태를 확인하고 파이프라인을 시작하겠습니다`, ❌ `Let me check the state…`, ❌ `Starting the pipeline`
- Status summaries after a Read: ❌ `현재 상태: DEVELOPMENT 단계, 반복 1/3`, ❌ `I see we're in iteration 1/3`, ❌ `이전 실패를 수정하겠습니다`
- Plan announcements before the next tool call: ❌ `로드맵에서 ...를 찾겠습니다`, ❌ `I will now read…`, ❌ `다음으로 ...를 진행`
- Step labels: ❌ `LOOP-1 실행 중`, ❌ `Step 3: …`, ❌ `Now executing validate.md`
- Tool acknowledgments: ❌ `파일을 읽었습니다`, ❌ `Read complete`, ❌ `Got it`
- Apologies, hedges, transitional connectors
- **Pausing after validation FAIL with retries remaining**: ❌ `Should I continue?`, ❌ `검증에 실패했습니다. 계속할까요?`, ❌ any turn-ending text in LOOP-5b when `iteration < maxRetries` — FAIL with retries remaining triggers automatic retry, never user confirmation
- **Wrong-language output**: ❌ English messages when `uiLanguage=ko` — you MUST use the `ko:` variant from the Messages table; defaulting to English for a Korean-language project is a protocol violation

Every one of these phrases costs 30–80 tokens and they accumulate into thousands across a full pipeline run. The user has explicitly objected to this verbosity — treat any such output as a procedural violation.

**Allowed user-visible output:**

- Literal `messages.*` strings the procedure mandates (`messages.cycle_resumed`, `messages.auto_retro`, `messages.previous_failure`, `messages.stage_advanced`, `messages.full_pipeline_done`, `messages.stage_failed_retry`, `messages.stage_regressed_retry`, `messages.retry_limit`, `messages.retry_limit_reached`, `messages.worker_failed`)
- The retro report summary that retro.md itself prints at the end of LOOP-5a (it is part of retro.md's output, not yours to embellish)

**Stop conditions** — only here may you stop without immediately issuing the next tool call: `state.iteration >= state.maxRetries`, worker sub-agent failure, retro completion in 5a-DONE. Anywhere else, stopping or narrating is a bug.

**Self-check before any non-tool output**: ask yourself "is this the literal text of a `messages.*` entry the procedure mandates?" If no, do not emit it — issue the next tool call instead.

---

### LOOP-1. Load state

(Discipline reminder: your **first** action on `/harness:run` is the Read tool call below. Do NOT emit any greeting, plan, or status preamble. The user does not need to be told you are about to read state.)

- Read `.harness/state.json` and `.harness/config.json`
- Read `config.uiLanguage` — all subsequent user-facing output uses messages from the `## Messages` table below, keyed by this value
- If `state.stage === 'DONE'`:
  - **The user just invoked `/harness:run` — that itself is the strongest signal that they want a new cycle. Do NOT bail with "all done" and force the user into a `reset --stage` dance.** Recover automatically:
    - Look at `state.history`. If its last entry has `stage === "RETROSPECTIVE"`, retro already ran in this cycle; the only thing missing is the stage reset. Edit `.harness/state.json`: set `stage` to `"REQUIREMENTS"`, `iteration` to `0`, `failures` to `[]`, `lastValidated` to `null`. Print `messages.cycle_resumed`. Then **WITHOUT generating any further text, immediately re-read `.harness/state.json` as the very next action and continue this LOOP-1 with the refreshed state.**
    - Otherwise (no retrospective entry — the cycle reached DONE without a retro, e.g. an interrupted prior run or a pre-0.3.0 state file): print `messages.auto_retro`, then **execute the retro.md procedure inline within this session** (skip the dirty-tree check — step 1 of retro.md). Retro's step 6 will reset `stage` to `REQUIREMENTS`. After retro completes, **WITHOUT generating any further text, immediately re-read `.harness/state.json` as the very next action and continue this LOOP-1 with the refreshed state.**
- If `state.iteration >= state.maxRetries`, print `messages.retry_limit` and stop the loop

---

### LOOP-2. Acknowledge previous failure (if any)

If the last entry in `state.failures` matches the current stage, print `messages.previous_failure` populated with `<cause>` and `<plan>`. This information is also passed to the worker sub-agent (LOOP-3).

**WITHOUT generating any further text, immediately proceed to LOOP-3 by issuing the Task tool call as the very next action.** If no previous failure exists, also proceed straight to LOOP-3 with no narration.

---

### LOOP-3. Call worker sub-agent

(Discipline reminder: this step issues multiple Read calls — base instructions, overrides file, the spec handoff (REQUIREMENTS stage only), prior artifacts (requirements/roadmap/progress) — then a Bash call to log the worker start, then the Task call. Between each step there must be **zero** narration: a run of Read calls → Bash → Task.)

stage → sub-agent mapping:

| stage | sub-agent |
|-------|-----------|
| REQUIREMENTS | requirements-collector |
| ROADMAP | roadmap-designer |
| DEVELOPMENT | developer |
| REVIEW | reviewer |

#### Load base instructions

Read `docs/agent-system-prompt/en/base.md`. This content is injected into every worker sub-agent as `[BASE INSTRUCTIONS]`.

#### Load overrides

If `.harness/agents-overrides/<subagent_type>.md` exists, read it. Otherwise use an empty string.

#### Load spec handoff (REQUIREMENTS stage only)

When the current stage is `REQUIREMENTS`, check whether `.harness/spec.md` exists — it is the decision specification produced by a prior `/harness:analyze` cycle. If it exists, read it; its contents fill the `[SPEC HANDOFF]` block of the Task prompt. If the stage is not REQUIREMENTS, or the file is absent, omit that block entirely.

#### Log worker start

Ensure the log directory exists and append a STARTED line to `.harness/logs/pipeline.log`. Capture the real wall-clock timestamp:

`mkdir -p ".harness/logs" && echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <worker-name> | STARTED" >> ".harness/logs/pipeline.log"`

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

[BASE INSTRUCTIONS]
<docs/agent-system-prompt/base.md contents verbatim>

[SPEC HANDOFF]   ← only at the REQUIREMENTS stage, and only when .harness/spec.md exists
<.harness/spec.md contents verbatim, inside ``` fences>

This is the decision specification from a prior /harness:analyze cycle. If it is
relevant to this implementation cycle, use it to pre-fill requirements (Decisions /
Recommendations / Constraints → functional & non-functional requirements; Out of
Scope → explicit exclusions) and interview the user ONLY for genuine gaps. If it is
unrelated to this cycle's intent, ignore it and collect requirements normally.

[PREVIOUS ARTIFACTS]
ROADMAP: requirements.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md (if present)
REVIEW: requirements.md, roadmap.md, progress.md
(inline each file's content inside ``` fences)

[USER INTENT]   ← only when the captured `userIntent` from the top of this command is non-empty
<userIntent verbatim>

This is a free-form hint from the user about what they want this cycle to focus on
(e.g. "add T08", "fix login bug"). Treat it as a focus signal — narrow your Q&A or
implementation toward this. It does NOT override stage rules, completion criteria,
or existing artifacts. If it contradicts the current stage's role, ignore it.

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

#### After Task returns (normal completion)

When the Task tool returns successfully, **WITHOUT generating any further text and without summarizing the worker's output, immediately begin LOOP-4** by issuing its first tool call (`Read docs/validate.md`) as the very next action.

---

### LOOP-4. Run validation (inline `docs/validate.md` procedure)

If the worker finishes normally, **execute the validation procedure inline within this session**. The procedure is defined in `docs/validate.md` (not a slash command) — Read that file first, then perform its full procedure inline and hold the PASS / FAIL result as an internal variable.

**When the procedure completes (state.json has been updated), WITHOUT generating any further text, immediately call `Read .harness/state.json` as the very next action to begin LOOP-5.** Do not summarize validation results — LOOP-5 will print the appropriate message.

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
  - **MANDATORY**: Issue `Read .harness/state.json` as the immediate next action — no text, no pause, no user prompt. Validation FAIL with remaining retries is a normal, expected event that triggers automatic retry, NOT user intervention. Stopping or asking "should I continue?" here is a critical protocol violation that breaks the auto-loop contract.
- If `state.iteration >= state.maxRetries`:
  - Print `messages.retry_limit_reached` populated with `<stage>`
  - Stop loop

---

## Messages

**CRITICAL — Language selection**: You MUST select the variant that matches `config.uiLanguage` exactly. If `uiLanguage === 'ko'`, use the `ko:` text verbatim — never fall back to `en:`. If `uiLanguage === 'en'`, use `en:`. Using the wrong language is a protocol violation. Substitute `{...}` placeholders before printing.

### `all_done`

- **en**: `All stages complete. /harness:retro recommended`
- **ko**: `모든 단계 완료. /harness:retro 권장`

(Retained for backward compatibility — LOOP-1 no longer prints this on `/harness:run`.
The new behavior auto-recovers from a stuck DONE state. See `cycle_resumed` and `auto_retro` below.)

### `cycle_resumed`

- **en**:
  ```
  Previous cycle already retro'd but stage was stuck at DONE — resetting to REQUIREMENTS
  and starting next cycle.
  ```
- **ko**:
  ```
  이전 사이클 회고는 끝났지만 stage가 DONE에 박혀 있었음 — REQUIREMENTS로 리셋하고
  다음 사이클 시작합니다.
  ```

### `auto_retro`

- **en**:
  ```
  Stage is DONE without a retrospective entry — running retro inline first
  (it will reset stage to REQUIREMENTS), then continuing the loop.
  ```
- **ko**:
  ```
  Stage가 DONE인데 회고 기록이 없음 — 먼저 inline 회고를 실행합니다
  (회고가 stage를 REQUIREMENTS로 리셋함), 이후 루프를 이어갑니다.
  ```

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

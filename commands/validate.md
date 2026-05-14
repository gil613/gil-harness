---
description: Validate current stage artifacts (deterministic + inferential)
allowed-tools: Read, Edit, Bash, Task
---

# /harness:validate

Judges whether the current stage artifacts meet the quality bar to advance to the next stage. Proceeds in two phases:

1. **Deterministic validation** — run typecheck/lint/test/build directly via Bash in the parent session
2. **Inferential validation** — a validation sub-agent (Task) judges artifact quality

### Discipline (when invoked inline from `/harness:run`)

This procedure runs inside `/harness:run`'s tight tool-driven loop. The same **0-character output budget between tool calls** rule applies: the only user-visible text is the literal `messages.*` strings the procedure mandates and the deterministic results table. No greetings, no plan announcements, no summaries of intermediate Reads, no "I will now run typecheck…" narration. Read → Bash → Bash → Task → Edit, with mandated message prints inserted only where the procedure says so.

**Language**: All `messages.*` output MUST use the `config.uiLanguage` variant — if `uiLanguage === 'ko'`, print Korean text. Defaulting to English for a Korean-language project is a protocol violation.

## Procedure

### 1. Load state

- Read `.harness/state.json` and `.harness/config.json`
- Read `config.uiLanguage` — all subsequent user-facing output uses messages from the `## Messages` table below, keyed by this value
- If the current stage is `DONE`, print `messages.already_done` and exit

### 2. Deterministic validation (DEVELOPMENT and REVIEW stages only)

Run only when stage is `DEVELOPMENT` or `REVIEW`. Skip for REQUIREMENTS/ROADMAP.

Ensure the log directory exists first: `mkdir -p ".harness/logs"` (safe to run even if it already exists). Always double-quote the path — unquoted Windows absolute paths cause bash to strip backslashes, creating a malformed directory name in the CWD instead of the intended location.

Run the following commands from `config.json` sequentially via Bash:

1. `typecheckCmd` — type check
2. `lintCmd` — lint
3. `testCmd` — test
4. `buildCmd` — build

For each command:

- If empty string: SKIP
- Timeout: 10 minutes
- exit 0 → PASS
- non-zero exit → FAIL
- spawn failure → ERROR

Print each result to the console and accumulate in a results table:

```
[PASS|FAIL|SKIP|ERROR] <label>: <command> (exit <code>, <ms>ms)
```

After each command completes, append one structured line to `.harness/logs/pipeline.log` using Bash. Capture the real wall-clock timestamp at the moment of the append — never use a placeholder string.

`echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <label> | <STATUS>[| exit <code>]" >> ".harness/logs/pipeline.log"`

Append `| exit <code>` only on FAIL or ERROR. Do not write raw stdout/stderr to any file.

#### Deterministic failure handling

If any FAIL/ERROR/TIMEOUT occurs, do not proceed to inferential validation and fail immediately:

- `cause` = `messages.deterministic_cause` populated with `<label>`, `<status>`, `<code>`
- `plan` = `messages.deterministic_plan` populated with `<label>`, `<command>`
- If current stage is `REVIEW`, also set internal flag `regressTo = "DEVELOPMENT"` (broken code requires the developer agent, not another reviewer pass)
- Proceed to the "failure handling" procedure (step 5 below)

### 2b. Structural pre-checks (REQUIREMENTS and ROADMAP stages only)

Run only when stage is `REQUIREMENTS` or `ROADMAP`. Skip for DEVELOPMENT/REVIEW (step 2 covers those).

These bash checks catch obvious structural failures before the inferential LLM call. If any fail, skip directly to step 5b (failure handling).

#### REQUIREMENTS

```bash
test -f ".harness/requirements.md" && echo "EXISTS" || echo "MISSING"
grep -ic "TBD\|TODO" ".harness/requirements.md" 2>/dev/null || echo "0"
```

- File missing → FAIL: `cause` = `messages.structural_missing` with `{file}=requirements.md`, `plan` = `messages.structural_missing_plan` with `{file}=requirements.md`
- TBD/TODO count > 0 → FAIL: `cause` = `messages.structural_tbd`, `plan` = `messages.structural_tbd_plan`

#### ROADMAP

```bash
test -f ".harness/roadmap.md" && echo "EXISTS" || echo "MISSING"
grep -c "^T[0-9]" ".harness/roadmap.md" 2>/dev/null || echo "0"
```

- File missing → FAIL: `cause` = `messages.structural_missing` with `{file}=roadmap.md`, `plan` = `messages.structural_missing_plan` with `{file}=roadmap.md`
- Task count == 0 → FAIL: `cause` = `messages.structural_no_tasks`, `plan` = `messages.structural_no_tasks_plan`

### 3. Inferential validation — call validation sub-agent

stage → sub-agent:

| stage | sub-agent |
|-------|-----------|
| REQUIREMENTS | requirements-validator |
| ROADMAP | roadmap-validator |
| DEVELOPMENT | development-validator |
| REVIEW | review-validator |

#### 3-1. Load overrides

If `.harness/agents-overrides/<subagent_type>.md` exists, read it. Otherwise treat as an empty string. This content is inlined into the `[OVERRIDE]` block of the Task prompt.

#### 3-2. Task prompt template

Call via the `Task` tool. Use the structure below exactly (omit blocks that do not apply):

```
[STAGE]
<current stage name>

[CONFIG]
<full .harness/config.json>

[OUTPUT LANGUAGE]
{config.uiLanguage}

The body text of REASON and FIX_PLAN MUST be in this language — they are surfaced
to the user verbatim. Protocol labels (VALIDATION_RESULT, PASS, FAIL, REASON,
FIX_PLAN, REGRESS_TO, stage names, artifact section headers) MUST stay verbatim
in English. See your agent's "Output Language" section for the exact list.

[ATTACHED ARTIFACTS]
REQUIREMENTS: requirements.md
ROADMAP: requirements.md, roadmap.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md
REVIEW: requirements.md, roadmap.md, review-report.md
(inline each file's content inside ``` fences)

[DETERMINISTIC VALIDATION RESULTS]   ← DEVELOPMENT/REVIEW only
| Label | Status | exit | ms |
| --- | --- | --- | --- |
| typecheck | ... | ... | ... |
...
(inline the full table)

[OVERRIDE]   ← only when agents-overrides file exists
<file contents verbatim>

[INSTRUCTIONS]
Output the verdict on the last line block in exactly one of these formats:
  VALIDATION_RESULT: PASS
or
  VALIDATION_RESULT: FAIL
  REASON: <one line>
  FIX_PLAN: <remediation direction>
or (regress to a previous stage — only when the validator agent supports it; e.g., review-validator)
  VALIDATION_RESULT: FAIL
  REASON: <one line>
  FIX_PLAN: <remediation direction>
  REGRESS_TO: <STAGE NAME>
```

### 4. Parse result

From the text returned by the sub-agent:

- Extract `VALIDATION_RESULT: (PASS|FAIL)`
- If neither matches, **treat as a runtime error, do not increment iteration**. Print `messages.parse_error` and exit.
- If `VALIDATION_RESULT: FAIL`, also try to extract `REGRESS_TO: <STAGE>`. If present and the value is one of `REQUIREMENTS|ROADMAP|DEVELOPMENT|REVIEW`, set the internal flag `regressTo = <STAGE>` (overrides any value set in step 2). Otherwise leave `regressTo` unset.

### 5a. PASS handling

Append the inferential result to `.harness/logs/pipeline.log` (use the actual validator sub-agent name from the table in step 3):

`echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <validator-name> | PASS" >> ".harness/logs/pipeline.log"`

Update `state.json` (Edit):

- `stage` → next stage (`STAGES[indexOf+1]`)
- `iteration` → 0
- `lastValidated` → current ISO 8601 timestamp
- `failures` → `[]` (reset accumulated failures on PASS)
- `history` → append `{ stage, completedAt }` to the existing array

Print `messages.validation_passed` populated with `<prev>` and `<next>`.

Only when invoked directly (`/harness:validate` standalone), also print `messages.next_hint`.

Omit `messages.next_hint` when called inline within the `/harness:run` loop — run will continue the loop automatically.

### 5b. FAIL handling

Extract `REASON: <one line>` and `FIX_PLAN: <block>` from the sub-agent response. Also use the `regressTo` flag set in step 2 (deterministic) or step 4 (REGRESS_TO).

Append the inferential result to `.harness/logs/pipeline.log` (validator name from step 3; REASON condensed to one line):

`echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <validator-name> | FAIL | <REASON>" >> ".harness/logs/pipeline.log"`

Update `state.json` (Edit):

- `iteration` → +1
- If `regressTo` is set AND `new iteration < maxRetries`:
  - `stage` → `regressTo` (regress to the specified earlier stage; the developer/etc. handles remediation in the next loop)
  - iteration carries over (each FAIL counts toward the global retry budget regardless of stage)
- Otherwise: `stage` unchanged (same-stage retry)
- `failures` → append the following object to the end of the existing array. **If the length exceeds maxRetries, remove the oldest entries (keep only the most recent maxRetries entries)**:
  ```json
  {
    "stage": "<stage at time of failure>",
    "attempt": <new iteration>,
    "cause": "<REASON>",
    "plan": "<FIX_PLAN>",
    "timestamp": "<ISO timestamp>",
    "deterministic": [<label/status/exit summary if deterministic validation ran>],
    "regressedTo": "<regressTo if set, omit otherwise>"
  }
  ```

If `regressTo` is unset, print `messages.validation_failed` populated with `<stage>`, `<cause>`, `<plan>`, `<remaining>`.
If `regressTo` is set and applied, print `messages.validation_failed_regress` populated with `<stage>`, `<regressTo>`, `<cause>`, `<plan>`, `<remaining>`.

If `new iteration >= maxRetries`, additionally print `messages.retry_limit_reached`.

---

## Messages

**CRITICAL — Language selection**: Select the variant matching `config.uiLanguage` exactly. If `uiLanguage === 'ko'`, use `ko:` text — never `en:`. Substitute `{...}` placeholders before printing.

### `already_done`

- **en**: `Done. /harness:retro recommended`
- **ko**: `완료. /harness:retro 권장`

### `deterministic_cause`

- **en**: `Deterministic validation failed — {label}={status}(exit {code})`
- **ko**: `결정론 검증 실패 — {label}={status}(exit {code})`

### `deterministic_plan`

- **en**: `Resolve {label}({command}) failure first. Details in .harness/logs/pipeline.log`
- **ko**: `먼저 {label}({command}) 실패를 해결하세요. 상세: .harness/logs/pipeline.log`

### `parse_error`

- **en**: `Validator returned malformed output (no VALIDATION_RESULT line). Treating as runtime error; iteration not incremented. Re-run /harness:validate or /harness:run to retry.`
- **ko**: `검증 에이전트 출력이 형식에 맞지 않습니다(VALIDATION_RESULT 라인 없음). 런타임 오류로 처리하며 iteration은 증가하지 않습니다. /harness:validate 또는 /harness:run을 다시 실행해 재시도하세요.`

### `validation_passed`

- **en**: `Validation passed: {prev} -> {next}`
- **ko**: `검증 통과: {prev} -> {next}`

### `next_hint`

- **en**: `Next: /harness:run    (or /harness:retro if DONE)`
- **ko**: `다음: /harness:run    (DONE이면 /harness:retro)`

### `validation_failed`

- **en**:
  ```
  Validation failed: {stage}
  Cause:      {cause}
  Fix plan:   {plan}

  Retries remaining: {remaining}
  ```
- **ko**:
  ```
  검증 실패: {stage}
  원인:        {cause}
  수정 계획:   {plan}

  남은 재시도: {remaining}
  ```

### `validation_failed_regress`

- **en**:
  ```
  Validation failed: {stage}  → regressing to {regressTo}
  Cause:      {cause}
  Fix plan:   {plan}

  Retries remaining: {remaining}
  ```
- **ko**:
  ```
  검증 실패: {stage}  → {regressTo}로 회귀
  원인:        {cause}
  수정 계획:   {plan}

  남은 재시도: {remaining}
  ```

### `structural_missing`

- **en**: `Structural check failed — {file} does not exist`
- **ko**: `구조 사전검사 실패 — {file} 없음`

### `structural_missing_plan`

- **en**: `Run the appropriate worker agent to generate {file} first`
- **ko**: `{file}을(를) 먼저 생성하는 워커 에이전트를 실행하세요`

### `structural_tbd`

- **en**: `Structural check failed — requirements.md contains unresolved TBD/TODO placeholders`
- **ko**: `구조 사전검사 실패 — requirements.md에 TBD/TODO 미확정 항목이 있습니다`

### `structural_tbd_plan`

- **en**: `Replace all TBD/TODO entries in requirements.md with concrete answers, then re-run /harness:validate`
- **ko**: `requirements.md의 TBD/TODO 항목을 모두 구체적인 내용으로 교체한 뒤 /harness:validate를 다시 실행하세요`

### `structural_no_tasks`

- **en**: `Structural check failed — roadmap.md contains no task definitions (expected T01, T02, ...)`
- **ko**: `구조 사전검사 실패 — roadmap.md에 태스크 정의가 없습니다 (T01, T02, ... 형식 필요)`

### `structural_no_tasks_plan`

- **en**: `Re-run the roadmap designer to generate task definitions in roadmap.md`
- **ko**: `로드맵 디자이너를 다시 실행하여 roadmap.md에 태스크를 정의하세요`

### `retry_limit_reached`

- **en**:
  ```
  Retry limit reached — user intervention required.
  Modify agent instructions (.harness/agents or plugin agents/) or requirements,
  then reset with /harness:reset.
  ```
- **ko**:
  ```
  재시도 한도 도달 — 사용자 개입이 필요합니다.
  에이전트 지침(.harness/agents 또는 플러그인 agents/)이나 요구사항을 수정한 뒤
  /harness:reset으로 초기화하세요.
  ```

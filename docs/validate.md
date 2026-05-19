# Validation Procedure

> Internal procedure executed inline by `/harness:run` (LOOP-4). Not a standalone slash command. Tools used: Read, Edit, Bash, Task.

Judges whether the current stage artifacts meet the quality bar to advance to the next stage. The validation path depends on the stage:

- **REQUIREMENTS / ROADMAP** — structural pre-checks (Bash) followed by **inferential validation**: a validator sub-agent (Task) judges artifact quality.
- **DEVELOPMENT / REVIEW** — **fully deterministic**: the typecheck/lint/test/build commands plus structural checks on the stage artifact. No validator sub-agent. The inferential safety net for code is the `reviewer` agent itself — it reads the actual source in the REVIEW stage, a stronger check than re-reading `progress.md` prose. The REVIEW deterministic check then routes the reviewer's recorded verdict.

### Discipline

This procedure runs inside `/harness:run`'s tight tool-driven loop. The same **0-character output budget between tool calls** rule applies: the only user-visible text is the literal `messages.*` strings the procedure mandates and the deterministic results table. No greetings, no plan announcements, no summaries of intermediate Reads, no "I will now run typecheck…" narration. Read → Bash → … → Edit, with mandated message prints inserted only where the procedure says so.

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

If any FAIL/ERROR/TIMEOUT occurs, do not proceed to step 2b structural validation and fail immediately:

- `cause` = `messages.deterministic_cause` populated with `<label>`, `<status>`, `<code>`
- `plan` = `messages.deterministic_plan` populated with `<label>`, `<command>`
- If current stage is `REVIEW`, also set internal flag `regressTo = "DEVELOPMENT"` (broken code requires the developer agent, not another reviewer pass)
- Proceed to the "failure handling" procedure (step 5 below)

### 2b. Structural validation

Bash checks on the current stage's artifact. For `REQUIREMENTS` / `ROADMAP` these are **pre-checks** that catch obvious structural failures before the inferential call in step 3. For `DEVELOPMENT` / `REVIEW` these are the **complete artifact validation** — there is no step-3 sub-agent for those stages.

Run only the subsection matching the current stage. Always double-quote paths. `grep -c` prints the count (`0` included) on stdout regardless of exit code.

Routing after this step:

- Any check fails → set `cause` / `plan` (and `regressTo` where the subsection says so) and skip to step 5b.
- All checks pass AND stage is `DEVELOPMENT` or `REVIEW` → artifact validation is complete; **skip steps 3–4** and go to step 5a.
- All checks pass AND stage is `REQUIREMENTS` or `ROADMAP` → continue to step 3.

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

#### DEVELOPMENT

Reached only after step 2's deterministic commands all PASS/SKIP. Validates `.harness/progress.md`.

```bash
test -f ".harness/progress.md" && echo "progress=EXISTS" || echo "progress=MISSING"
for h in "## Done" "## In Progress" "## Pending" "## Failure History"; do
  printf '%s=' "$h"; grep -cFx "$h" ".harness/progress.md" 2>/dev/null
done
echo "open=$(grep -cE '^- \[ \]' '.harness/progress.md' 2>/dev/null)"
echo "failures=$(grep -cE '^- T[0-9]' '.harness/progress.md' 2>/dev/null)"
echo "done=$(grep -cE '^- \[x\]' '.harness/progress.md' 2>/dev/null)"
echo "total=$(grep -cE '^T[0-9]' '.harness/roadmap.md' 2>/dev/null)"
```

Evaluate in order; on the first failing check set `cause` / `plan` and skip to step 5b. **All DEVELOPMENT failures are same-stage retries** (never set `regressTo`).

1. `progress=MISSING` → `cause` = `messages.structural_missing` with `{file}=progress.md`, `plan` = `messages.structural_missing_plan` with `{file}=progress.md`
2. Any of the four headers not present exactly once → `cause` = `messages.dev_struct_headers`, `plan` = `messages.dev_struct_headers_plan`
3. `open + failures > 0` (unfinished `- [ ]` items or `- T..` Failure History entries remain) → `cause` = `messages.dev_struct_incomplete` with `{open}` and `{failures}`, `plan` = `messages.dev_struct_incomplete_plan`
4. `done ≠ total` → `cause` = `messages.dev_struct_coverage` with `{done}` and `{total}`, `plan` = `messages.dev_struct_coverage_plan`

All four pass → DEVELOPMENT validation PASS; go to step 5a.

> Semantic acceptance-criteria verification is **not** done here. It is the `reviewer` agent's job in the next stage — the reviewer reads the actual source, which subsumes re-judging `progress.md` evidence prose.

#### REVIEW

Reached only after step 2's deterministic commands all PASS/SKIP. Validates `.harness/review-report.md`.

```bash
test -f ".harness/review-report.md" && echo "report=EXISTS" || echo "report=MISSING"
for h in "## Verification Command Results" "## Findings and Actions" "### Critical" "### Major" "### Minor" "## Final Verdict"; do
  printf '%s=' "$h"; grep -cFx "$h" ".harness/review-report.md" 2>/dev/null
done
echo "markers=$(grep -cE '\[Fixed\]|\[Resolved\]|\[수정 완료\]|\[해결됨\]' '.harness/review-report.md' 2>/dev/null)"
awk '/^### Critical$/{s=1;next} /^### Major$/{s=2;next} /^### Minor$/{s=3;next} /^## /{s=0} s==1&&/^- /{c++} s==2&&/^- /{m++} END{print "critical="c+0" major="m+0}' ".harness/review-report.md" 2>/dev/null
echo "verdict=$(grep -A2 -Fx '## Final Verdict' '.harness/review-report.md' 2>/dev/null | grep -oE 'PASS|FAIL' | head -1)"
```

`critical` / `major` count column-0 `- ` bullets inside the `### Critical` / `### Major` sections — the reviewer agent's mandated finding format (empty section = the literal `_none_`, one bullet = one finding).

Evaluate in order; on the first failing check set `cause` / `plan` (and `regressTo` where noted) and skip to step 5b.

1. `report=MISSING`, OR any of the six headers not present exactly once, OR `verdict` is neither `PASS` nor `FAIL` → reviewer output defect → `cause` = `messages.review_struct_defect`, `plan` = `messages.review_struct_defect_plan`. **Same-stage retry** — do NOT set `regressTo`.
2. `markers > 0` → reviewer applied in-place fixes → `cause` = `messages.review_struct_markers`, `plan` = `messages.review_struct_markers_plan`, set `regressTo = "DEVELOPMENT"`.
3. `critical + major > 0` → `cause` = `messages.review_struct_findings` with `{critical}` and `{major}`, `plan` = `messages.review_struct_findings_plan`, set `regressTo = "DEVELOPMENT"`.
4. `verdict == FAIL` → `cause` = `messages.review_struct_verdict`, `plan` = `messages.review_struct_verdict_plan`, set `regressTo = "DEVELOPMENT"`.

All checks pass (report well-formed, no markers, zero Critical/Major, `verdict == PASS`) → REVIEW validation PASS; go to step 5a (advances to `DONE`).

### 3. Inferential validation — call validator sub-agent (REQUIREMENTS and ROADMAP only)

Run only when stage is `REQUIREMENTS` or `ROADMAP`. For `DEVELOPMENT` / `REVIEW`, step 2b already produced the verdict — those stages never reach this step.

stage → sub-agent:

| stage | sub-agent |
|-------|-----------|
| REQUIREMENTS | requirements-validator |
| ROADMAP | roadmap-validator |

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
(inline each file's content inside ``` fences)

[OVERRIDE]   ← only when agents-overrides file exists
<file contents verbatim>

[INSTRUCTIONS]
Output the verdict on the last line block in exactly one of these formats:
  VALIDATION_RESULT: PASS
or
  VALIDATION_RESULT: FAIL
  REASON: <one line>
  FIX_PLAN: <remediation direction>
or (regress to a previous stage — only when the validator agent supports it)
  VALIDATION_RESULT: FAIL
  REASON: <one line>
  FIX_PLAN: <remediation direction>
  REGRESS_TO: <STAGE NAME>
```

### 4. Parse result (REQUIREMENTS and ROADMAP only)

For `DEVELOPMENT` / `REVIEW`, step 2b already set the verdict plus `cause` / `plan` / `regressTo` — skip straight to step 5.

From the text returned by the sub-agent:

- Extract `VALIDATION_RESULT: (PASS|FAIL)`
- If neither matches, **treat as a runtime error, do not increment iteration**. Print `messages.parse_error` and exit.
- If `VALIDATION_RESULT: FAIL`, also try to extract `REGRESS_TO: <STAGE>`. If present and the value is one of `REQUIREMENTS|ROADMAP|DEVELOPMENT|REVIEW`, set the internal flag `regressTo = <STAGE>` (overrides any value set in step 2). Otherwise leave `regressTo` unset.

### 5a. PASS handling

Append the validation result to `.harness/logs/pipeline.log`. For `<validator-name>` use the step-3 sub-agent name (REQUIREMENTS/ROADMAP) or the literal `structural` (DEVELOPMENT/REVIEW):

`echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <validator-name> | PASS" >> ".harness/logs/pipeline.log"`

Update `state.json` (Edit):

- `stage` → next stage (`STAGES[indexOf+1]`)
- `iteration` → 0
- `lastValidated` → current ISO 8601 timestamp
- `failures` → `[]` (reset accumulated failures on PASS)
- `history` → append `{ stage, completedAt }` to the existing array

Print `messages.validation_passed` populated with `<prev>` and `<next>`.

Do not print any "next step" hint — `/harness:run` continues the loop automatically.

### 5b. FAIL handling

Determine `cause` and `plan`:

- REQUIREMENTS / ROADMAP: extract `REASON: <one line>` → `cause` and `FIX_PLAN: <block>` → `plan` from the sub-agent response.
- DEVELOPMENT / REVIEW, or any step 2 / 2b structural failure: `cause` / `plan` are already populated from the `messages.*` entries by step 2 or step 2b.

Use the `regressTo` flag set in step 2 (deterministic REVIEW failure), step 2b (REVIEW structural failure), or step 4 (REGRESS_TO).

Append the validation result to `.harness/logs/pipeline.log` (`<validator-name>` = step-3 sub-agent name for REQUIREMENTS/ROADMAP, else `structural`; REASON condensed to one line):

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

- **en**: `Validator returned malformed output (no VALIDATION_RESULT line). Treating as runtime error; iteration not incremented. Re-run /harness:run to retry.`
- **ko**: `검증 에이전트 출력이 형식에 맞지 않습니다(VALIDATION_RESULT 라인 없음). 런타임 오류로 처리하며 iteration은 증가하지 않습니다. /harness:run을 다시 실행해 재시도하세요.`

### `validation_passed`

- **en**: `Validation passed: {prev} -> {next}`
- **ko**: `검증 통과: {prev} -> {next}`

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

- **en**: `Replace all TBD/TODO entries in requirements.md with concrete answers, then re-run /harness:run`
- **ko**: `requirements.md의 TBD/TODO 항목을 모두 구체적인 내용으로 교체한 뒤 /harness:run을 다시 실행하세요`

### `structural_no_tasks`

- **en**: `Structural check failed — roadmap.md contains no task definitions (expected T01, T02, ...)`
- **ko**: `구조 사전검사 실패 — roadmap.md에 태스크 정의가 없습니다 (T01, T02, ... 형식 필요)`

### `structural_no_tasks_plan`

- **en**: `Re-run the roadmap designer to generate task definitions in roadmap.md`
- **ko**: `로드맵 디자이너를 다시 실행하여 roadmap.md에 태스크를 정의하세요`

### `dev_struct_headers`

- **en**: `Structural check failed — progress.md is missing required section headers (Done / In Progress / Pending / Failure History)`
- **ko**: `구조 검사 실패 — progress.md에 필수 섹션 헤더(Done / In Progress / Pending / Failure History)가 누락됨`

### `dev_struct_headers_plan`

- **en**: `Restore all four "## " section headers in progress.md exactly as the developer agent's output template specifies`
- **ko**: `progress.md에 네 개의 "## " 섹션 헤더를 developer 에이전트 출력 템플릿대로 정확히 복원하세요`

### `dev_struct_incomplete`

- **en**: `Structural check failed — progress.md still has unfinished work (open items: {open}, Failure History entries: {failures})`
- **ko**: `구조 검사 실패 — progress.md에 미완 작업이 남음 (미완 항목: {open}건, Failure History: {failures}건)`

### `dev_struct_incomplete_plan`

- **en**: `Finish every remaining task and remove resolved Failure History entries — In Progress, Pending, and Failure History must all be empty to leave DEVELOPMENT`
- **ko**: `남은 태스크를 모두 완료하고 해결된 Failure History 항목을 제거하세요 — In Progress·Pending·Failure History가 모두 비어야 DEVELOPMENT를 벗어납니다`

### `dev_struct_coverage`

- **en**: `Structural check failed — Done task count ({done}) does not match roadmap task count ({total})`
- **ko**: `구조 검사 실패 — Done 태스크 수({done})가 로드맵 태스크 수({total})와 불일치`

### `dev_struct_coverage_plan`

- **en**: `Implement every roadmap task (T01, T02, ...) and record it under Done in progress.md with per-AC evidence`
- **ko**: `로드맵의 모든 태스크(T01, T02, ...)를 구현하고 progress.md의 Done에 AC별 증거와 함께 기록하세요`

### `review_struct_defect`

- **en**: `Structural check failed — review-report.md is malformed (missing required sections or unparseable Final Verdict)`
- **ko**: `구조 검사 실패 — review-report.md 형식 오류 (필수 섹션 누락 또는 Final Verdict 파싱 불가)`

### `review_struct_defect_plan`

- **en**: `Re-run the reviewer agent and emit review-report.md with all required sections and a PASS/FAIL Final Verdict`
- **ko**: `reviewer 에이전트를 다시 실행해 필수 섹션과 PASS/FAIL Final Verdict를 모두 갖춘 review-report.md를 생성하세요`

### `review_struct_markers`

- **en**: `Structural check failed — review-report.md contains in-place fix markers; the reviewer is discovery-only`
- **ko**: `구조 검사 실패 — review-report.md에 직접 수정 마커가 있음; 리뷰어는 발견 전용`

### `review_struct_markers_plan`

- **en**: `Treat every marked item as an open finding. The developer agent applies the fixes in the DEVELOPMENT stage`
- **ko**: `마커가 붙은 항목을 모두 미해결 finding으로 처리하세요. 수정은 DEVELOPMENT 단계에서 developer 에이전트가 담당합니다`

### `review_struct_findings`

- **en**: `Review found blocking issues — Critical: {critical}, Major: {major}`
- **ko**: `리뷰에서 차단 이슈 발견 — Critical: {critical}건, Major: {major}건`

### `review_struct_findings_plan`

- **en**: `Fix every Critical and Major finding listed in review-report.md, then re-run the pipeline`
- **ko**: `review-report.md에 나열된 Critical·Major finding을 모두 수정한 뒤 파이프라인을 다시 실행하세요`

### `review_struct_verdict`

- **en**: `Review Final Verdict is FAIL`
- **ko**: `리뷰 Final Verdict가 FAIL`

### `review_struct_verdict_plan`

- **en**: `Address the issues recorded in review-report.md's Final Verdict reason, then re-run the pipeline`
- **ko**: `review-report.md의 Final Verdict 사유에 적힌 문제를 해결한 뒤 파이프라인을 다시 실행하세요`

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

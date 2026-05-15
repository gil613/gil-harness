---
description: 분석 사이클 자동 실행 (ANALYSIS → SPECIFICATION → DONE) — 검증 실패 시 자동 재시도/회귀
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
argument-hint: "[분석 대상/의도, 예: 'auth 모듈 회귀 테스트 영향', 'PRD 초안 검토']"
---

# /harness:analyze

분석 전용 사이클. **`/harness:run`(구현 사이클)과 별도의 state 파일**(`.harness/analyzer-state.json`)을 사용해 충돌 없이 병행 가능하다.

흐름: `ANALYSIS → SPECIFICATION → DONE` (각 단계 직후 inline validator)

산출물: `.harness/analysis.md`, `.harness/spec.md`

### 사용자 의도 캡처

`/harness:analyze` 뒤에 인자(`$ARGUMENTS`)가 있으면 trim 후 `userIntent`로 보관. 워커 sub-agent에 `[USER INTENT]` 블록으로 전달. 비어 있으면 ANALYSIS 단계의 analyzer가 사용자에게 1회 물어본다.

---

## Loop Procedure

DONE에 도달하거나 정지 조건이 발생할 때까지 반복.

### 루프 규율

도구 호출 사이에는 **0자 출력**. `## Messages` 표가 명시적으로 출력하라고 한 문자열만 허용. 인사·진행상황 요약·계획 announce 금지. (`/harness:run`과 동일 규율 — 자세한 금지 패턴은 `commands/run.md` 참고)

정지 조건: `state.iteration >= state.maxRetries`, 워커 실패, DONE 도달.

---

### A-1. State 로드 / 부트스트랩

- `.harness/config.json`을 읽어 `uiLanguage` 확인 (없으면 `ko`로 가정)
- `.harness/analyzer-state.json`을 읽는다. **없으면** 다음으로 새로 생성하고 진행:

  ```json
  {
    "schemaVersion": 1,
    "stage": "ANALYSIS",
    "iteration": 0,
    "maxRetries": 3,
    "lastValidated": null,
    "failures": [],
    "history": []
  }
  ```

- `state.stage === 'DONE'`이면:
  - 사용자가 다시 `/harness:analyze`를 호출했다는 것은 새 사이클을 원한다는 신호. `stage`를 `ANALYSIS`로, `iteration`을 0으로, `failures`를 `[]`로, `lastValidated`를 `null`로 리셋. `messages.cycle_resumed` 출력 후 즉시 다음 액션으로 state 재로드
- `state.iteration >= state.maxRetries`면 `messages.retry_limit` 출력 후 정지

---

### A-2. 직전 실패 echo

`state.failures`의 마지막 entry가 현재 stage와 일치하면 `messages.previous_failure`에 `<cause>`/`<plan>`을 채워 출력. 이 정보는 워커에 `[PREVIOUS FAILURE]` 블록으로도 전달.

이후 즉시 A-3로.

---

### A-3. 워커 호출

stage → sub-agent 매핑:

| stage | sub-agent | artifact |
|-------|-----------|----------|
| ANALYSIS | analyzer | `.harness/analysis.md` |
| SPECIFICATION | specifier | `.harness/spec.md` |

#### 사전 자료 로드

- `docs/agent-system-prompt/en/base.md`를 읽어 `[BASE INSTRUCTIONS]`로 주입 (파일이 없으면 빈 문자열)
- 이전 산출물:
  - SPECIFICATION 단계에서는 `.harness/analysis.md`를 읽어 `[PREVIOUS ARTIFACTS]`에 inline (없으면 워커 실패 처리 — 분석 없이 명세 불가)

#### 워커 시작 로깅

```bash
mkdir -p ".harness/logs" && echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <worker> | STARTED" >> ".harness/logs/analyzer-pipeline.log"
```

#### Task 프롬프트 템플릿

```
[STAGE]
<현재 stage 이름>

[CONFIG]
<.harness/config.json 전문>

[OUTPUT LANGUAGE]
{config.uiLanguage}

본문·사용자 대화는 모두 이 언어로. 프로토콜 식별자(섹션 헤더, VALIDATION_RESULT, REGRESS_TO 등)는 영문 그대로.

[BASE INSTRUCTIONS]
<docs/agent-system-prompt/en/base.md verbatim — 없으면 생략>

[PREVIOUS ARTIFACTS]   ← SPECIFICATION 단계에서만
analysis.md:
```
<analysis.md 내용>
```

[USER INTENT]   ← userIntent가 비어 있지 않을 때만
<userIntent verbatim>

[PREVIOUS FAILURE]   ← state.failures의 마지막 entry가 현재 stage와 매치할 때만
Cause: <cause>
Fix plan: <plan>

[INSTRUCTIONS]
산출물을 .harness/<artifact>.md로 저장. 한 줄로 보고 후 종료.
```

#### 워커 실패 처리

워커 sub-agent가 실패하거나 abort하면 state 변경하지 말고 정지. `messages.worker_failed`에 `<reason>` 채워 출력. (검증 실패와는 다름 — iteration 카운터 증가 안 함)

#### 워커 정상 종료 후

즉시 A-4로 (검증 inline 실행). 워커 출력 요약 출력 금지.

---

### A-4. 검증 (inline)

stage → validator 매핑:

| stage | validator |
|-------|-----------|
| ANALYSIS | analysis-validator |
| SPECIFICATION | spec-validator |

해당 validator를 Task로 호출. 프롬프트는 동일 템플릿(`[CONFIG]`, `[BASE INSTRUCTIONS]`만 필요)에 다음 한 줄 instruction:

```
[INSTRUCTIONS]
.harness/<artifact>.md를 위 체크리스트로 판정하고 마지막 줄에 VALIDATION_RESULT를 출력하라.
```

validator 응답에서 마지막 줄들을 파싱:
- `VALIDATION_RESULT: PASS` → PASS
- `VALIDATION_RESULT: FAIL` + `REASON:` + `FIX_PLAN:` (+ 선택적으로 `REGRESS_TO: ANALYSIS`) → FAIL

#### State 갱신

PASS:
- `state.lastValidated = "<stage>"`
- `state.history`에 `{ "stage": "<stage>", "result": "PASS", "ts": "<utc>" }` push
- `state.iteration = 0` (다음 단계의 카운터 리셋)
- stage 진행: `ANALYSIS → SPECIFICATION → DONE`

FAIL:
- `state.iteration += 1`
- `state.failures`에 `{ "stage": "<stage>", "cause": "<reason>", "plan": "<fix_plan>", "ts": "<utc>" }` push
- `REGRESS_TO: ANALYSIS`가 있으면 `state.stage = "ANALYSIS"` (회귀)

검증 결과를 `.harness/logs/analyzer-pipeline.log`에 한 줄 append:

```bash
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <validator> | <PASS|FAIL>" >> ".harness/logs/analyzer-pipeline.log"
```

state 저장 후 즉시 A-5로.

---

### A-5. 분기

state를 다시 읽고:

#### A-5a. PASS

- 새 `state.stage === 'DONE'`이면: `messages.cycle_done` 출력 후 정지
- 아니면: `messages.stage_advanced`에 `<prev>`/`<new>` 채워 출력 후 즉시 A-1으로 재진입

#### A-5b. FAIL

- `state.iteration < state.maxRetries`:
  - 회귀 발생(이전 stage와 다름) → `messages.stage_regressed_retry` 출력
  - 같은 stage 재시도 → `messages.stage_failed_retry` 출력
  - 즉시 A-1으로 재진입 (사용자 확인 절대 금지)
- `state.iteration >= state.maxRetries`:
  - `messages.retry_limit_reached` 출력 후 정지

---

## Messages

`config.uiLanguage`로 분기. 한국어 우선 — 영어는 추후 필요시 추가.

### `cycle_resumed`
- **ko**: `이전 분석 사이클이 DONE 상태였음 — ANALYSIS로 리셋하고 새 사이클 시작합니다.`
- **en**: `Previous analyze cycle was DONE — resetting to ANALYSIS and starting a new cycle.`

### `retry_limit`
- **ko**: `재시도 한도 도달 — analyzer/specifier 지침을 수정하거나 사용자 의도를 다시 알려주세요`
- **en**: `Retry limit reached — adjust analyzer/specifier instructions or restate user intent`

### `previous_failure`
- **ko**:
  ```
  이전 실패 원인: {cause}
  수정 계획:      {plan}
  ```
- **en**:
  ```
  Previous failure cause: {cause}
  Fix plan:               {plan}
  ```

### `worker_failed`
- **ko**: `워커 에이전트 실패: {reason} — /harness:analyze로 재시도하세요`
- **en**: `Worker agent failed: {reason} — re-run /harness:analyze to retry`

### `cycle_done`
- **ko**: `✓ 분석 사이클 완료 (ANALYSIS→SPECIFICATION→DONE) — .harness/analysis.md, .harness/spec.md 확인하세요`
- **en**: `✓ Analyze cycle complete (ANALYSIS→SPECIFICATION→DONE) — see .harness/analysis.md and .harness/spec.md`

### `stage_advanced`
- **ko**: `✓ {prev} 완료 → {new} 시작`
- **en**: `✓ {prev} done → starting {new}`

### `stage_failed_retry`
- **ko**:
  ```
  ✗ {stage} 검증 실패 (시도 {iteration}/{maxRetries})
     원인: {cause}
     수정 계획: {plan}
     → 같은 단계 재시도...
  ```
- **en**:
  ```
  ✗ {stage} validation failed (attempt {iteration}/{maxRetries})
     Cause: {cause}
     Fix plan: {plan}
     → Retrying same stage...
  ```

### `stage_regressed_retry`
- **ko**:
  ```
  ✗ {fromStage} 검증 실패 (시도 {iteration}/{maxRetries}) — {toStage}로 자동 회귀
     원인: {cause}
     수정 계획: {plan}
     → analyzer가 보강 후 재진입합니다...
  ```
- **en**:
  ```
  ✗ {fromStage} validation failed (attempt {iteration}/{maxRetries}) — regressing to {toStage}
     Cause: {cause}
     Fix plan: {plan}
     → analyzer will reinforce and re-enter...
  ```

### `retry_limit_reached`
- **ko**:
  ```
  ✗ {stage} 재시도 한도 도달 — 사용자 개입 필요
     analyzer/specifier 오버라이드(.harness/agents-overrides/) 또는 사용자 의도를 다시 정리한 뒤
     .harness/analyzer-state.json의 iteration을 0으로 리셋
  ```
- **en**:
  ```
  ✗ {stage} retry limit reached — user intervention required
     Update analyzer/specifier overrides (.harness/agents-overrides/) or restate intent,
     then reset iteration to 0 in .harness/analyzer-state.json
  ```

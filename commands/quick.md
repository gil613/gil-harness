---
description: 작은 변경용 fast-path 자동 실행 (PLAN → DEVELOPMENT → REVIEW → DONE) — REQUIREMENTS/ROADMAP을 단일 PLAN으로 압축
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
argument-hint: "[변경 요청 — 예: 'login 버튼 색상 토큰화', 'config 파서 null 처리 버그 수정']"
---

# /harness:quick

작은 변경용 fast-path 사이클. 전체 사이클(`/harness:run`)의 REQUIREMENTS 인터뷰 + ROADMAP 웨이브 설계 두 단계를 **인터뷰 없는 단일 PLAN 단계**로 압축한다. 작은 버그 수정·소규모 기능 변경에 적합하다.

**`/harness:run`(구현 사이클)·`/harness:analyze`(분석 사이클)와 별도의 state 파일**(`.harness/quick-state.json`)을 사용해 충돌 없이 병행 가능하다.

흐름: `PLAN → DEVELOPMENT → REVIEW → DONE`

검증 방식: PLAN은 결정론 구조 검사, DEVELOPMENT/REVIEW는 `/harness:run`과 동일한 결정론 검증(`docs/validate.md`).

큰 기능 신규 설계나 사용자 인터뷰가 필요한 모호한 요구사항은 fast-path 대상이 아니다 — `quick-planner`가 규모 초과로 판정하면 `/harness:run` 사용을 권하며 실패 종료한다.

산출물: `.harness/roadmap.md`(압축 계획), `.harness/progress.md`, `.harness/review-report.md`. quick 사이클은 별도 `requirements.md`를 만들지 않는다 — `roadmap.md`의 `## Intent` 섹션이 요구사항 기준선이다.

### 사용자 의도 캡처

`/harness:quick` 뒤의 인자(`$ARGUMENTS`)를 trim 해 `userIntent`로 보관한다. PLAN 단계 워커에 `[USER INTENT]`로 전달되며, quick 사이클에서는 단순 힌트가 아니라 **요구사항 그 자체**다.

`state.stage === 'PLAN'`인데 `userIntent`가 비어 있으면 계획을 세울 대상이 없다 — `messages.intent_required`를 출력하고 정지한다. stage가 `DEVELOPMENT`/`REVIEW`이면 의도는 이미 `roadmap.md`에 반영돼 있으므로 `$ARGUMENTS`가 비어도 무방하다.

---

## Loop Procedure

DONE에 도달하거나 정지 조건이 발생할 때까지 반복.

### 루프 규율

도구 호출 사이에는 **0자 출력**. `## Messages` 표가 명시적으로 출력하라고 한 문자열만 허용. 인사·진행상황 요약·계획 announce·도구 호출 확인·단계 라벨 금지. (`/harness:run`과 동일 규율 — 자세한 금지 패턴은 `commands/run.md`의 "Loop discipline" 참고.) 검증 FAIL은 재시도 여력이 있으면 자동 재시도하는 정상 이벤트다 — "계속할까요?" 류로 멈추지 않는다.

정지 조건: `state.iteration >= state.maxRetries`, 워커 실패, `quick-planner`의 `OUT_OF_SCOPE` 판정, DONE 도달, PLAN 단계 의도 누락.

---

### Q-1. State 로드 / 부트스트랩

(규율: `/harness:quick`의 **첫** 액션은 아래 Read다. 인사·계획·상태 preamble 금지.)

- `.harness/config.json`을 읽어 `uiLanguage` 확인 (없으면 `ko`로 가정). 이후 모든 사용자 출력은 `## Messages` 표에서 이 값으로 키잉
- `.harness/quick-state.json`을 읽는다. **없으면** 다음으로 새로 생성하고 진행:

  ```json
  {
    "schemaVersion": 1,
    "stage": "PLAN",
    "iteration": 0,
    "maxRetries": 3,
    "lastValidated": null,
    "failures": [],
    "history": []
  }
  ```

- `state.stage === 'DONE'`이면: 사용자가 다시 `/harness:quick`을 호출했다는 것은 새 사이클을 원한다는 신호다. `stage`를 `PLAN`, `iteration`을 0, `failures`를 `[]`, `lastValidated`를 `null`로 리셋. `messages.cycle_resumed` 출력 후 **추가 텍스트 없이 즉시** `.harness/quick-state.json`을 재로드해 갱신된 state로 Q-1을 이어간다
- `state.iteration >= state.maxRetries`면 `messages.retry_limit` 출력 후 정지
- `state.stage === 'PLAN'`이고 `userIntent`가 비어 있으면 `messages.intent_required` 출력 후 정지

---

### Q-2. 직전 실패 echo

`state.failures`의 마지막 entry가 현재 stage와 일치하면 `messages.previous_failure`에 `<cause>`/`<plan>`을 채워 출력한다. 이 정보는 워커에 `[PREVIOUS FAILURE]` 블록으로도 전달된다.

이후 **추가 텍스트 없이 즉시** Q-3로.

---

### Q-3. 워커 호출

stage → sub-agent 매핑:

| stage | sub-agent | artifact |
|-------|-----------|----------|
| PLAN | quick-planner | `.harness/roadmap.md` |
| DEVELOPMENT | developer | `.harness/progress.md` |
| REVIEW | reviewer | `.harness/review-report.md` |

#### 사전 자료 로드

- `docs/agent-system-prompt/en/base.md`를 읽어 `[BASE INSTRUCTIONS]`로 주입 (파일이 없으면 빈 문자열)
- `.harness/agents-overrides/<subagent_type>.md`가 있으면 읽어 `[OVERRIDE]`로 주입 (없으면 빈 문자열)
- 이전 산출물:
  - DEVELOPMENT: `.harness/roadmap.md` (필수 — 없으면 워커 실패 처리), `.harness/progress.md` (있으면)
  - REVIEW: `.harness/roadmap.md`, `.harness/progress.md` (둘 다 필수 — 없으면 워커 실패 처리)

#### 워커 시작 로깅

로그 디렉터리를 보장하고 STARTED 한 줄을 append. 경로는 항상 double-quote (Windows 백슬래시 버그 방지):

```bash
mkdir -p ".harness/logs" && echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <worker> | STARTED" >> ".harness/logs/quick-pipeline.log"
```

#### Task 프롬프트 템플릿

`Task` 도구로 호출. 해당 없는 블록은 생략:

```
[STAGE]
<현재 stage 이름>

[CONFIG]
<.harness/config.json 전문>

[OUTPUT LANGUAGE]
{config.uiLanguage}

산출물 본문·사용자 대화는 모두 이 언어로. 프로토콜 식별자(섹션 헤더, 태스크 ID,
AC ID, VALIDATION_RESULT 등)는 영문 그대로. 각 에이전트의 "Output Language" 절 참고.

[BASE INSTRUCTIONS]
<docs/agent-system-prompt/en/base.md verbatim — 없으면 생략>

[USER INTENT]   ← PLAN 단계에서만 (quick 사이클의 요구사항 명세)
<userIntent verbatim>

[PREVIOUS ARTIFACTS]   ← DEVELOPMENT/REVIEW 단계에서만
DEVELOPMENT: roadmap.md, progress.md(있으면)
REVIEW: roadmap.md, progress.md
(각 파일 내용을 ``` 펜스로 inline)

[REQUIREMENTS BASELINE NOTE]   ← REVIEW 단계에서만
quick 사이클은 별도 requirements.md가 없다. roadmap.md의 `## Intent` 섹션이
요구사항 기준선이다 — 정확성 판정 시 이 섹션을 requirements.md 대신 사용하라.

[PREVIOUS FAILURE]   ← state.failures의 마지막 entry가 현재 stage와 매치할 때만
Cause: <cause>
Fix plan: <plan>

[OVERRIDE]   ← agents-overrides 파일이 있을 때만
<file contents verbatim>

[INSTRUCTIONS]
산출물을 .harness/<artifact>.md로 저장. (PLAN→roadmap / DEVELOPMENT→progress / REVIEW→review-report)
한 줄로 보고 후 종료.
```

#### 워커 실패 처리

워커 sub-agent가 실패하거나 abort하면 state를 변경하지 말고 정지한다. `messages.worker_failed`에 `<reason>`을 채워 출력한다. (검증 실패와는 다름 — iteration 카운터 증가 안 함. `quick-planner`가 정상 종료하며 규모 초과를 보고하는 경우는 아래 "워커 정상 종료 후" 참고)

#### 워커 정상 종료 후

stage가 `PLAN`이고 워커의 한 줄 보고가 `OUT_OF_SCOPE:`로 시작하면 — `quick-planner`가 이 변경이 fast-path 범위를 벗어난다고 판정한 것이다. state를 변경하지 말고 (iteration 증가 없음) `messages.out_of_scope`에 `<reason>`(마커 뒤 사유)을 채워 출력하고 정지한다.

그 외에는 **추가 텍스트 없이, 워커 출력을 요약하지 말고 즉시** Q-4로 (검증 inline 실행).

---

### Q-4. 검증 (inline)

stage에 따라 검증 방식이 다르다:

- **PLAN** → Q-4a 결정론 구조 검사 (Bash, 서브에이전트 없음)
- **DEVELOPMENT** → Q-4b `docs/validate.md` 위임
- **REVIEW** → Q-4c `docs/validate.md` 위임

해당 하위 절을 수행해 PASS/FAIL + `cause`/`plan` (+ 선택적 `regressTo`)을 내부 변수로 확정한 뒤 #### State 갱신으로 간다.

#### Q-4a. PLAN — 결정론 구조 검사

`.harness/roadmap.md`를 Bash로 검사한다. 추론 서브에이전트를 호출하지 않는다 — 압축 fast-path는 ROADMAP 추론 검증(roadmap-validator)을 의도적으로 생략한다. 계획 품질의 의미 검증은 하류 developer가 실행하며 막히면 드러나고, REVIEW 단계에서 reviewer가 잡는다.

```bash
test -f ".harness/roadmap.md" && echo "roadmap=EXISTS" || echo "roadmap=MISSING"
echo "tasks=$(grep -cE '^T[0-9]' '.harness/roadmap.md' 2>/dev/null)"
echo "placeholder=$(awk '/^## Task List/{f=1;next} /^## /{f=0} f' '.harness/roadmap.md' 2>/dev/null | grep -icE 'TBD|TODO' 2>/dev/null)"
```

순서대로 평가하고 첫 실패에서 `cause`/`plan`을 설정한다. **모든 PLAN 실패는 같은 단계 재시도** (PLAN은 첫 단계 — `regressTo` 설정 안 함):

1. `roadmap=MISSING`, 또는 `tasks == 0` (`## Task List`에 `^T[0-9]` 형식 태스크가 하나도 없음) → FAIL: `cause` = `messages.plan_struct_missing`, `plan` = `messages.plan_struct_missing_plan`
2. `placeholder > 0` (`## Task List` 섹션 안에 TBD/TODO 미확정 표현) → FAIL: `cause` = `messages.plan_struct_tbd`, `plan` = `messages.plan_struct_tbd_plan`

모두 통과 → PLAN 검증 PASS. #### State 갱신으로.

#### Q-4b. DEVELOPMENT — `docs/validate.md` 위임

`docs/validate.md`를 읽고 그 **step 2 (Deterministic validation)** 와 **step 2b (Structural validation) 의 `DEVELOPMENT` 하위 절**을 적힌 그대로 수행해 PASS/FAIL 판정과, 실패 시 `cause`/`plan`을 확정한다. validate.md의 step 1(state 로드)·step 3·4·5는 수행하지 않는다 — state 로드/갱신은 quick.md가 담당한다. `cause`/`plan` 텍스트는 validate.md `## Messages` 표의 항목을 `uiLanguage`로 키잉해 사용한다.

결정론 명령 결과 로그는 `.harness/logs/quick-pipeline.log`에 기록한다 (validate.md가 지정한 `pipeline.log`가 아님). **모든 DEVELOPMENT 실패는 같은 단계 재시도** (`regressTo` 설정 안 함).

#### Q-4c. REVIEW — `docs/validate.md` 위임

`docs/validate.md`의 **step 2** 와 **step 2b 의 `REVIEW` 하위 절**을 그대로 수행해 PASS/FAIL + `cause`/`plan` + `regressTo`를 확정한다. validate.md REVIEW 절이 지시하는 대로, 마커·Critical/Major finding·`verdict == FAIL`·결정론 명령 실패는 `regressTo = "DEVELOPMENT"`로 설정한다 (report 형식 결함은 같은 단계 재시도). 로그는 `.harness/logs/quick-pipeline.log`에 기록한다.

#### State 갱신

PASS:
- `state.lastValidated = "<stage>"`
- `state.history`에 `{ "stage": "<stage>", "result": "PASS", "ts": "<utc>" }` push
- `state.iteration = 0`
- stage 진행: `PLAN → DEVELOPMENT → REVIEW → DONE`

FAIL:
- `state.iteration += 1`
- `state.failures`에 `{ "stage": "<stage>", "attempt": <새 iteration>, "cause": "<cause>", "plan": "<plan>", "ts": "<utc>", "regressedTo": "<regressTo 있으면, 없으면 생략>" }` push. **길이가 maxRetries를 초과하면 가장 오래된 entry부터 제거** (최근 maxRetries개만 유지)
- `regressTo`가 설정되었고 `새 iteration < maxRetries`이면 `state.stage = regressTo` (회귀). 아니면 stage 유지 (같은 단계 재시도)

검증 결과를 `.harness/logs/quick-pipeline.log`에 한 줄 append (`<validator>` = PLAN이면 `structural`, DEVELOPMENT/REVIEW이면 `validate.md`):

```bash
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | <stage> | <validator> | <PASS|FAIL>[ | <cause 한 줄>]" >> ".harness/logs/quick-pipeline.log"
```

state 저장 후 **추가 텍스트 없이 즉시** Q-5로.

---

### Q-5. 분기

`.harness/quick-state.json`을 다시 읽고 갱신된 state로 분기한다.

#### Q-5a. PASS

- 새 `state.stage === 'DONE'`이면: `messages.cycle_done` 출력 후 정지
- 아니면: `messages.stage_advanced`에 `<prev>`/`<new>` 채워 출력 후 **추가 텍스트 없이 즉시** Q-1으로 재진입 (정지·사용자 확인 금지)

#### Q-5b. FAIL

`state.iteration`은 이미 +1 되어 있다. 회귀가 일어났으면 `state.stage`가 직전 실행 stage와 다르다.

- `state.iteration < state.maxRetries`:
  - 회귀 발생(직전 실행 stage와 다름) → `messages.stage_regressed_retry`에 `<fromStage>`/`<toStage>`/`<iteration>`/`<maxRetries>`/`<cause>`/`<plan>` 채워 출력
  - 같은 stage 재시도 → `messages.stage_failed_retry`에 `<stage>`/`<iteration>`/`<maxRetries>`/`<cause>`/`<plan>` 채워 출력
  - **필수**: 즉시 Q-1을 재진입한다. 텍스트·정지·사용자 확인 금지 — 재시도 여력이 있는 검증 FAIL은 자동 재시도하는 정상 이벤트다
- `state.iteration >= state.maxRetries`:
  - `messages.retry_limit_reached`에 `<stage>` 채워 출력 후 정지

---

## Messages

**언어 선택**: `config.uiLanguage`와 정확히 일치하는 변형을 사용한다. `uiLanguage === 'ko'`면 `ko:` 텍스트를 그대로, `'en'`이면 `en:`을 사용한다. `{...}` placeholder는 출력 전 치환한다. (DEVELOPMENT/REVIEW의 `cause`/`plan`은 `docs/validate.md`의 `## Messages`를 사용한다 — 여기서 재정의하지 않는다.)

### `cycle_resumed`

- **ko**: `이전 quick 사이클이 DONE 상태였음 — PLAN으로 리셋하고 새 사이클 시작합니다.`
- **en**: `Previous quick cycle was DONE — resetting to PLAN and starting a new cycle.`

### `intent_required`

- **ko**:
  ```
  변경 요청이 비어 있습니다. /harness:quick 뒤에 무엇을 바꿀지 적어 주세요.
    예: /harness:quick login 버튼 색상 토큰화
  ```
- **en**:
  ```
  No change request given. Add what to change after /harness:quick.
    e.g. /harness:quick tokenize the login button color
  ```

### `retry_limit`

- **ko**: `재시도 한도 도달 — quick-planner/developer/reviewer 지침이나 변경 요청을 수정한 뒤 .harness/quick-state.json의 iteration을 0으로 리셋하세요`
- **en**: `Retry limit reached — adjust quick-planner/developer/reviewer instructions or the change request, then reset iteration to 0 in .harness/quick-state.json`

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

- **ko**: `워커 에이전트 실패: {reason} — /harness:quick으로 재시도하거나, 규모가 크면 /harness:run을 사용하세요`
- **en**: `Worker agent failed: {reason} — re-run /harness:quick to retry, or use /harness:run for larger work`

### `out_of_scope`

- **ko**:
  ```
  이 변경은 fast-path 범위를 벗어납니다: {reason}
  전체 사이클 /harness:run을 사용하세요 (REQUIREMENTS 수집 + ROADMAP 설계 포함).
  ```
- **en**:
  ```
  This change is out of fast-path scope: {reason}
  Use the full cycle /harness:run (with REQUIREMENTS gathering + ROADMAP design).
  ```

### `cycle_done`

- **ko**: `✓ quick 사이클 완료 (PLAN→DEVELOPMENT→REVIEW→DONE) — .harness/progress.md, .harness/review-report.md 확인하세요`
- **en**: `✓ Quick cycle complete (PLAN→DEVELOPMENT→REVIEW→DONE) — see .harness/progress.md and .harness/review-report.md`

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
     → developer가 자동으로 수정합니다 — 루프 계속...
  ```
- **en**:
  ```
  ✗ {fromStage} validation failed (attempt {iteration}/{maxRetries}) — regressing to {toStage}
     Cause: {cause}
     Fix plan: {plan}
     → developer will remediate automatically — continuing loop...
  ```

### `retry_limit_reached`

- **ko**:
  ```
  ✗ {stage} 재시도 한도 도달 — 사용자 개입 필요
     quick-planner/developer/reviewer 오버라이드(.harness/agents-overrides/)나 변경 요청을 수정한 뒤
     .harness/quick-state.json의 iteration을 0으로 리셋
  ```
- **en**:
  ```
  ✗ {stage} retry limit reached — user intervention required
     Update quick-planner/developer/reviewer overrides (.harness/agents-overrides/) or the change request,
     then reset iteration to 0 in .harness/quick-state.json
  ```

### `plan_struct_missing`

- **ko**: `구조 검사 실패 — roadmap.md가 없거나 "^T[0-9]" 형식 태스크가 하나도 없음`
- **en**: `Structural check failed — roadmap.md is missing or has no "^T[0-9]" tasks`

### `plan_struct_missing_plan`

- **ko**: `quick-planner를 다시 실행해 "T01:" 형식(0열 시작) 태스크를 1개 이상 갖춘 roadmap.md를 생성하세요`
- **en**: `Re-run quick-planner to produce roadmap.md with at least one "T01:"-style task starting at column 0`

### `plan_struct_tbd`

- **ko**: `구조 검사 실패 — Task List에 TBD/TODO 미확정 표현이 있음`
- **en**: `Structural check failed — the Task List contains unresolved TBD/TODO placeholders`

### `plan_struct_tbd_plan`

- **ko**: `Task List의 TBD/TODO를 구체적인 태스크·AC로 교체하세요. 결정 불가한 항목은 ## Assumptions에 가정으로 명시`
- **en**: `Replace TBD/TODO in the Task List with concrete tasks/ACs. Record undecidable items as assumptions under ## Assumptions`

---
description: 현재 스테이지 산출물 검증 (결정론 + 추론)
allowed-tools: Read, Edit, Bash, Task
---

# /harness:validate

현재 스테이지 산출물이 다음 단계로 넘어갈 수 있는 품질인지 판정한다. 두 단계로 진행한다:

1. **결정론 검증** — 부모 세션에서 Bash로 typecheck/lint/test/build 직접 실행
2. **추론 검증** — 검증 서브에이전트(Task)가 산출물 품질 판정

## 절차

### 1. 상태 로드

- `.harness/state.json`, `.harness/config.json` 읽기
- 현재 stage가 `DONE`이면 ko: "완료. /harness:retro 권장" / en: "Done. /harness:retro recommended" 출력 후 종료

이후 모든 출력은 `config.uiLanguage`에 따라 한국어 또는 영어로 표시한다.

### 2. 결정론 검증 (DEVELOPMENT, REVIEW 단계에만)

stage가 `DEVELOPMENT` 또는 `REVIEW`일 때만 실행. REQUIREMENTS/ROADMAP은 스킵.

먼저 로그 디렉터리를 보장: `mkdir -p .harness/logs` (이미 있어도 무해).

`config.json`에서 다음 명령어를 순서대로 Bash로 실행:

1. `typecheckCmd` — 타입체크
2. `lintCmd` — 린트
3. `testCmd` — 테스트
4. `buildCmd` — 빌드

각 명령에 대해:

- 빈 문자열이면 SKIP
- 타임아웃 10분
- exit 0 → PASS
- exit 비0 → FAIL
- spawn 실패 → ERROR

각 결과를 다음 형식으로 콘솔 출력 + 결과 표 누적:

```
[PASS|FAIL|SKIP|ERROR] <라벨>: <명령어> (exit <코드>, <ms>ms)
```

**stdout/stderr는 마지막 80줄만 보존** — 큰 로그는 `.harness/logs/<stage>-<YYYYMMDD-HHmmss>.log`에 전체 저장하고 콘솔/state엔 tail만 표시.

#### 결정론 실패 처리

하나라도 FAIL/ERROR/TIMEOUT이면 추론 검증으로 넘어가지 않고 즉시 실패 처리:

- `cause` = "결정론 검증 실패 — <라벨>=<상태>(exit <코드>) ..."
- `plan` = "<첫 실패 라벨>(<명령어>) 실패 원인 우선 해결. 로그: <로그 파일 경로>"
- 현재 stage가 `REVIEW`이면 내부 플래그 `regressTo = "DEVELOPMENT"` 설정 (깨진 코드는 리뷰어 재시도가 아니라 개발자 에이전트가 수정해야 함)
- "실패 처리" 절차로 진행 (아래 5번)

### 3. 추론 검증 — 검증 서브에이전트 호출

`config.uiLanguage`를 확인해 서브에이전트를 결정한다. `"en"`이면 `-en` 접미사 에이전트를 사용한다.

stage → 서브에이전트:

| stage | uiLanguage=ko | uiLanguage=en |
|-------|---------------|---------------|
| REQUIREMENTS | requirements-validator | requirements-validator-en |
| ROADMAP | roadmap-validator | roadmap-validator-en |
| DEVELOPMENT | development-validator | development-validator-en |
| REVIEW | review-validator | review-validator-en |

`config.uiLanguage`가 없거나 `"ko"`이면 기존 한국어 에이전트 사용.

#### 3-1. 오버라이드 로드

`.harness/agents-overrides/<subagent_type>.md` 파일이 존재하면 Read로 읽어둔다. 없으면 빈 문자열로 처리. 이 내용은 Task 프롬프트의 `[오버라이드]` 블록에 그대로 인라인된다.

#### 3-2. Task 프롬프트 템플릿

`Task` 도구로 호출. 프롬프트는 아래 구조 그대로 (해당 없는 블록 통째로 생략):

```
[STAGE]
<현재 stage 이름>

[CONFIG]
<.harness/config.json 전체>

[첨부 산출물]
REQUIREMENTS: requirements.md
ROADMAP: requirements.md, roadmap.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md
REVIEW: requirements.md, roadmap.md, review-report.md
(각 파일 내용을 ``` 펜스로 인라인)

[결정론 검증 결과]   ← DEVELOPMENT/REVIEW에만
| 라벨 | 상태 | exit | ms |
| --- | --- | --- | --- |
| typecheck | ... | ... | ... |
...
(전체 표를 인라인)

[오버라이드]   ← agents-overrides 파일이 있을 때만
<파일 내용 그대로>

[지시]
판정 결과를 마지막 줄 블록에 정확히 다음 형식 중 하나로 출력:
  VALIDATION_RESULT: PASS
또는
  VALIDATION_RESULT: FAIL
  REASON: <한 줄>
  FIX_PLAN: <보완 방향>
또는 (이전 단계로 회귀 — 검증 에이전트가 지원할 때만; 예: review-validator)
  VALIDATION_RESULT: FAIL
  REASON: <한 줄>
  FIX_PLAN: <보완 방향>
  REGRESS_TO: <단계명>
```

### 4. 결과 파싱

서브에이전트가 반환한 텍스트에서:

- `VALIDATION_RESULT: (PASS|FAIL)` 추출
- 둘 다 매치 안 되면 **runtime 오류로 간주, iteration 증가시키지 않음**. 사용자에게 보고하고 종료.
- `VALIDATION_RESULT: FAIL`이면 추가로 `REGRESS_TO: <단계>`도 추출 시도. 값이 `REQUIREMENTS|ROADMAP|DEVELOPMENT|REVIEW` 중 하나면 내부 플래그 `regressTo = <단계>` 설정 (2번 단계에서 설정한 값보다 우선). 아니면 `regressTo` 미설정 유지.

### 5a. PASS 처리

`state.json` 갱신 (Edit):

- `stage` → 다음 stage (`STAGES[indexOf+1]`)
- `iteration` → 0
- `lastValidated` → 현재 ISO 8601 시각
- `failures` → `[]` (PASS 시 누적 실패 리셋)
- `history` → 기존 배열에 `{ stage, completedAt }` append

출력 (`uiLanguage`에 따라):

```
[ko] 검증 통과: <이전 stage> -> <다음 stage>

[en] Validation passed: <prev stage> -> <next stage>
```

단독 실행(`/harness:validate` 직접 호출)인 경우에만 추가 힌트 출력:

```
[ko] 다음: /harness:run    (또는 DONE이면 /harness:retro)
[en] Next: /harness:run    (or /harness:retro if DONE)
```

`/harness:run` 루프 안에서 인라인으로 호출된 경우 이 힌트는 생략한다 — run이 자동으로 루프를 이어간다.

### 5b. FAIL 처리

서브에이전트 응답에서 `REASON: <한 줄>`, `FIX_PLAN: <블록>` 추출. 2번(결정론) 또는 4번(REGRESS_TO)에서 설정된 `regressTo` 플래그도 함께 사용.

`state.json` 갱신 (Edit):

- `iteration` → +1
- `regressTo`가 설정돼 있고 AND `새 iteration < maxRetries`이면:
  - `stage` → `regressTo` (지정한 이전 단계로 회귀; 다음 루프에서 developer 등이 수정 담당)
  - iteration은 그대로 유지 (FAIL은 단계와 무관하게 전역 재시도 예산을 차감)
- 아니면: `stage` 그대로 (같은 단계 재시도)
- `failures` → 기존 배열 끝에 다음 객체 append. **단, 길이가 maxRetries를 넘으면 가장 오래된 항목부터 제거 (최근 maxRetries개만 유지)**:
  ```json
  {
    "stage": "<실패 시점 stage>",
    "attempt": <새 iteration>,
    "cause": "<REASON>",
    "plan": "<FIX_PLAN>",
    "timestamp": "<ISO 시각>",
    "deterministic": [<결정론 검증이 실행됐다면 라벨/상태/exit 요약>],
    "regressedTo": "<regressTo 값, 미설정이면 생략>"
  }
  ```

출력 (`uiLanguage`에 따라, `regressTo` 미설정 시):

```
[ko]
검증 실패: <stage>
원인:      <cause>
수정 계획: <plan>

남은 재시도: <maxRetries - 새 iteration>회

[en]
Validation failed: <stage>
Cause:      <cause>
Fix plan:   <plan>

Retries remaining: <maxRetries - new iteration>
```

출력 (`regressTo`가 설정·적용된 경우):

```
[ko]
검증 실패: <stage>  → <regressTo> 단계로 회귀
원인:      <cause>
수정 계획: <plan>

남은 재시도: <maxRetries - 새 iteration>회

[en]
Validation failed: <stage>  → regressing to <regressTo>
Cause:      <cause>
Fix plan:   <plan>

Retries remaining: <maxRetries - new iteration>
```

`새 iteration >= maxRetries`이면 추가 안내:

```
[ko] 재시도 한계 도달 — 사용자 개입 필요.
     에이전트 지침(.harness/agents 또는 플러그인 agents/)이나 요구사항을 수정한 뒤
     /harness:reset 으로 iteration을 리셋하세요.

[en] Retry limit reached — user intervention required.
     Modify agent instructions (.harness/agents or plugin agents/) or requirements,
     then reset with /harness:reset.
```

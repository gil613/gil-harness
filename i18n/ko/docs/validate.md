> 📖 **참고용 사본 (한국어 번역)**
>
> 이 파일은 한국 사용자가 내부 동작을 이해하기 위한 **읽기 전용 참조**입니다.
> Claude Code 플러그인은 이 파일을 사용하지 않습니다 — 정본은 `docs/validate.md` (영어)입니다.
> 자동 동기화되지 않으므로 정본과 어긋날 수 있습니다. 동작 검증은 항상 정본 기준으로 수행하세요.

---

# 검증 절차

> `/harness:run`(LOOP-4)이 인라인으로 실행하는 내부 절차다. 단독 슬래시 명령이 아니다. 사용 도구: Read, Edit, Bash, Task.

현재 스테이지 산출물이 다음 단계로 넘어갈 수 있는 품질인지 판정한다. 검증 경로는 스테이지에 따라 다르다:

- **REQUIREMENTS / ROADMAP** — 구조 사전검사(Bash) + **추론 검증**(검증 서브에이전트가 Task로 산출물 품질 판정)
- **DEVELOPMENT / REVIEW** — **완전 결정론** — typecheck/lint/test/build 명령어 실행 + 산출물 구조 검사. 검증 서브에이전트 없음. 코드의 의미 검증은 REVIEW 단계의 `reviewer`가 실제 소스를 읽으며 담당한다 — `progress.md` 산문을 재심사하는 것보다 강한 검사다.

## 절차

### 1. 상태 로드

- `.harness/state.json`, `.harness/config.json` 읽기
- 현재 stage가 `DONE`이면 ko: "완료. /harness:retro 권장" / en: "Done. /harness:retro recommended" 출력 후 종료

이후 모든 출력은 `config.uiLanguage`에 따라 한국어 또는 영어로 표시한다.

### 2. 결정론 검증 (DEVELOPMENT, REVIEW 단계에만)

stage가 `DEVELOPMENT` 또는 `REVIEW`일 때만 실행. REQUIREMENTS/ROADMAP은 스킵.

먼저 로그 디렉터리를 보장: `mkdir -p ".harness/logs"` (이미 있어도 무해). 항상 큰따옴표로 감싼다 — 따옴표 없는 Windows 절대경로는 bash가 backslash를 이스케이프로 처리해 잘못된 이름의 디렉터리를 현재 폴더에 만든다.

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

### 2b. 구조 검증

현재 스테이지 산출물에 대한 Bash 검사. REQUIREMENTS/ROADMAP에서는 3번 추론 호출 전 **사전검사**, DEVELOPMENT/REVIEW에서는 산출물 검증 **전부**다 (이 두 스테이지에는 3번 서브에이전트가 없음).

현재 스테이지에 해당하는 하위 절만 실행한다. 검사 후 라우팅:

- 하나라도 실패 → cause/plan(필요 시 regressTo) 설정 후 5b로 이동
- 전부 통과 + DEVELOPMENT/REVIEW → 산출물 검증 완료, **3~4번 스킵**하고 5a로
- 전부 통과 + REQUIREMENTS/ROADMAP → 3번으로 진행

#### REQUIREMENTS

```bash
test -f ".harness/requirements.md" && echo "EXISTS" || echo "MISSING"
grep -ic "TBD\|TODO" ".harness/requirements.md" 2>/dev/null || echo "0"
```

- 파일 없음 → FAIL: cause = "구조 검사 실패 — requirements.md 없음", plan = "requirements.md를 먼저 생성하는 워커 에이전트를 실행하세요"
- TBD/TODO 개수 > 0 → FAIL: cause = "구조 검사 실패 — requirements.md에 TBD/TODO 미확정 항목이 있습니다", plan = "requirements.md의 TBD/TODO 항목을 모두 구체적인 내용으로 교체한 뒤 /harness:run을 다시 실행하세요"

#### ROADMAP

```bash
test -f ".harness/roadmap.md" && echo "EXISTS" || echo "MISSING"
grep -c "^T[0-9]" ".harness/roadmap.md" 2>/dev/null || echo "0"
```

- 파일 없음 → FAIL: cause = "구조 검사 실패 — roadmap.md 없음", plan = "roadmap.md를 먼저 생성하는 워커 에이전트를 실행하세요"
- 태스크 수 == 0 → FAIL: cause = "구조 검사 실패 — roadmap.md에 태스크 정의가 없습니다 (T01, T02, ... 형식 필요)", plan = "로드맵 디자이너를 다시 실행하여 roadmap.md에 태스크를 정의하세요"

#### DEVELOPMENT

2번 결정론 명령어가 모두 PASS/SKIP일 때만 도달. `.harness/progress.md`를 검증한다. 순서대로 평가하고 첫 실패에서 cause/plan 설정 후 5b로. **모든 DEVELOPMENT 실패는 같은 단계 재시도**(regressTo 설정 안 함).

1. `progress.md` 없음 → FAIL
2. 필수 헤더 4개(`## Done` / `## In Progress` / `## Pending` / `## Failure History`) 중 하나라도 누락 → FAIL
3. In Progress·Pending 미완 항목(`- [ ]`) 또는 Failure History 항목이 남음 → FAIL
4. Done 태스크 수 ≠ 로드맵 태스크 수 → FAIL

전부 통과 → DEVELOPMENT 검증 PASS, 5a로. 산출물의 의미(acceptance criteria 충족 여부)는 여기서 판정하지 않는다 — 다음 단계 `reviewer`가 실제 소스를 읽으며 담당한다.

#### REVIEW

2번 결정론 명령어가 모두 PASS/SKIP일 때만 도달. `.harness/review-report.md`를 검증한다. 순서대로 평가하고 첫 실패에서 cause/plan(필요 시 regressTo) 설정 후 5b로.

1. `review-report.md` 없음, 필수 섹션 헤더 6개 중 누락, 또는 Final Verdict 파싱 불가 → FAIL **(같은 단계 재시도)** — reviewer 출력 결함
2. 직접 수정 마커(`[Fixed]`/`[Resolved]`/`[수정 완료]`/`[해결됨]`) 존재 → FAIL, `regressTo = "DEVELOPMENT"`
3. Critical/Major finding이 1건 이상 → FAIL, `regressTo = "DEVELOPMENT"`
4. Final Verdict == FAIL → FAIL, `regressTo = "DEVELOPMENT"`

전부 통과(형식 정상, 마커 없음, Critical/Major 0건, Final Verdict PASS) → REVIEW 검증 PASS, 5a로 (`DONE`으로 이동).

### 3. 추론 검증 — 검증 서브에이전트 호출 (REQUIREMENTS, ROADMAP 단계에만)

stage가 `REQUIREMENTS` 또는 `ROADMAP`일 때만 실행. DEVELOPMENT/REVIEW는 2b에서 이미 판정이 끝났으므로 이 단계에 도달하지 않는다.

stage → 서브에이전트:

| stage | 서브에이전트 |
|-------|---------------|
| REQUIREMENTS | requirements-validator |
| ROADMAP | roadmap-validator |

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
(각 파일 내용을 ``` 펜스로 인라인)

[오버라이드]   ← agents-overrides 파일이 있을 때만
<파일 내용 그대로>

[지시]
판정 결과를 마지막 줄 블록에 정확히 다음 형식 중 하나로 출력:
  VALIDATION_RESULT: PASS
또는
  VALIDATION_RESULT: FAIL
  REASON: <한 줄>
  FIX_PLAN: <보완 방향>
또는 (이전 단계로 회귀 — 검증 에이전트가 지원할 때만)
  VALIDATION_RESULT: FAIL
  REASON: <한 줄>
  FIX_PLAN: <보완 방향>
  REGRESS_TO: <단계명>
```

### 4. 결과 파싱 (REQUIREMENTS, ROADMAP 단계에만)

DEVELOPMENT/REVIEW는 2b에서 이미 판정·cause·plan·regressTo가 정해졌으므로 곧장 5번으로 간다.

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

별도의 "다음 단계" 힌트는 출력하지 않는다 — `/harness:run`이 자동으로 루프를 이어간다.

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

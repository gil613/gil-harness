---
description: DONE 또는 재시도 한계까지 전 스테이지 자동 실행
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
---

# /harness:run

**자동 루프**: DONE에 도달하거나 재시도 한계를 초과할 때까지 스테이지를 순차적으로 실행한다. 수동 개입 불필요.

루프 순서: REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE

---

## 루프 절차

다음 절차를 **DONE 도달 또는 중단 조건 발생까지 반복**한다.

---

### LOOP-1. 상태 로드

- `.harness/state.json`, `.harness/config.json` 읽기
- `state.stage === 'DONE'`이면 출력 후 루프 종료:
  - ko: "모든 스테이지 완료. /harness:retro 권장"
  - en: "All stages complete. /harness:retro recommended"
- `state.iteration >= state.maxRetries`이면 출력 후 루프 종료:
  - ko: "재시도 한계 도달 — 에이전트 지침 또는 요구사항 수정 후 /harness:reset"
  - en: "Retry limit reached — modify agent instructions or requirements, then /harness:reset"

이후 모든 출력은 `config.uiLanguage`에 따라 한국어 또는 영어로 표시한다.

---

### LOOP-2. 이전 실패 인지 (있으면)

`state.failures`의 마지막 항목이 현재 스테이지와 일치하면 출력:

```
이전 실패 원인: <cause>
수정 계획:     <plan>
```

이 정보는 워커 서브에이전트에게도 전달한다 (LOOP-3).

---

### LOOP-3. 워커 서브에이전트 호출

`config.uiLanguage`를 확인해 서브에이전트를 결정한다. `"en"`이면 `-en` 접미사 에이전트를 사용한다.

stage → 서브에이전트 매핑:

| stage | uiLanguage=ko | uiLanguage=en |
|-------|---------------|---------------|
| REQUIREMENTS | requirements-collector | requirements-collector-en |
| ROADMAP | roadmap-designer | roadmap-designer-en |
| DEVELOPMENT | developer | developer-en |
| REVIEW | reviewer | reviewer-en |

`config.uiLanguage`가 없거나 `"ko"`이면 한국어 에이전트 사용.

#### 오버라이드 로드

`.harness/agents-overrides/<subagent_type>.md` 파일이 존재하면 Read로 읽어둔다. 없으면 빈 문자열.

#### Task 프롬프트 템플릿

`Task` 도구로 호출. 해당 없는 블록은 통째로 생략:

```
[STAGE]
<현재 stage 이름>

[CONFIG]
<.harness/config.json 전체>

[이전 산출물]
ROADMAP: requirements.md
DEVELOPMENT: requirements.md, roadmap.md, progress.md(있으면)
REVIEW: requirements.md, roadmap.md, progress.md
(각 파일 내용을 ``` 펜스로 인라인)

[이전 실패]   ← state.failures의 마지막 항목이 현재 stage와 일치할 때만
원인: <cause>
수정 계획: <plan>

[오버라이드]   ← agents-overrides 파일이 있을 때만
<파일 내용 그대로>

[지시]
산출물을 .harness/<산출물명>.md 에 저장하라.
산출물명: requirements / roadmap / progress / review-report
끝나면 한 줄로 보고하라.
```

#### 워커 실패 처리

서브에이전트가 실패/abort하면 state를 변경하지 않고 루프 중단:

```
[ko] 워커 에이전트 실패: <원인>
     재시도하려면 /harness:run 다시 실행

[en] Worker agent failed: <reason>
     Re-run /harness:run to retry
```

(runtime 오류와 검증 실패 구분 — iteration 카운터 증가 없음)

---

### LOOP-4. 검증 실행 (validate.md 절차 인라인)

워커가 정상 종료했으면 `validate.md`의 절차를 **이 세션 안에서 그대로 실행**한다.

validate.md 절차 전체를 인라인으로 수행 후 PASS / FAIL 결과를 내부 변수로 보유한다.

---

### LOOP-5. 루프 분기

validate 결과와 갱신된 state를 기준으로 분기한다.

#### 5a. PASS

`state.json`이 이미 다음 스테이지로 갱신되어 있다. 상태를 다시 읽는다.

- 새 `state.stage === 'DONE'`이면:
  - ko: "✓ 전체 파이프라인 완료 (REQUIREMENTS→ROADMAP→DEVELOPMENT→REVIEW→DONE)\n   /harness:retro 실행 권장"
  - en: "✓ Full pipeline complete (REQUIREMENTS→ROADMAP→DEVELOPMENT→REVIEW→DONE)\n   Run /harness:retro"
  - 루프 종료
- 아니면 진행 상황 한 줄 출력 후 **LOOP-1로 돌아간다**:
  - ko: "✓ <이전 stage> 완료 → <새 stage> 시작"
  - en: "✓ <prev stage> done → starting <new stage>"

#### 5b. FAIL

state.json의 `iteration`이 이미 +1 증가되어 있다.

- `state.iteration < state.maxRetries`이면:
  - ko: "✗ <stage> 검증 실패 (시도 <iteration>/<maxRetries>)\n   원인: <cause>\n   수정 계획: <plan>\n   → 동일 스테이지 재시도 중..."
  - en: "✗ <stage> validation failed (attempt <iteration>/<maxRetries>)\n   Cause: <cause>\n   Fix plan: <plan>\n   → Retrying same stage..."
  - **LOOP-1로 돌아간다** (state는 이미 갱신됨, 동일 stage 재실행)
- `state.iteration >= state.maxRetries`이면:
  - ko: "✗ <stage> 재시도 한계 도달 — 사용자 개입 필요\n   에이전트 지침(.harness/agents-overrides/) 또는 요구사항 수정 후\n   /harness:reset 으로 iteration 리셋"
  - en: "✗ <stage> retry limit reached — user intervention required\n   Modify agent overrides (.harness/agents-overrides/) or requirements,\n   then reset with /harness:reset"
  - 루프 종료

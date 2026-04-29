---
description: 현재 스테이지의 작업 에이전트 실행 (자동으로 검증까지)
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Task
---

# /harness:run

현재 스테이지에 맞는 워커 서브에이전트를 호출해 작업을 진행한다. 작업이 끝나면 검증 단계로 이어진다.

## 절차

### 1. 상태 로드

- `.harness/state.json`, `.harness/config.json` 읽기
- `state.stage === 'DONE'`이면 ko: "완료. /harness:retro 권장" / en: "Done. /harness:retro recommended" 출력 후 종료
- `state.iteration >= state.maxRetries`이면 ko: "재시도 한계 도달 — /harness:reset 후 재시도" / en: "Retry limit reached — reset with /harness:reset and retry" 출력 후 종료

이후 모든 출력은 `config.uiLanguage`에 따라 한국어 또는 영어로 표시한다.

### 2. 이전 실패 인지 (있으면)

`state.failures`의 마지막 항목이 현재 스테이지와 일치하면 본인(부모 세션)에게 명시적으로 출력:

```
이전 실패 원인: <cause>
수정 계획:     <plan>
```

이 정보는 서브에이전트에게도 전달한다.

### 3. 워커 서브에이전트 호출

`config.uiLanguage`를 확인해 서브에이전트를 결정한다. `"en"`이면 `-en` 접미사 에이전트를 사용한다.

stage → 서브에이전트 매핑:

| stage | uiLanguage=ko | uiLanguage=en |
|-------|---------------|---------------|
| REQUIREMENTS | requirements-collector | requirements-collector-en |
| ROADMAP | roadmap-designer | roadmap-designer-en |
| DEVELOPMENT | developer | developer-en |
| REVIEW | reviewer | reviewer-en |

`config.uiLanguage`가 없거나 `"ko"`이면 기존 한국어 에이전트 사용.

#### 3-1. 오버라이드 로드

`.harness/agents-overrides/<subagent_type>.md` 파일이 존재하면 Read로 읽어둔다. 없으면 빈 문자열로 처리. 이 내용은 Task 프롬프트의 `[오버라이드]` 블록에 그대로 인라인된다 — 회고가 만든 프로젝트 로컬 지침이 실제로 적용되는 유일한 경로.

#### 3-2. Task 프롬프트 템플릿

`Task` 도구로 호출. 프롬프트는 아래 구조를 그대로 사용 (해당 없는 블록은 통째로 생략):

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

### 4. 검증으로 위임

서브에이전트가 정상 종료하면 즉시 `/harness:validate`를 실행한다 (이 명령 안에서 validate.md의 절차를 그대로 따른다).

서브에이전트가 실패/abort하면 검증으로 진행하지 않고 사용자에게 보고:

```
워커 에이전트 실패: <원인>
재시도하려면 /harness:run 다시 실행
```

state는 변경하지 않는다 (검증을 거치지 않은 실패는 iteration 카운터에 반영하지 않음 — runtime 오류와 검증 실패를 구분).

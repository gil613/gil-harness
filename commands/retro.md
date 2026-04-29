---
description: 회고 에이전트 실행 후 에이전트 지침 직접 개선
allowed-tools: Read, Edit, Write, Bash, Task, Glob
---

# /harness:retro

이번 사이클의 실패 패턴을 분석하고, 결과 교훈을 `.harness/agents-overrides/` 또는 직접 플러그인 에이전트 지침에 반영한다.

## 절차

### 1. git working tree 검사 (선택)

`git status --porcelain` 으로 dirty 여부 확인. dirty면 사용자에게 경고:

> working tree가 깨끗하지 않습니다. 회고 패치는 별도 commit으로 떨어뜨리는 것이 안전합니다.
> 계속 진행할까요? (yes/no)

`yes`가 아니면 중단.

### 2. 컨텍스트 수집

다음 파일을 Read로 모은다 (있는 것만):

- `.harness/state.json` — failures/history 전체
- `.harness/config.json`
- `.harness/requirements.md`
- `.harness/roadmap.md`
- `.harness/progress.md`
- `.harness/review-report.md`
- Glob `.harness/retrospectives/*.md` — 과거 회고 (최근 5개)

### 3. 회고 서브에이전트 호출

`Task(subagent_type: "retrospective", ...)` 호출. 프롬프트에 위의 컨텍스트와 다음 지시 포함:

- 실패 패턴 분석 (state.failures의 cause 분포)
- 요구사항 수집 품질 (개발 중 요구사항 변경 횟수)
- 로드맵 정확도 (예상 복잡도 vs 실제)
- 개발 효율 (반복 실수)
- 리뷰 효과 (Critical 누락 빈도)
- 결론 산출물 두 가지:
  1. **회고 보고서** (잘된 것 / 개선 필요 / 교훈) — `.harness/retrospectives/<YYYY-MM-DD>.md`로 저장 (날짜는 **로컬 시간** 기준)
  2. **에이전트 지침 개선안** — Edit 도구로 `.harness/agents-overrides/<agent>.md` 또는 플러그인 위치에 직접 적용

### 4. 패치 적용 정책

회고 에이전트는 **Edit 도구를 직접 호출해서** 에이전트 지침을 수정한다. 별도의 패치 DSL은 사용하지 않는다.

수정 대상 화이트리스트:

- `.harness/agents-overrides/*.md` (사용자 프로젝트 로컬 오버라이드)
- 플러그인 본체의 `agents/*.md`는 사용자가 명시적으로 동의한 경우에만

수정 대상 외의 파일을 수정하려고 하면 거부. `.env`, `secrets/`, 임의 코드 파일은 절대 수정하지 않는다.

### 4-1. 패치 후 무결성 검증

회고 에이전트가 종료 보고를 보낸 직후, 부모 세션은 수정된 각 파일을 Read로 다시 읽고 다음을 검사한다:

- 첫 줄이 `---`이고, 그 뒤에 `---`로 닫히는 frontmatter 블록이 있는가
- frontmatter 안에 `name:` 필드가 있는가 (`agents/*.md` 수정 시)
- 닫히는 `---` 이후에 본문이 1줄 이상 남아 있는가
- 파일 크기가 0 바이트가 아닌가

검사를 실패한 파일이 있으면:

1. 사용자에게 어떤 파일이 깨졌는지 보고
2. `git checkout -- <파일>` 명령을 사용자에게 제안 (자동 실행 ❌)
3. history 갱신은 그대로 진행하되 `patchesApplied` 카운트에서 깨진 파일은 제외

### 5. history 갱신

`state.json` 갱신 (Edit):

- `history` 배열에 다음 append:
  ```json
  {
    "stage": "RETROSPECTIVE",
    "completedAt": "<ISO 시각>",
    "patchesApplied": <수정된 파일 개수>
  }
  ```

다른 필드 건드리지 않음.

### 6. 출력

```
회고 완료
보고서:    .harness/retrospectives/<YYYY-MM-DD>.md
적용 패치: <파일 개수>개
  - <파일 경로>
  - ...
```

## 안전 규칙

- 회고 에이전트는 `agents/retrospective.md` 정의대로 동작
- Edit 대상이 아닌 파일을 변경하려 하면 **그 작업을 막고** 사용자에게 보고
- `.harness/state.json`은 회고 에이전트가 직접 수정하지 않음 (이 명령에서만 history append)
- 같은 날짜의 retrospective 파일이 이미 있으면 덮어쓰지 말고 `.harness/retrospectives/<YYYY-MM-DD>-<n>.md`로 새로 생성

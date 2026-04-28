# [PROJECT_NAME] 하네스

이 프로젝트는 범용 에이전트 하네스로 관리됩니다.

## 세션 시작 시 필수 작업 (순서 준수)

1. `.harness/state.json` 읽기 — `stage` 확인
2. `.harness/config.json` 읽기 — 프로젝트 설정 확인
3. 아래 표에서 현재 스테이지의 에이전트 지침 파일 읽기
4. 지침에 따라 작업 시작

## 스테이지별 에이전트 지침

| stage | 지침 파일 |
|-------|-----------|
| REQUIREMENTS | `.harness/agents/01-requirements.md` |
| ROADMAP | `.harness/agents/02-roadmap.md` |
| DEVELOPMENT | `.harness/agents/03-developer.md` |
| REVIEW | `.harness/agents/04-reviewer.md` |
| RETROSPECTIVE | `.harness/agents/05-retrospective.md` |

## 핵심 원칙

- 각 스테이지는 명확한 산출물이 있다 — 산출물 없이 완료 선언 금지
- 사용자가 언급하지 않은 것은 임의로 추가하지 않는다
- 실패 원인은 반드시 `.harness/state.json` failures 배열에 기록
- 세션 시작 시 failures 배열을 확인해 이전 실패 원인을 인지하고 시작

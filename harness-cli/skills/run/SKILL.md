---
description: Execute the current harness stage. Use when user wants to proceed with the harness workflow or asks what to do next.
---

현재 하네스 스테이지를 실행합니다.

## 실행 순서

1. `.harness/state.json`을 읽어 현재 스테이지와 반복 횟수를 확인합니다.
2. `.harness/config.json`을 읽어 프로젝트 설정을 파악합니다.
3. 이전 실패가 있으면 `failures` 배열에서 마지막 항목의 `cause`와 `plan`을 참고합니다.
4. 현재 스테이지에 맞는 에이전트 파일을 로드합니다:

| 스테이지 | 에이전트 파일 |
|---|---|
| REQUIREMENTS | `.harness/agents/01-requirements.md` |
| ROADMAP | `.harness/agents/02-roadmap.md` |
| DEVELOPMENT | `.harness/agents/03-developer.md` |
| REVIEW | `.harness/agents/04-reviewer.md` |
| DONE | `harness retro` 실행 안내 |

5. 에이전트 파일의 지침에 따라 작업을 수행합니다.
6. 작업 완료 후 터미널에서 `harness validate`를 실행합니다.

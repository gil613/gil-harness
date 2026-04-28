---
description: Initialize harness in the current project. Use when user wants to set up the agent harness workflow for a new project.
---

프로젝트 하네스를 초기화합니다.

다음 정보를 사용자에게 확인하세요:
- 프로젝트 이름
- 주 언어/프레임워크 (예: TypeScript, Python, Java)
- 테스트 명령어 (예: npm test)
- 린트 명령어 (예: npm run lint)
- 타입체크 명령어 (예: npx tsc --noEmit)
- 빌드 명령어 (예: npm run build)
- 개발 서버 명령어 (예: npm run dev)
- 스테이지 최대 재시도 횟수 (기본값: 3)

정보 수집 후 터미널에서 `harness init`을 실행하도록 안내하세요.
이미 `.harness/state.json`이 존재하면 이미 초기화된 프로젝트입니다.

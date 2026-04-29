# CLAUDE.md
# 핵심 원칙
- Agent = Model + Harness — 모델이 아닌 모든 것이 하네스
- 이 파일은 **목차**다. 상세 원리는 `docs/research/harness-engineering.md` 참조
- 백과사전 ❌, 목차 ✅ — 100줄 안에서 끝낸다
- 실패에서 시작 — 에이전트가 실제로 실패한 경우에만 규칙을 추가한다
- 에이전트가 막히면 모델 문제가 아니라 환경 결함 신호 — 누락된 도구/문서/가드레일을 식별·보강 후 재시도
- 적게 넣어라 — 보편 적용되는 최소 지침만 (ETH Zurich: 과한 설정은 성능↓·비용↑)
- Build to Delete — 어제 짠 smart logic을 뜯어낼 수 있게 모듈러로
- The Harness is the Dataset — 경쟁 우위는 프롬프트가 아니라 하네스가 캡처하는 trajectory
- "에이전트가 컨텍스트에서 접근 못 하는 것은 사실상 존재하지 않는 것"

# 문서 구조 (System of Record)
- `CLAUDE.md` — 목차 (이 파일, ~100줄)
- `docs/agent-system-prompt/base.md` — 하네스 에이전트 공통 지침 (하네스 코드가 주입)
- `docs/agent-system-prompt/roles/` — 역할별 추가 지침
- `docs/research/` — 리서치 자료 (예: `harness-engineering.md`)
- `docs/design-docs/` — 설계 문서 (`index.md` 진입점)
- `docs/exec-plans/active/` · `completed/` — 실행 계획 + 의사결정 로그
- `docs/exec-plans/tech-debt-tracker.md` — 기술 부채 추적
- `docs/product-specs/` — 제품 스펙
- `docs/references/` — 외부 참조 (LLM-friendly txt)
- `docs/generated/` — 자동 생성 산출물 (db-schema 등)

# 세션 간 메모리
- **첫 세션(Initializer)** — 별도 prompt로 `init.sh` / progress / `feature-list.json` / 초기 commit만 생성, 기능 구현 ❌
- `init.sh` — 개발 서버 실행 스크립트 (매 세션 시작 시 읽고 실행, 환경 파악 토큰 절약)
- `claude-progress.txt` 또는 `STATE.md` — 세션 간 작업 로그
- `feature-list.json` — 기능 목록, `passes` 필드만 수정 허용 (JSON: 모델 변조 저항)
- 깨끗한(merge-ready) 상태로만 세션 종료

# 컨텍스트 관리
- `SKILL.md` — 반복 작업 절차 문서화, 필요 시점에만 컨텍스트 로드 (progressive disclosure)
- 에이전트 런타임 컨텍스트 관리 원칙 → `docs/agent-system-prompt/base.md`

# 세션 워크플로우 (Coding Agent)
1. `pwd` 확인
2. `git log` + progress 파일 읽기
3. feature list에서 미완 최우선 항목 선택
4. 새 기능 착수 전 기본 E2E로 회귀 확인
5. 한 기능 구현
6. 사용자처럼 검증 (Puppeteer/CDP 등)
7. descriptive commit + progress 파일 갱신
8. merge-ready 상태로 종료

# 작업 분해
- XML 작업 정의: `<task><name><files><action><verify><done>`
- 에이전트 런타임 작업 분해 원칙 → `docs/agent-system-prompt/base.md`

# 커밋 규칙
- 원자적 커밋 (기능 단위 독립 revert 가능)
- 한국어 메시지, 마침표 없이
- 형식: `feat(MM-DD): ...` / `fix(MM-DD): ...` / `docs(MM-DD): ...`
- 검증 통과 후에만 `passes: true`

# 아키텍처 (Layered Domain)
- 순방향만: Types → Config → Repo → Service → Runtime → UI
- Cross-cutting (auth / telemetry / feature flag) → **Providers** 인터페이스로만
- Utils는 경계 밖, Providers로만 데이터 전달
- 위반은 커스텀 린터 + 구조 테스트로 기계적 차단
- "경계는 중앙에서, 자율성은 로컬에서"

# 자가 검증 (Back-pressure)
- 두 축: **Guides**(사전 차단: 린터·타입체크·deny 룰) + **Sensors**(사후 관찰: 테스트·로그·모니터링)
- 두 종류: **Computational**(결정론적, 빠름) + **Inferential**(LLM 기반 의미 분석, 코드 리뷰 에이전트)
- Quality Left — 빠른 검사는 pre-commit, 비싼 검사는 통합 후
- **린터 에러 메시지에 수정 지침을 직접 주입**
- Durability — 50~100 tool call 이후 instruction 추종 여부가 핵심 지표
- 관찰 가능성 — LogQL / PromQL / TraceQL
- worktree별 ephemeral 스택 (작업 끝나면 삭제)
- PR 검토는 점진적으로 에이전트 간 처리로 전환 — 인간 취향은 린터·문서·골든 룰로 인코딩
- 에이전트 런타임 검증 절차 → `docs/agent-system-prompt/base.md`

# 도구 사용 (MCP / CLI)
- MCP는 **필요한 것만** — 도구 정의 자체가 토큰
- "지루한" 기술 선호 — 학습 데이터 풍부 + API 안정 → 외부 라이브러리보다 재구현이 쌀 때도
- Vercel 사례: 도구 80% 제거 → 적은 스텝, 빠른 응답
- 에이전트 런타임 도구 사용 원칙 → `docs/agent-system-prompt/base.md`

# 보안
- 민감 파일 deny: `.env`, `.env.*`, `**/secrets/*`, `**/*credential*`, `**/*.pem`, `**/*.key`
- PreToolUse 가드 훅으로 마크다운 작성 전 인젝션 스캔
- `permissions.allow` 세분화 — 자동화 마찰 제거하되 deny 우선
- 에이전트 런타임 보안 원칙 → `docs/agent-system-prompt/base.md`

# 엔트로피 관리
- Golden Principles는 repo에 **코드로** 인코딩 (문서 의존 ❌)
  - (1) 자체 헬퍼보다 공유 유틸리티 패키지
  - (2) YOLO 데이터 탐색 금지 → 경계 검증 / 타입드 SDK
- 백그라운드 drift 감지 → 품질 등급 갱신 → 자동 리팩터링 PR
- Doc-gardening 에이전트 — 코드와 어긋난 stale 문서 감지 → 수정 PR 자동 생성
- 기술 부채는 고금리 대출, **매일 갚는다**
- 인간 취향 피드백 → 문서 업데이트 또는 툴링에 직접 인코딩

# 금지 사항
- 거대 AGENTS.md / 백과사전식 지침
- 코드베이스 개요 / 디렉터리 목록 (에이전트가 스스로 탐색)
- 사전 설계된 "이상적 하네스" — 실패 발생 시점에만 추가
- 한 세션에 여러 기능
- 검증 없이 완료 선언
- `--no-verify` / 훅 우회 (사용자 명시 요청 시에만)
- 인간 취향 충족용 코드 정리 — 정확·유지보수·재실행만 충족하면 합격
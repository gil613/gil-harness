# Harness Engineering — 통합 정리 문서

> AI 에이전트 시대, 경쟁력은 모델이 아니라 **에이전트를 감싸는 시스템**(하네스)에서 나온다.

---

## 0. 한 문장 요약

**Agent = Model + Harness**

하네스는 AI 모델이 안정적으로 long-running 작업을 수행하도록 감싸는 인프라 전체 — 시스템 프롬프트, 도구 정의, 샌드박스, 파일시스템, 컨텍스트 관리, 피드백 루프, 미들웨어 훅, 오케스트레이션, 기계적 강제 장치까지 포함한다. 모델이 아닌 모든 것이 하네스다.

---

## 1. 개념 위계 — 프롬프트 → 컨텍스트 → 하네스

### 1.1 3단계 진화

| 구분 | 핵심 질문 | 설계 대상 |
|---|---|---|
| 프롬프트 엔지니어링 | "무엇을 물어볼까?" | LLM에 전달하는 지시문 |
| 컨텍스트 엔지니어링 | "무엇을 보여줄까?" | 추론 시점에 보는 모든 토큰 |
| **하네스 엔지니어링** | "전체 환경을 어떻게 설계할까?" | 에이전트 바깥의 제약·피드백·운영 시스템 |

### 1.2 비유

- **프롬프트**: "오른쪽으로 돌아"라는 단발 음성 명령
- **컨텍스트**: 지도와 이정표를 보여주기
- **하네스**: 고삐·안장·울타리·도로 정비 — 여러 마리를 동시에 안전하게 달리게 만드는 전체 설계

### 1.3 컴퓨터 아키텍처 비유 (Phil Schmid)

| 컴퓨터 | 에이전트 시스템 |
|---|---|
| CPU | Model (raw processing) |
| RAM | Context Window (제한·휘발성 working memory) |
| **OS** | **Agent Harness** (컨텍스트 큐레이션, boot 시퀀스, 표준 드라이버) |
| Application | Agent (OS 위에서 도는 user logic) |

→ 개발자는 OS를 다시 만들 필요 없이 application만 정의하면 된다.

### 1.4 상호보완 관점

> **"컨텍스트 엔지니어링은 모델이 잘 생각하게 돕고, 하네스 엔지니어링은 시스템이 궤도를 이탈하지 않게 막는다."**

### 1.5 시간 순서

- **2023~2024**: 프롬프트 엔지니어링
- **2025년 중반**: 컨텍스트 엔지니어링 (Karpathy 언급, RAG/MCP/메모리 부상)
- **2025년 11월**: Anthropic, Effective Harnesses for Long-Running Agents
- **2026.01**: Phil Schmid, "Importance of Agent Harness in 2026"
- **2026.02.05**: Mitchell Hashimoto 블로그 (Harness Engineering 이름 등장)
- **2026.02.11**: OpenAI Codex 5개월 실험 보고서

---

## 2. 왜 필요한가 — 환경이 병목이다

### 2.1 핵심 명제

**모델이 아니라 환경이 병목이다.**

- 정적 리더보드의 톱티어 모델 격차는 좁아지고 있지만 **착시**일 수 있음
- 실제 차이는 **task가 길고 복잡해질수록 드러남**
- 핵심 지표 = **Durability** — 50~100번 tool call 이후에도 instruction을 얼마나 잘 따르는가
- 리더보드 1% 차이는 50스텝 후 drift 신뢰도를 잡지 못함
- **모델 성능은 빠르게 상향 평준화** → 하네스가 직접 쌓아야 하는 자산이고 범용 모델처럼 한 번에 배포되지 않음

### 2.2 LLM 단독으로 못 하는 것

LLM은 본질적으로 텍스트(이미지·오디오) → 텍스트 함수. 그 자체로는 못 함:
- 세션 간 상태 유지
- 코드 실행
- 실시간 정보 접근
- 환경 구성 / 패키지 설치
- "채팅" UX 자체도 사실 하네스의 산물 (이전 메시지 추적 + 새 메시지 이어붙이는 while 루프 = 가장 기본적인 하네스)

### 2.3 컨텍스트 부패 (Context Rot)

- Chroma 연구: 모델은 **컨텍스트 길이가 늘어날수록 추론 능력이 떨어진다**
- 질문과 관련 정보 간 의미적 유사도가 낮을수록 성능 저하 가팔라짐
- "큰 컨텍스트 윈도우는 더 큰 건초더미일 뿐 — 바늘 찾는 능력이 좋아지는 게 아니라 건초더미만 커진다"
- 필요한 건 더 긴 컨텍스트가 아니라 **더 나은 컨텍스트 격리**

### 2.4 벤치마크의 한계

- 기존 벤치마크는 single-turn 위주
- AIMO, SWE-Bench 같은 시스템 평가도 **50~100번째 tool call 이후 행동을 측정 못 함**
- "한두 번 시도로 어려운 퍼즐을 푸는 것"과 "한 시간 동안 초기 지시를 따르는 것"은 다른 능력

---

## 3. 하네스의 구성 요소

### 3.1 컨텍스트 파일 (AGENTS.md / CLAUDE.md / .cursorrules)

**원칙: 백과사전 ❌, 목차 ✅**

거대 AGENTS.md의 4가지 실패 모드 (OpenAI 경험):
1. 컨텍스트는 희소 자원 → 핵심 제약 놓침
2. 모든 게 "중요"하면 아무것도 안 중요함
3. 빠르게 stale 됨 — 낡은 규칙들의 무덤
4. 기계적 점검(커버리지·신선도·소유권·교차링크) 불가

해결: AGENTS.md(~100줄)는 **목차**, 실제 지식은 구조화된 `docs/` 디렉터리.

### 3.2 구조화된 문서 디렉터리 (System of Record)

OpenAI Codex 팀의 실제 레이아웃:
```
AGENTS.md                 # 목차 (~100줄)
ARCHITECTURE.md
docs/
├── design-docs/
│   ├── index.md
│   ├── core-beliefs.md
│   └── ...
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
│   └── db-schema.md
├── product-specs/
│   ├── index.md
│   └── ...
├── references/
│   ├── design-system-reference-llms.txt
│   ├── nixpacks-llms.txt
│   ├── uv-llms.txt
│   └── ...
├── DESIGN.md
├── FRONTEND.md
├── PLANS.md
├── PRODUCT_SENSE.md
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
```

핵심 원칙:
- **계획은 일급 아티팩트** (작은 변경=ephemeral, 복잡=exec-plan에 의사결정 로그까지 저장)
- 진행/완료/기술부채 모두 버전 관리되고 같은 위치에
- **점진적 공개(progressive disclosure)** — 작고 안정적인 진입점 → 다음 단계
- 기계적 강제 (전용 린터/CI 작업이 신선도·교차링크·구성 검증)
- **doc-gardening 에이전트** — 코드 동작과 어긋난 stale 문서 감지 → 수정 PR 자동 생성

### 3.3 MCP (Model Context Protocol) 서버

외부 도구·데이터 소스 연결:
- 이슈 트래커, 위키, 모니터링 시스템, 브라우저 자동화

```bash
claude mcp add --transport http jira https://mcp.jira.example.com/mcp
claude mcp add --transport stdio github -- npx -y @modelcontextprotocol/server-github
```

**주의**: 도구 정의 자체가 토큰 소비. **필요한 것만**.
- HumanLayer 사례: Linear MCP 대신 핵심만 감싼 경량 CLI로 수천 토큰 절약
- CLI가 이미 학습 데이터에 충분히 포함된 도구(GitHub, Docker, DB)면 MCP보다 CLI 호출이 낫다

### 3.4 스킬 파일 (SKILL.md)

반복 작업 절차를 문서화. 점진적 노출(progressive disclosure)로 **에이전트가 실제 필요할 때만 컨텍스트에 로드**.

예: 코드 리뷰 체크리스트, 배포 워크플로우, 특정 프레임워크 패턴.

### 3.5 파일시스템 + Git (지속적 저장소)

가장 근본적인 하네스 프리미티브.

- **작업 공간** + 중간 결과물 저장 + 세션 간 상태 유지
- **Git** = 버전 관리 + 실수 되돌리기 + 실험적 브랜치 + 협업용 공유 원장
- **Anthropic의 `claude-progress.txt`** — 각 세션이 한 일 기록, 다음 세션이 이 파일 + git log 읽고 현재 상태 파악

### 3.6 샌드박스 + 코드 실행

- bash·코드 실행 = 범용 도구
- 에이전트가 도구를 즉석에서 코드로 만들어 쓸 수 있게 함
- 격리된 환경 / 허용 명령만 / 네트워크 제한
- **on-demand 생성·폐기**로 대규모 워크로드 처리

### 3.7 컨텍스트 관리 전략

| 전략 | 설명 |
|---|---|
| **Compaction** | 한계 다다르면 기존 내용 요약·덜어내기 |
| **Tool call offloading** | 대용량 도구 출력은 앞뒤만 남기고 전체는 파일로 — 필요할 때만 참조 |
| **Skills (progressive disclosure)** | 실제 필요할 때만 관련 지침·도구 로드 |

HumanLayer 격언: **"성공은 조용히, 실패만 시끄럽게"** — 4,000줄 통과 결과로 컨텍스트 범람 시키지 말 것

### 3.8 서브 에이전트 (컨텍스트 격리)

서브 에이전트의 진짜 가치는 "프론트엔드/백엔드 역할 분담"이 아니라 **컨텍스트 격리**:
- 조사·탐색·구현의 노이즈를 흡수
- 상위 에이전트에게 **최종 결과만 간결하게** 전달
- 일종의 "**컨텍스트 방화벽**"

비용 통제 효과:
- 상위 세션 = 비싼 모델 (Opus)
- 서브 에이전트 = 저렴한 모델 (Sonnet, Haiku)
- 좁고 명확한 작업 범위라 약한 모델로도 충분

### 3.9 훅 + 백프레셔

- **훅(Hooks)**: 에이전트 라이프사이클 특정 시점에 자동 실행되는 사용자 정의 스크립트 (Git hook 유사)
  - 예: 작업 완료 시 typecheck + formatter 자동 실행 → 에러 있으면 에이전트에 돌려보냄
- **백프레셔(Back-pressure)**: 에이전트가 자기 작업을 스스로 검증
  - typecheck, 테스트, 커버리지 리포트, 브라우저 자동화 테스트
  - HumanLayer: **"가장 레버리지 높은 투자"**, "에이전트의 작업 성공 확률은 자기 검증 능력과 강하게 상관된다"

### 3.10 기계적 강제 (Mechanical Enforcement) — 커스텀 린터 + 구조 테스트

문서만으로는 일관성 유지 불가. **불변 조건을 기계적으로 강제**.

- 단순 에러만 띄우는 게 아니라 **린터 실패 시 에러 메시지에 수정 지침을 에이전트 컨텍스트에 직접 주입**
- 적용 대상: 구조화된 로깅, 스키마·유형 명명 규칙, 파일 크기 제한, 플랫폼별 안정성 요구사항

### 3.11 관찰 가능성 (Observability)

에이전트가 **자기 작성 코드를 디버깅·검증**할 수 있도록:
- LogQL로 로그 쿼리
- PromQL로 메트릭 쿼리
- TraceQL로 추적 쿼리
- DOM 스냅샷 / 스크린샷
- worktree별 ephemeral 스택 (작업 끝나면 삭제)

OpenAI 사례: Chrome DevTools Protocol을 에이전트 런타임에 연결 → DOM 스냅샷·스크린샷·네비게이션 스킬 → 한 Codex 실행이 6시간 이상 단일 작업 (밤새 동작)

### 3.12 가비지 컬렉션 (엔트로피 관리)

- Codex는 **기존 패턴(나쁜 것 포함)을 복제** → drift 불가피
- 과거: 매주 금요일(20%)을 "AI slop" 정리에 소모 → **확장 안 됨**
- 현재: **Golden Principles**를 repo에 직접 인코딩 + 백그라운드 에이전트 자동 정리
  - (1) 자체 헬퍼보다 공유 유틸리티 패키지 선호
  - (2) YOLO식 데이터 탐색 금지 → 경계 검증 / 타입드 SDK 강제
- Codex 백그라운드 잡: drift 감지 → 품질 등급 갱신 → 타깃 리팩터링 PR 자동 생성·자동 머지
- 격언: **"기술 부채는 고금리 대출, 매일 갚아라"**

---

## 4. 아키텍처 강제 — Layered Domain Architecture

### 4.1 OpenAI 패턴

각 비즈니스 도메인은 고정 레이어 시퀀스로 "전달"만 가능:
```
Types → Config → Repo → Service → Runtime → UI
```

- 교차 관심사(auth, connectors, telemetry, feature flags) → 단일 인터페이스 **Providers**로만 통과
- 모든 위반은 **커스텀 린터 + 구조 테스트로 기계적 차단**
- Utils 모듈은 경계 밖에 위치, Providers로 데이터 전달

### 4.2 보통은 100명 엔지니어가 모일 때 도입할 수준

…인 아키텍처를 **에이전트에게는 사전 조건으로** 도입한다.

> **"제약 조건이 있어야 성능 저하나 아키텍처 드리프트 없이 속도를 낼 수 있다."**

원칙: **"경계는 중앙에서, 자율성은 로컬에서"** (대규모 엔지니어링 플랫폼 조직 운영 패턴 그대로)

### 4.3 인간 코드 스타일과의 차이

결과 코드가 인간 취향과 일치하지 않아도 OK — **정확·유지보수·재실행 가독성**만 충족하면 합격.

인간 취향은 시스템에 지속 피드백:
- 리뷰 코멘트, 리팩터링 PR, 사용자 측 버그 → **문서 업데이트**로 기록 또는 **툴링에 직접 인코딩**
- 문서가 부족하면 **규칙을 코드로 승격**

---

## 5. 핵심 패턴

### 5.1 "지도를 줘라, 매뉴얼이 아니라"

> **"Give Codex a map, not a 1,000-page instruction manual."**

- 거대한 지침 파일 ❌
- AGENTS.md = 목차, 실제 지식은 구조화된 docs/

### 5.2 한 번에 하나의 기능 (Anthropic)

Anthropic Claude.ai 클론 실험:
- "claude.ai 클론 만들어" 같은 high-level 프롬프트 → 두 가지 실패
  1. **One-shot 시도** → 컨텍스트 소진, 절반 구현 미문서화
  2. **조기 완료 선언** → 후반부 에이전트가 "이미 됐네"하고 종료

해결: **각 세션이 단 하나의 기능에만 집중**.

### 5.3 Initializer + Coding 에이전트 패턴 (Anthropic)

**첫 세션** (Initializer agent — 다른 user prompt만 사용):
- `init.sh` 작성 (개발 서버 실행 스크립트)
- `claude-progress.txt` 작성 (작업 로그)
- 초기 git commit
- **Feature list JSON** (200+ 기능, 모두 `"passes": false`)

**이후 모든 세션** (Coding agent):
1. `pwd` — 작업 디렉터리 확인
2. **git log + progress 파일 읽기**
3. feature list에서 미완 최우선 기능 선택
4. `init.sh`로 dev server 시작
5. 새 기능 전 **기본 end-to-end 테스트**
6. 한 기능 구현
7. **검증** (Puppeteer MCP로 사용자처럼)
8. **descriptive commit message + progress 파일 업데이트**
9. 깨끗한 상태(merge-ready)로 종료

### 5.4 Feature List는 JSON으로

```json
{
    "category": "functional",
    "description": "New chat button creates a fresh conversation",
    "steps": [
      "Navigate to main interface",
      "Click the 'New Chat' button",
      "Verify a new conversation is created",
      "Check that chat area shows welcome state",
      "Verify conversation appears in sidebar"
    ],
    "passes": false
}
```

- 코딩 에이전트는 `passes` 필드만 수정 허용
- 강한 어조: **"It is unacceptable to remove or edit tests..."**
- **JSON 선택 이유**: 모델이 마크다운보다 JSON을 부적절하게 변경/덮어쓰기 할 가능성이 낮음

### 5.5 처리량이 머지 철학을 바꾼다 (OpenAI)

- 차단 머지 게이트 최소화
- PR 수명 짧게
- **테스트 flakiness는 차단 대신 재실행으로 처리**
- 에이전트 처리량 ≫ 사람 주의력 → **수정 비용은 싸고 대기 비용이 비쌈**
- (낮은 처리량 환경엔 부적합)

### 5.6 원자적 Git 커밋 (GSD)

```
abc123f docs(08-02): complete user registration plan
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing
lmn012o feat(08-02): create registration endpoint
```

**장점**:
- Git bisect로 정확히 깨진 작업 추적
- 작업 단위 독립 revert
- 다음 세션 에이전트가 읽을 명확한 이력
- AI 자동화 워크플로우 한눈에

### 5.7 Wave 기반 병렬화 (GSD)

```
웨이브 1 (병렬)         웨이브 2 (병렬)         웨이브 3
[플랜 01][플랜 02]  →  [플랜 03][플랜 04]  →  [플랜 05]
 유저모델  제품모델      주문API   장바구니API     결제UI
```

- 독립 계획 → 같은 웨이브 → 병렬
- 의존 계획 → 이후 웨이브 → 의존성 대기
- 파일 충돌 → 순차 또는 같은 계획
- **수직 슬라이스(엔드투엔드 기능)**가 **수평 레이어(모든 모델 → 모든 API)**보다 더 잘 병렬화

### 5.8 XML 프롬프트 포맷팅 (GSD)

```xml
<task type="auto">
  <name>로그인 엔드포인트 생성</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    JWT에는 jose 사용 (jsonwebtoken 아님 - CommonJS 이슈).
    users 테이블 대비 자격증명 검증.
    성공 시 httpOnly 쿠키 반환.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login이 200 + Set-Cookie 반환</verify>
  <done>유효한 자격증명은 쿠키 반환, 무효는 401 반환</done>
</task>
```

→ 정확한 지시, 추측 없음, 검증 내장

### 5.9 멀티 에이전트 오케스트레이션 (GSD 패턴)

| 단계 | 오케스트레이터 | 에이전트 |
|---|---|---|
| 리서치 | 조율 + 결과 제시 | 4개 리서처 병렬 (스택/기능/아키텍처/주의사항) |
| 기획 | 검증 + 반복 관리 | 플래너 → 확인기 → 통과까지 반복 |
| 실행 | 웨이브 그룹화 + 진행 추적 | 실행기 병렬, 각각 새 200K 컨텍스트 |
| 검증 | 결과 제시 + 다음 라우팅 | 검증기 + 디버거 |

**결과**: 메인 컨텍스트 30~40%만 사용, 실제 작업은 서브에이전트 컨텍스트에서

### 5.10 Ralph Wiggum Loop (OpenAI)

PR 완료까지 **모든 에이전트 리뷰어가 만족할 때까지 반복**:
- Codex가 로컬에서 자체 변경 검토
- 추가 에이전트 리뷰 요청 (로컬 + 클라우드)
- 사람·에이전트 피드백에 응답
- 반복

→ 시간 지나면서 **거의 모든 리뷰가 에이전트 간 처리**로 전환

---

## 6. 사례 연구

### 6.1 OpenAI Codex — 5개월 실험

| 지표 | 값 |
|---|---|
| 기간 | 2025.08 ~ 2026.01 |
| 수동 작성 코드 | **0줄** |
| 생성 코드 | 약 100만 라인 |
| 머지된 PR | 약 1,500개 |
| 팀 규모 | 3명 → 7명 |
| 1인당 일 평균 PR | 3.5개 |
| 수동 대비 시간 | 약 1/10 |
| 사용 | 내부 데일리 유저 + 외부 알파 테스터 |

**핵심 교훈**:
- 초기 진행은 예상보다 느렸음 — **모델 역량 부족이 아니라 환경 미비**
- 엔지니어 핵심 질문: "**무엇이 누락되어 에이전트가 못 읽고 못 실행하는가**"
- 깊이 우선(depth-first) — 큰 목표를 작은 빌딩 블록으로 분해

### 6.2 Anthropic — Claude.ai 클론 실험

- Claude Agent SDK + Opus 4.5
- Initializer + Coding 에이전트 2-part 솔루션
- Feature list JSON 200+ 항목
- Puppeteer MCP로 end-to-end 검증
- **한계 보고**: Puppeteer MCP로 브라우저 네이티브 alert 모달은 안 보임

### 6.3 Hashline (Can Boluk, 2026.02) — 도구 형식만 바꿔서

기존: 정확한 텍스트 재현 / 구조화된 diff 요구

Hashline: 각 줄에 2~3자리 해시 부여
```
1:a3|function hello() {
2:f1|  return "world";
3:0e|}
```
모델이 "2:f1 줄을 교체해라"처럼 해시로 위치 지정 → 정확한 문자열 재현 없이 편집

**결과** (16개 모델 대상):
- Grok Code Fast 1: **6.7% → 68.3%**
- 전체 평균 출력 토큰 약 **20% 감소**
- **모델 가중치 변경 없이 하네스만 개선**

### 6.4 LangChain — Terminal Bench 2.0

- 모델 고정: gpt-5.2-codex
- 하네스만 개선
- 점수: **52.8% → 66.5%** (13.7p 상승)
- 순위: **30위권 → 5위권**
- 핵심: LangSmith 트레이스로 실패 패턴 자동 분석 + 자가 검증 루프

### 6.5 GSD (Get Shit Done) — 실제 도구

12개 런타임 지원하는 메타 프롬프팅·컨텍스트 엔지니어링·스펙 기반 개발 시스템.

표준 파일 구조:
| 파일 | 역할 |
|---|---|
| `PROJECT.md` | 비전, 항상 로드 |
| `research/` | 생태계 지식 |
| `REQUIREMENTS.md` | v1/v2/스코프 외 |
| `ROADMAP.md` | 방향 + 완료 |
| `STATE.md` | 결정/블로커/위치 — 세션 간 메모리 |
| `PLAN.md` | XML 구조 + 검증 단계 |
| `SUMMARY.md` | 변경사항, 이력 커밋 |
| `todos/` | 미래 작업 |
| `threads/` | 크로스 세션 컨텍스트 |
| `seeds/` | 트리거 조건 갖춘 미래 아이디어 |

워크플로우:
```
new-project → discuss-phase → plan-phase → execute-phase
            → verify-work → ship → complete-milestone → new-milestone
```

### 6.6 Mitchell Hashimoto — Ghostty AGENTS.md

**원칙**: "에이전트가 실수할 때마다, 그 실수가 다시는 발생하지 않도록 엔지니어링"

- 과거 에이전트가 저지른 실수를 방지하는 규칙이 한 줄 한 줄 쌓임
- "다음부터 잘해" 프롬프트 ❌, **구조적 재발 방지** ✅

### 6.7 기타 사례

- **Manus**: 6개월간 하네스 5번 리팩터링 (rigid assumption 제거)
- **LangChain**: Open Deep Research 1년에 3번 재설계
- **Vercel**: 에이전트 tool 80% 제거 → 적은 스텝, 적은 토큰, 빠른 응답
- **Stripe**: pre-push 훅 + 통합 feedback sensor

---

## 7. 실패 모드와 해결책

| 문제 | 해결 |
|---|---|
| One-shot 시도, 컨텍스트 소진 | Feature list + 한 세션에 단일 기능 |
| 조기 완료 선언 | 구조화된 feature list, 모든 미완 항목 추적 |
| 미문서화 / 버그 상태로 종료 | git commit + progress 파일 + 다음 세션 시작 시 dev server 기본 테스트 |
| 기능 조기 "완료" 처리 | 모든 기능 자가 검증 + Puppeteer 등 end-to-end 테스트 후만 `passing` |
| 앱 실행법 알아내느라 토큰 낭비 | `init.sh` 작성 + 매 세션 시작 시 읽기 |
| 컨텍스트 부패 (Context Rot) | Compaction + tool call offloading + Skills + 서브 에이전트 격리 |
| 거대 AGENTS.md 실패 | 목차 + 구조화된 docs/ + 점진적 공개 |
| 대량 통과 출력으로 컨텍스트 범람 | "성공은 조용히, 실패만 시끄럽게" |
| 엔트로피 / AI slop 누적 | Golden Principles + 백그라운드 정리 에이전트 |
| 아키텍처 드리프트 | 커스텀 린터 + 구조 테스트로 기계적 강제 |
| MCP 도구 정의 토큰 폭증 | 필요한 것만 + 학습된 CLI는 그냥 CLI 호출 |
| 과도한 지시사항 | "적게 넣어라" — 사람 작성도 4% 개선에 그침 |

---

## 8. 실전 원칙 (메타 룰)

### 8.1 실패에서 시작하라 (Mitchell Hashimoto / HumanLayer)

이상적 하네스를 미리 설계 ❌. 에이전트가 **실제로 실패할 때마다** 그 실패를 구조적으로 방지하는 장치를 추가 ✅.

> "출하 편향을 가져라. 에이전트가 실제로 실패한 경우에만 하네스를 건드려라."

### 8.2 적게 넣어라 (ETH Zurich 연구)

- 138개 에이전트 설정 파일 테스트
- LLM 생성 파일: **성능 떨어뜨리면서 비용 20%+ 상승**
- 사람 작성도 4% 개선에 그침
- 코드베이스 개요 / 디렉터리 목록은 무용 (에이전트가 스스로 탐색)
- **보편적으로 적용되는 최소한의 지침만** 넣기

### 8.3 도구를 과하게 연결하지 마라

- MCP 많이 연결 → 도구 설명이 시스템 프롬프트 채움 → **인스트럭션 예산 잠식**
- 학습 데이터에 충분히 포함된 도구(GitHub, Docker, DB)는 CLI 사용 프롬프트가 더 효율적

### 8.4 점진적 작업을 강제하라

Anthropic 실험 최대 개선 변화: **한 번에 하나의 기능**.
- 각 작업 끝나면 git commit + progress note
- 다음 세션은 깨끗한 상태에서 시작

OpenAI: "에이전트가 고전하면 그걸 신호로 삼아라. 무엇이 빠져 있는지(도구·가드레일·문서) 파악하고, Codex가 직접 수정하게 하라."

### 8.5 Start Simple, Build to Delete (Phil Schmid)

1. **Start Simple** — 거대 컨트롤 플로우 ❌. 견고한 atomic tool 제공, 모델에게 plan을 맡기고 guardrail/retry/verification만 구현
2. **Build to Delete** — 모듈러 아키텍처. 새 모델이 로직을 대체할 것. 코드 제거 가능 상태 유지
3. **The Harness is the Dataset** — 경쟁 우위는 더 이상 프롬프트가 아니라 **하네스가 캡처하는 trajectory**

### 8.6 The Bitter Lesson

Rich Sutton: "general methods that use computation beat hand-coded human knowledge every time."

→ 인프라(하네스)는 **lightweight**여야 함. 매 모델 릴리스마다 최적 구조가 달라짐.
→ 2024년 hand-coded 파이프라인이 필요했던 능력이 2026년엔 **단일 context-window prompt**로 처리됨.
→ "어제 짠 smart logic을 뜯어낼 수 있게 만들어라."

### 8.7 에이전트 가독성이 곧 진실

> **"에이전트가 컨텍스트에서 접근 못 하는 것은 사실상 존재하지 않는 것."**

- Slack·Google Docs·머릿속 지식 = **존재하지 않는 것**
- 모든 것을 **마크다운/스키마/exec-plan으로 repo에 인코딩**
- 신입 사원 합류시키듯 에이전트에 정보 제공

### 8.8 "지루한" 기술 선호

- 결합성·API 안정성·학습 데이터 내 표현이 좋아 **모델링 쉬움**
- 때로는 외부 라이브러리보다 **재구현이 더 저렴**
  - 예: p-limit 대신 자체 map-with-concurrency, OTel 통합 + 100% 테스트

### 8.9 "엄밀함의 재배치" (Chad Fowler)

코드 한 줄 한 줄을 정확히 짜던 엄밀함이, **에이전트가 올바르게 작동하도록 시스템을 설계하는 엄밀함**으로 옮겨감.

> **"규율은 코드보다 스캐폴딩에서 더 많이 드러난다."**

### 8.10 인간 검토는 선택적

- PR 검토는 점진적으로 에이전트 간 처리로 전환
- 인간 취향은 **시스템에 인코딩** (린터·문서·골든 룰)

---

## 9. 도입 단계 (3단계)

### Step 1. 컨텍스트 파일 작성

프로젝트 루트에 `CLAUDE.md` / `AGENTS.md` 생성:
- **짧게 시작**
- 에이전트가 반복 실수하는 부분만 추가
- 같은 실수 방지 지시를 누적

예시:
```markdown
## 빌드
- `./gradlew build` 로 전체 빌드
- `./gradlew test` 로 테스트 실행

## 코딩 규칙
- 패키지 의존 방향: domain → application → infrastructure
- infrastructure에서 domain을 직접 참조하지 않는다
- 엔티티는 지연 로딩 기본, Fetch Join으로 N+1 해결

## 커밋
- 커밋 메시지는 한국어, 마침표 없이 작성
```

### Step 2. MCP 연결

자주 참조하는 외부 시스템:
- 이슈 트래커, 위키, 모니터링
- **필요한 것만 연결** (토큰 낭비 방지)

### Step 3. 린터 + CI 연동

- 에이전트가 CI 실패 로그를 읽도록 연결
- **자가 수정 피드백 루프** 구성
- 린터 에러 메시지에 **수정 지침 직접 주입**

---

## 10. 보안 (GSD 패턴)

### 10.1 심층 방어

- **경로 순회 방지** — 사용자 제공 파일 경로 검증
- **프롬프트 인젝션 감지** — 중앙화된 모듈로 사용자 텍스트 스캔
- **PreToolUse 가드 훅** — 마크다운 파일 쓰기 전 인젝션 벡터 스캔
- **안전한 JSON 파싱** — 잘못된 형식 차단
- **셸 인수 검증** — 보간 전 살균
- **CI 인젝션 스캐너** — 모든 에이전트/워크플로우/명령어 파일 점검

핵심 통찰:
> **"LLM 시스템 프롬프트가 되는 마크다운 파일을 생성하기 때문에, 기획 아티팩트에 들어가는 사용자 제어 텍스트는 잠재적 간접 프롬프트 인젝션 벡터가 된다."**

### 10.2 민감 파일 보호

`.claude/settings.json`:
```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

### 10.3 자동화 마찰 제거

`claude --dangerously-skip-permissions`
- "date와 git commit 50번 승인하러 멈추면 의미가 없음"
- 대안: 세분화된 `permissions.allow`

---

## 11. 모델·하네스 공진화의 역설

### 11.1 모델은 자기 하네스에서 후훈련된다

- Claude → Claude Code 하네스
- Codex → Codex 하네스
- 결과: **모델이 특정 하네스에 최적화**
  - Codex 모델이 `apply_patch`에 극도로 결합 → OpenCode가 별도 도구 추가 필요

### 11.2 그러나 자기 하네스에 과적합

- Terminal Bench 2.0에서 Opus 4.6:
  - Claude Code 안에서: **33위**
  - 다른 하네스에서: **5위권**
- → **후훈련 때 보지 못한 하네스가 더 나은 성능**
- → 모델이 자기 하네스에 "**과적합**" 가능성

### 11.3 실무자 메시지

> **"기본 하네스를 그대로 쓰는 것이 최선이 아닐 수 있다. 자신의 작업 특성에 맞게 커스터마이징하면 의미 있는 성능 향상."**

---

## 12. 미래 / 열린 질문

### 12.1 단일 vs 멀티 에이전트 (Anthropic)

전문화된 에이전트가 더 나을 가능성:
- 테스트 에이전트
- QA 에이전트
- 코드 클린업 에이전트
- doc-gardening 에이전트

### 12.2 다른 도메인 일반화

웹 앱 외 영역으로 확장:
- 과학 연구
- 금융 모델링
- 기타 long-horizon 작업

### 12.3 LangChain 탐구 방향

- 수백 개 에이전트가 공유 코드베이스에서 병렬 작업 오케스트레이션
- **자기 개선 루프** — 에이전트가 자기 실행 트레이스 분석 → 하네스 수준 실패 원인 자가 수정
- **적응형 하네스** — 사전 구성 없이 작업에 따라 도구·컨텍스트 동적 조립

### 12.4 하네스가 새로운 서비스 템플릿이 될 것인가 (Birgitta Böckeler)

- 대부분 조직은 2~3개 주요 기술 스택만 사용
- **일반적 애플리케이션 유형별 하네스 미리 구비** → 점진적 맞춤화
- 골든 패스처럼 작동
- 기술 선택 기준 변화: "DX 좋은 프레임워크" → "**좋은 하네스가 갖춰진 프레임워크**" (AI 친화성)

### 12.5 레거시 vs Greenfield 격차

- AI 에이전트와 처음부터 만든 코드베이스 vs **하네스 이전 시대 레거시**
- 레거시에 하네스 소급 적용 = 정적 분석 한 번도 안 돌린 코드에 처음 돌리기 → **경고 홍수**

### 12.6 새로운 병목: Context Durability

- Harness가 **model drift 해결의 1차 도구**
- 100번째 스텝에서 언제 instruction을 안 따르는지·추론이 깨지는지 정확히 감지
- **training에 직접 피드백** → "지치지 않는 모델"

---

## 13. Birgitta Böckeler 프레임워크 (Martin Fowler 사이트)

### 13.1 제어의 두 축

| 분류 | 설명 |
|---|---|
| **Guides (feedforward)** | 원치 않는 출력을 사전 차단 |
| **Sensors (feedback)** | 결과를 사후 관찰 + 자가교정 유도 |

| 분류 | 설명 |
|---|---|
| **Computational** | 결정론적·빠름 (린터, 테스트, 타입 체커) |
| **Inferential** | LLM 기반 의미론적 분석 (코드 리뷰 에이전트) |

### 13.2 3가지 규제 카테고리

1. **Maintainability Harness** — 가장 성숙. 복잡도/중복/스타일 검출
2. **Architecture Fitness Harness** — fitness function·관측성 표준
3. **Behaviour Harness** — 가장 미성숙. AI 생성 테스트에 너무 의존하면 위험

### 13.3 전략 원칙

- **Timing & Quality Left** — 빠른 검사는 pre-commit, 비싼 검사는 통합 후
- **Harnessability** — 강한 타이핑·명확한 모듈 경계 같은 "ambient affordances"가 하네스 가능성 결정
- **Human Role** — 인간 제거가 아니라 **고임팩트 의사결정에 재배치**

### 13.4 미해결 과제

- 가이드와 센서가 모순되지 않는 일관된 시스템 설계
- 하네스 품질·커버리지의 체계적 평가
- 함수적 정확성 신뢰를 진짜로 높이는 행위 하네스 구축
- 시스템 진화에 따른 하네스 동기화

### 13.5 검증의 빈틈 (Anthropic이 보완)

OpenAI 글에서 부족했던 부분: **기능과 동작의 검증** ("이 기능이 사용자 입장에서 실제로 작동하는가?")
→ Anthropic의 Puppeteer 기반 E2E 테스트가 더 완결적

---

## 14. 한 페이지 요약 — 하네스 엔지니어링 체크리스트

### 14.1 기본 인프라

- [ ] 프로젝트 루트 `AGENTS.md` 또는 `CLAUDE.md` (목차, ~100줄)
- [ ] `docs/` 구조화 (design-docs / exec-plans / product-specs / references)
- [ ] `init.sh` (앱 실행 스크립트)
- [ ] Git 리포지터리 + 원자적 커밋 컨벤션
- [ ] `progress.txt` 또는 `STATE.md` (세션 간 메모리)

### 14.2 컨텍스트 관리

- [ ] Compaction 활성화
- [ ] Tool call 출력 offload 정책
- [ ] 서브 에이전트로 컨텍스트 격리
- [ ] "성공은 조용히, 실패만 시끄럽게"

### 14.3 검증 / 자가 검증

- [ ] 타입체크 / 테스트 / 린터 통합
- [ ] 브라우저 자동화 (Puppeteer/CDP)
- [ ] 관찰 가능성 (LogQL / PromQL / TraceQL)
- [ ] worktree별 격리된 dev 환경
- [ ] Feature list JSON (한 번에 하나)

### 14.4 아키텍처 강제

- [ ] 레이어드 도메인 (Types → Config → Repo → Service → Runtime → UI)
- [ ] Cross-cutting via Providers
- [ ] 커스텀 린터 (수정 지침 메시지 포함)
- [ ] 구조 테스트
- [ ] doc-gardening 에이전트

### 14.5 워크플로우

- [ ] new-project → discuss → plan → execute → verify → ship
- [ ] Wave 기반 병렬 실행
- [ ] XML 작업 정의 (action / verify / done)
- [ ] Multi-agent 오케스트레이션
- [ ] Initializer + Coding 에이전트 분리

### 14.6 보안

- [ ] 경로 순회 방지
- [ ] 프롬프트 인젝션 스캐너
- [ ] PreToolUse 가드 훅
- [ ] 민감 파일 deny 리스트
- [ ] CI 인젝션 검증 테스트

### 14.7 유지보수 / 엔트로피 관리

- [ ] Golden Principles 인코딩
- [ ] 백그라운드 drift 감지 잡
- [ ] 자동 리팩터링 PR
- [ ] 품질 등급 추적
- [ ] tech-debt-tracker

### 14.8 운영 마찰 제거

- [ ] permissions.allow 정의
- [ ] Skip permission 모드 (자동화용)
- [ ] 빠른 모드 (`/quick`) — 단순 작업 경로
- [ ] auto_advance — 무인 체이닝

---

## 15. 핵심 인용문 모음

> **"Agent = Model + Harness"** — Vivek Trivedy (LangChain)

> **"에이전트가 실수할 때마다, 그 실수가 다시는 발생하지 않도록 엔지니어링하는 것."** — Mitchell Hashimoto

> **"Codex에 1,000페이지 매뉴얼이 아니라 지도를 줘라."** — OpenAI Codex Team

> **"에이전트가 컨텍스트에서 접근 못 하는 것은 사실상 존재하지 않는 것."** — OpenAI Codex Team

> **"모델은 아마 괜찮다. 하네스의 문제일 뿐이다."** — HumanLayer

> **"규율은 코드보다 스캐폴딩에서 더 많이 드러난다."** — OpenAI Codex Team

> **"기술 부채는 고금리 대출 — 매일 갚아라."** — OpenAI Codex Team

> **"성공은 조용히, 실패만 시끄럽게."** — HumanLayer

> **"컨텍스트 엔지니어링은 모델이 잘 생각하게 돕고, 하네스 엔지니어링은 시스템이 궤도를 이탈하지 않게 막는다."** — MadPlay

> **"큰 컨텍스트 윈도우는 더 큰 건초더미일 뿐."** — Chroma 연구

> **"가장 어려운 도전은 이제 환경, 피드백 루프, 제어 시스템을 설계하는 것."** — OpenAI Codex Team

> **"Build to Delete — 어제 짠 smart logic을 뜯어낼 수 있게 만들어라."** — Phil Schmid

---

## 16. 참고 자료

### 1차 자료
- **OpenAI** — *Harness engineering: leveraging Codex in an agent-first world* (2026.02.11)
- **Anthropic** — *Effective Harnesses for Long-Running Agents* (Justin Young, 2025.11.26)
- **Phil Schmid** — *The importance of Agent Harness in 2026* (2026.01.05)
- **Martin Fowler / Birgitta Böckeler** — *Harness Engineering for Coding Agent Users*
- **Mitchell Hashimoto** — *My AI Adoption Journey* (2026.02.05)

### 2차 자료
- **MadPlay** — *프롬프트와 컨텍스트를 넘어, AI 에이전트를 위한 하네스 엔지니어링* (2026.02.15)
- **HumanLayer** — *Skill Issue: Harness Engineering for Coding Agents*
- **LangChain** — *The Anatomy of an Agent Harness*, *Improving Deep Agents with Harness Engineering*
- **InfoQ** — *OpenAI Introduces Harness Engineering* (2026.02)
- **Towards AI** — *OpenAI's Harness Engineering Experiment* (Rick Hightower, 2026.04)

### 실전 도구
- **GSD (Get Shit Done)** — github.com/gsd-build/get-shit-done — 12개 런타임 메타 시스템
- **Claude Agent SDK** — Anthropic
- **Codex CLI** — OpenAI
- **LangChain DeepAgents**
- **Aardvark** — OpenAI 코드베이스 작업 에이전트

### 관련 연구
- **Chroma** — Context Rot 연구
- **ETH Zurich** — 138개 에이전트 설정 파일 효과 연구
- **Can Boluk** — *I Improved 15 LLMs at Coding in One Afternoon* (Hashline, 2026.02)

---

*최종 정리: 2026-04-28 — ai-engine 프로젝트 설계용 통합 자료*

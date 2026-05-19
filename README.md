한국어 | **[English](README.en.md)**

# Harness

범용 프로젝트 에이전트 하네스. 어떤 프로젝트에든 설치해 AI가 요구사항 수집부터 코드 리뷰까지 단계적으로 작업하도록 만드는 Claude Code 플러그인이다.

## 개념

```
에이전트 = 모델 + 하네스
```

모델이 아닌 모든 것 — 에이전트 지침, 검증 기준, 상태 관리, 산출물 구조 — 이 하네스다. 하네스가 에이전트가 어디서 무엇을 해야 하는지 결정하고, 결과가 기준을 통과했는지 판정한다.

### 워크플로우

**구현 사이클** (`/harness:run`):

```
REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE
     ↑           ↑           ↑           ↑
   추론         추론       결정론       결정론
```

**분석 사이클** (`/harness:analyze`):

```
ANALYSIS → SPECIFICATION → DONE
   ↑            ↑
 결정론        추론
```

검증 게이트는 두 종류 — **추론**: 검증 서브에이전트(LLM)가 산출물 품질을 판정 · **결정론**: 명령어 실행 + 산출물 구조 검사로 판정 (LLM 호출 없음).

두 사이클은 각각 독립 state 파일(`state.json` / `analyzer-state.json`)을 사용해 충돌 없이 병행 가능하다.

각 스테이지는 전용 워커 서브에이전트가 작업한다. 산출물 심사는 스테이지에 따라 다르다 — REQUIREMENTS/ROADMAP은 검증 서브에이전트가, DEVELOPMENT/REVIEW는 결정론 검사(명령어 실행 + 산출물 구조 검사)가 담당한다. 검증 실패 시 실패 원인과 수정 계획을 state 파일에 기록하고 재시도한다. `maxRetries`(기본 3) 초과 시 사용자 개입을 요청한다.

---

## 설치

터미널에서 CLI로 설치한다.

```bash
claude plugin marketplace add gil613/gil-harness
claude plugin install harness
```

설치 후 `/harness:*` 슬래시 명령어가 활성화된다.

### 로컬 개발

```bash
git clone https://github.com/gil613/gil-harness
claude --plugin-dir ./gil-harness
```

---

## 빠른 시작

```
/harness:init        # 현재 프로젝트에 .harness/ 초기화
/harness:run         # 구현 사이클 자동 실행 (REQUIREMENTS→REVIEW→DONE)
/harness:analyze     # 분석 사이클 자동 실행 (ANALYSIS→SPECIFICATION→DONE)
/harness:status      # 진행 상태 확인
/harness:retro       # 모든 스테이지 완료 후 회고 + 지침 개선
```

---

## 명령어

| 명령어 | 역할 |
|--------|------|
| `/harness:init` | 현재 프로젝트 자동 분석 → `.harness/config.json`, `.harness/state.json` 생성 |
| `/harness:run` | **구현 사이클 자동 루프** — DONE 또는 재시도 한계까지 run→validate 반복, 수동 개입 불필요 |
| `/harness:analyze` | **분석 사이클 자동 루프** — ANALYSIS→SPECIFICATION→DONE, 구현 사이클과 독립 실행 |
| `/harness:status` | 진행 상황 한 화면 요약 |
| `/harness:reset` | iteration/failures 리셋 — `maxRetries` 초과 후 지침 수정하고 재시도할 때 사용 |
| `/harness:retro` | 회고 서브에이전트 → 실패 패턴 분석 → 에이전트 지침 직접 개선 |
| `/harness:update` | 플러그인 새 버전 내용을 기존 프로젝트에 적용 — config.json 스키마 보완, CLAUDE.md 갱신 |
| `/harness:uninstall` | 프로젝트에서 하네스 완전 제거 (`.harness/` 삭제, 확인 후 실행) |

### `/harness:init`

현재 디렉터리의 프로젝트 파일을 자동 분석해 설정값을 채운다.

감지 지원: Node.js (TypeScript/JavaScript, React, Next.js, Vue, Nuxt, Svelte, Express, Fastify, NestJS), Python, Rust, Go, Java (Maven/Gradle), Kotlin.

생성 결과:

```
.harness/
  config.json          ← 프로젝트 설정 (수정 가능)
  state.json           ← 현재 stage, iteration, failures, history (직접 수정 금지, /harness:reset 사용)
```

스테이지 산출물(`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`)과 `retrospectives/`는 각 스테이지에서 만들어진다.

### `/harness:run`

**한 번 실행하면 전 파이프라인을 자동으로 완주한다.** 내부 루프: 현재 스테이지 워커 실행 → validate → PASS면 다음 스테이지로 이동 후 반복 → DONE 도달 시 종료. FAIL이면 cause/plan을 워커에게 전달해 동일 스테이지 재시도. `iteration >= maxRetries`이면 루프 중단 후 사용자 개입 요청.

`/harness:run T08 추가` 처럼 명령 뒤에 자유 문자열을 붙이면 이번 사이클의 `userIntent`로 캡처되어 워커 서브에이전트(특히 `requirements-collector`)에 focus hint로 전달된다. stage 규칙이나 완료 기준을 덮어쓰지는 않는다.

이전 사이클이 `DONE` 상태로 끝나 있어도 `/harness:run`은 더 이상 거기서 멈추지 않는다 — 회고가 누락됐으면 inline 회고를 자동 실행하고, 회고가 끝나 있으면 stage만 `REQUIREMENTS`로 자동 리셋한 뒤 새 사이클을 이어간다. `reset --stage` 댄스 불필요.

`.harness/agents-overrides/<subagent>.md`가 있으면 회고가 만든 프로젝트 로컬 지침을 프롬프트에 자동 인라인한다.

스테이지별 검증은 `/harness:run`이 자동으로 수행한다 (절차 정의: `docs/validate.md`) — 별도의 검증 명령은 없다. 검증 동작은 아래 "검증 게이트" 절 참고.

### `/harness:status`

```
프로젝트: my-app
언어:     TypeScript

스테이지 [██▶░░] 3/5
현재:     DEVELOPMENT
재시도:   1/3
마지막 검증: 2026-04-27T09:12:34.000Z

최근 실패:
  [DEVELOPMENT] #1 — 타입 에러 12건 (tsc --noEmit 실패)

완료 이력:
  REQUIREMENTS — 2026-04-26
  ROADMAP — 2026-04-27
```

### `/harness:reset`

| 인수 | 동작 |
|------|------|
| (없음) | `iteration=0`, `failures=[]` |
| `--iteration` | `iteration`만 0 |
| `--failures` | `failures`만 비움 |
| `--all` | 둘 다 |
| `--stage <STAGE>` | 강제 stage 변경 (확인 필요) |

`maxRetries`/`lastValidated`/`history`/`schemaVersion`은 절대 건드리지 않는다.

### `/harness:analyze`

**한 번 실행하면 분석 사이클을 자동으로 완주한다.** 내부 루프: ANALYSIS 워커 실행 → 검증 → PASS면 SPECIFICATION으로 이동 → 검증 → PASS면 DONE. FAIL이면 원인/계획을 워커에 전달해 재시도. `iteration >= maxRetries`이면 정지 후 사용자 개입 요청.

명령 뒤에 분석 대상을 자유 문자열로 붙이면 워커에 `[USER INTENT]`로 전달된다. 비어 있으면 `analyzer`가 사용자에게 1회 질문한다.

```bash
/harness:analyze auth 모듈 회귀 테스트 영향 파악
/harness:analyze PRD 초안 기술 실현 가능성 검토
```

이전 사이클이 DONE이면 자동으로 ANALYSIS로 리셋해 새 사이클을 시작한다. 구현 사이클(`state.json`)과 충돌하지 않는다.

산출물:
- `.harness/analysis.md` — 사실 기반 분석 (출처 첨부 Findings, Methodology, Open Questions)
- `.harness/spec.md` — 의사결정 명세 (Decisions + 근거, Recommendations, Constraints)

### `/harness:retro`

회고 서브에이전트(`retrospective`)를 호출해 이번 사이클을 분석한다. 산출물 두 가지:

1. `.harness/retrospectives/<YYYY-MM-DD>.md` — 잘된 것 / 개선 필요 / 교훈
2. **에이전트 지침 개선** — Edit 도구로 `.harness/agents-overrides/*.md`(프로젝트 로컬) 또는 명시적 동의 시 플러그인 본체 `agents/*.md`에 직접 적용

별도의 패치 DSL은 사용하지 않는다 — Edit 도구가 그대로 패치 메커니즘이다.

### `/harness:update`

플러그인을 새 버전으로 업데이트(`claude plugin update harness` 또는 `git pull`)한 뒤 실행해 기존 프로젝트 파일을 동기화한다.

- **config.json**: 새 버전 스키마에서 추가된 필드만 보완. 기존 필드는 건드리지 않음
- **디렉터리**: 새 버전이 요구하는 `.harness/` 하위 디렉터리 생성

`state.json`·산출물·회고는 절대 건드리지 않는다.

### `/harness:uninstall`

현재 프로젝트에서 하네스를 완전히 제거한다. `.harness/` 디렉터리 전체(config, state, 산출물, 로그, 회고)를 삭제한다. 실행 전 삭제 목록을 표시하고 명시적 확인을 받는다.

플러그인 바이너리 자체를 제거하려면: `claude plugin remove harness`
플러그인 버전 업데이트: `claude plugin update harness`

---

## 스테이지 상세

### REQUIREMENTS — 요구사항 수집 (`requirements-collector`)

- 한 번에 한 가지 질문
- "나중에", "TBD" 같은 미결 표현 불가
- 기능/비기능(성능·보안·확장성·운영환경)/명시적 제외/성공 기준 모두 채워야 통과
- 산출물: `.harness/requirements.md`

### ROADMAP — 로드맵 설계 (`roadmap-designer`)

- 각 태스크는 수직 슬라이스(E2E 단위)
- 태스크마다 acceptance criteria + 의존관계
- Wave 기반 실행 순서
- 산출물: `.harness/roadmap.md`

### DEVELOPMENT — 구현 (`developer`)

- 한 번에 한 태스크
- 태스크 완료마다 `config.json`의 testCmd/lintCmd/typecheckCmd Bash 실행
- 산출물: `.harness/progress.md`

### REVIEW — 코드 리뷰 (`reviewer`)

- 정확성, 보안(OWASP Top 10), 코드 품질
- typecheck/lint/test/build 모두 직접 실행
- Critical 이슈 1건이라도 있으면 FAIL
- 산출물: `.harness/review-report.md`

### ANALYSIS — 사실 기반 분석 (`analyzer`)

- 모든 Finding에 파일:라인 / URL / 사용자 발화 인용 중 하나 이상 첨부
- TBD/추정 금지 — 모르는 것은 `Open Questions`에 명시
- 산출물: `.harness/analysis.md`

### SPECIFICATION — 의사결정 명세 (`specifier`)

- `analysis.md` 발견 사항을 바탕으로 의사결정 도출
- 각 Decision에 근거(`analysis.md F#` 참조 또는 사용자 인터뷰 인용) 필수
- 분석으로 답할 수 있는 것은 인터뷰 없이 명세로 직접 기입
- 산출물: `.harness/spec.md`

---

## 검증 게이트

각 스테이지 종료 시 산출물을 심사한다. 방식은 스테이지에 따라 둘로 나뉜다.

**추론 검증** (REQUIREMENTS / ROADMAP) — 검증 서브에이전트가 산출물 품질을 판정하고 마지막 줄에 판정 결과를 출력한다:

```
VALIDATION_RESULT: PASS

또는

VALIDATION_RESULT: FAIL
REASON: [실패 원인 한 줄]
FIX_PLAN: [재시도 시 집중할 것]
```

**결정론 검증** (DEVELOPMENT / REVIEW) — 검증 명령어 실행 + 산출물 구조 검사(Bash)만으로 판정한다. LLM 호출 없음. 의미 수준의 코드 검증은 REVIEW 단계의 `reviewer` 워커가 실제 소스를 읽으며 담당한다.

분석 사이클도 같은 방식으로 나뉜다 — ANALYSIS는 결정론 구조 검사, SPECIFICATION은 추론 검증(`spec-validator`). analysis.md의 의미 검증은 하류 `specifier`와 `spec-validator`의 ANALYSIS 회귀가 담당한다.

실패는 `state.json` `failures` 배열(최근 20개)에 기록되고, 다음 워커 세션은 이 cause/plan을 컨텍스트로 받아 보완 방향을 인지한 채 시작한다.

---

## 회고를 통한 자기 개선

회고 서브에이전트는 이번 사이클의 실패 패턴, 요구사항 변경 빈도, 로드맵 정확도, 리뷰 누락률을 분석해 **에이전트 지침 자체를 Edit 도구로 직접 수정**한다. 공통 행동 원칙은 `docs/agent-system-prompt/base.md`에, 역할별 지침은 `agents/*.md`에 분리 관리된다.

수정 대상 화이트리스트:

- `.harness/agents-overrides/*.md` (프로젝트 로컬 오버라이드, 기본)
- `docs/agent-system-prompt/base.md` (모든 에이전트 공통 지침, 사용자 명시적 동의 시에만)
- 플러그인 본체 `agents/*.md` (사용자 명시적 동의 시에만)

`.env`, `secrets/`, 임의 코드 파일은 절대 수정하지 않는다.

프로젝트를 거듭할수록 에이전트 지침이 프로젝트 특성에 맞게 정교해진다.

---

## 프로젝트 구조

플러그인이 사용자 프로젝트에 만드는 것:

```
your-project/
└── .harness/
    ├── config.json                  ← 프로젝트 설정 (수정 가능)
    ├── state.json                   ← 구현 사이클 상태 (직접 수정 금지)
    ├── analyzer-state.json          ← 분석 사이클 상태 (직접 수정 금지)
    ├── requirements.md              ← REQUIREMENTS 산출물
    ├── roadmap.md                   ← ROADMAP 산출물
    ├── progress.md                  ← DEVELOPMENT 산출물
    ├── review-report.md             ← REVIEW 산출물
    ├── analysis.md                  ← ANALYSIS 산출물
    ├── spec.md                      ← SPECIFICATION 산출물
    ├── agents-overrides/*.md        ← (선택) 회고가 만드는 프로젝트별 지침 오버라이드
    └── retrospectives/
        └── <YYYY-MM-DD>.md          ← 회고 보고서
```

플러그인 본체 (이 저장소):

```
gil-harness/
├── .claude-plugin/plugin.json
├── marketplace.json
├── docs/
│   ├── validate.md                  ← 검증 절차 (run.md가 인라인 실행, 슬래시 명령 아님)
│   └── agent-system-prompt/
│       ├── base.md                  ← 모든 에이전트 공통 지침 (하네스가 자동 주입)
│       └── roles/                   ← 역할별 추가 지침
├── agents/                          ← 워커 + 검증 서브에이전트 정의
│   ├── requirements-collector.md
│   ├── requirements-validator.md
│   ├── roadmap-designer.md
│   ├── roadmap-validator.md
│   ├── developer.md
│   ├── reviewer.md
│   ├── analyzer.md
│   ├── specifier.md
│   ├── spec-validator.md
│   └── retrospective.md
└── commands/                        ← 슬래시 명령어
    ├── init.md
    ├── run.md
    ├── analyze.md
    ├── status.md
    ├── reset.md
    └── retro.md
```

---

## config.json

`/harness:init`이 생성한다. 검증/구현 단계의 Bash 실행이 이 값을 참조한다.

```json
{
  "projectName": "my-app",
  "language": "TypeScript",
  "testCmd": "npm test",
  "lintCmd": "npm run lint",
  "typecheckCmd": "npx tsc --noEmit",
  "buildCmd": "npm run build",
  "devCmd": "npm run dev"
}
```

명령어가 비어 있으면 해당 검사는 SKIP 처리된다.

---

## 요구사항

- Claude Code (`/plugin` 마켓플레이스 지원 버전)

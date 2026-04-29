# Harness

범용 프로젝트 에이전트 하네스. 어떤 프로젝트에든 설치해 AI가 요구사항 수집부터 코드 리뷰까지 단계적으로 작업하도록 만드는 Claude Code 플러그인이다.

## 개념

```
에이전트 = 모델 + 하네스
```

모델이 아닌 모든 것 — 에이전트 지침, 검증 기준, 상태 관리, 산출물 구조 — 이 하네스다. 하네스가 에이전트가 어디서 무엇을 해야 하는지 결정하고, 결과가 기준을 통과했는지 판정한다.

### 워크플로우

```
REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE
      ↑             ↑           ↑            ↑
   [검증 게이트]  [검증 게이트] [검증 게이트] [검증 게이트]
```

각 스테이지는 전용 워커 서브에이전트가 작업하고, 검증 서브에이전트가 산출물을 심사한다. 검증 실패 시 실패 원인과 수정 계획을 `state.json`에 기록하고 재시도한다. `maxRetries`(기본 3) 초과 시 사용자 개입을 요청한다.

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
/harness:run         # 현재 스테이지 워커 실행 (자동 검증까지)
/harness:status      # 진행 상태 확인
/harness:retro       # 모든 스테이지 완료 후 회고 + 지침 개선
```

---

## 명령어

| 명령어 | 역할 |
|--------|------|
| `/harness:init` | 현재 프로젝트 자동 분석 → `.harness/config.json`, `.harness/state.json`, `CLAUDE.md` 생성 |
| `/harness:run` | **전 스테이지 자동 루프** — DONE 또는 재시도 한계까지 run→validate 반복, 수동 개입 불필요 |
| `/harness:validate` | 결정론 검증(typecheck/lint/test/build, Bash) + 추론 검증(서브에이전트) |
| `/harness:status` | 진행 상황 한 화면 요약 |
| `/harness:advance` | 검증 생략하고 다음 스테이지로 강제 이동 (긴급용, 사용자 확인) |
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
CLAUDE.md              ← 세션 진입점 (이미 있으면 건드리지 않음)
```

스테이지 산출물(`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`)과 `retrospectives/`는 각 스테이지에서 만들어진다.

### `/harness:run`

**한 번 실행하면 전 파이프라인을 자동으로 완주한다.** 내부 루프: 현재 스테이지 워커 실행 → validate → PASS면 다음 스테이지로 이동 후 반복 → DONE 도달 시 종료. FAIL이면 cause/plan을 워커에게 전달해 동일 스테이지 재시도. `iteration >= maxRetries`이면 루프 중단 후 사용자 개입 요청.

`.harness/agents-overrides/<subagent>.md`가 있으면 회고가 만든 프로젝트 로컬 지침을 프롬프트에 자동 인라인한다.

### `/harness:validate`

두 단계로 산출물을 심사한다.

1. **결정론 검증** (DEVELOPMENT/REVIEW에만): 부모 세션이 Bash로 `typecheckCmd → lintCmd → testCmd → buildCmd` 순차 실행. 한 명령이 실패하면 추론 검증 생략하고 즉시 FAIL.
2. **추론 검증**: 스테이지별 검증 서브에이전트(`requirements-validator`, `roadmap-validator`, `development-validator`, `review-validator`)가 산출물 품질 판정. 마지막 줄에 `VALIDATION_RESULT: PASS|FAIL` + (FAIL이면 `REASON`/`FIX_PLAN`).

PASS → 다음 스테이지 + `iteration=0` + `failures=[]` + `lastValidated` 갱신.
FAIL → `iteration += 1`, `failures` 배열 끝에 append (최근 20개만 유지).

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

### `/harness:advance`

검증을 생략하고 다음 스테이지로 강제 이동. `history`에 `skippedValidation: true` 기록. 사용자에게 명시적으로 한 번 더 확인받는다.

### `/harness:reset`

| 인수 | 동작 |
|------|------|
| (없음) | `iteration=0`, `failures=[]` |
| `--iteration` | `iteration`만 0 |
| `--failures` | `failures`만 비움 |
| `--all` | 둘 다 |
| `--stage <STAGE>` | 강제 stage 변경 (확인 필요) |

`maxRetries`/`lastValidated`/`history`/`schemaVersion`은 절대 건드리지 않는다.

### `/harness:retro`

회고 서브에이전트(`retrospective`)를 호출해 이번 사이클을 분석한다. 산출물 두 가지:

1. `.harness/retrospectives/<YYYY-MM-DD>.md` — 잘된 것 / 개선 필요 / 교훈
2. **에이전트 지침 개선** — Edit 도구로 `.harness/agents-overrides/*.md`(프로젝트 로컬) 또는 명시적 동의 시 플러그인 본체 `agents/*.md`에 직접 적용

별도의 패치 DSL은 사용하지 않는다 — Edit 도구가 그대로 패치 메커니즘이다.

### `/harness:update`

플러그인을 새 버전으로 업데이트(`claude plugin update harness` 또는 `git pull`)한 뒤 실행해 기존 프로젝트 파일을 동기화한다.

- **config.json**: 새 버전 스키마에서 추가된 필드만 보완. 기존 필드는 건드리지 않음
- **CLAUDE.md**: 사용자 수정이 없으면 현재 템플릿으로 자동 갱신. 수정이 있으면 diff 표시 후 덮어쓰기/건너뜀 선택
- **디렉터리**: 새 버전이 요구하는 `.harness/` 하위 디렉터리 생성

`state.json`·산출물·회고는 절대 건드리지 않는다.

### `/harness:uninstall`

현재 프로젝트에서 하네스를 완전히 제거한다. `.harness/` 디렉터리 전체(config, state, 산출물, 로그, 회고)를 삭제한다. 실행 전 삭제 목록을 표시하고 명시적 확인을 받는다.

`CLAUDE.md`는 사용자 콘텐츠가 포함될 수 있어 건드리지 않는다 — 필요하면 수동 제거.

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

---

## 검증 게이트

각 스테이지 종료 시 검증 서브에이전트가 산출물을 심사한다. 마지막 줄에 반드시 판정 결과:

```
VALIDATION_RESULT: PASS

또는

VALIDATION_RESULT: FAIL
REASON: [실패 원인 한 줄]
FIX_PLAN: [재시도 시 집중할 것]
```

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
├── CLAUDE.md                        ← 세션 진입점 (자동 생성, 이미 있으면 건드리지 않음)
└── .harness/
    ├── config.json                  ← 프로젝트 설정 (수정 가능)
    ├── state.json                   ← 상태 (직접 수정 금지)
    ├── requirements.md              ← REQUIREMENTS 산출물
    ├── roadmap.md                   ← ROADMAP 산출물
    ├── progress.md                  ← DEVELOPMENT 산출물
    ├── review-report.md             ← REVIEW 산출물
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
│   └── agent-system-prompt/
│       ├── base.md                  ← 모든 에이전트 공통 지침 (하네스가 자동 주입)
│       └── roles/                   ← 역할별 추가 지침
├── agents/                          ← 워커 + 검증 서브에이전트 정의
│   ├── requirements-collector.md
│   ├── requirements-validator.md
│   ├── roadmap-designer.md
│   ├── roadmap-validator.md
│   ├── developer.md
│   ├── development-validator.md
│   ├── reviewer.md
│   ├── review-validator.md
│   └── retrospective.md
└── commands/                        ← 슬래시 명령어
    ├── init.md
    ├── run.md
    ├── validate.md
    ├── status.md
    ├── advance.md
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

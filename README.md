# Harness

범용 프로젝트 에이전트 하네스. 어떤 프로젝트에든 설치해 AI가 요구사항 수집부터 코드 리뷰까지 단계적으로 작업하도록 만드는 워크플로우 시스템이다.

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

각 스테이지는 전용 에이전트가 작업하고, 검증 에이전트가 산출물을 심사한다. 검증 실패 시 실패 원인과 수정 계획을 기록하고 재시도한다. 최대 재시도 횟수를 초과하면 사용자에게 에스컬레이션한다.

---

## 설치

### Claude Code 플러그인으로 설치

마켓플레이스를 추가하고 플러그인을 설치한다:

```
/plugin marketplace add https://raw.githubusercontent.com/inogard/harness/main/marketplace.json
/plugin install harness
```

설치 후 `harness` 명령어가 Bash tool PATH에 자동 등록된다.

### 로컬 개발 / 테스트

```bash
git clone https://github.com/inogard/harness
claude --plugin-dir ./harness
```

---

## 빠른 시작

```bash
# 1. 새 프로젝트 디렉토리에서 초기화
harness init

# 2. 현재 스테이지 에이전트 실행
harness run

# 3. 검증
harness validate

# 4. 통과하면 다음 스테이지로 자동 이동, 2~3 반복
harness run

# 5. DONE 상태가 되면 회고
harness retro
```

---

## 명령어

### `harness init`

현재 디렉토리의 프로젝트 파일을 자동으로 분석해 설정값을 채운다. Enter를 누르면 감지된 값을 그대로 사용하고, 다른 값을 입력하면 덮어쓴다.

```
프로젝트 분석 중... 완료

감지된 파일: package.json, tsconfig.json
감지된 언어: TypeScript (Next.js)

Enter를 누르면 감지된 값을 사용합니다.

프로젝트 이름 [my-next-app]:
주 언어/프레임워크 [TypeScript (Next.js)]:
테스트 명령어 [npm test]:
린트 명령어 [npm run lint]:
타입체크 명령어 [npx tsc --noEmit]:
빌드 명령어 [npm run build]:
개발 서버 명령어 [npm run dev]:
스테이지 최대 재시도 횟수 [3]:
```

감지 지원 환경: Node.js (TypeScript/JavaScript, React, Next.js, Vue, Nuxt, Svelte, Express, Fastify, NestJS), Python, Rust, Go, Java (Maven/Gradle), Kotlin

생성 결과:

```
.harness/
  config.json          ← 프로젝트 설정
  state.json           ← 현재 스테이지, 이력, 실패 기록
  agents/              ← 스테이지별 에이전트 지침 (수정 가능)
  validators/          ← 스테이지별 검증 기준 (수정 가능)
  skills/              ← 반복 작업 절차 문서
  retrospectives/      ← 회고 파일 저장소
CLAUDE.md              ← Claude Code 세션 진입점
```

### `harness run`

현재 스테이지에 맞는 에이전트 지침을 로드하고 Claude Code 세션을 시작한다. 세션 종료 후 자동으로 검증 실행 여부를 묻는다.

이전 검증 실패 기록이 있으면 세션 시작 전에 실패 원인과 수정 계획을 출력한다.

> Claude Code 내에서는 `/harness:run` 스킬을 사용하면 동일한 역할을 한다.

### `harness validate`

현재 스테이지의 검증 에이전트를 비대화형(`claude -p`)으로 실행해 산출물을 심사한다.

**검증 통과 시:** 다음 스테이지로 자동 이동하고 `iteration`을 0으로 초기화한다.

**검증 실패 시:** 실패 원인(`REASON`)과 수정 계획(`FIX_PLAN`)을 출력하고 `state.json`에 기록한다. `maxRetries` 초과 시 사용자 개입을 요청한다.

### `harness status`

현재 진행 상황을 출력한다.

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

### `harness advance`

검증 없이 다음 스테이지로 강제 이동한다. 이력에 `skippedValidation: true`가 기록된다. 긴급 상황에서만 사용한다.

### `harness retro`

회고 에이전트 세션을 시작한다. 에이전트가 이번 사이클의 실패 패턴, 요구사항 품질, 개발 효율 등을 분석하고 에이전트 지침 개선 패치를 생성한다.

세션 종료 후 `.harness/retrospectives/YYYY-MM-DD.md`의 패치 블록을 자동으로 읽어 에이전트 지침 파일에 적용한다.

---

## 스테이지 상세

### REQUIREMENTS — 요구사항 수집

에이전트가 사용자와 일대일 문답으로 요구사항을 구체화한다.

- 한 번에 한 가지 질문만 한다
- "나중에", "TBD" 같은 미결 표현은 허용하지 않는다
- 기능 요구사항, 비기능 요구사항(성능/보안/확장성/운영환경), 명시적 제외 항목, 성공 기준 모두 완료해야 다음 스테이지로 이동한다

산출물: `.harness/requirements.md`

### ROADMAP — 로드맵 설계

요구사항을 기반으로 구현 계획을 설계한다.

- 각 태스크는 수직 슬라이스(E2E 동작 가능한 단위)
- 태스크마다 acceptance criteria와 의존관계 명시
- Wave 기반으로 실행 순서 정의

산출물: `.harness/roadmap.md`

### DEVELOPMENT — 구현

로드맵의 태스크를 순서대로 구현한다.

- 한 번에 한 태스크
- 태스크 완료마다 `config.json`의 테스트/린트/타입체크 명령어 실행
- 진행 상황을 `.harness/progress.md`에 기록

산출물: `.harness/progress.md`

### REVIEW — 코드 리뷰

구현된 코드를 심사한다.

- 정확성, 보안(OWASP Top 10), 코드 품질 점검
- config.json 명령어로 타입체크/린트/빌드/테스트 직접 실행
- Critical 이슈가 있으면 FAIL

산출물: `.harness/review-report.md`

---

## 검증 게이트

각 스테이지 종료 시 검증 에이전트가 산출물을 심사한다. 검증은 완전히 비대화형으로 실행되며, 마지막 줄에 반드시 판정 결과를 출력한다.

```
VALIDATION_RESULT: PASS

또는

VALIDATION_RESULT: FAIL
REASON: [실패 원인 한 줄]
FIX_PLAN: [에이전트가 재시도 시 집중할 것]
```

실패 시 `state.json`의 `failures` 배열에 기록되며, 에이전트는 다음 세션 시작 시 이 기록을 읽고 보완 방향을 인지한 채 작업한다.

**에스컬레이션:** `maxRetries`(기본 3)에 도달하면 자동화를 중단하고 사용자에게 에이전트 지침 또는 요구사항 수정을 요청한다. 수정 후 `state.json`의 `iteration`을 0으로 리셋하면 재시도한다.

---

## 회고 패치 시스템

회고 에이전트는 이번 사이클의 교훈을 `.harness/retrospectives/YYYY-MM-DD.md`에 패치 블록으로 저장한다.

```
=== PATCH: agents/01-requirements.md ===
[ADD]
- 추가할 규칙
=== END PATCH ===

=== PATCH: agents/03-developer.md ===
[MODIFY]
BEFORE: 수정 전 텍스트 (파일에서 정확히 복사)
AFTER: 수정 후 텍스트
=== END PATCH ===

=== PATCH: agents/02-roadmap.md ===
[REMOVE]
제거할 텍스트
=== END PATCH ===
```

`harness retro` 세션이 끝나면 이 블록을 자동으로 파싱해 에이전트 지침 파일에 적용한다. 프로젝트를 거듭할수록 에이전트 지침이 프로젝트 특성에 맞게 정교해진다.

---

## 프로젝트 구조

```
your-project/
├── CLAUDE.md                        ← Claude Code 세션 진입점 (자동 생성)
└── .harness/
    ├── config.json                  ← 프로젝트 설정
    ├── state.json                   ← 현재 상태 (stage, iteration, failures, history)
    ├── agents/
    │   ├── 01-requirements.md       ← 요구사항 수집 에이전트 지침
    │   ├── 02-roadmap.md            ← 로드맵 설계 에이전트 지침
    │   ├── 03-developer.md          ← 개발 에이전트 지침
    │   ├── 04-reviewer.md           ← 코드 리뷰 에이전트 지침
    │   └── 05-retrospective.md      ← 회고 에이전트 지침
    ├── validators/
    │   ├── requirements.md          ← 요구사항 검증 기준
    │   ├── roadmap.md               ← 로드맵 검증 기준
    │   ├── development.md           ← 개발 완료 검증 기준
    │   └── review.md                ← 리뷰 완료 검증 기준
    ├── requirements.md              ← 산출물 (REQUIREMENTS 스테이지)
    ├── roadmap.md                   ← 산출물 (ROADMAP 스테이지)
    ├── progress.md                  ← 산출물 (DEVELOPMENT 스테이지)
    ├── review-report.md             ← 산출물 (REVIEW 스테이지)
    ├── skills/                      ← 반복 작업 절차 문서
    └── retrospectives/
        └── YYYY-MM-DD.md            ← 회고 파일
```

`agents/`와 `validators/` 안의 파일은 프로젝트 특성에 맞게 직접 편집하거나 회고를 통해 자동 개선된다.

---

## config.json

`harness init`이 생성하는 프로젝트 설정 파일. 검증 에이전트가 실제 명령어를 실행할 때 이 값을 참조한다.

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

---

## 요구사항

- Node.js 18 이상
- Claude Code CLI (`claude` 명령어가 PATH에 있어야 함)

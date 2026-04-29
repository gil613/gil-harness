---
description: 현재 프로젝트에 하네스 초기화 (.harness/ 생성)
allowed-tools: Bash, Read, Write, Edit, Glob
---

# /harness:init

현재 작업 디렉터리에 하네스를 초기화한다. 프로젝트 파일을 자동 감지해 `.harness/config.json`, `.harness/state.json`, `CLAUDE.md`를 생성한다.

## 절차

### 1. 언어 선택 / Language Selection

사용자에게 UI 언어를 선택하게 한다. 단 한 번만 묻는다:

```
언어를 선택하세요 / Please select a language:
  [ko] 한국어 (기본값)
  [en] English
```

`ko` 또는 `en` 이외의 입력은 `ko`로 fallback. 입력이 없으면 `ko`로 처리.
선택된 값을 `uiLanguage` 변수에 저장해 이후 단계에서 사용한다.

### 2. 기존 초기화 여부 확인

`.harness/state.json`이 이미 존재하면 즉시 중단하고 사용자에게 알린다. 절대 덮어쓰지 않는다.

### 3. 프로젝트 자동 감지

다음 파일을 Glob/Read로 확인해 프로젝트 메타데이터를 추출한다.

| 파일 | 추출값 |
|------|--------|
| `package.json` | name, scripts.{test,lint,build,dev,start,typecheck,type-check}, deps |
| `tsconfig.json` 존재 | TypeScript 여부 |
| `pyproject.toml` / `requirements.txt` / `setup.py` | Python |
| `Cargo.toml` | Rust, package.name |
| `go.mod` | Go, module name |
| `pom.xml` | Java (Maven) |
| `build.gradle` / `build.gradle.kts` | Java/Kotlin (Gradle) |

언어별 기본 명령어:

- **TypeScript/JavaScript**: `npm test`, `npm run lint`, `npm run build`, `npm run dev`, `npx tsc --noEmit` (타입체크는 tsconfig.json 또는 typescript dep 있을 때)
- **Python**: `pytest`, `ruff check .`, `mypy .`, `python main.py`
- **Rust**: `cargo test`, `cargo clippy`, `cargo check`, `cargo build --release`, `cargo run`
- **Go**: `go test ./...`, `golangci-lint run`, `go vet ./...`, `go build ./...`, `go run .`
- **Java (Maven)**: `mvn test`, `mvn checkstyle:check`, `mvn compile -q`, `mvn package -DskipTests`, `mvn spring-boot:run`
- **Kotlin/Java (Gradle)**: `./gradlew test`, `./gradlew ktlintCheck`(kts)/`./gradlew checkstyleMain`, `./gradlew compileKotlin`, `./gradlew build`, `./gradlew bootRun`

프레임워크 감지 (package.json deps): `next`, `nuxt`, `react`, `vue`, `svelte`, `express`, `fastify`, `@nestjs/core`.

### 4. 사용자에게 확인

`uiLanguage === "en"` 이면 영문으로, 아니면 한국어로 표를 보여준다. 각 필드 개별 질문하지 말 것 — 사용자가 수정 필요한 항목만 알려주면 거기만 갱신한다.

**한국어 (ko)**:
```
프로젝트 이름:     <감지값>
주 언어/프레임워크: <감지값>
테스트:            <감지값>
린트:              <감지값>
타입체크:          <감지값>
빌드:              <감지값>
개발 서버:         <감지값>
스테이지 최대 재시도: 3
```

**English (en)**:
```
Project name:       <detected>
Language/Framework: <detected>
Test:               <detected>
Lint:               <detected>
Typecheck:          <detected>
Build:              <detected>
Dev server:         <detected>
Max stage retries:  3
```

`maxRetries`는 정수만 허용. 비정상 입력 시 3으로 fallback.

#### 명령어 형식 가드

각 `*Cmd` 값은 Bash로 실행되므로 다음 패턴이 들어 있으면 사용자에게 다시 묻고 그대로 저장하지 않는다:

- 줄바꿈 (`\n`, `\r`)
- 끝나지 않은 따옴표
- `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>`, `<` (체이닝/리다이렉션) — 단일 명령만 허용. 정말 필요하면 사용자가 명시적으로 yes 답해야 저장
- 길이 500자 초과

빈 문자열은 허용 (해당 검사 SKIP 처리).

### 5. 파일 생성

**`.harness/config.json`** (`uiLanguage` 필드 포함):
```json
{
  "projectName": "...",
  "language": "...",
  "uiLanguage": "ko",
  "testCmd": "...",
  "lintCmd": "...",
  "typecheckCmd": "...",
  "buildCmd": "...",
  "devCmd": "..."
}
```

`uiLanguage`는 단계 1에서 선택한 값(`"ko"` 또는 `"en"`)으로 설정한다.

**`.harness/state.json`**:
```json
{
  "schemaVersion": 1,
  "stage": "REQUIREMENTS",
  "iteration": 0,
  "maxRetries": 3,
  "lastValidated": null,
  "failures": [],
  "history": []
}
```

**디렉터리 사전 생성**:

- `.harness/logs/` — 결정론 검증 로그 보관소 (`/harness:validate`가 첫 실행 시 사용)

산출물 파일(`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`)과 `retrospectives/`, `agents-overrides/`는 만들지 않는다 — 각 스테이지/회고가 필요 시 직접 만든다.

### 6. 완료 보고

`uiLanguage === "en"` 이면 영문으로, 아니면 한국어로 출력한다.

**한국어**:
```
초기화 완료: <projectName>

생성된 파일:
  .harness/config.json
  .harness/state.json

다음 단계:
  /harness:status   현재 상태 확인
  /harness:run      요구사항 수집 시작
```

**English**:
```
Initialized: <projectName>

Files created:
  .harness/config.json
  .harness/state.json

Next steps:
  /harness:status   check current status
  /harness:run      start requirements collection
```

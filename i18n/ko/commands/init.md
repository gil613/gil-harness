> 📖 **참고용 사본 (한국어 번역)**
>
> 이 파일은 한국 사용자가 내부 동작을 이해하기 위한 **읽기 전용 참조**입니다.
> Claude Code 플러그인은 이 파일을 사용하지 않습니다 — 정본은 `commands/init.md` (영어)입니다.
> 자동 동기화되지 않으므로 정본과 어긋날 수 있습니다. 동작 검증은 항상 정본 기준으로 수행하세요.

---
description: 현재 프로젝트에 하네스 초기화 (.harness/ 생성)
allowed-tools: Bash, Read, Write, Edit, Glob
---

# /harness:init

현재 작업 디렉터리에 하네스를 초기화한다. 프로젝트 파일을 자동 감지해 `.harness/config.json`, `.harness/state.json`을 생성한다. **`.harness/`가 이미 존재하면 재초기화 모드로 진입해 config는 사용자 확인 후 머지 갱신, 런타임 상태(state.json의 stage/iteration/history 등)는 보존한다.**

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

**`.harness/config.json`이 이미 존재하고 `uiLanguage` 값이 있으면 이 단계를 건너뛰고 저장된 값을 그대로 사용한다.**

### 2. 기존 초기화 감지

`.harness/state.json` 또는 `.harness/config.json`이 존재하면 **재초기화 모드**로 진입한다:

- `.harness/config.json`을 `existing`으로 읽는다 (파싱 실패 시 없는 것으로 간주하고 경고).
- `.harness/state.json`을 `existingState`로 읽는다 (있을 때만).
- `messages.reinit_detected`를 출력한다.
- `reinitMode = true` 플래그를 세팅하고 단계 3으로 진행한다.

존재하지 않으면 일반 신규 초기화 진행 (`reinitMode = false`).

**state.json의 런타임 필드(`stage`, `iteration`, `history`, `failures`, `lastValidated`, `schemaVersion`)는 재초기화 모드에서 절대 덮어쓰지 않는다** — 단계 4 확인을 통한 `maxRetries`만 갱신 가능.

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

**신규 초기화**: `messages.confirm_table`에 감지값을 채워 보여준다. 각 필드 개별 질문하지 말 것 — 사용자가 수정 필요한 항목만 알려주면 거기만 갱신한다.

**재초기화 모드**: `messages.confirm_table_reinit`을 3열(`기존값` / `감지값` / `→ 최종`)로 보여준다. `최종` 열은 기존값이 있으면 그것으로, 없으면 감지값으로 시작한다. `기존값`과 `감지값`이 다른 행은 앞에 `*` 마크를 붙여 drift를 한눈에 보이게 한다. 사용자에게 다음 중 하나를 답하도록 요청:

- 감지값으로 갱신할 필드명 나열 (예: `testCmd lintCmd`),
- 사용자 지정값은 `field=value` 형식 (예: `testCmd=npm run test:unit`),
- `ok`로 기존값 전부 유지.

사용자가 실제로 변경한 필드 집합을 `updatedFields`로 추적해 완료 보고에 사용한다.

`maxRetries`는 정수만 허용. 비정상 입력 시 3으로 fallback. 재초기화 모드에서는 `existingState.maxRetries`가 있으면 그 값을 기본값으로 한다.

#### 명령어 형식 가드

각 `*Cmd` 값은 Bash로 실행되므로 다음 패턴이 들어 있으면 사용자에게 다시 묻고 그대로 저장하지 않는다:

- 줄바꿈 (`\n`, `\r`)
- 끝나지 않은 따옴표
- `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>`, `<` (체이닝/리다이렉션) — 단일 명령만 허용. 정말 필요하면 사용자가 명시적으로 yes 답해야 저장
- 길이 500자 초과

빈 문자열은 허용 (해당 검사 SKIP 처리).

### 5. 파일 생성 또는 갱신

**신규 초기화** — 두 파일 모두 새로 작성.

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

**재초기화 모드** — 덮어쓰기 대신 머지:

- `.harness/config.json`: `existing`을 로드하고 단계 4에서 확정된 필드만 적용해 다시 쓴다. init이 관리하지 않는 추가 키는 보존(forward-compat). 파일이 없었다면 확정값으로 새로 만든다.
- `.harness/state.json`: `existingState`를 로드하고 `maxRetries`가 변경된 경우에만 갱신; `schemaVersion`, `stage`, `iteration`, `lastValidated`, `failures`, `history`는 그대로 둔다. 파일이 없었다면 기본값으로 생성.

**디렉터리 사전 생성** (양 모드에서 멱등):

- `.harness/logs/` — 결정론 검증 로그 보관소 (`/harness:validate`가 첫 실행 시 사용)

`mkdir` 호출 시 반드시 상대경로 사용 (예: `mkdir -p .harness/logs`). Bash에서 `\`는 이스케이프 문자이므로 `C:\...` 같은 Windows 절대경로를 사용하면 경로 구분자가 모두 사라져 잘못된 이름의 디렉터리가 생성된다.

산출물 파일(`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`)과 `retrospectives/`, `agents-overrides/`는 만들지 않는다 — 각 스테이지/회고가 필요 시 직접 만든다. **재초기화 모드에서는 기존 산출물을 절대 삭제하거나 비우지 않는다.**

### 6. 완료 보고

**신규 초기화**: `messages.completion`에 `<projectName>`을 채워 출력.

**재초기화 모드**: `messages.completion_reinit`에 `<projectName>`, `<updatedFields>`(공백 구분, 변경 없으면 `(없음)`), `existingState`에서 보존한 `<stage>` / `<iteration>`을 채워 출력.

---

## Messages

`uiLanguage` 기준으로 조회. `{name}`, `{detected.*}`, `{existing.*}`, `{final.*}` 같은 자리표시자는 출력 전에 치환한다.

### `reinit_detected`

- **en**: `.harness/ already exists — entering re-init mode. Existing config will be diffed against detected values; runtime state (stage, iteration, history, failures) is preserved. Only fields you confirm will be updated.`
- **ko**: `.harness/가 이미 존재합니다 — 재초기화 모드로 진입합니다. 기존 config와 자동 감지값을 비교하며, 런타임 상태(stage, iteration, history, failures)는 보존됩니다. 사용자가 확인한 항목만 갱신됩니다.`

### `confirm_table` (신규 초기화)

- **ko**:
  ```
  프로젝트명:         {detected.projectName}
  언어/프레임워크:    {detected.language}
  테스트:             {detected.testCmd}
  린트:               {detected.lintCmd}
  타입체크:           {detected.typecheckCmd}
  빌드:               {detected.buildCmd}
  개발 서버:          {detected.devCmd}
  단계 재시도 한도:   3

  변경할 항목명을 알려주거나, "ok"로 확정하세요.
  ```

### `confirm_table_reinit` (재초기화)

`기존값`과 `감지값`이 다른 행은 `*` 접두로 표시.

- **ko**:
  ```
    항목                기존값                   감지값                   → 최종
    프로젝트명:         {existing.projectName}   {detected.projectName}   {final.projectName}
    언어:               {existing.language}      {detected.language}      {final.language}
    테스트:             {existing.testCmd}       {detected.testCmd}       {final.testCmd}
    린트:               {existing.lintCmd}       {detected.lintCmd}       {final.lintCmd}
    타입체크:           {existing.typecheckCmd}  {detected.typecheckCmd}  {final.typecheckCmd}
    빌드:               {existing.buildCmd}      {detected.buildCmd}      {final.buildCmd}
    개발 서버:          {existing.devCmd}        {detected.devCmd}        {final.devCmd}
    단계 재시도 한도:   {existingState.maxRetries}   3                    {final.maxRetries}

  답변 형식:
    - 감지값으로 갱신할 항목명 나열 (예: "testCmd lintCmd")
    - 사용자 지정값은 "field=value" 형식 (예: "testCmd=npm run test:unit")
    - "ok"로 기존값 전부 유지
  ```

### `completion` (신규 초기화)

- **ko**:
  ```
  초기화 완료: {name}

  생성된 파일:
    .harness/config.json
    .harness/state.json

  다음 단계:
    /harness:status   현재 상태 확인
    /harness:run      요구사항 수집 시작
  ```

### `completion_reinit` (재초기화)

- **ko**:
  ```
  재초기화 완료: {name}

  갱신된 항목: {updatedFields}
  상태 보존: stage={stage}, iteration={iteration}

  다음 단계:
    /harness:status   현재 상태 확인
    /harness:run      현재 스테이지부터 재개
  ```

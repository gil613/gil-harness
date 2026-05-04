---
description: Initialize harness in the current project (creates .harness/)
allowed-tools: Bash, Read, Write, Edit, Glob
---

# /harness:init

Initializes the harness in the current working directory. Auto-detects project files and creates `.harness/config.json`, `.harness/state.json`.

## Procedure

### 1. Language Selection

Ask the user to select a UI language. Ask only once. The prompt itself is bilingual; show it verbatim:

```
Please select a language / 언어를 선택하세요:
  [ko] 한국어
  [en] English (default)
```

Any input other than `ko` or `en` falls back to `en`. If no input is provided, treat as `en`. Store the selected value in the `uiLanguage` variable.

**Skip this step if `.harness/config.json` already exists with a `uiLanguage` value — reuse the stored value as-is.**

**From this step onward, all user-facing output uses messages from the `## Messages` table at the bottom of this file, keyed by `uiLanguage`.**

### 2. Detect existing initialization

If `.harness/state.json` or `.harness/config.json` exists, enter **re-init mode**:

- Read existing `.harness/config.json` (if present) into `existing`. If parse fails, treat as missing and warn.
- Read existing `.harness/state.json` (if present) into `existingState`.
- Print `messages.reinit_detected`.
- Set a flag `reinitMode = true` and continue to step 3.

Otherwise proceed normally (fresh init, `reinitMode = false`).

**Runtime fields in `state.json` (`stage`, `iteration`, `history`, `failures`, `lastValidated`, `schemaVersion`) are never overwritten in re-init mode** — only `maxRetries` can be updated via the confirm step.

### 3. Auto-detect project

Check the following files via Glob/Read to extract project metadata.

| File | Extracted values |
|------|-----------------|
| `package.json` | name, scripts.{test,lint,build,dev,start,typecheck,type-check}, deps |
| `tsconfig.json` exists | TypeScript detection |
| `pyproject.toml` / `requirements.txt` / `setup.py` | Python |
| `Cargo.toml` | Rust, package.name |
| `go.mod` | Go, module name |
| `pom.xml` | Java (Maven) |
| `build.gradle` / `build.gradle.kts` | Java/Kotlin (Gradle) |

Default commands by language:

- **TypeScript/JavaScript**: `npm test`, `npm run lint`, `npm run build`, `npm run dev`, `npx tsc --noEmit` (typecheck when tsconfig.json or typescript dep is present)
- **Python**: `pytest`, `ruff check .`, `mypy .`, `python main.py`
- **Rust**: `cargo test`, `cargo clippy`, `cargo check`, `cargo build --release`, `cargo run`
- **Go**: `go test ./...`, `golangci-lint run`, `go vet ./...`, `go build ./...`, `go run .`
- **Java (Maven)**: `mvn test`, `mvn checkstyle:check`, `mvn compile -q`, `mvn package -DskipTests`, `mvn spring-boot:run`
- **Kotlin/Java (Gradle)**: `./gradlew test`, `./gradlew ktlintCheck`(kts)/`./gradlew checkstyleMain`, `./gradlew compileKotlin`, `./gradlew build`, `./gradlew bootRun`

Framework detection (package.json deps): `next`, `nuxt`, `react`, `vue`, `svelte`, `express`, `fastify`, `@nestjs/core`.

### 4. Confirm with user

**Fresh init**: show `messages.confirm_table` populated with detected values. Do not ask for each field individually — only update fields the user specifies.

**Re-init mode**: show `messages.confirm_table_reinit` with three columns — `Existing` / `Detected` / `→ Final`. The `Final` column starts equal to `Existing` for fields already set, otherwise equal to `Detected`. Mark rows where `Existing` and `Detected` differ with a `*` prefix so the user can see drift at a glance. Ask the user to:

- reply with field names to adopt the detected value (e.g. `testCmd lintCmd`),
- pass `field=value` for a custom value (e.g. `testCmd=npm run test:unit`),
- or `ok` to keep all existing values unchanged.

Track the set of fields the user actually changed as `updatedFields` for the completion report.

`maxRetries` accepts integers only. Falls back to 3 on invalid input. In re-init mode, `maxRetries` defaults to `existingState.maxRetries` if present.

#### Command format guard

Each `*Cmd` value is executed via Bash. If any of the following patterns are present, ask the user again and do not save as-is:

- Newlines (`\n`, `\r`)
- Unclosed quotes
- `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>`, `<` (chaining/redirection) — only a single command is allowed. If truly needed, the user must answer yes explicitly before saving
- Length exceeding 500 characters

Empty strings are allowed (the corresponding check will be SKIPPED).

### 5. Create or update files

**Fresh init** — write both files from scratch.

**`.harness/config.json`** (set `uiLanguage` to the value from step 1):
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

**Re-init mode** — merge instead of overwrite:

- `.harness/config.json`: load `existing`, apply only the fields confirmed in step 4, write back. Preserve any extra keys not managed by init (forward-compat). If the file was missing, create it with the confirmed values.
- `.harness/state.json`: load `existingState`, update only `maxRetries` if it changed; keep `schemaVersion`, `stage`, `iteration`, `lastValidated`, `failures`, `history` untouched. If the file was missing, create it with defaults.

**Pre-create directories** (idempotent in both modes):

- `.harness/logs/` — deterministic validation log storage (used by `/harness:validate` on first run)

Use relative paths when calling `mkdir` (e.g., `mkdir -p .harness/logs`). Never use Windows absolute paths (`C:\...`) in Bash commands — backslashes are escape characters in bash and will corrupt the path into a single malformed directory name.

Do not create artifact files (`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`), `retrospectives/`, or `agents-overrides/` — each stage and retrospective creates them as needed. In re-init mode, never delete or truncate existing artifacts.

### 6. Completion report

**Fresh init**: print `messages.completion` populated with `<projectName>`.

**Re-init mode**: print `messages.completion_reinit` populated with `<projectName>`, `<updatedFields>` (space-separated, or `(none)` if nothing changed), and the preserved `<stage>` / `<iteration>` from `existingState`.

---

## Messages

Look up by `uiLanguage`. Substitute `{name}`, `{detected.*}` placeholders before printing.

### `reinit_detected`

- **en**: `.harness/ already exists — entering re-init mode. Existing config will be diffed against detected values; runtime state (stage, iteration, history, failures) is preserved. Only fields you confirm will be updated.`
- **ko**: `.harness/가 이미 존재합니다 — 재초기화 모드로 진입합니다. 기존 config와 자동 감지값을 비교하며, 런타임 상태(stage, iteration, history, failures)는 보존됩니다. 사용자가 확인한 항목만 갱신됩니다.`

### `confirm_table`

- **en**:
  ```
  Project name:       {detected.projectName}
  Language/Framework: {detected.language}
  Test:               {detected.testCmd}
  Lint:               {detected.lintCmd}
  Typecheck:          {detected.typecheckCmd}
  Build:              {detected.buildCmd}
  Dev server:         {detected.devCmd}
  Max stage retries:  3

  Reply with field names to change, or "ok" to accept.
  ```
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

### `confirm_table_reinit`

Rows where `Existing` differs from `Detected` are prefixed with `*`.

- **en**:
  ```
    Field              Existing                 Detected                 → Final
    Project name:      {existing.projectName}   {detected.projectName}   {final.projectName}
    Language:          {existing.language}      {detected.language}      {final.language}
    Test:              {existing.testCmd}       {detected.testCmd}       {final.testCmd}
    Lint:              {existing.lintCmd}       {detected.lintCmd}       {final.lintCmd}
    Typecheck:         {existing.typecheckCmd}  {detected.typecheckCmd}  {final.typecheckCmd}
    Build:             {existing.buildCmd}      {detected.buildCmd}      {final.buildCmd}
    Dev server:        {existing.devCmd}        {detected.devCmd}        {final.devCmd}
    Max stage retries: {existingState.maxRetries}   3                    {final.maxRetries}

  Reply with:
    - field names to adopt detected values (e.g. "testCmd lintCmd")
    - "field=value" for custom values (e.g. "testCmd=npm run test:unit")
    - "ok" to keep all existing values unchanged
  ```
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

### `completion`

- **en**:
  ```
  Initialized: {name}

  Files created:
    .harness/config.json
    .harness/state.json

  Next steps:
    /harness:status   check current status
    /harness:run      start requirements collection
  ```
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

### `completion_reinit`

- **en**:
  ```
  Re-init complete: {name}

  Updated fields: {updatedFields}
  State preserved: stage={stage}, iteration={iteration}

  Next steps:
    /harness:status   check current status
    /harness:run      resume from current stage
  ```
- **ko**:
  ```
  재초기화 완료: {name}

  갱신된 항목: {updatedFields}
  상태 보존: stage={stage}, iteration={iteration}

  다음 단계:
    /harness:status   현재 상태 확인
    /harness:run      현재 스테이지부터 재개
  ```

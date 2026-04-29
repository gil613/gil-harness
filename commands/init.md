---
description: Initialize harness in the current project (creates .harness/)
allowed-tools: Bash, Read, Write, Edit, Glob
---

# /harness:init

Initializes the harness in the current working directory. Auto-detects project files and creates `.harness/config.json`, `.harness/state.json`.

## Procedure

### 1. Language Selection

Ask the user to select a UI language. Ask only once:

```
Please select a language / 언어를 선택하세요:
  [ko] 한국어
  [en] English (default)
```

Any input other than `ko` or `en` falls back to `en`. If no input is provided, treat as `en`.
Store the selected value in the `uiLanguage` variable for use in subsequent steps.

### 2. Check existing initialization

If `.harness/state.json` already exists, stop immediately and inform the user. Never overwrite.

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

Show the table in English. Do not ask for each field individually — only update the fields the user specifies.

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

`maxRetries` accepts integers only. Falls back to 3 on invalid input.

#### Command format guard

Each `*Cmd` value is executed via Bash. If any of the following patterns are present, ask the user again and do not save as-is:

- Newlines (`\n`, `\r`)
- Unclosed quotes
- `;`, `&&`, `||`, `|`, `` ` ``, `$(`, `>`, `<` (chaining/redirection) — only a single command is allowed. If truly needed, the user must answer yes explicitly before saving
- Length exceeding 500 characters

Empty strings are allowed (the corresponding check will be SKIPPED).

### 5. Create files

**`.harness/config.json`** (including `uiLanguage` field):
```json
{
  "projectName": "...",
  "language": "...",
  "uiLanguage": "en",
  "testCmd": "...",
  "lintCmd": "...",
  "typecheckCmd": "...",
  "buildCmd": "...",
  "devCmd": "..."
}
```

Set `uiLanguage` to the value selected in step 1 (`"ko"` or `"en"`).

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

**Pre-create directories**:

- `.harness/logs/` — deterministic validation log storage (used by `/harness:validate` on first run)

Use relative paths when calling `mkdir` (e.g., `mkdir -p .harness/logs`). Never use Windows absolute paths (`C:\...`) in Bash commands — backslashes are escape characters in bash and will corrupt the path into a single malformed directory name.

Do not create artifact files (`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`), `retrospectives/`, or `agents-overrides/` — each stage and retrospective creates them as needed.

### 6. Completion report

```
Initialized: <projectName>

Files created:
  .harness/config.json
  .harness/state.json

Next steps:
  /harness:status   check current status
  /harness:run      start requirements collection
```

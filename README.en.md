**[한국어](README.md)** | English

# Harness

A general-purpose project agent harness. A Claude Code plugin that you install in any project to have AI work through it step by step — from requirements gathering to code review.

## Concept

```
Agent = Model + Harness
```

Everything that is not the model — agent instructions, validation criteria, state management, artifact structure — is the harness. The harness decides where the agent is and what it should do, then judges whether the result meets the bar.

### Workflow

**Implementation cycle** (`/harness:run`):

```
REQUIREMENTS → ROADMAP → DEVELOPMENT → REVIEW → DONE
      ↑              ↑           ↑            ↑
 [validation]  [validation] [validation] [validation]
```

**Analysis cycle** (`/harness:analyze`):

```
ANALYSIS → SPECIFICATION → DONE
    ↑              ↑
[validation]  [validation]
```

The two cycles use separate state files (`state.json` / `analyzer-state.json`) and can run independently without conflict.

Each stage has a dedicated worker sub-agent that does the work and a validator sub-agent that reviews the output. On validation failure, the cause and fix plan are recorded in the state file and the stage is retried. After `maxRetries` (default 3), user intervention is requested.

---

## Installation

Install via the CLI.

```bash
claude plugin marketplace add gil613/gil-harness
claude plugin install harness
```

After installation, the `/harness:*` slash commands become available.

### Local Development

```bash
git clone https://github.com/gil613/gil-harness
claude --plugin-dir ./gil-harness
```

---

## Quick Start

```
/harness:init        # Initialize .harness/ in the current project
/harness:run         # Run the implementation pipeline automatically (REQUIREMENTS→REVIEW→DONE)
/harness:analyze     # Run the analysis pipeline automatically (ANALYSIS→SPECIFICATION→DONE)
/harness:status      # Check progress
/harness:retro       # Retrospective + instruction improvement after all stages complete
```

---

## Commands

| Command | Role |
|---------|------|
| `/harness:init` | Auto-analyzes the current project → generates `.harness/config.json`, `.harness/state.json` |
| `/harness:run` | **Implementation cycle auto-loop** — repeats run→validate until DONE or retry limit, no manual input needed |
| `/harness:analyze` | **Analysis cycle auto-loop** — ANALYSIS→SPECIFICATION→DONE, runs independently of the implementation cycle |
| `/harness:validate` | Deterministic checks (typecheck/lint/test/build via Bash) + inferential validation (sub-agent) |
| `/harness:status` | Single-screen progress summary |
| `/harness:advance` | Force-advance to the next stage skipping validation (emergency use, requires confirmation) |
| `/harness:reset` | Reset iteration/failures — use after modifying instructions when `maxRetries` is exceeded |
| `/harness:retro` | Retrospective sub-agent → failure pattern analysis → directly improves agent instructions |
| `/harness:update` | Apply new plugin version changes to an existing project — fill config.json schema gaps, refresh CLAUDE.md |
| `/harness:uninstall` | Completely remove the harness from the project (deletes `.harness/`, requires confirmation) |

### `/harness:init`

Auto-analyzes project files in the current directory and fills in configuration values.

Detected stacks: Node.js (TypeScript/JavaScript, React, Next.js, Vue, Nuxt, Svelte, Express, Fastify, NestJS), Python, Rust, Go, Java (Maven/Gradle), Kotlin.

Generated files:

```
.harness/
  config.json          ← project settings (editable)
  state.json           ← current stage, iteration, failures, history (do not edit directly — use /harness:reset)
```

Stage artifacts (`requirements.md`, `roadmap.md`, `progress.md`, `review-report.md`) and `retrospectives/` are created by each stage as it runs.

### `/harness:run`

**One invocation runs the entire pipeline automatically.** Internal loop: run current stage's worker → validate → on PASS advance to next stage and repeat → stop when DONE. On FAIL, passes cause/plan to the worker and retries the same stage. Stops and requests user intervention when `iteration >= maxRetries`.

You can append free-form text after the command (e.g. `/harness:run add T08`); it is captured as this cycle's `userIntent` and forwarded to the worker sub-agent (especially `requirements-collector`) as a focus hint. It does NOT override stage rules or completion criteria.

If the previous cycle is in `DONE`, `/harness:run` no longer bails — it auto-recovers: if a retrospective entry is missing it runs retro inline first, otherwise it just resets `stage` to `REQUIREMENTS` and continues with the next cycle. No more `reset --stage` dance.

If `.harness/agents-overrides/<subagent>.md` exists, the retrospective-generated project-local instructions are automatically inlined into the prompt.

### `/harness:validate`

Reviews artifacts in two passes.

1. **Deterministic validation** (DEVELOPMENT/REVIEW only): the parent session runs `typecheckCmd → lintCmd → testCmd → buildCmd` sequentially via Bash. If any command fails, inferential validation is skipped and the stage fails immediately.
2. **Inferential validation**: stage-specific validator sub-agents (`requirements-validator`, `roadmap-validator`, `development-validator`, `review-validator`) judge artifact quality. The last line must be `VALIDATION_RESULT: PASS|FAIL` + (if FAIL) `REASON`/`FIX_PLAN`.

PASS → advance to next stage + reset `iteration=0`, `failures=[]`, update `lastValidated`.
FAIL → `iteration += 1`, append to `failures` array (capped at 20 most recent).

### `/harness:status`

```
Project:  my-app
Language: TypeScript

Stage [██▶░░] 3/5
Current:  DEVELOPMENT
Retries:  1/3
Last validated: 2026-04-27T09:12:34.000Z

Recent failures:
  [DEVELOPMENT] #1 — 12 type errors (tsc --noEmit failed)

Completed:
  REQUIREMENTS — 2026-04-26
  ROADMAP      — 2026-04-27
```

### `/harness:advance`

Force-advances to the next stage without validation. Records `skippedValidation: true` in `history`. Asks the user for explicit confirmation before proceeding.

### `/harness:reset`

| Argument | Action |
|----------|--------|
| (none) | `iteration=0`, `failures=[]` |
| `--iteration` | reset `iteration` only |
| `--failures` | clear `failures` only |
| `--all` | both |
| `--stage <STAGE>` | force stage change (requires confirmation) |

`maxRetries`, `lastValidated`, `history`, and `schemaVersion` are never touched.

### `/harness:analyze`

**One invocation runs the entire analysis pipeline automatically.** Internal loop: ANALYSIS worker → validate → on PASS advance to SPECIFICATION → validate → on PASS reach DONE. On FAIL, passes cause/plan to the worker and retries. Stops and requests user intervention when `iteration >= maxRetries`.

Append the analysis subject as free-form text; it is forwarded to the worker as `[USER INTENT]`. If omitted, the `analyzer` asks the user once.

```bash
/harness:analyze impact of auth module on regression tests
/harness:analyze technical feasibility review of PRD draft
```

If the previous cycle is in DONE, it automatically resets to ANALYSIS and starts a fresh cycle. Does not conflict with the implementation cycle (`state.json`).

Outputs:
- `.harness/analysis.md` — evidence-based analysis (sourced Findings, Methodology, Open Questions)
- `.harness/spec.md` — decision specification (Decisions + rationale, Recommendations, Constraints)

### `/harness:retro`

Calls the `retrospective` sub-agent to analyze the current cycle. Produces two outputs:

1. `.harness/retrospectives/<YYYY-MM-DD>.md` — what went well / needs improvement / lessons learned
2. **Agent instruction improvements** — applies changes directly via the Edit tool to `.harness/agents-overrides/*.md` (project-local) or, with explicit user consent, to the plugin's own `agents/*.md`

No patch DSL is used — the Edit tool is the patch mechanism.

### `/harness:update`

Run after updating the plugin (`claude plugin update harness` or `git pull`) to sync existing project files with the new version.

- **config.json**: adds only fields introduced in the new schema. Existing fields are never overwritten
- **Directories**: creates any new `.harness/` subdirectories required by the new version

`state.json`, artifacts, and retrospectives are never touched.

### `/harness:uninstall`

Completely removes the harness from the current project. Deletes the entire `.harness/` directory (config, state, artifacts, logs, retrospectives). Displays the deletion list and requires explicit confirmation before proceeding.

To remove the plugin binary itself: `claude plugin remove harness`
To update the plugin to a newer version: `claude plugin update harness`

---

## Stage Details

### REQUIREMENTS — Requirements Gathering (`requirements-collector`)

- One question at a time
- No unresolved placeholders ("later", "TBD")
- Must cover: functional, non-functional (performance/security/scalability/runtime environment), explicit exclusions, and success criteria
- Output: `.harness/requirements.md`

### ROADMAP — Roadmap Design (`roadmap-designer`)

- Each task is a vertical slice (end-to-end unit)
- Each task has acceptance criteria and dependencies
- Wave-based execution order
- Output: `.harness/roadmap.md`

### DEVELOPMENT — Implementation (`developer`)

- One task at a time
- Runs `testCmd`/`lintCmd`/`typecheckCmd` from `config.json` via Bash after each task
- Output: `.harness/progress.md`

### REVIEW — Code Review (`reviewer`)

- Correctness, security (OWASP Top 10), code quality
- Runs typecheck/lint/test/build directly
- Any Critical issue causes FAIL
- Output: `.harness/review-report.md`

### ANALYSIS — Evidence-based Analysis (`analyzer`)

- Every Finding must have a source attached: `file:line`, URL, or user-statement quote
- No TBD or speculation — unknowns go in `Open Questions`
- Output: `.harness/analysis.md`

### SPECIFICATION — Decision Specification (`specifier`)

- Derives decisions from `analysis.md` findings
- Each Decision must include a rationale (`analysis.md F#` reference or user-interview quote)
- Items answerable from analysis are written directly — no unnecessary interview
- Output: `.harness/spec.md`

---

## Validation Gates

At the end of each stage, the validator sub-agent reviews the artifact. The last line must be the verdict:

```
VALIDATION_RESULT: PASS

or

VALIDATION_RESULT: FAIL
REASON: [one-line failure cause]
FIX_PLAN: [what to focus on when retrying]
```

Failures are recorded in the `state.json` `failures` array (capped at 20). The next worker session receives this cause/plan as context so it starts with an informed fix direction.

---

## Self-Improvement via Retrospective

The retrospective sub-agent analyzes failure patterns, requirements change frequency, roadmap accuracy, and review miss rates from the current cycle, then **directly edits the agent instructions** via the Edit tool. Common behavioral principles live in `docs/agent-system-prompt/base.md`; role-specific instructions live in `agents/*.md`.

Allowed edit targets:

- `.harness/agents-overrides/*.md` (project-local overrides, default)
- `docs/agent-system-prompt/base.md` (common instructions for all agents, only with explicit user consent)
- Plugin's own `agents/*.md` (only with explicit user consent)

`.env`, `secrets/`, and arbitrary code files are never touched.

Over successive projects, agent instructions become increasingly tuned to the project's characteristics.

---

## Project Structure

What the plugin creates in your project:

```
your-project/
└── .harness/
    ├── config.json                  ← project settings (editable)
    ├── state.json                   ← implementation cycle state (do not edit directly)
    ├── analyzer-state.json          ← analysis cycle state (do not edit directly)
    ├── requirements.md              ← REQUIREMENTS output
    ├── roadmap.md                   ← ROADMAP output
    ├── progress.md                  ← DEVELOPMENT output
    ├── review-report.md             ← REVIEW output
    ├── analysis.md                  ← ANALYSIS output
    ├── spec.md                      ← SPECIFICATION output
    ├── agents-overrides/*.md        ← (optional) project-specific instruction overrides from retro
    └── retrospectives/
        └── <YYYY-MM-DD>.md          ← retrospective reports
```

Plugin repository (this repo):

```
gil-harness/
├── .claude-plugin/plugin.json
├── marketplace.json
├── docs/
│   └── agent-system-prompt/
│       ├── base.md                  ← common instructions injected into all agents
│       └── roles/                   ← role-specific additional instructions
├── agents/                          ← worker + validator sub-agent definitions
│   ├── requirements-collector.md
│   ├── requirements-validator.md
│   ├── roadmap-designer.md
│   ├── roadmap-validator.md
│   ├── developer.md
│   ├── development-validator.md
│   ├── reviewer.md
│   ├── review-validator.md
│   ├── analyzer.md
│   ├── analysis-validator.md
│   ├── specifier.md
│   ├── spec-validator.md
│   └── retrospective.md
└── commands/                        ← slash commands
    ├── init.md
    ├── run.md
    ├── analyze.md
    ├── validate.md
    ├── status.md
    ├── advance.md
    ├── reset.md
    └── retro.md
```

---

## config.json

Generated by `/harness:init`. Bash commands in the validation and development stages read these values.

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

Empty strings cause the corresponding check to be skipped.

---

## Requirements

- Claude Code (version with `/plugin` marketplace support)

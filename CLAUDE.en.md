# CLAUDE.md
# Core Principles
- Agent = Model + Harness — everything that is not the model is the harness
- This file is a **table of contents**. For detailed principles see `docs/research/harness-engineering.md`
- Encyclopedia ❌, index ✅ — keep it under 100 lines
- Start from failure — only add a rule when an agent has actually failed
- When an agent gets stuck, treat it as an environment defect, not a model problem — identify missing tools/docs/guardrails, fix them, then retry
- Put less in — only the minimum instructions that apply universally (ETH Zurich: over-specification lowers performance and raises cost)
- Build to Delete — keep yesterday's smart logic modular so it can be torn out
- The Harness is the Dataset — the competitive edge is the trajectory the harness captures, not the prompt
- "What the agent cannot reach in context effectively does not exist"

# Document Structure (System of Record)
- `CLAUDE.md` — index (this file, ~100 lines)
- `docs/research/` — research material (e.g. `harness-engineering.md`)
- `docs/design-docs/` — design documents (`index.md` entry point)
- `docs/exec-plans/active/` · `completed/` — execution plans + decision logs
- `docs/exec-plans/tech-debt-tracker.md` — tech debt tracking
- `docs/product-specs/` — product specs
- `docs/references/` — external references (LLM-friendly txt)
- `docs/generated/` — auto-generated artifacts (db-schema, etc.)

# Cross-Session Memory
- **First session (Initializer)** — dedicated prompt: create `init.sh` / progress file / `feature-list.json` / initial commit only; no feature implementation
- `init.sh` — dev server startup script (read and run at the start of every session to save environment-discovery tokens)
- `claude-progress.txt` or `STATE.md` — cross-session work log
- `feature-list.json` — feature list; only the `passes` field may be modified (JSON: tamper-resistant to model drift)
- End every session in a clean, merge-ready state

# Context Management
- Compaction — summarize and continue when approaching limits
- Tool call offloading — large outputs go to files; only head/tail in context
- `SKILL.md` — document repeated procedures; load into context only when needed (progressive disclosure)
- "Success is silent, only failure is loud" — do not flood context with passing output
- Sub-agents = context firewall (absorb exploration/implementation noise, return only the result)
- Parent session = Opus, sub-agents = Sonnet/Haiku (narrow tasks don't need the strongest model)

# Session Workflow (Coding Agent)
1. Confirm `pwd`
2. Read `git log` + progress file
3. Pick the highest-priority incomplete item from the feature list
4. Run a basic E2E regression check before starting a new feature
5. Implement one feature
6. Validate as a user would (Puppeteer/CDP, etc.)
7. Descriptive commit + update progress file
8. End in a merge-ready state

# Task Decomposition
- One feature at a time — one-shot attempts; never declare completion early
- Vertical slice (end-to-end) > horizontal layer
- Wave-based parallelism — independent tasks in the same wave, dependent tasks in the next
- File conflicts → serialize
- XML task definition: `<task><name><files><action><verify><done>`

# Commit Rules
- Atomic commits (each feature independently revertable)
- English messages, no trailing period
- Format: `feat(MM-DD): ...` / `fix(MM-DD): ...` / `docs(MM-DD): ...`
- Only set `passes: true` after validation passes

# Architecture (Layered Domain)
- Forward-only: Types → Config → Repo → Service → Runtime → UI
- Cross-cutting concerns (auth / telemetry / feature flags) → through **Providers** interfaces only
- Utils live outside the boundary; data flows only through Providers
- Violations are blocked mechanically by custom linters + structural tests
- "Boundaries enforced centrally, autonomy kept local"

# Self-Validation (Back-pressure)
- Two axes: **Guides** (proactive blocking: linters, type checks, deny rules) + **Sensors** (reactive observation: tests, logs, monitoring)
- Two kinds: **Computational** (deterministic, fast) + **Inferential** (LLM-based semantic analysis, code review agents)
- Quality Left — fast checks at pre-commit, expensive checks post-integration
- Auto-run typecheck / tests / linter at end of each task (hooks)
- **Inject fix instructions directly into linter error messages**
- Durability — instruction-following after 50–100 tool calls is the key metric
- Browser validation (Puppeteer / CDP) — DOM snapshots, screenshots, navigation
- Observability — LogQL / PromQL / TraceQL
- Ephemeral stack per worktree (deleted when work is done)
- PR review progressively delegated to agents — human preferences encoded in linters, docs, and golden rules

# Tool Use (MCP / CLI)
- MCP: **only what is necessary** — tool definitions are tokens
- Tools well-represented in training data (GitHub / Docker / DB / git) → call CLI directly
- No monolithic control flow ❌; atomic tool + guardrail/retry/verification ✅
- Sandbox — bash and code execution in isolated environments with allowed commands and network restrictions, created and destroyed on demand
- Prefer "boring" technology — rich training data + stable API → reimplementing is sometimes cheaper than a third-party library
- Vercel case study: removed 80% of tools → fewer steps, faster responses

# Security
- Deny sensitive files: `.env`, `.env.*`, `**/secrets/*`, `**/*credential*`, `**/*.pem`, `**/*.key`
- Markdown/planning artifacts written by agents become the next session's system prompt → user-controlled text = **indirect prompt injection vector**
- PreToolUse guard hook: scan for injections before writing any markdown
- Validate path traversal / shell arguments / JSON parsing / CI workflows
- Granular `permissions.allow` — remove automation friction, but deny takes precedence

# Entropy Management
- Golden Principles encoded **in code** in the repo (no doc dependency)
  - (1) Shared utility packages over private helpers
  - (2) No YOLO data exploration → boundary validation / typed SDK
- Background drift detection → quality grade update → automated refactor PR
- Doc-gardening agent — detects stale docs that diverge from code → auto-generates fix PR
- Tech debt is a high-interest loan — **pay it down daily**
- Human-preference feedback → encode directly into docs or tooling

# Prohibited
- Monolithic AGENTS.md / encyclopedia-style instructions
- Codebase overviews / directory listings (agents explore on their own)
- Pre-designed "ideal harness" — add rules only when a failure actually occurs
- Multiple features in one session
- Declaring completion without validation
- `--no-verify` / hook bypass (only if the user explicitly requests it)
- Code cleanup to satisfy human aesthetic preferences — correct, maintainable, and re-runnable is the bar

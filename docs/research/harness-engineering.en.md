# Harness Engineering — Consolidated Reference

> In the age of AI agents, competitive advantage comes not from the model but from **the system wrapping the agent** (the harness).

---

## 0. One-sentence summary

**Agent = Model + Harness**

The harness is the entire infrastructure that wraps an AI model to reliably perform long-running tasks — including system prompts, tool definitions, sandboxes, filesystems, context management, feedback loops, middleware hooks, orchestration, and mechanical enforcement mechanisms. Everything that is not the model is the harness.

---

## 1. Conceptual hierarchy — Prompt → Context → Harness

### 1.1 Three stages of evolution

| Level | Core question | Design target |
|---|---|---|
| Prompt engineering | "What should I ask?" | Instructions passed to the LLM |
| Context engineering | "What should it see?" | All tokens present at inference time |
| **Harness engineering** | "How do I design the whole environment?" | Constraints, feedback, and operations outside the agent |

### 1.2 Analogy

- **Prompt**: A single voice command — "Turn right"
- **Context**: Showing a map and signposts
- **Harness**: Reins, saddle, fences, road maintenance — the full design that lets multiple horses run safely at the same time

### 1.3 Computer architecture analogy (Phil Schmid)

| Computer | Agent system |
|---|---|
| CPU | Model (raw processing) |
| RAM | Context Window (limited, volatile working memory) |
| **OS** | **Agent Harness** (context curation, boot sequence, standard drivers) |
| Application | Agent (user logic running on top of the OS) |

→ Developers don't need to rebuild the OS — they only need to define the application.

### 1.4 Complementary perspective

> **"Context engineering helps the model think well; harness engineering keeps the system from going off the rails."**

### 1.5 Timeline

- **2023–2024**: Prompt engineering
- **Mid-2025**: Context engineering (Karpathy mention, RAG/MCP/memory rises)
- **November 2025**: Anthropic, *Effective Harnesses for Long-Running Agents*
- **2026.01**: Phil Schmid, "Importance of Agent Harness in 2026"
- **2026.02.05**: Mitchell Hashimoto blog (term "Harness Engineering" appears)
- **2026.02.11**: OpenAI Codex 5-month experiment report

---

## 2. Why it matters — the environment is the bottleneck

### 2.1 Core proposition

**The environment, not the model, is the bottleneck.**

- The gap between top-tier models on static leaderboards is narrowing — but this may be an illusion
- The real difference **emerges as tasks grow longer and more complex**
- The key metric = **Durability** — how well the agent follows instructions after 50–100 tool calls
- A 1% leaderboard gap cannot measure instruction-following drift at step 50
- **Model performance is rapidly converging** → the harness is the asset you must build; it is not deployed once like a general-purpose model

### 2.2 What an LLM cannot do alone

An LLM is fundamentally a text (image/audio) → text function. On its own it cannot:
- Maintain state across sessions
- Execute code
- Access real-time information
- Configure environments or install packages
- Even the "chat" UX is a harness artifact (a while loop that tracks previous messages and appends new ones = the most basic harness)

### 2.3 Context Rot

- Chroma research: **reasoning ability degrades as context length grows**
- Performance degrades faster when semantic similarity between the question and relevant information is low
- "A larger context window is just a bigger haystack — it doesn't improve needle-finding ability, only the haystack size"
- What's needed is not a longer context but **better context isolation**

### 2.4 Benchmark limitations

- Existing benchmarks are primarily single-turn
- System evaluations like AIMO and SWE-Bench **cannot measure behavior after the 50th–100th tool call**
- "Solving a hard puzzle in one or two attempts" and "following initial instructions for an hour" are different capabilities

---

## 3. Components of a harness

### 3.1 Context files (AGENTS.md / CLAUDE.md / .cursorrules)

**Principle: encyclopedia ❌, table of contents ✅**

Four failure modes of a giant AGENTS.md (from OpenAI's experience):
1. Context is a scarce resource → critical constraints get missed
2. When everything is "important," nothing is
3. Goes stale quickly — a graveyard of outdated rules
4. Cannot be mechanically checked (coverage, freshness, ownership, cross-links)

Solution: AGENTS.md (~100 lines) is the **table of contents**; actual knowledge lives in a structured `docs/` directory.

### 3.2 Structured documentation directory (System of Record)

Actual layout used by the OpenAI Codex team:
```
AGENTS.md                 # table of contents (~100 lines)
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

Core principles:
- **Plans are first-class artifacts** (small changes = ephemeral, complex = exec-plan with decision log)
- Progress, completion, and tech debt are all version-controlled and co-located
- **Progressive disclosure** — small, stable entry points → next level
- Mechanical enforcement (dedicated linter/CI checks freshness, cross-links, structure)
- **Doc-gardening agent** — detects stale docs that diverge from code behavior → auto-generates fix PRs

### 3.3 MCP (Model Context Protocol) servers

Connecting external tools and data sources:
- Issue trackers, wikis, monitoring systems, browser automation

```bash
claude mcp add --transport http jira https://mcp.jira.example.com/mcp
claude mcp add --transport stdio github -- npx -y @modelcontextprotocol/server-github
```

**Caution**: Tool definitions consume tokens. **Only what is needed.**
- HumanLayer example: replaced Linear MCP with a lightweight CLI wrapping only the essentials, saving thousands of tokens
- For tools already well-represented in training data (GitHub, Docker, DB), calling the CLI directly beats MCP

### 3.4 Skill files (SKILL.md)

Document procedures for repeated tasks. Use progressive disclosure to **load relevant instructions into context only when actually needed**.

Examples: code review checklists, deployment workflows, specific framework patterns.

### 3.5 Filesystem + Git (persistent storage)

The most fundamental harness primitive.

- **Workspace** + intermediate artifact storage + cross-session state
- **Git** = version control + undo mistakes + experimental branches + shared ledger for collaboration
- **Anthropic's `claude-progress.txt`** — each session logs what it did; the next session reads this file + git log to understand current state

### 3.6 Sandbox + code execution

- bash/code execution = general-purpose tool
- Lets the agent create and use tools on the fly as code
- Isolated environment / only allowed commands / network restrictions
- **On-demand creation and teardown** for handling large-scale workloads

### 3.7 Context management strategies

| Strategy | Description |
|---|---|
| **Compaction** | Summarize and trim when approaching the limit |
| **Tool call offloading** | Keep only head/tail of large tool outputs; save full content to file — reference only when needed |
| **Skills (progressive disclosure)** | Load relevant instructions and tools only when actually needed |

HumanLayer maxim: **"Succeed quietly, fail loudly"** — don't flood the context with 4,000 lines of passing results

### 3.8 Sub-agents (context isolation)

The real value of sub-agents is not "frontend/backend role separation" but **context isolation**:
- Absorbs the noise of exploration, research, and implementation
- Delivers **only the final result concisely** to the parent agent
- Functions as a "**context firewall**"

Cost control benefit:
- Parent session = expensive model (Opus)
- Sub-agent = cheaper model (Sonnet, Haiku)
- Narrow, well-defined scope means a weaker model is sufficient

### 3.9 Hooks + back-pressure

- **Hooks**: user-defined scripts that run automatically at specific points in the agent lifecycle (similar to Git hooks)
  - Example: auto-run typecheck + formatter on task completion → if errors exist, send back to the agent
- **Back-pressure**: agent validates its own work
  - typecheck, tests, coverage reports, browser automation tests
  - HumanLayer: **"the highest-leverage investment"**, "an agent's task success rate strongly correlates with its self-validation capability"

### 3.10 Mechanical enforcement — custom linters + structural tests

Documentation alone cannot maintain consistency. **Enforce invariants mechanically.**

- Don't just surface errors — **inject fix instructions directly into the agent's context via linter error messages**
- Applies to: structured logging, schema/type naming conventions, file size limits, platform-specific stability requirements

### 3.11 Observability

So the agent can **debug and verify its own written code**:
- Query logs with LogQL
- Query metrics with PromQL
- Query traces with TraceQL
- DOM snapshots / screenshots
- Ephemeral per-worktree stacks (deleted when work is done)

OpenAI example: Chrome DevTools Protocol connected to the agent runtime → DOM snapshots, screenshots, navigation skills → a single Codex run lasting 6+ hours on a single task (running overnight)

### 3.12 Garbage collection (entropy management)

- Codex **replicates existing patterns (including bad ones)** → drift is inevitable
- Previously: spending every Friday (20%) cleaning up "AI slop" → **does not scale**
- Now: **Golden Principles encoded directly in the repo** + background agent auto-cleanup
  - (1) Prefer shared utility packages over self-rolled helpers
  - (2) No YOLO data exploration → boundary validation / typed SDKs enforced
- Codex background job: detect drift → update quality grades → auto-generate and auto-merge targeted refactoring PRs
- Maxim: **"Tech debt is a high-interest loan — pay it daily"**

---

## 4. Architectural enforcement — Layered Domain Architecture

### 4.1 OpenAI pattern

Each business domain can only "flow" through a fixed layer sequence:
```
Types → Config → Repo → Service → Runtime → UI
```

- Cross-cutting concerns (auth, connectors, telemetry, feature flags) → pass through a single **Providers** interface only
- All violations are **mechanically blocked by custom linters + structural tests**
- Utils modules live outside boundaries; data flows through Providers

### 4.2 Normally introduced for 100-engineer teams

...yet it is introduced as a **precondition for agents**.

> **"Constraints are what allow you to move fast without performance degradation or architectural drift."**

Principle: **"Boundaries from the center, autonomy at the local level"** (the same pattern used in large-scale engineering platform organizations)

### 4.3 Difference from human coding style

It's fine if the resulting code doesn't match human taste — **accuracy, maintainability, and re-runnable readability** are the only bars.

Human preferences are continuously fed back into the system:
- Review comments, refactoring PRs, user-side bugs → **recorded as documentation updates** or **encoded directly in tooling**
- When docs are insufficient → **promote rules to code**

---

## 5. Key patterns

### 5.1 "Give a map, not a manual"

> **"Give Codex a map, not a 1,000-page instruction manual."**

- Giant instruction files ❌
- AGENTS.md = table of contents; actual knowledge lives in structured docs/

### 5.2 One feature at a time (Anthropic)

Anthropic claude.ai clone experiment:
- High-level prompts like "build a claude.ai clone" → two failure modes:
  1. **One-shot attempt** → context exhausted, half-implementation undocumented
  2. **Premature completion declaration** → later agents say "looks done" and exit

Solution: **Each session focuses on exactly one feature.**

### 5.3 Initializer + Coding agent pattern (Anthropic)

**First session** (Initializer agent — uses a separate user prompt only):
- Write `init.sh` (dev server startup script)
- Write `claude-progress.txt` (task log)
- Initial git commit
- **Feature list JSON** (200+ features, all `"passes": false`)

**All subsequent sessions** (Coding agent):
1. `pwd` — confirm working directory
2. **Read git log + progress file**
3. Select the highest-priority incomplete feature from the feature list
4. Start dev server with `init.sh`
5. **Basic end-to-end test** before each new feature
6. Implement one feature
7. **Validate** (using Puppeteer MCP as the user would)
8. **Descriptive commit message + update progress file**
9. Exit in a clean (merge-ready) state

### 5.4 Feature list as JSON

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

- Coding agents are only allowed to modify the `passes` field
- Strong wording: **"It is unacceptable to remove or edit tests..."**
- **Why JSON**: the model is less likely to inappropriately modify or overwrite JSON compared to markdown

### 5.5 Throughput changes merge philosophy (OpenAI)

- Minimize blocking merge gates
- Keep PR lifetimes short
- **Handle test flakiness with re-runs, not blocks**
- Agent throughput ≫ human attention → **fix cost is cheap, wait cost is expensive**
- (Not suitable for low-throughput environments)

### 5.6 Atomic git commits (GSD)

```
abc123f docs(08-02): complete user registration plan
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing
lmn012o feat(08-02): create registration endpoint
```

**Benefits**:
- Track exactly which task broke via git bisect
- Independent revert per task unit
- Clear history for the next session's agent to read
- AI automation workflow visible at a glance

### 5.7 Wave-based parallelism (GSD)

```
Wave 1 (parallel)        Wave 2 (parallel)        Wave 3
[Plan 01][Plan 02]  →  [Plan 03][Plan 04]  →  [Plan 05]
 UserModel ProductModel  OrderAPI CartAPI      PaymentUI
```

- Independent plans → same wave → parallel
- Dependent plans → later wave → wait for dependency
- File conflicts → sequential or same plan
- **Vertical slices (end-to-end features) parallelize better than horizontal layers (all models → all APIs)**

### 5.8 XML prompt formatting (GSD)

```xml
<task type="auto">
  <name>Create login endpoint</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    Use jose for JWT (not jsonwebtoken — CommonJS issue).
    Validate credentials against the users table.
    Return an httpOnly cookie on success.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 + Set-Cookie</verify>
  <done>Valid credentials return cookie, invalid return 401</done>
</task>
```

→ Precise instructions, no guessing, validation built in

### 5.9 Multi-agent orchestration (GSD pattern)

| Phase | Orchestrator | Agents |
|---|---|---|
| Research | Coordinate + present results | 4 researchers in parallel (stack/features/architecture/caveats) |
| Planning | Validate + manage iterations | Planner → Reviewer → repeat until pass |
| Execution | Group into waves + track progress | Executors in parallel, each with a fresh 200K context |
| Validation | Present results + route next | Validator + Debugger |

**Result**: Only 30–40% of main context used; actual work happens in sub-agent contexts

### 5.10 Ralph Wiggum Loop (OpenAI)

**Repeat until all agent reviewers are satisfied** with the PR:
- Codex reviews its own changes locally
- Requests additional agent reviews (local + cloud)
- Responds to human and agent feedback
- Repeat

→ Over time, **nearly all reviews shift to agent-to-agent processing**

---

## 6. Case studies

### 6.1 OpenAI Codex — 5-month experiment

| Metric | Value |
|---|---|
| Duration | 2025.08 – 2026.01 |
| Lines of code written manually | **0** |
| Generated code | ~1 million lines |
| Merged PRs | ~1,500 |
| Team size | 3 → 7 |
| Daily PRs per person | 3.5 |
| Time vs manual | ~1/10 |
| Usage | Internal daily users + external alpha testers |

**Key lessons**:
- Initial progress was slower than expected — **not from model capability gaps but from environment gaps**
- Core engineering question: "**What is missing that prevents the agent from reading and running things?**"
- Depth-first — break large goals into small building blocks

### 6.2 Anthropic — claude.ai clone experiment

- Claude Agent SDK + Opus 4.5
- Initializer + Coding agent two-part solution
- Feature list JSON with 200+ items
- End-to-end validation with Puppeteer MCP
- **Limitation noted**: Puppeteer MCP cannot see browser-native alert modals

### 6.3 Hashline (Can Boluk, 2026.02) — changed only the tool format

Before: required exact text reproduction / structured diffs

Hashline: assigns a 2–3 character hash to each line
```
1:a3|function hello() {
2:f1|  return "world";
3:0e|}
```
The model specifies edits by hash ("replace line 2:f1") → no exact string reproduction needed

**Results** (16 models tested):
- Grok Code Fast 1: **6.7% → 68.3%**
- Average output tokens reduced by **~20%**
- **Model weights unchanged — only the harness improved**

### 6.4 LangChain — Terminal Bench 2.0

- Fixed model: gpt-5.2-codex
- Improved harness only
- Score: **52.8% → 66.5%** (+13.7 points)
- Ranking: **top 30 → top 5**
- Key: LangSmith traces for automated failure pattern analysis + self-validation loop

### 6.5 GSD (Get Shit Done) — a real tool

A meta-prompting, context engineering, and spec-driven development system supporting 12 runtimes.

Standard file structure:
| File | Role |
|---|---|
| `PROJECT.md` | Vision, always loaded |
| `research/` | Ecosystem knowledge |
| `REQUIREMENTS.md` | v1/v2/out-of-scope |
| `ROADMAP.md` | Direction + completion |
| `STATE.md` | Decisions/blockers/location — cross-session memory |
| `PLAN.md` | XML structure + verification steps |
| `SUMMARY.md` | Changes, historical commits |
| `todos/` | Future tasks |
| `threads/` | Cross-session context |
| `seeds/` | Future ideas with trigger conditions |

Workflow:
```
new-project → discuss-phase → plan-phase → execute-phase
            → verify-work → ship → complete-milestone → new-milestone
```

### 6.6 Mitchell Hashimoto — Ghostty AGENTS.md

**Principle**: "Every time the agent makes a mistake, engineer it so the mistake never happens again"

- Each line in AGENTS.md is a rule built from a mistake an agent actually made
- "Do better next time" prompts ❌, **structural recurrence prevention** ✅

### 6.7 Other case studies

- **Manus**: refactored harness 5 times over 6 months (removing rigid assumptions)
- **LangChain**: Open Deep Research redesigned 3 times in 1 year
- **Vercel**: removed 80% of agent tools → fewer steps, fewer tokens, faster responses
- **Stripe**: pre-push hooks + integrated feedback sensors

---

## 7. Failure modes and solutions

| Problem | Solution |
|---|---|
| One-shot attempt, context exhausted | Feature list + single feature per session |
| Premature completion declaration | Structured feature list tracking all incomplete items |
| Undocumented / buggy exit | git commit + progress file + basic dev server test at session start |
| Feature marked "done" prematurely | Self-validation for all features + E2E test (Puppeteer etc.) before `passing` |
| Wasting tokens figuring out how to run the app | Write `init.sh` + read it at session start |
| Context Rot | Compaction + tool call offloading + Skills + sub-agent isolation |
| Giant AGENTS.md failure | Table of contents + structured docs/ + progressive disclosure |
| Context flooded with passing output | "Succeed quietly, fail loudly" |
| Entropy / AI slop accumulation | Golden Principles + background cleanup agent |
| Architectural drift | Mechanical enforcement via custom linters + structural tests |
| MCP tool definitions bloating tokens | Only what's needed + use CLI for well-trained tools |
| Too many instructions | "Keep it minimal" — human-written instructions only improved results 4% |

---

## 8. Practical principles (meta rules)

### 8.1 Start from failures (Mitchell Hashimoto / HumanLayer)

Don't design the ideal harness upfront ❌. Add structural prevention devices **each time the agent actually fails** ✅.

> "Have a shipping bias. Only touch the harness when the agent actually fails."

### 8.2 Keep it minimal (ETH Zurich research)

- Tested 138 agent configuration files
- LLM-generated files: **degraded performance while increasing cost 20%+**
- Human-written improved results by only 4%
- Codebase overviews and directory listings are useless (agents explore on their own)
- **Include only the minimum instructions that apply universally**

### 8.3 Don't over-connect tools

- Many MCP connections → tool descriptions fill the system prompt → **eat into the instruction budget**
- For tools well-represented in training data (GitHub, Docker, DB), CLI prompt engineering is more efficient

### 8.4 Enforce incremental work

Anthropic experiment's biggest improvement: **one feature at a time**.
- After each task, git commit + progress note
- Next session starts from a clean state

OpenAI: "When agents struggle, treat it as a signal. Figure out what is missing (tools, guardrails, docs), and have Codex fix it directly."

### 8.5 Start Simple, Build to Delete (Phil Schmid)

1. **Start Simple** — no large control flows ❌. Provide solid atomic tools, let the model plan, implement only guardrails/retry/verification
2. **Build to Delete** — modular architecture. New models will replace logic. Keep code removable
3. **The Harness is the Dataset** — competitive advantage is no longer the prompt but **the trajectory captured by the harness**

### 8.6 The Bitter Lesson

Rich Sutton: "General methods that use computation beat hand-coded human knowledge every time."

→ Infrastructure (harness) must be **lightweight**. Optimal structure changes with every model release.
→ Capabilities that required hand-coded pipelines in 2024 are handled by a **single context-window prompt** in 2026.
→ "Build today's smart logic so it can be ripped out tomorrow."

### 8.7 Agent readability is ground truth

> **"What the agent cannot access in context effectively does not exist."**

- Slack, Google Docs, knowledge in someone's head = **effectively non-existent**
- Encode everything **in the repo as markdown/schemas/exec-plans**
- Onboard the agent like a new team member

### 8.8 Prefer "boring" technology

- Composable, stable APIs, and good training data coverage → **easier to model**
- Sometimes **reimplementing is cheaper** than pulling in an external library
  - Example: custom map-with-concurrency instead of p-limit, with OTel integration + 100% test coverage

### 8.9 "Relocating rigor" (Chad Fowler)

The rigor that once went into writing every line of code precisely has shifted to **rigor in designing systems that make agents work correctly**.

> **"Discipline shows more in the scaffolding than in the code."**

### 8.10 Human review is optional

- PR review gradually shifts to agent-to-agent processing
- Human preferences are **encoded into the system** (linters, docs, golden rules)

---

## 9. Adoption steps (3 phases)

### Step 1. Write context files

Create `CLAUDE.md` / `AGENTS.md` at the project root:
- **Start short**
- Add only the parts where agents make repeated mistakes
- Accumulate instructions that prevent the same mistake

Example:
```markdown
## Build
- Full build: `./gradlew build`
- Run tests: `./gradlew test`

## Coding conventions
- Package dependency direction: domain → application → infrastructure
- infrastructure must not directly reference domain
- Entities use lazy loading by default; use Fetch Join to resolve N+1

## Commits
- Commit messages in English, no trailing period
```

### Step 2. Connect MCP

For frequently referenced external systems:
- Issue trackers, wikis, monitoring
- **Connect only what is needed** (avoid token waste)

### Step 3. Linter + CI integration

- Connect the agent to CI failure logs
- Build a **self-correcting feedback loop**
- **Inject fix instructions directly into linter error messages**

---

## 10. Security (GSD pattern)

### 10.1 Defense in depth

- **Path traversal prevention** — validate user-provided file paths
- **Prompt injection detection** — centralized module to scan user text
- **PreToolUse guard hook** — scan for injection vectors before writing markdown files
- **Safe JSON parsing** — block malformed input
- **Shell argument validation** — sanitize before interpolation
- **CI injection scanner** — check all agent/workflow/command files

Core insight:
> **"Because we're generating markdown files that become LLM system prompts, user-controlled text in planning artifacts is a potential indirect prompt injection vector."**

### 10.2 Sensitive file protection

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

### 10.3 Removing automation friction

`claude --dangerously-skip-permissions`
- "Stopping 50 times to approve `date` and `git commit` defeats the purpose"
- Alternative: granular `permissions.allow`

---

## 11. The model-harness co-evolution paradox

### 11.1 Models are post-trained on their own harness

- Claude → Claude Code harness
- Codex → Codex harness
- Result: **models become optimized for a specific harness**
  - Codex model became tightly coupled to `apply_patch` → OpenCode needed to add separate tools

### 11.2 But they overfit to their own harness

- Opus 4.6 on Terminal Bench 2.0:
  - Inside Claude Code: **rank 33**
  - On a different harness: **top 5**
- → **A harness the model didn't see during post-training yields better performance**
- → The model may **"overfit"** to its own harness

### 11.3 Message to practitioners

> **"Using the default harness as-is may not be optimal. Customizing it to your task characteristics can yield meaningful performance gains."**

---

## 12. Future / open questions

### 12.1 Single vs. multi-agent (Anthropic)

Specialized agents may outperform:
- Test agent
- QA agent
- Code cleanup agent
- Doc-gardening agent

### 12.2 Generalization to other domains

Expansion beyond web apps:
- Scientific research
- Financial modeling
- Other long-horizon tasks

### 12.3 LangChain exploration direction

- Orchestrating hundreds of agents working in parallel on a shared codebase
- **Self-improvement loop** — agents analyze their own execution traces → self-correct harness-level failure causes
- **Adaptive harness** — dynamically assemble tools and context per task without pre-configuration

### 12.4 Will harness become the new service template? (Birgitta Böckeler)

- Most organizations use only 2–3 major tech stacks
- **Pre-built harnesses per common application type** → gradual customization
- Functions like a golden path
- Technology selection criteria shift: "framework with good DX" → "**framework with a good harness**" (AI-friendliness)

### 12.5 Legacy vs. greenfield gap

- Codebases built from the start with AI agents vs. **legacy code from the pre-harness era**
- Retroactively applying a harness to legacy = running static analysis for the first time on code that never had it → **flood of warnings**

### 12.6 New bottleneck: Context Durability

- The harness is the **primary tool for resolving model drift**
- Precisely detect when and at which step the model stops following instructions or reasoning breaks down
- **Direct feedback into training** → "a model that doesn't get tired"

---

## 13. Birgitta Böckeler framework (Martin Fowler site)

### 13.1 Two axes of control

| Category | Description |
|---|---|
| **Guides (feedforward)** | Pre-empt undesired outputs |
| **Sensors (feedback)** | Observe results post-hoc and prompt self-correction |

| Category | Description |
|---|---|
| **Computational** | Deterministic, fast (linters, tests, type checkers) |
| **Inferential** | LLM-based semantic analysis (code review agent) |

### 13.2 Three regulatory categories

1. **Maintainability Harness** — most mature. Detects complexity, duplication, style
2. **Architecture Fitness Harness** — fitness functions, observability standards
3. **Behaviour Harness** — least mature. Dangerous to over-rely on AI-generated tests

### 13.3 Strategic principles

- **Timing & Quality Left** — fast checks at pre-commit, expensive checks post-integration
- **Harnessability** — "ambient affordances" like strong typing and clear module boundaries determine harness potential
- **Human Role** — not removing humans but **repositioning them to high-impact decisions**

### 13.4 Open challenges

- Designing a consistent system where guides and sensors don't contradict each other
- Systematic assessment of harness quality and coverage
- Building behaviour harnesses that genuinely improve trust in functional correctness
- Keeping the harness synchronized as the system evolves

### 13.5 The validation gap (supplemented by Anthropic)

What OpenAI's piece lacked: **validating features and behavior** ("Does this feature actually work from the user's perspective?")
→ Anthropic's Puppeteer-based E2E testing is more complete

---

## 14. One-page summary — Harness engineering checklist

### 14.1 Basic infrastructure

- [ ] `AGENTS.md` or `CLAUDE.md` at project root (table of contents, ~100 lines)
- [ ] Structured `docs/` (design-docs / exec-plans / product-specs / references)
- [ ] `init.sh` (app startup script)
- [ ] Git repository + atomic commit convention
- [ ] `progress.txt` or `STATE.md` (cross-session memory)

### 14.2 Context management

- [ ] Compaction enabled
- [ ] Tool call output offload policy
- [ ] Context isolation via sub-agents
- [ ] "Succeed quietly, fail loudly"

### 14.3 Validation / self-validation

- [ ] Typecheck / tests / linter integration
- [ ] Browser automation (Puppeteer/CDP)
- [ ] Observability (LogQL / PromQL / TraceQL)
- [ ] Isolated dev environment per worktree
- [ ] Feature list JSON (one at a time)

### 14.4 Architectural enforcement

- [ ] Layered domain (Types → Config → Repo → Service → Runtime → UI)
- [ ] Cross-cutting via Providers
- [ ] Custom linter (with fix instruction messages)
- [ ] Structural tests
- [ ] Doc-gardening agent

### 14.5 Workflow

- [ ] new-project → discuss → plan → execute → verify → ship
- [ ] Wave-based parallel execution
- [ ] XML task definitions (action / verify / done)
- [ ] Multi-agent orchestration
- [ ] Initializer + Coding agent separation

### 14.6 Security

- [ ] Path traversal prevention
- [ ] Prompt injection scanner
- [ ] PreToolUse guard hook
- [ ] Sensitive file deny list
- [ ] CI injection validation tests

### 14.7 Maintenance / entropy management

- [ ] Golden Principles encoding
- [ ] Background drift detection job
- [ ] Automated refactoring PRs
- [ ] Quality grade tracking
- [ ] tech-debt-tracker

### 14.8 Removing operational friction

- [ ] `permissions.allow` defined
- [ ] Skip permission mode (for automation)
- [ ] Fast mode (`/quick`) — simple task path
- [ ] auto_advance — unattended chaining

---

## 15. Key quotes

> **"Agent = Model + Harness"** — Vivek Trivedy (LangChain)

> **"Every time the agent makes a mistake, engineer it so the mistake never happens again."** — Mitchell Hashimoto

> **"Give Codex a map, not a 1,000-page instruction manual."** — OpenAI Codex Team

> **"What the agent cannot access in context effectively does not exist."** — OpenAI Codex Team

> **"The model is probably fine. It's just a harness problem."** — HumanLayer

> **"Discipline shows more in the scaffolding than in the code."** — OpenAI Codex Team

> **"Tech debt is a high-interest loan — pay it daily."** — OpenAI Codex Team

> **"Succeed quietly, fail loudly."** — HumanLayer

> **"Context engineering helps the model think well; harness engineering keeps the system from going off the rails."** — MadPlay

> **"A larger context window is just a bigger haystack."** — Chroma research

> **"The hardest challenge is now designing the environment, feedback loops, and control systems."** — OpenAI Codex Team

> **"Build to Delete — build today's smart logic so it can be ripped out tomorrow."** — Phil Schmid

---

## 16. References

### Primary sources
- **OpenAI** — *Harness engineering: leveraging Codex in an agent-first world* (2026.02.11)
- **Anthropic** — *Effective Harnesses for Long-Running Agents* (Justin Young, 2025.11.26)
- **Phil Schmid** — *The importance of Agent Harness in 2026* (2026.01.05)
- **Martin Fowler / Birgitta Böckeler** — *Harness Engineering for Coding Agent Users*
- **Mitchell Hashimoto** — *My AI Adoption Journey* (2026.02.05)

### Secondary sources
- **MadPlay** — *Beyond Prompts and Context: Harness Engineering for AI Agents* (2026.02.15)
- **HumanLayer** — *Skill Issue: Harness Engineering for Coding Agents*
- **LangChain** — *The Anatomy of an Agent Harness*, *Improving Deep Agents with Harness Engineering*
- **InfoQ** — *OpenAI Introduces Harness Engineering* (2026.02)
- **Towards AI** — *OpenAI's Harness Engineering Experiment* (Rick Hightower, 2026.04)

### Practical tools
- **GSD (Get Shit Done)** — github.com/gsd-build/get-shit-done — 12-runtime meta system
- **Claude Agent SDK** — Anthropic
- **Codex CLI** — OpenAI
- **LangChain DeepAgents**
- **Aardvark** — OpenAI codebase task agent

### Related research
- **Chroma** — Context Rot research
- **ETH Zurich** — Study on the effect of 138 agent configuration files
- **Can Boluk** — *I Improved 15 LLMs at Coding in One Afternoon* (Hashline, 2026.02)

---

*Last updated: 2026-04-28 — consolidated reference for ai-engine project design*

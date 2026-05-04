---
description: Run retrospective agent and directly improve agent instructions
allowed-tools: Read, Edit, Write, Bash, Task, Glob
---

# /harness:retro

Analyzes the failure patterns of this cycle and incorporates the lessons learned directly into `.harness/agents-overrides/` or the plugin agent instructions.

## Procedure

### 1. Check git working tree (optional)

Check for dirty state via `git status --porcelain`. If dirty, warn the user with `messages.dirty_warning` and stop if the answer is not `yes`.

### 2. Collect context

Read `.harness/config.json` to obtain `uiLanguage` (used for all subsequent user-facing output via the `## Messages` table below).

Read the following files (only those that exist):

- `.harness/state.json` — full failures/history
- `.harness/config.json`
- `.harness/requirements.md`
- `.harness/roadmap.md`
- `.harness/progress.md`
- `.harness/review-report.md`
- Glob `.harness/retrospectives/*.md` — past retrospectives (latest 5)

### 3. Call retrospective sub-agent

Call `Task(subagent_type: "retrospective", ...)`. Include the above context in the prompt along with the following instructions:

```
[OUTPUT LANGUAGE]
{config.uiLanguage}

The body of the retrospective report MUST be in this language. Edits you apply to
agent instruction files MUST be written in English (the canonical language of those
files). See your agent's "Output Language" section.
```

Then list the analysis directives:

- Analyze failure patterns (distribution of causes in state.failures)
- Requirements collection quality (number of requirement changes during development)
- Roadmap accuracy (estimated vs actual complexity)
- Development efficiency (repeated mistakes)
- Review effectiveness (frequency of missed Critical issues)
- Produce two artifacts:
  1. **Retrospective report** (what went well / needs improvement / lessons learned) — save to `.harness/retrospectives/<YYYY-MM-DD>.md` (date based on **local time**)
  2. **Agent instruction improvements** — apply directly via Edit tool to `.harness/agents-overrides/<agent>.md` or plugin location

### 4. Patch application policy

The retrospective agent **calls the Edit tool directly** to modify agent instructions. No separate patch DSL is used.

Edit whitelist:

- `.harness/agents-overrides/*.md` (user project local overrides)
- `docs/agent-system-prompt/base.md` (common instructions for all agents — only with explicit user consent)
- Plugin's own `agents/*.md` — only when the user explicitly agrees

Reject any attempt to modify files outside the whitelist. Never modify `.env`, `secrets/`, or arbitrary code files.

### 4-1. Post-patch integrity check

Immediately after the retrospective agent reports completion, the parent session reads each modified file and checks:

- The first line is `---` and there is a frontmatter block closed by `---`
- The frontmatter contains a `name:` field (when `agents/*.md` was modified)
- There is at least 1 line of body content after the closing `---`
- The file is not 0 bytes

If any file fails the check:

1. Print `messages.broken_files` populated with the file list
2. Suggest the `git checkout -- <file>` command to the user (do NOT run automatically)
3. Proceed with the history update but exclude broken files from the `patchesApplied` count

### 5. Update history

Update `state.json` (Edit):

- Append the following to the `history` array:
  ```json
  {
    "stage": "RETROSPECTIVE",
    "completedAt": "<ISO timestamp>",
    "patchesApplied": <number of modified files>
  }
  ```

Do not touch other fields.

### 6. Output

Print `messages.complete` populated with `<reportPath>`, `<patchCount>`, `<patchList>`.

## Safety Rules

- The retrospective agent operates as defined in `agents/retrospective.md`
- If the agent attempts to modify a file not in the whitelist, **block that action** and report to the user
- `.harness/state.json` is not directly modified by the retrospective agent (only this command appends to history)
- If a retrospective file for the same date already exists, do not overwrite — create a new `.harness/retrospectives/<YYYY-MM-DD>-<n>.md` instead

---

## Messages

Look up by `config.uiLanguage`. Substitute `{...}` placeholders before printing.

### `dirty_warning`

- **en**:
  ```
  The working tree is not clean. It is safer to land retrospective patches as a separate commit.
  Continue? (yes/no)
  ```
- **ko**:
  ```
  작업 트리가 깨끗하지 않습니다. 회고 패치는 별도 커밋으로 적용하는 편이 안전합니다.
  계속? (yes/no)
  ```

### `broken_files`

- **en**:
  ```
  Broken file(s) detected after retrospective patch:
  {fileList}
  Suggested rollback: git checkout -- <file>
  ```
- **ko**:
  ```
  회고 패치 후 손상된 파일 감지:
  {fileList}
  롤백 제안: git checkout -- <file>
  ```

### `complete`

- **en**:
  ```
  Retrospective complete
  Report:          {reportPath}
  Patches applied: {patchCount}
  {patchList}
  ```
- **ko**:
  ```
  회고 완료
  보고서:        {reportPath}
  적용된 패치:   {patchCount}
  {patchList}
  ```

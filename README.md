<h1 align="center">
  h u s t l e
  <br>
  <sub>better work from claude code, with teams of agents</sub>
</h1>

A single agent fails on large or difficult work in four predictable ways. It stops before the work is done. It grades its own work and misses its own flaws. Its context fills up and degrades over a long job. It commits to its first idea. Google's Antigravity addresses these failures with teams of agents that divide the work and check each other. Google's terms prohibit driving Antigravity from Claude Code. Hustle rebuilds the same patterns inside Claude Code instead.

Four saved workflows, one skill, one optional agent, one optional hook. Plain files. No runtime and no server.

---

## The failures and the fixes

| Failure | Fix | Tool |
|---|---|---|
| Stops too early | A separate judge decides when the work is done | `/goal` (built into Claude Code) |
| Grades its own work | Fresh agents try to break the result | `/boost`, `/deep-review` |
| Context fills up and degrades | The work is split; each agent starts with a clean context | dynamic workflows and agent teams (built into Claude Code), `/teamwork` |
| Commits to its first idea | Rival ideas compete | `/design-panel` |

`/goal`, dynamic workflows, and agent teams ship with Claude Code. This repo adds the rest. Each added command is a saved dynamic workflow: a script that coordinates subagents in the background and returns one result.

---

## When to reach for each

| The work is | Reach for | Example |
|---|---|---|
| One task with a finish line a command can check | `/goal` | A framework upgrade, until the test suite passes |
| Many items, a loop until a check passes, or a process worth scripting | a dynamic workflow | Every API endpoint checked for a missing permission check |
| A few large pieces built in parallel, which you may want to redirect | an agent team | Models, screens, and specs for one feature at once |
| Days long, with milestones | `/scope`, then `/teamwork` | A prototype taken to production over two weeks |
| One hard bug | `/boost` | A payment charged twice about once a week |
| A choice that would be costly to undo | `/design-panel` | How to keep each customer's data separate |
| A document about to go out | `/deep-review` | A proposal or spec before the client sees it |

---

## Commands

### `/boost`

One agent finds the root cause, writes the fix, and runs the tests. Then fresh agents attack the fix one round at a time. Each is told the change is wrong until proven otherwise; each fixes what it finds and reruns the tests. The run stops after two clean rounds in a row, or after six rounds. A final agent reruns the tests itself and checks every requirement.

```
Run /boost on: the duplicate-charge bug in the payment job
```

Use it when a problem is hard rather than broad. Broad work belongs in an ordinary workflow.

### `/deep-review`

Four reviewers read a document, each from one angle: facts, logic, what is missing, and where a reader stalls. A skeptic then tries to refute every finding. Only findings that survive are reported, ranked by severity.

```
Run /deep-review on proposal.md
```

### `/design-panel`

Three agents propose rival answers to a design question: the simplest design that works, the safest, and the easiest to change later. A falsifier attacks each proposal. A final agent picks the strongest proposal with no fatal objection, borrows the best ideas from the others, and lists the risks that remain.

```
Run /design-panel on: how to keep each customer's data separate
```

### `/scope` and `/teamwork`

`/scope` interviews you one question at a time and writes `SPEC.md`: the goal, the requirements, a command that proves each requirement, acceptance criteria, off-limits shortcuts, and an ordered list of milestones.

`/teamwork` builds one milestone per run:

1. **Plan.** A fresh agent reads `SPEC.md`, `PROGRESS.md`, and `PITFALLS.md`, picks the next milestone, and splits it into tracks. No file belongs to two tracks.
2. **Build.** One worker per track, in parallel. Each edits only its own files.
3. **Check.** A critic reviews the code. A challenger writes adversarial tests. An auditor reruns every command the workers claim to have run.
4. **Record.** The result and its problems go to `PROGRESS.md`. Mistakes likely to recur go to `PITFALLS.md` as rules for future workers.

You review the result between runs. A failed milestone is retried on the next run, with its recorded problems in the plan. When every milestone has passed, the next run performs a final check against every acceptance criterion.

```
/scope a client portal for invoices and payments
/teamwork
```

### Agent team extras

Claude Code's agent teams run several sessions at once that message each other. Each teammate appears in a panel under your prompt; select one to read its work and message it. Two optional extras add the discipline of Google's `/swarm`:

- **`verifier`** — an agent that reads diffs, runs the tests, and reports failures to the teammate responsible. It never edits code.
- **`require-green-tests.sh`** — a `TaskCompleted` hook that blocks a teammate from marking a task complete while the project's tests fail.

```
Spawn three teammates and a verifier. @data owns the database schema and models. @ui owns the screens. @tests owns the test directory.
```

---

## Install

Requires Claude Code with dynamic workflows available (any paid plan; on Pro, turn on Dynamic workflows in `/config`). The hook additionally requires `bash` and `jq`.

Ask Claude Code to install this repo:

```
Install https://github.com/bioneural/hustle by following the instructions in its README.
```

### Instructions for Claude Code

Follow these steps exactly. Do not overwrite an existing file without asking the user first.

1. Clone the repository to a temporary directory:

   ```bash
   HUSTLE_SRC="$(mktemp -d)/hustle"
   git clone --depth 1 https://github.com/bioneural/hustle.git "$HUSTLE_SRC"
   ```

2. Install the workflows and the skill:

   ```bash
   mkdir -p ~/.claude/workflows ~/.claude/skills
   cp -n "$HUSTLE_SRC"/workflows/*.js ~/.claude/workflows/
   cp -Rn "$HUSTLE_SRC"/skills/scope ~/.claude/skills/
   ```

   `cp -n` skips files that already exist. If any target file already existed, list it and ask the user whether to replace it.

3. Ask the user whether they want the agent team extras. If not, skip to step 6.

4. Install the verifier agent and the hook:

   ```bash
   mkdir -p ~/.claude/agents ~/.claude/hooks
   cp -n "$HUSTLE_SRC"/agents/verifier.md ~/.claude/agents/
   cp -n "$HUSTLE_SRC"/hooks/require-green-tests.sh ~/.claude/hooks/
   chmod +x ~/.claude/hooks/require-green-tests.sh
   ```

5. Merge the following into `~/.claude/settings.json`. Read the file first and preserve every existing key; add to existing `env` and `hooks` objects rather than replacing them. Create the file if it does not exist.

   ```json
   {
     "env": {
       "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
     },
     "hooks": {
       "TaskCompleted": [
         {
           "hooks": [
             { "type": "command", "command": "$HOME/.claude/hooks/require-green-tests.sh" }
           ]
         }
       ]
     }
   }
   ```

   Tell the user that the hook gates nothing until a project sets its test command in that project's `.claude/settings.json`. Use the project's own command, such as `npm test`, `pytest`, or `go test ./...`:

   ```json
   { "env": { "HUSTLE_TEST_COMMAND": "npm test" } }
   ```

6. Verify. Confirm these files exist: `~/.claude/workflows/boost.js`, `deep-review.js`, `design-panel.js`, `teamwork.js`, and `~/.claude/skills/scope/SKILL.md`.

7. Remove the temporary clone, then tell the user to run `/reload-skills` or restart Claude Code. The new commands are `/boost`, `/deep-review`, `/design-panel`, `/scope`, and `/teamwork`.

---

## Cost

Every agent draws on your plan's usage. A workflow that runs twenty agents costs roughly what twenty conversations cost. Agent teams cost more than either, because each teammate is a full session. Try each command on a small task first. `/workflows` shows each agent's token use while a run is in progress, and a run can be stopped there without losing completed work.

---

## Constraints

Hustle does not use Antigravity, Gemini, or any Google service. It reproduces published patterns with Claude Code's own primitives.

It does not reproduce Google's results. The patterns are the same; the models, the scale, and the tuning are not.

Checks reduce false completion reports. They do not eliminate them. An auditor that reruns commands is more reliable than one that reads reports, but it is still an agent.

Agent teams are an experimental Claude Code feature. Their behavior may change.

---

## Origin

- [Advancing science and engineering with Antigravity's /teamwork](https://research.google/blog/advancing-science-engineering-with-antigravitys-teamwork-feature/) — Google Research, November 2026.
- [Teamwork: when AI becomes a research partner](https://antigravity.google/blog/teamwork-when-ai-becomes-a-research-partner) — Antigravity blog, August 2026.
- Antigravity documentation for [/boost](https://antigravity.google/docs/boost), [/swarm](https://antigravity.google/docs/swarm), and [/teamwork](https://antigravity.google/docs/teamwork).
- Claude Code documentation for [dynamic workflows](https://code.claude.com/docs/en/workflows), [agent teams](https://code.claude.com/docs/en/agent-teams), and [/goal](https://code.claude.com/docs/en/goal).

| Hustle | Google pattern |
|---|---|
| `/boost` | `/boost` |
| `/deep-review` | Deep Review |
| `/design-panel` | Long Proof |
| `/scope`, `/teamwork` | `/teamwork` |
| agent team extras | `/swarm` |

---

## Contents

| Path | Function |
|---|---|
| `workflows/boost.js` | Fix, then rounds of fresh attackers, then verification |
| `workflows/deep-review.js` | Four reviewers by angle; a skeptic refutes each finding |
| `workflows/design-panel.js` | Rival designs, each attacked, then a decision |
| `workflows/teamwork.js` | One milestone per run: plan, build, check, record |
| `skills/scope/SKILL.md` | Interview that writes `SPEC.md` |
| `agents/verifier.md` | Optional verifier for agent teams |
| `hooks/require-green-tests.sh` | Optional `TaskCompleted` hook that blocks completion while tests fail |
| `README.md` | This document |

---

## License

[MIT](LICENSE) © 2026 Fort Asset LLC, a Washington limited liability company.

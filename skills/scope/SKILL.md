---
name: scope
description: Interview the user one question at a time and write SPEC.md for a multi-day project, with a check for every requirement. Run before /teamwork.
argument-hint: "[what you want built]"
disable-model-invocation: true
---

# scope

Write `SPEC.md` for a project that will be built milestone by milestone with `/teamwork`. The spec states what, not how. Every requirement carries a check that proves it.

## Interview

Ask one question at a time. Offer a suggested answer with each question. Wait for the reply before asking the next. Read the repository first, so suggestions reflect the existing code.

Cover these, in order:

1. **Goal.** What is being built, for whom, and why. Production, demo, or exploration.
2. **Requirements.** Only what the user cares about. Each one short and concrete.
3. **Checks.** For each requirement, the exact command or measurable result that proves it holds: a test command, a benchmark with a threshold, a URL that must return a status code. A requirement without a check is not finished.
4. **Acceptance criteria.** The conditions under which the whole project is done.
5. **Off-limits shortcuts.** Choose one mode:
   - `development`: libraries and frameworks allowed. Only faked output and facade implementations are forbidden.
   - `demo`: additionally, no copying core logic from open source, and no reading test source to reverse-engineer expected answers.
   - `benchmark`: a from-scratch implementation using only the language standard library.
   Add any project-specific prohibitions.
6. **Milestones.** An ordered list. Each milestone is independently verifiable and names the requirements it satisfies.

Stop asking when every section is complete. Do not ask about implementation details the user has not raised.

## Output

Show the full draft. Apply corrections. On approval, write these files at the repository root:

`SPEC.md`:

```markdown
# <project name>

## Goal
<goal, audience, purpose>

## Requirements
| # | Requirement | Check |
|---|---|---|
| R1 | <requirement> | <exact command or measurable result> |

## Acceptance criteria
- <criterion>

## Off-limits shortcuts
Mode: <development | demo | benchmark>
- <project-specific prohibition>

## Milestones
1. <milestone> — satisfies R1, R2
```

`PROGRESS.md`, if it does not already exist:

```markdown
# Progress

No milestones attempted yet.
```

`PITFALLS.md`, if it does not already exist:

```markdown
# Pitfalls

Rules learned from failed milestones. Every worker reads this file first.
```

Then tell the user the next step: run `/teamwork` to build the first milestone, and review the result before running it again.

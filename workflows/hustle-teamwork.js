export const meta = {
  name: 'hustle-teamwork',
  description: 'Run the next milestone of SPEC.md: a fresh planner, workers that own separate files, three independent checks, then record the result',
  whenToUse: 'A multi-day project with milestones. Run /hustle-scope first to write SPEC.md, then run /hustle-teamwork once per milestone and review between runs.',
  phases: [
    { title: 'Plan', detail: 'a fresh agent picks the next milestone and splits it into tracks' },
    { title: 'Build', detail: 'one worker per track, each owning its own files' },
    { title: 'Check', detail: 'file ownership compared with git, then a critic, a challenger, and an auditor' },
    { title: 'Record', detail: 'the result is appended to PROGRESS.md; recurring mistakes go to PITFALLS.md' },
  ],
}

// MIT License — Copyright (c) 2026 Fort Asset LLC

const SPEC = (args && typeof args === 'object' && args.spec) || 'SPEC.md'
const PROGRESS = 'PROGRESS.md'
const PITFALLS = 'PITFALLS.md'

const PLAN = {
  type: 'object',
  required: ['status', 'milestone', 'tracks', 'note'],
  properties: {
    status: { type: 'string', enum: ['next', 'all_done', 'blocked'] },
    milestone: { type: 'string' },
    tracks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'files', 'task'],
        properties: {
          name: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          task: { type: 'string' },
        },
      },
    },
    note: { type: 'string' },
  },
}

const GATE = {
  type: 'object',
  required: ['pass', 'problems'],
  properties: {
    pass: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' } },
  },
}

// The script cannot run git itself, so an agent runs one fixed command and reports its output.
// The script, not the agent, compares the two snapshots with the plan.
const SNAPSHOT = {
  type: 'object',
  required: ['head', 'files'],
  properties: {
    head: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'hash'],
        properties: {
          path: { type: 'string' },
          hash: { type: 'string' },
        },
      },
    },
  },
}

const snapshot = (label, phaseTitle) =>
  agent(
    `Run this exact command and report its output. Do not run anything else and do not edit any files.

cd "$(git rev-parse --show-toplevel)" && { git rev-parse --verify -q HEAD || echo none; } && { git -c core.quotePath=false diff --name-only HEAD 2>/dev/null; git -c core.quotePath=false ls-files --others --exclude-standard; } | sort -u | while IFS= read -r f; do if [ -f "$f" ]; then printf '%s %s\\n' "$(git hash-object -- "$f" | cut -c1-12)" "$f"; else printf 'deleted %s\\n' "$f"; fi; done

The first line of output is head. Every later line is one file: the first word is its hash and the rest of the line is its path. Copy each exactly. If there are no later lines, files is empty.`,
    { schema: SNAPSHOT, label, phase: phaseTitle, effort: 'low' },
  )

const clean = (path) => path.replace(/^\.\//, '')

phase('Plan')
const plan = await agent(
  `Plan the next milestone of a project.

Read ${SPEC}, ${PROGRESS} (it may not exist yet), and ${PITFALLS} (it may not exist yet).
- If ${SPEC} does not exist, set status to "blocked" and say so in note.
Each attempt is recorded in ${PROGRESS} as an entry headed "## <milestone>" with a line "Result: PASSED" or "Result: FAILED". A milestone has passed only if its last entry says "Result: PASSED".
- If every milestone in ${SPEC} has passed, set status to "all_done".
- Otherwise set status to "next". Pick the first milestone not yet passed and name it exactly as ${SPEC} lists it. If its last attempt failed, the plan must address the recorded problems.

Split the milestone into tracks. Each track lists every file it may create or edit, as a path relative to the repository root. No file may appear in two tracks. Keep tracks few and substantial.
Do not edit any files.`,
  { schema: PLAN, label: 'plan' },
)
if (!plan) throw new Error('The planner did not return a result. Nothing was built.')

if (plan.status === 'next') {
  const owners = new Map()
  const shared = []
  for (const t of plan.tracks) {
    for (const f of t.files) {
      const path = clean(f)
      if (owners.has(path) && owners.get(path) !== t.name) shared.push(`${path} (${owners.get(path)}, ${t.name})`)
      owners.set(path, t.name)
    }
  }
  if (!plan.tracks.length) {
    plan.status = 'blocked'
    plan.note = 'The planner returned no tracks.'
  } else if (shared.length) {
    plan.status = 'blocked'
    plan.note = `The plan gave files to more than one track: ${shared.join('; ')}. Run /hustle-teamwork again.`
  }
}

if (plan.status === 'blocked') {
  log(`Blocked: ${plan.note}`)
  return { status: 'blocked', note: plan.note }
}

if (plan.status === 'all_done') {
  phase('Check')
  const final = await agent(
    `Every milestone in ${SPEC} is recorded as passed. Perform the final check.
Rerun every acceptance criterion and every verification command in ${SPEC} yourself. Do not trust ${PROGRESS}.
Fail on anything that does not hold. Do not edit any files.`,
    { schema: GATE, label: 'final check' },
  )
  if (!final) return { status: 'final check did not return', problems: [] }
  return { status: final.pass ? 'complete' : 'final check failed', problems: final.problems }
}

phase('Build')
const before = await snapshot('snapshot before build', 'Build')
if (before && before.files.length) {
  log(`${before.files.length} file(s) already had uncommitted changes before this milestone. Commit between runs to keep milestones apart.`)
}
const reports = await parallel(
  plan.tracks.map((t) => () =>
    agent(
      `You are one worker on milestone "${plan.milestone}" of the project described in ${SPEC}. Read ${SPEC} and ${PITFALLS} first.

You own only these files: ${t.files.join(', ')}
Do not create or edit any other file. Other workers are editing other files at the same time.

Your task: ${t.task}

Write unit tests for your work. Run only your own tests, not the whole suite, so you do not collide with other workers.
Respect every off-limits shortcut listed in ${SPEC}.
Report what you built and every command you ran with its real output.`,
      { label: t.name, phase: 'Build' },
    ),
  ),
)

phase('Check')
const after = await snapshot('snapshot after build', 'Check')

// File ownership, decided here from the two snapshots.
const owned = new Set(plan.tracks.flatMap((t) => t.files).map(clean))
const ownership = []
let changed = null
if (!before || !after) {
  ownership.push('The file ownership check did not run: a git snapshot did not return.')
} else if (before.head !== after.head) {
  ownership.push(`HEAD moved during the build (${before.head} to ${after.head}), so file ownership could not be checked. Workers must not commit or switch branches.`)
} else {
  const was = new Map(before.files.map((f) => [clean(f.path), f.hash]))
  const now = new Map(after.files.map((f) => [clean(f.path), f.hash]))
  changed = [...new Set([...was.keys(), ...now.keys()])].filter((p) => was.get(p) !== now.get(p)).sort()
  for (const p of changed) {
    if (!owned.has(p)) ownership.push(`${p} changed during the build but belongs to no track.`)
  }
}
if (ownership.length) log(`File ownership: ${ownership.length} problem(s)`)

const scope = changed
  ? `The workers changed these files in this run: ${changed.join(', ') || 'none'}. Inspect those changes with git. Uncommitted changes to any other file predate this milestone.`
  : 'Inspect the current uncommitted changes with git.'
const ctx = `Milestone: "${plan.milestone}". Read ${SPEC}, including its acceptance criteria and off-limits shortcuts. ${scope}`
const gates = await parallel([
  () =>
    agent(
      `CRITIC. ${ctx}
Review the code for correctness, completeness, robustness, and fit with the existing interfaces. Do not edit any files.`,
      { schema: GATE, label: 'critic', phase: 'Check' },
    ),
  () =>
    agent(
      `CHALLENGER. ${ctx}
Write adversarial tests for this milestone: edge cases, failure paths, worst-case inputs. Put them in a new file or folder named "adversarial" inside the project's existing test directory. Do not modify source code. Run your tests and report each failure as a problem.`,
      { schema: GATE, label: 'challenger', phase: 'Check' },
    ),
  () =>
    agent(
      `AUDITOR. ${ctx}
Worker reports:
${reports.filter(Boolean).join('\n---\n')}

Rerun every command the workers claim to have run and compare the output. Fail on any mismatch, any mocked or skipped test passed off as real, any facade implementation, and any off-limits shortcut. Do not edit any files.`,
      { schema: GATE, label: 'auditor', phase: 'Check' },
    ),
])

const results = gates.filter(Boolean)
const problems = [...ownership, ...results.flatMap((g) => g.problems)]
const passed = !ownership.length && results.length === 3 && results.every((g) => g.pass)
if (results.length < 3) log(`${3 - results.length} check(s) did not return; the milestone is recorded as failed.`)

// The script writes the entry; the agent only appends it. The planner reads the Result line.
const entry = `## ${plan.milestone}
Result: ${passed ? 'PASSED' : 'FAILED'}
Problems:
${problems.length ? problems.map((p) => `- ${p.replace(/\s*\n\s*/g, ' ')}`).join('\n') : '- none'}`

phase('Record')
await agent(
  `Append the entry below to the end of ${PROGRESS}, exactly as written. Create the file if it does not exist. Do not reword the entry and do not change earlier entries.

${entry}

Then update ${PITFALLS}: add any problem that reflects a mistake likely to recur, phrased as a rule for future workers. Create the file if it does not exist. Edit only ${PROGRESS} and ${PITFALLS}.`,
  { label: 'record', phase: 'Record' },
)

return { status: passed ? 'milestone passed' : 'milestone failed', milestone: plan.milestone, problems, record: entry }

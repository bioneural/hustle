export const meta = {
  name: 'teamwork',
  description: 'Run the next milestone of SPEC.md: a fresh planner, workers that own separate files, three independent checks, then record the result',
  whenToUse: 'A multi-day project with milestones. Run /scope first to write SPEC.md, then run /teamwork once per milestone and review between runs.',
  phases: [
    { title: 'Plan', detail: 'a fresh agent picks the next milestone and splits it into tracks' },
    { title: 'Build', detail: 'one worker per track, each owning its own files' },
    { title: 'Check', detail: 'a critic, a challenger, and an auditor' },
    { title: 'Record', detail: 'progress and recurring mistakes are written down' },
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

phase('Plan')
const plan = await agent(
  `Plan the next milestone of a project.

Read ${SPEC}, ${PROGRESS} (it may not exist yet), and ${PITFALLS} (it may not exist yet).
- If ${SPEC} does not exist, set status to "blocked" and say so in note.
- If every milestone in ${SPEC} is recorded as passed in ${PROGRESS}, set status to "all_done".
- Otherwise set status to "next". Pick the first milestone not yet passed. If its last attempt failed, the plan must address the recorded problems.

Split the milestone into tracks. Each track lists every file it may create or edit. No file may appear in two tracks. Keep tracks few and substantial.
Do not edit any files.`,
  { schema: PLAN, label: 'plan' },
)

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
  return { status: final.pass ? 'complete' : 'final check failed', problems: final.problems }
}

phase('Build')
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
const ctx = `Milestone: "${plan.milestone}". Read ${SPEC}, including its acceptance criteria and off-limits shortcuts, and inspect the current uncommitted changes with git.`
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
const problems = results.flatMap((g) => g.problems)
const passed = results.length === 3 && results.every((g) => g.pass)
if (results.length < 3) log(`${3 - results.length} check(s) did not return; the milestone is recorded as failed.`)

phase('Record')
await agent(
  `Update ${PROGRESS} for milestone "${plan.milestone}". Create the file if it does not exist.
Result: ${passed ? 'PASSED' : 'FAILED'}
Problems to fix on the next run:
${problems.length ? problems.map((p) => `- ${p}`).join('\n') : '- none'}

Then update ${PITFALLS}: add any problem that reflects a mistake likely to recur, phrased as a rule for future workers. Create the file if it does not exist. Edit only ${PROGRESS} and ${PITFALLS}.`,
  { label: 'record', phase: 'Record' },
)

return { status: passed ? 'milestone passed' : 'milestone failed', milestone: plan.milestone, problems }

export const meta = {
  name: 'boost',
  description: 'Fix one hard bug, then have fresh agents attack the fix in rounds until two rounds in a row find nothing',
  whenToUse: 'One hard, tangled problem: a race condition, an intermittent failure, a delicate refactor. Not broad work.',
  phases: [
    { title: 'Fix', detail: 'one agent finds the root cause, writes the fix, runs the tests' },
    { title: 'Attack', detail: 'fresh agents try to break the fix, one round at a time' },
    { title: 'Verify', detail: 'one agent reruns the tests and checks each requirement' },
  ],
}

// MIT License — Copyright (c) 2026 Fort Asset LLC

const task = typeof args === 'string' ? args : args && args.task
if (!task) {
  throw new Error('boost needs a task. Example: Run /boost on: the duplicate-charge bug in ChargeInvoiceJob')
}
const MAX_ROUNDS = (args && typeof args === 'object' && args.maxRounds) || 6
const CLEAN_ROUNDS_TO_STOP = 2

const FIX = {
  type: 'object',
  required: ['requirements', 'summary'],
  properties: {
    requirements: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const ROUND = {
  type: 'object',
  required: ['flaws', 'summary'],
  properties: {
    flaws: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['passed', 'requirements'],
  properties: {
    passed: { type: 'boolean' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['requirement', 'passed', 'evidence'],
        properties: {
          requirement: { type: 'string' },
          passed: { type: 'boolean' },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

phase('Fix')
const fix = await agent(
  `Task: ${task}

1. Investigate until you understand the root cause. Do not guess.
2. List the requirements a correct fix must meet: the ones the task states and the ones the code implies.
3. Implement the fix. Add or update tests that would have caught the bug.
4. Run the relevant tests.

Report the requirements, what you changed, and every command you ran with its real output.`,
  { schema: FIX, label: 'fix' },
)

phase('Attack')
let summary = fix.summary
let clean = 0
let round = 0
let flawsFound = 0
while (clean < CLEAN_ROUNDS_TO_STOP && round < MAX_ROUNDS) {
  round++
  const r = await agent(
    `You did not write the change described below. Assume it is wrong until you prove otherwise.

Task: ${task}
Requirements:
${fix.requirements.map((q) => `- ${q}`).join('\n')}

Current state of the change:
${summary}

Attack it. Look for edge cases, concurrency problems, failure paths, worst-case inputs, and requirements it does not meet. Read the actual diff and code; do not trust the summary.
For every real flaw: fix it, then rerun the tests.
Report each flaw you found (an empty list if none), and an updated summary of the change including every command you ran with its real output.`,
    { schema: ROUND, label: `attack ${round}` },
  )
  if (r.flaws.length) {
    clean = 0
    flawsFound += r.flaws.length
    summary = r.summary
  } else {
    clean++
  }
  log(`Round ${round}: ${r.flaws.length} flaw(s) found`)
}
if (clean < CLEAN_ROUNDS_TO_STOP) {
  log(`Stopped at the ${MAX_ROUNDS}-round limit before two clean rounds in a row. Treat the result with caution.`)
}

phase('Verify')
const verdict = await agent(
  `Verify a bug fix. Do not trust earlier reports: rerun the tests yourself and read the code.

Task: ${task}
Check each requirement and give pass or fail with evidence from real command output or code:
${fix.requirements.map((q) => `- ${q}`).join('\n')}

Do not edit any files.`,
  { schema: VERDICT, label: 'verify' },
)

return { task, rounds: round, flawsFound, stoppedClean: clean >= CLEAN_ROUNDS_TO_STOP, verdict }

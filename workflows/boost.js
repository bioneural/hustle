export const meta = {
  name: 'boost',
  description: 'Fix one hard bug, then have fresh agents attack the fix in rounds until two rounds in a row find nothing',
  whenToUse: 'One hard, tangled problem: a race condition, an intermittent failure, a delicate refactor. Not broad work.',
  phases: [
    { title: 'Fix', detail: 'one agent finds the root cause, writes the fix, runs the tests' },
    { title: 'Attack', detail: 'fresh agents try to break the fix, one round at a time' },
    { title: 'Verify', detail: 'one agent reruns the tests and checks the task and each requirement; a failure reopens the attack' },
  ],
}

// MIT License — Copyright (c) 2026 Fort Asset LLC

// Claude may pass input as a string or as an object; accept either.
const input = (keys) => {
  if (typeof args === 'string') return args.trim() || undefined
  if (!args || typeof args !== 'object') return undefined
  const named = keys.map((k) => args[k]).find((v) => typeof v === 'string' && v.trim())
  return named || Object.values(args).find((v) => typeof v === 'string' && v.trim())
}
const task = input(['task', 'bug', 'problem'])
if (!task) {
  throw new Error('boost needs a task. Example: Run /boost on: the duplicate-charge bug in the payment job')
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
  required: ['taskSolved', 'taskEvidence', 'requirements'],
  properties: {
    taskSolved: { type: 'boolean' },
    taskEvidence: { type: 'string' },
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
if (!fix) throw new Error('The fix agent did not return a result. Nothing was attacked or verified.')

let summary = fix.summary
let clean = 0
let round = 0
let flawsFound = 0
let verdict = null
let verified = false
while (true) {
  while (clean < CLEAN_ROUNDS_TO_STOP && round < MAX_ROUNDS) {
    round++
    const r = await agent(
      `You did not write the change described below. Assume it is wrong until you prove otherwise.

Task: ${task}
Requirements, as listed by the agent that wrote the first fix. Check them against the task; a requirement the task implies but the list omits is a flaw.
${fix.requirements.map((q) => `- ${q}`).join('\n')}

Current state of the change:
${summary}

Attack it. Look for edge cases, concurrency problems, failure paths, worst-case inputs, and requirements it does not meet. Read the actual diff and code; do not trust the summary.
For every real flaw: fix it, then rerun the tests.
Report each flaw you found (an empty list if none), and an updated summary of the change including every command you ran with its real output.`,
      { schema: ROUND, label: `attack ${round}`, phase: 'Attack' },
    )
    if (!r) {
      log(`Round ${round} did not return. Stopping the attack early.`)
      break
    }
    if (r.flaws.length) {
      clean = 0
      flawsFound += r.flaws.length
      summary = r.summary
    } else {
      clean++
    }
    log(`Round ${round}: ${r.flaws.length} flaw(s) found`)
  }
  if (clean < CLEAN_ROUNDS_TO_STOP && round >= MAX_ROUNDS) {
    log(`Stopped at the ${MAX_ROUNDS}-round limit before two clean rounds in a row. Treat the result with caution.`)
  }

  verdict = await agent(
    `Verify a bug fix. Do not trust earlier reports: rerun the tests yourself and read the code.

Task: ${task}
First judge the task itself, apart from the list below: does the change solve it? The list was written by the agent that wrote the fix and may be incomplete.
Then check each requirement and give pass or fail with evidence from real command output or code:
${fix.requirements.map((q) => `- ${q}`).join('\n')}

Do not edit any files.`,
    { schema: VERDICT, label: 'verify', phase: 'Verify' },
  )
  if (!verdict) break

  // The script decides the result from the verifier's per-item answers.
  const failures = verdict.requirements.filter((q) => !q.passed).map((q) => `${q.requirement}: ${q.evidence}`)
  if (!verdict.taskSolved) failures.unshift(`The task itself is not solved: ${verdict.taskEvidence}`)
  if (verdict.requirements.length < fix.requirements.length) {
    failures.push(`The verifier checked ${verdict.requirements.length} of ${fix.requirements.length} requirements.`)
  }
  verified = failures.length === 0
  if (verified || round >= MAX_ROUNDS) break

  log(`Verification failed on ${failures.length} point(s). Reopening the attack.`)
  summary = `${summary}

An independent verifier then failed the change on these points:
${failures.map((f) => `- ${f}`).join('\n')}`
  clean = 0
}

const status = verified ? 'verified' : verdict ? 'failed verification' : 'not verified'
return { task, status, rounds: round, flawsFound, stoppedClean: clean >= CLEAN_ROUNDS_TO_STOP, verdict }

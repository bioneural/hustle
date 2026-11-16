export const meta = {
  name: 'design-panel',
  description: 'Draft rival answers to a design question, have a falsifier attack each one, then pick the strongest and borrow the best of the rest',
  whenToUse: 'A choice that would be costly to undo: data separation between customers, where background jobs run, how billing is built.',
  phases: [
    { title: 'Propose', detail: 'three rival designs from different angles' },
    { title: 'Attack', detail: 'a falsifier tries to break each design' },
    { title: 'Decide', detail: 'the strongest survives and borrows the best ideas' },
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
const question = input(['question', 'topic'])
if (!question) {
  throw new Error('design-panel needs a question. Example: Run /design-panel on: how to keep each customer\'s data separate')
}
const context = (args && typeof args === 'object' && args.context) || ''

const ANGLES = [
  { key: 'simplest', prompt: 'the simplest design that fully works' },
  { key: 'safest', prompt: 'the design with the lowest risk of failure, data loss, or security exposure' },
  { key: 'flexible', prompt: 'the design that is easiest to change later as requirements grow' },
]

const PROPOSAL = {
  type: 'object',
  required: ['name', 'design', 'tradeoffs'],
  properties: {
    name: { type: 'string' },
    design: { type: 'string' },
    tradeoffs: { type: 'string' },
  },
}

const ATTACK = {
  type: 'object',
  required: ['fatal', 'objections'],
  properties: {
    fatal: { type: 'boolean' },
    objections: { type: 'array', items: { type: 'string' } },
  },
}

const DECISION = {
  type: 'object',
  required: ['choice', 'why', 'borrowed', 'risks', 'nextSteps'],
  properties: {
    choice: { type: 'string' },
    why: { type: 'string' },
    borrowed: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
}

const contested = await pipeline(
  ANGLES,
  (angle) =>
    agent(
      `Design question: ${question}
${context ? `Context: ${context}\n` : ''}
Read the relevant code and docs in this repository first. Then propose ${angle.prompt}.
Describe the design concretely enough to build from, and state its tradeoffs honestly. Do not edit any files.`,
      { schema: PROPOSAL, label: `propose: ${angle.key}`, phase: 'Propose' },
    ),
  (proposal, angle) =>
    agent(
      `Your only job is to break this design. Read the relevant code in this repository.

Design question: ${question}
Proposed design (${proposal.name}): ${proposal.design}
Stated tradeoffs: ${proposal.tradeoffs}

List every serious objection: failure modes, hidden costs, migration pain, security exposure, ways it conflicts with the existing code. Set fatal to true only if an objection rules the design out. Do not edit any files.`,
      { schema: ATTACK, label: `attack: ${angle.key}`, phase: 'Attack' },
    ).then((attack) => ({ angle: angle.key, proposal, attack })),
)

const entries = contested.filter(Boolean)
const decision = await agent(
  `Decide a design question from the rival proposals and the objections raised against each.

Design question: ${question}

${entries
  .map(
    (e) => `## ${e.proposal.name} (${e.angle})
Design: ${e.proposal.design}
Tradeoffs: ${e.proposal.tradeoffs}
Fatal objection found: ${e.attack.fatal}
Objections:
${e.attack.objections.map((o) => `- ${o}`).join('\n')}`,
  )
  .join('\n\n')}

Pick the strongest design that has no fatal objection. Borrow specific ideas from the others where they fix its weaknesses. List the objections that still apply as risks. Do not edit any files.`,
  { schema: DECISION, label: 'decide', phase: 'Decide' },
)

return {
  question,
  decision,
  considered: entries.map((e) => ({ name: e.proposal.name, angle: e.angle, fatal: e.attack.fatal })),
}

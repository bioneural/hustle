export const meta = {
  name: 'deep-review',
  description: 'Review a document from four angles, then have a skeptic try to refute every finding; report only the survivors',
  whenToUse: 'A proposal, spec, design doc, or essay is about to go out.',
  phases: [
    { title: 'Review', detail: 'four reviewers, one angle each' },
    { title: 'Refute', detail: 'a skeptic tries to refute each finding' },
  ],
}

// MIT License — Copyright (c) 2026 Fort Asset LLC

const doc = typeof args === 'string' ? args : args && args.path
if (!doc) {
  throw new Error('deep-review needs a document path. Example: Run /deep-review on proposal.md')
}

const LENSES = [
  {
    key: 'facts',
    prompt: 'Find claims that are wrong, unsupported, or stated more strongly than the evidence allows. Check numbers, names, dates, and anything that can be verified against the repository or the cited sources.',
  },
  {
    key: 'logic',
    prompt: 'Find reasoning gaps: conclusions that do not follow, contradictions between sections, and steps the reader must supply on their own.',
  },
  {
    key: 'missing',
    prompt: 'Find what a reader needs that is absent: undefined terms, requirements with no way to verify them, promised work with no cost or owner, timelines that do not fit the scope.',
  },
  {
    key: 'clarity',
    prompt: 'Find where a reader stalls: references to things never introduced, pronouns with unclear antecedents, jargon, buried main points, sentences that need rereading.',
  },
]

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['quote', 'problem', 'severity', 'fix'],
        properties: {
          quote: { type: 'string' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

const reviewed = await pipeline(
  LENSES,
  (lens) =>
    agent(
      `Review the document at ${doc}. Read all of it first.

Your angle: ${lens.prompt}

Stay on your angle. For each finding, quote the exact text, state the problem, rate its severity, and propose a fix. Report nothing you are unsure is real. Do not edit any files.`,
      { schema: FINDINGS, label: `review: ${lens.key}`, phase: 'Review' },
    ),
  (result, lens) =>
    parallel(
      result.findings.map((f) => () =>
        agent(
          `A reviewer reported a problem in ${doc}. Try to refute it. Read the document and any sources it cites.

Quoted text: ${f.quote}
Reported problem: ${f.problem}

The finding is refuted if the problem is not real, is already addressed elsewhere in the document, or is a matter of taste rather than a defect. If you are uncertain, set refuted to true. Do not edit any files.`,
          { schema: VERDICT, label: `refute: ${lens.key}`, phase: 'Refute' },
        ).then((v) => ({ ...f, lens: lens.key, verdict: v })),
      ),
    ),
)

const all = reviewed.filter(Boolean).flat().filter(Boolean)
const RANK = { high: 0, medium: 1, low: 2 }
const survivors = all.filter((f) => f.verdict && !f.verdict.refuted).sort((a, b) => RANK[a.severity] - RANK[b.severity])
log(`${all.length} finding(s) reported, ${all.length - survivors.length} refuted, ${survivors.length} kept`)

return {
  document: doc,
  findings: survivors.map((f) => ({ severity: f.severity, lens: f.lens, quote: f.quote, problem: f.problem, fix: f.fix })),
}

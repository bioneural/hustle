export const meta = {
  name: 'hustle-deep-review',
  description: 'Review a document from four angles, then have a skeptic try to refute every finding; report only the survivors',
  whenToUse: 'A proposal, spec, design doc, or essay is about to go out.',
  phases: [
    { title: 'Review', detail: 'four reviewers, one angle each' },
    { title: 'Refute', detail: 'a skeptic tries to refute each merged finding' },
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
const doc = input(['path', 'file', 'document'])
if (!doc) {
  throw new Error('hustle-deep-review needs a document path. Example: Run /hustle-deep-review on proposal.md')
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
    prompt: 'Find what a reader needs that is absent: undefined terms, requirements with no way to verify them, promised work with no cost or owner, timelines that do not fit the scope, and acceptance criteria with no finite list of cases to check (for example "handles all inputs" or "every edge case" with no list).',
  },
  {
    key: 'clarity',
    prompt: 'Find where a reader stalls: references to things never introduced, pronouns with unclear antecedents, jargon, buried main points, sentences that need rereading.',
  },
]

// One definition of severity, given to the reviewer and the skeptic alike.
const SEVERITY = `Severity:
- high: a builder following the document as written builds the wrong thing, or ships a defect its checks would not catch.
- high also: a requirement no build can satisfy, one that contradicts itself or another requirement, or whose condition can never occur.
- medium: a builder would have to stop and ask, or guess, but the checks would catch a wrong guess.
- low: everything else, including wording, clarity and polish.
Use high only when you can name the wrong thing that would be built or the defect that would ship.
A check that is weaker than the outcome it guards is not high on its own: when a builder doing what the document says would still build the right thing, it is medium.`

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
  required: ['refuted', 'reason', 'severity'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
}

const reviews = await parallel(
  LENSES.map((lens) => () =>
    agent(
      `Review the document at ${doc}. Read all of it first.

Your angle: ${lens.prompt}

Stay on your angle. For each finding, quote the exact text, state the problem, rate its severity, and propose a fix.

Report only findings you can support from the quoted text; a skeptic will try to refute each one.

${SEVERITY}

Do not edit any files.`,
      { schema: FINDINGS, label: `review: ${lens.key}`, phase: 'Review' },
    ).then((result) => (result ? result.findings : []).map((f) => ({ ...f, lens: lens.key }))),
  ),
)
const reported = reviews.filter(Boolean).flat().filter(Boolean)

const RANK = { high: 0, medium: 1, low: 2 }
const LENS_ORDER = LENSES.map((l) => l.key)

// Different lenses often report one problem. Two findings are the same when their quotes overlap: after
// normalizing case, punctuation and whitespace, one quote contains the other, they share a sentence, or the
// shorter shares at least 60% of its distinct words with the longer. Overlap is transitive (A~B, B~C groups
// A, B, C). A quote of one or two words matches only an equal quote, and one of three words only by
// containment, so a quoted term does not swallow unrelated findings. A skeptic then checks each merged finding.
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()
const sentences = (t) => String(t || '').split(/(?<=[.!?;:])\s+|\n+/).map(norm).filter((x) => x.split(' ').length >= 4)
const words = (t) => new Set(t.split(' ').filter(Boolean))
function sameQuote(a, b) {
  const na = norm(a.quote), nb = norm(b.quote)
  if (!na || !nb) return false
  if (na === nb) return true
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  const ws = words(short), wl = words(long)
  if (ws.size < 3) return false
  if (long.includes(short)) return true
  if (ws.size < 4) return false
  const sb = new Set(sentences(b.quote))
  if (sentences(a.quote).some((x) => sb.has(x))) return true
  let shared = 0
  for (const w of ws) if (wl.has(w)) shared++
  return shared / ws.size >= 0.6
}
function mergeDuplicates(list) {
  const parent = list.map((_, i) => i)
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      if (sameQuote(list[i], list[j])) parent[root(j)] = root(i)
  const groups = new Map()
  list.forEach((f, i) => {
    const r = root(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(f)
  })
  return [...groups.values()].map((g) => {
    const lenses = LENS_ORDER.filter((k) => g.some((f) => f.lens === k))
    const severity = g.map((f) => f.severity).sort((a, b) => RANK[a] - RANK[b])[0]
    const clearest = g.reduce((a, b) => (String(b.problem).length > String(a.problem).length ? b : a))
    const quote = g.reduce((a, b) => (String(b.quote).length > String(a.quote).length ? b : a)).quote
    const fixes = [...new Set(g.map((f) => String(f.fix || '').trim()).filter(Boolean))]
    const fix = fixes.length <= 1 ? fixes[0] || '' : fixes.map((x) => `- ${x}`).join('\n')
    return { severity, lens: lenses[0], lenses, quote, problem: clearest.problem, fix }
  })
}

const merged = mergeDuplicates(reported)
const all = await parallel(
  merged.map((f) => () =>
    agent(
      `A reviewer reported a problem in ${doc}. Try to refute it. Read the document and any sources it cites.

Quoted text: ${f.quote}
Reported problem: ${f.problem}
Reported severity: ${f.severity}

The finding is refuted if the problem is not real, is already addressed elsewhere in the document, or is a matter of taste rather than a defect. If you are uncertain, set refuted to true.

Whether or not you refute it, rate the severity the problem really has. Do not raise it above the reported severity.
${SEVERITY}

Do not edit any files.`,
      { schema: VERDICT, label: `refute: ${f.lenses.join('+')}`, phase: 'Refute' },
    ).then((v) => ({ ...f, verdict: v })),
  ),
).then((results) => results.map((r, i) => r || { ...merged[i], verdict: null }))

// Keep the lower of the reviewer's and the skeptic's severity.
for (const f of all) {
  if (f.verdict && RANK[f.verdict.severity] > RANK[f.severity]) f.severity = f.verdict.severity
}
const bySeverity = (a, b) => RANK[a.severity] - RANK[b.severity]
const survivors = all.filter((f) => f.verdict && !f.verdict.refuted).sort(bySeverity)
const refuted = all.filter((f) => f.verdict && f.verdict.refuted).sort(bySeverity)
// A skeptic that did not return has refuted nothing. Keep its finding apart from both lists.
const unchecked = all.filter((f) => !f.verdict).sort(bySeverity)
log(`${reported.length} finding(s) reported, ${merged.length} after merging duplicates, ${refuted.length} refuted, ${unchecked.length} not checked, ${survivors.length} kept`)

const shape = (f) => ({ severity: f.severity, lens: f.lens, lenses: f.lenses, quote: f.quote, problem: f.problem, fix: f.fix })
return {
  document: doc,
  findings: survivors.map(shape),
  refuted: refuted.map((f) => ({ ...shape(f), reason: f.verdict.reason })),
  unchecked: unchecked.map(shape),
}

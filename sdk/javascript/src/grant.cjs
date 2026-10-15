// Authority (spec/protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`.
// A child grant (`refs.parent`) is a subset of its parent on every field (invariant 10), and a grant is live only
// while every ancestor is (invariant 9). A grant carries no status: its author ends it by an `updates` with stopped;
// the receiver declines or leaves by an `answers`. Durations count calendar months and years in UTC.
const { indexOf } = require('./order.cjs')
const { GRAMMAR } = require('./spec.cjs')

// ---- Durations (ISO 8601) ----
function parseDuration(text) {
  if (typeof text !== 'string' || !GRAMMAR.duration.test(text)) return null
  const [, y, mo, w, d, , h, mi, s] = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(text)
  return { years: +y || 0, months: +mo || 0, days: (+w || 0) * 7 + (+d || 0), ms: ((+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0)) * 1000 }
}
/** A time moved by a duration (sign -1 goes back), months and years by the UTC calendar. */
function addDuration(time, duration, sign = 1) {
  const parts = parseDuration(duration), at = new Date(time)
  if (!parts || Number.isNaN(at.getTime())) return null
  at.setUTCFullYear(at.getUTCFullYear() + sign * parts.years, at.getUTCMonth() + sign * parts.months, at.getUTCDate() + sign * parts.days)
  return new Date(at.getTime() + sign * parts.ms).toISOString()
}
// Two durations compared by adding both to one instant, the parent grant's `at` (§7): -1, 0 or 1. Arithmetic only.
const compareDurations = (a, b, from) => Math.sign(Date.parse(addDuration(from, a)) - Date.parse(addDuration(from, b)))

// ---- A child's scope within its parent's ----
const contains = (outer, inner) => {
  if (inner === undefined) return true
  if (Array.isArray(inner)) return Array.isArray(outer) && inner.every((item) => outer.some((other) => contains(other, item) && contains(item, other)))
  if (inner && typeof inner === 'object') return Boolean(outer) && typeof outer === 'object' && Object.keys(inner).every((key) => contains(outer[key], inner[key]))
  return outer === inner
}
/** What makes a child grant wider than its parent: [{ code, detail }] (`wider_than_parent`, `not_receiver`); [] when it is within it. */
function scopeRefusals(child, parent) {
  const c = child.state?.scope || {}, p = parent.state?.scope || {}, wrong = [], from = parent.state?.at || '2000-01-01T00:00:00.000Z'
  const wider = (detail) => wrong.push({ code: 'wider_than_parent', detail })
  for (const set of ['acts', 'parties']) {
    if (p[set] === undefined) continue
    if (c[set] === undefined || !c[set].every((item) => p[set].includes(item))) wider(`scope.${set} is a subset of the parent's`)
  }
  if (p.limit && !(c.limit && c.limit.currency === p.limit.currency && c.limit.minor <= p.limit.minor)) wider("scope.limit is no larger than the parent's")
  if (p.per && !(c.per && compareDurations(c.per, p.per, from) <= 0)) wider("scope.per is no longer than the parent's")
  if (p.until && !(c.until && c.until <= p.until)) wider("scope.until is no later than the parent's")
  if (p.notice && !(c.notice && compareDurations(c.notice, p.notice, from) >= 0)) wider("scope.notice is no shorter than the parent's")
  if (p.condition !== undefined && !contains(c.condition, p.condition)) wider("scope.condition keeps every condition of the parent's")
  const depth = parent.state?.depth ?? 0
  if (!(depth >= 1 && (child.state?.depth ?? 0) <= depth - 1)) wider("state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)")
  if (parent.refs?.to && child.refs?.author !== parent.refs.to) wrong.push({ code: 'not_receiver', detail: 'a grant is passed on by the one who received it' })
  return wrong
}
/** What makes a child grant wider than its parent, in plain words ([] when it is within it). */
const scopeWithin = (child, parent) => scopeRefusals(child, parent).map((one) => one.detail)

// ---- Liveness ----
const hashesOf = (ref) => (Array.isArray(ref) ? ref : ref ? [ref] : [])
/** Why a grant is not live among these blocks (its own end, the receiver's, its `until` on the reader's clock, an ancestor's): [] when live. */
function whyNotLive(grant, blocks, { now } = {}, seen = new Set()) {
  const byHash = indexOf(blocks)
  if (!grant) return ['the grant is not held']
  if (seen.has(grant.hash)) return ['its parents form a cycle']
  seen.add(grant.hash)
  const wrong = []
  for (const block of byHash.values()) {
    if (block.type !== 'grant' || block.state?.status === undefined) continue
    const ends = ['stopped', 'declined'].includes(block.state.status)
    if (ends && hashesOf(block.refs?.updates).includes(grant.hash) && (block.refs.author === grant.refs?.author || (grant.refs?.as && block.refs.as === grant.refs.as))) wrong.push('its author stopped it')
    if (ends && hashesOf(block.refs?.answers).includes(grant.hash) && grant.refs?.to && block.refs.author === grant.refs.to) wrong.push('its receiver ended it')
  }
  if (now && grant.state?.scope?.until && grant.state.scope.until <= now) wrong.push('its scope.until has passed')
  if (grant.refs?.parent) {
    const parent = byHash.get(grant.refs.parent)
    const above = whyNotLive(parent, byHash, { now }, seen)
    if (above.length) wrong.push(`its parent is not live (${above.join('; ')})`)
    else wrong.push(...scopeWithin(grant, parent))
  }
  return wrong
}
const isLive = (grant, blocks, options) => !whyNotLive(grant, blocks, options).length

/** The grants above this one, nearest first. */
function ancestors(grant, blocks) {
  const byHash = indexOf(blocks), out = [], seen = new Set()
  for (let at = byHash.get(grant?.refs?.parent); at && !seen.has(at.hash); at = byHash.get(at.refs?.parent)) { seen.add(at.hash); out.push(at) }
  return out
}

/** Whether a block signed under a grant (refs.under) speaks for its grantor: [] or why not. `scope.acts` lists the block types or type.kind names it covers. */
function whyNotUnder(block, blocks, options) {
  const grant = indexOf(blocks).get(block?.refs?.under)
  if (!grant || grant.type !== 'grant') return ['refs.under names no grant this reader holds']
  const acts = grant.state?.scope?.acts
  return [...(grant.refs?.to && grant.refs.to !== block.refs.author ? ['the grant is for someone else'] : []),
    ...(acts && !acts.includes(block.type) && !acts.includes(`${block.type}.${block.state?.kind}`) ? [`the grant's acts do not cover a ${block.type}${block.state?.kind ? `.${block.state.kind}` : ''}`] : []),
    ...whyNotLive(grant, blocks, options)]
}

/** Who answers for an agent or machine: the authors of its live grants of kind operator, naming it in refs.to (§2). */
const operatorsOf = (agent, blocks, options) => [...new Set([...indexOf(blocks).values()]
  .filter((block) => block.type === 'grant' && block.state?.kind === 'operator' && block.refs?.to === agent && block.state?.status === undefined && isLive(block, blocks, options))
  .map((block) => block.refs.author))].sort()

// ---- The limit is the principal's fence (§7) ----
/**
 * The `observe` of kind limit for a grant: what to hand `write` (its type, state, refs and audience). `agent` is the
 * grant's receiver; the audience is the agent alone, so no counterparty ever reads the limit, and the grant check never
 * looks at it. Write it as `write(f.type, f.state, f.refs, { audience: f.audience, author, key, held })`.
 */
const limitFence = (grantHash, agent, { limit, per } = {}) => ({ type: 'observe', state: { kind: 'limit', limit, ...(per ? { per } : {}) }, refs: { for: grantHash }, audience: [agent] })

/**
 * Whether spending `money` stays inside a limit. `limit` is the limit observe (or its state or the money); `spent` is
 * what the principal's node has already counted in the period (whole minor units; the node sums over `per`, since the
 * limit is read on the principal's node alone). Money in another currency is never within.
 */
function withinLimit(limit, money, spent = 0) {
  const cap = limit?.state?.limit || limit?.limit || limit
  if (!cap || !Number.isInteger(cap.minor) || !money || !Number.isInteger(money.minor) || cap.currency !== money.currency) return false
  return spent + money.minor <= cap.minor
}

module.exports = { limitFence, withinLimit, parseDuration, addDuration, compareDurations, scopeRefusals, scopeWithin, whyNotLive, isLive, ancestors, whyNotUnder, operatorsOf }

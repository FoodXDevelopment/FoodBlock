// Authority (modules/authority.md): a grant gives authority within a scope; a child is a subset of its parent; a grant
// is live only while every ancestor is. Durations count calendar months and years in UTC. The rules run in the Rust core.
const { call, list } = require('./core.cjs')

const parseDuration = (text) => call('parse_duration', typeof text === 'string' ? text : null)
/** A time moved by a duration (sign -1 goes back), months and years by the UTC calendar. null when either is not one. */
const addDuration = (time, duration, sign = 1) => call('add_duration', String(time), String(duration), sign)
/** Two durations compared by adding both to one instant (§7): -1, 0 or 1. */
const compareDurations = (a, b, from) => call('compare_durations', a, b, from)
const scopeRefusals = (child, parent) => call('scope_refusals', child, parent)
const scopeWithin = (child, parent) => call('scope_within', child, parent)
const whyNotLive = (grant, blocks, { now } = {}) => call('why_not_live', grant || null, list(blocks), now || null)
const isLive = (grant, blocks, { now } = {}) => Boolean(grant) && call('is_live', grant, list(blocks), now || null)
const ancestors = (grant, blocks) => call('ancestors', grant, list(blocks))
const whyNotUnder = (block, blocks, { now } = {}) => call('why_not_under', block || null, list(blocks), now || null)
/** Who answers for an autonomous system or machine: the authors of its live grants of kind operator (§2). */
const operatorsOf = (agent, blocks, { now } = {}) => call('operators_of', agent, list(blocks), now || null)
/** Why an act that cannot be undone (its schema says `undo: never`) is not live: [] when it has a specific accepted ask or a grant that names it with a limit. */
const whyNotLiveUndo = (block, blocks) => call('why_not_live_undo', block, list(blocks))
/** The act a block is, named `type.kind`. */
const actName = (block) => call('act_name', block)
/** The `observe` of kind limit for a grant: what to hand `write` (its type, state, refs and audience). */
const limitFence = (grantHash, agent, { limit, per, salt } = {}) => call('limit_fence', grantHash, agent, limit ?? null, per || null, salt || null)
/** The commitment to a limit (authority.md): put it in the grant's `scope.limit_commitment`; keep `salt` with the limit observe. */
const limitCommitment = (limit, per, salt, suite) => call('limit_commitment', limit, per || null, salt, suite || null)
/** Whether the limit observe opens the grant's `scope.limit_commitment` (the principal's node and the agent make this check). */
const limitOpens = (grant, fence, suite) => call('limit_opens', grant, fence, suite || null)
/** Whether spending `money` stays inside a limit (§7). */
const withinLimit = (limit, money, spent = 0) => call('within_limit', limit ?? null, money ?? null, spent)

module.exports = { limitFence, limitCommitment, limitOpens, withinLimit, whyNotLiveUndo, actName, parseDuration, addDuration, compareDurations, scopeRefusals, scopeWithin, whyNotLive, isLive, ancestors, whyNotUnder, operatorsOf }

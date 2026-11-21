// Authority (modules/authority.md): a grant gives authority within a scope; a child is a subset of its parent; a grant
// is live only while every ancestor is. Durations count calendar months and years in UTC. The rules run in the Rust core.
const door = require('./door.cjs')

const parseDuration = (text) => door.parseDuration(typeof text === 'string' ? text : null)
/** A time moved by a duration (sign -1 goes back), months and years by the UTC calendar. null when either is not one. */
const addDuration = (time, duration, sign = 1) => door.addDuration(String(time), String(duration), sign)
/** Two durations compared by adding both to one instant (§7): -1, 0 or 1. */
const compareDurations = door.compareDurations
/** The one official reading of a grant's `state.scope` (authority.md), every default the spec states and nothing else filled in:
 * { types, parties, on, limit, each, every, until, clocks, deadline, fallback, junk }. A missing scope reads as an empty one. A non-empty `junk` (the names of fields that are
 * there but unreadable) means the grant cannot be held to its word: a malformed `until` read as no end would be a wider grant. */
const scopeReading = (scope) => door.scopeReading(scope ?? null)
/** Is the machine inside the fence of its grant (authority.md, A machine's fence): `{ within, why, alone, alone_until }`. `fence` is a grant's `state.fence`; `at` the time asked about (no clock is read); `readings` `{ name: amount }`; `heard` the time of the newest block heard from its node. */
const fenceReading = (fence, at, readings, heard) => door.fenceReading(fence ?? null, at, readings ?? null, heard ?? null)
const scopeRefusals = door.scopeRefusals
const scopeWithin = door.scopeWithin
const whyNotLive = (grant, blocks, { now } = {}) => door.whyNotLive(grant || null, blocks, now || null)
const isLive = (grant, blocks, { now } = {}) => Boolean(grant) && door.isLive(grant, blocks, now || null)
const ancestors = door.ancestors
const whyNotUnder = (block, blocks, { now } = {}) => door.whyNotUnder(block || null, blocks, now || null)
/** Why an act that cannot be undone (its schema says `undo: never`) is not live: [] when it has a specific accepted ask or a grant that names it with a limit. */
const whyNotLiveUndo = door.whyNotLiveUndo
/** The act a block is, named `type.kind`. */
/** Whether a promise C keeps to a promise A (authority.md, Keeps to): `{ keeps, why }`, `why` the first sorted path that differs. */
const keepsTo = (c, a, blocks = []) => door.keepsTo(c, a, blocks)
/** The line a grant's blocks are counted on (authority.md, A limit is counted along one line): `{ grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back }`, for one block under it or for the grant's own draws. */
const meter = (grant, blocks, block = null) => door.meter(grant, blocks, block)
/** The worst case of a grant, from her grant and the promises it names alone (authority.md, G18): `at_most` and `can_lose` per kind. */
const worstCase = (grant, blocks) => door.worstCase(grant, blocks)
/** Her deadline's lowest offer, read on the meter's line (authority.md, G15): `{ offer, received, cutoff, why }`. */
const lowestOffer = (grant, blocks) => door.lowestOffer(grant, blocks)
/** What a promise's terms come to at a chosen quantity (else the terms'): { minor, currency }, or null when it cannot be computed. */
const termsTotal = (terms, quantity = null) => door.termsTotal(terms ?? null, quantity ?? null)
module.exports = { keepsTo, meter, worstCase, lowestOffer, termsTotal, whyNotLiveUndo, parseDuration, addDuration, compareDurations, scopeReading, fenceReading, scopeRefusals, scopeWithin, whyNotLive, isLive, ancestors, whyNotUnder }

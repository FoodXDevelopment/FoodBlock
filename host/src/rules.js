// One host, one set of rules, two stores. The numbers a host's owner states, and the one reading of them that both stores apply:
// src/postgres/node.js (rows) and src/files/host.mjs (files) call this and nothing else for who is admitted and how many copies are kept.
// Nothing here has a default: a missing number stops the start, named (the owner's own word; nothing fills in silence). Whether a block is
// well formed, signed or in its place is never decided here: that is the SDK's.
// A store gives the rule `arrivedSince(author, date)` and `strangersSince(exempt, date)` (counts of blocks that arrived since); sync or async.
import fb from '@foodxdev/foodblock'
import { createHash } from 'node:crypto'

export const DAY = 24 * 60 * 60 * 1000
/** The most block messages one push carries. */
export const MOST_MESSAGES = 1000
const HASH = new RegExp(fb.PROTOCOL.grammar.id)
export const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
export const authorOf = (block) => block.refs?.author || block.hash
const whole = (least) => (v) => Number.isInteger(v) && v >= least

// Each number the owner states: what it must be, and the words that say so when it is missing or wrong.
const NUMBERS = {
  perStranger: [whole(0), 'a whole number of blocks a day from each stranger (0 refuses strangers)'],
  strangersPerDay: [whole(0), 'a whole number, the most blocks one day may bring from all strangers together (0 refuses strangers)'],
  admission: [(v) => v === null || (typeof v === 'string' && HASH.test(v)), 'the hash of the owner\'s admission block, or null for no rule'],
  cap: [whole(1), 'a whole number of blocks, 1 or more, at most in one pull answer'],
  servesPairs: [(v) => typeof v === 'boolean', 'true or false'],
  takesPairs: [(v) => typeof v === 'boolean', 'true or false'],
  waitingPerAuthor: [whole(0), 'a whole number of blocks that may wait for one author (0 keeps none)'],
  copyRecipients: [whole(0), 'a whole number, the most recipients one sealed block may be copied to (0 keeps no copies)'],
  copyBytes: [whole(0), 'a whole number, the most bytes of sealed copies one push may add (0 keeps none)']
}
/** The owner's numbers, checked: returns them, or throws naming the first missing or wrong one. `names`: the ones this store has use for. */
export function stated(input, who, names = Object.keys(NUMBERS)) {
  const out = {}
  for (const name of names) {
    const [ok, words] = NUMBERS[name]
    if (!ok(input[name])) throw new Error(`${who}: ${name} is required: ${words}`)
    out[name] = input[name]
  }
  return out
}

/**
 * The owner's admission rule (§10), the published block whose hash discovery names: `state.parties` (ids always
 * admitted) and `state.per_stranger` (blocks a day from each other sender, counted per sender; 0 refuses strangers), fields its schema
 * declares. Where the owner states no `per_stranger` (or publishes no rule), the protocol reads no limit (nodes.md: the SDK's admission
 * refuses only by a number someone stated); the host then applies its own choice, `chosen`, and publishes it as its own.
 * `strangersPerDay` is the host's own total for all strangers together, stated by its owner and always published as the host's word.
 */
export function admissionRule(blocks, hash, owners, chosen, strangersPerDay) {
  const found = hash ? blocks.find((one) => one.hash === hash) : null
  const rule = found && owners.includes(authorOf(found)) ? found.state : null
  const state = rule || {}
  const stated = Number.isInteger(state.per_stranger)
  const limit = stated ? state.per_stranger : chosen
  const exempt = [...new Set([...owners, ...list(state.parties)])]
  const exemptAuthor = (id) => exempt.includes(id)
  return {
    hash: rule ? hash : null,
    state,
    // the per_stranger in effect, and whose word it is: the owner's rule, the node's config, or no one's (no limit)
    perStranger: { limit, by: stated ? 'owner' : 'node' },
    strangersPerDay,
    exempt,
    // `speaks`: whether the block speaks for its author (a block of a key rotated out off its counted line, frozen or void counts for
    // nothing, so it is admitted only as anyone else's block is: a thief with an old key cannot fill the store under her name)
    admits: async (db, block, admittedNow, speaks = true) => {
      const author = authorOf(block)
      if (exemptAuthor(author) && speaks) return true
      if ((await db.arrivedSince(author, new Date(Date.now() - DAY))) + (admittedNow.get(author) || 0) >= limit) return false
      const sum = [...admittedNow].filter(([id]) => !exemptAuthor(id)).reduce((n, [, c]) => n + c, 0)
      return (await db.strangersSince(exempt, new Date(Date.now() - DAY))) + sum < strangersPerDay
    },
    // Admission before the expensive work: a stranger (no owner, no listed party) who already has all the blocks the rule allows a day is
    // refused before any block is judged. The caller counts (`arrived`: this author's blocks since a day ago; `strangers`: every stranger's) and
    // keeps one `claimed` map (author -> blocks this push has already counted) per push. Pure, so a sync store and an async one both ask it.
    isStranger: (author) => !exemptAuthor(author),
    allows: (author, arrived, strangers, claimed) => {
      const total = [...claimed.values()].reduce((n, c) => n + c, 0)
      if (arrived + (claimed.get(author) || 0) >= limit || strangers + total >= strangersPerDay) return false
      claimed.set(author, (claimed.get(author) || 0) + 1)
      return true
    }
  }
}

/** The copies one push may add: `copyRecipients` for one block, `copyBytes` for the whole push. Returns `take(recipients, cost)`; a block that would pass either is refused whole. */
export function copyBudget({ copyRecipients, copyBytes }) {
  let left = copyBytes
  return (recipients, cost) => { if (recipients > copyRecipients || cost > left) return false; left -= cost; return true }
}
export const COPIES_REFUSED = "more sealed copies than this node's owner allows"

/**
 * A push read from its bytes (canonical.md, On the wire). The core's `strictPush` reads an unsigned push `{ messages, for }`; a signed push
 * carries the signer's fields beside them, so its text is checked whole here (the bytes the core's canonical writer gives for the value they parse
 * to, else the whole push is refused, `not_canonical`) and its messages are read as the unsigned push they carry. Returns what `strictPush`
 * returns: `{ refused, messages }`, `refused` a refusal of the whole push (left out where it is not refused) and `messages` one list of
 * refusals per message. Throws when the text is not a push at all.
 */
export function readPush(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error('a push is JSON') }
  if (parsed === null || typeof parsed !== 'object' || parsed.signature === undefined) return fb.sync.strictPush(text)
  if (fb.canonicalJSON(parsed) !== text) return { refused: { hash: createHash('sha256').update(text, 'utf8').digest('hex'), code: 'not_canonical', detail: 'the push is not canonical JSON whole: the bytes are not the canonical bytes of the value they parse to' }, messages: [] }
  return fb.sync.strictPush(fb.canonicalJSON({ messages: parsed.messages, ...(parsed.for !== undefined ? { for: parsed.for } : {}) }))
}

// Between nodes (modules/nodes.md): Pull and Push, signed, answered and discovered. The rules run in the Rust core; this
// module gives them JavaScript's option names. A signed request carries exactly one of `counter` or `challenge`: no time.
const door = require('./door.cjs')
const { list } = require('./core.cjs')

const pullRequest = (request = {}) => door.pullRequest(request)
/** A signed pull: the request, plus signer, node and one proof against replay (`counter` or `challenge`), signed by one of the signer's keys. */
const signPull = (request, { signer, node, privateKey, suite, counter, challenge }) => door.signPull(request, { who: signer, node, private_key: privateKey, suite, counter, challenge })
/** A signed push: the push, plus signer, node and one proof against replay. */
const signPush = (push, { signer, node, privateKey, suite, counter, challenge }) => door.signPush(push, { who: signer, node, private_key: privateKey, suite, counter, challenge })
/** A new challenge value a node hands out at its `challenge` endpoint (it keeps what it issued and what was used). */
const newChallenge = door.newChallenge

// What the core wants to know of a node's memory: the signer's live keys, the highest counter seen from the signer, and
// the challenges issued and not yet used. No clock.
const freshness = ({ node, keys = [], highest, issued = [] } = {}) => ({ node, keys, highest: highest ?? null, issued })
const messageRefusals = (message, options = {}) => door.messageRefusals(message || {}, options.fields || require('./spec.cjs').PROTOCOL.messages.signed_pull, freshness(options))
const pullRefusals = (message, options = {}) => door.pullRefusals(message || {}, freshness(options))
const pushRefusals = (message, options = {}) => door.pushRefusals(message || {}, freshness(options))
const matches = (block, filter = {}, held) => door.matches(block, filter || {}, held)
const headsOf = door.headsOf
/**
 * Answer a pull from a node's arrival log [{ n, block, copies? }]. Signed by the node when `privateKey` is given. The node's own
 * choices are stated, never filled: `cap` (the most blocks one answer carries, at least 1) and `servesPairs` (true: the other half of a
 * forked pair goes with any answer that includes one; false: only what matches). A missing or mistyped one is an error.
 */
const answerPull = (log, request = {}, { node, privateKey, signer, cap, servesPairs, held, suite, through } = {}) =>
  door.answerPull(log, request, node, privateKey || null, { cap, serves_pairs: servesPairs }, signer || null, held, suite || null, Number.isInteger(through) ? through : null)
const answerSignedBy = (answer, nodeKeys) => door.answerSignedBy(answer, [].concat(nodeKeys || []))
const recipientsOf = (forWhom, hash) => door.recipientsOf(forWhom ?? null, hash == null ? '' : String(hash))
const pushRequest = (messages, forWhom) => door.pushRequest(messages, forWhom ?? null)
/** A push read from its text (nodes.md, Push): per message, what its block's bytes say (strict writing); a repeated key anywhere throws. */
const strictPush = (text) => door.strictPush(String(text))
/**
 * What a node takes of a push: { taken, waiting, refused, equivocations }. Options: `takesPairs` (the node's own stated choice, required:
 * true takes the blocks of a forked pair as well as listing them, false takes neither) and `schemas`. Validity reads no arrival (core.md, section 8).
 */
function accept(incoming, held = [], { takesPairs, schemas } = {}) {
  const blocks = list(incoming), answer = door.accept(blocks, held, { takes_pairs: takesPairs }, schemas ? list(schemas) : null)
  // the door names what it takes by the id the node computed, in the suite of the key that signed it (core.md, section 2): a key's first
  // block after a move to a suite of another hash has an id its bytes alone do not show, so a block is found by that id too
  const byHash = new Map(blocks.map((block) => [block.hash, block]))
  const all = [...list(held), ...blocks]
  const named = (hash) => byHash.get(hash) || (() => { for (const block of blocks) if (door.idOf(block, all) === hash) return { ...block, hash }; return null })()
  return { ...answer, taken: answer.taken.map(named) }
}
/**
 * What a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that speaks for it
 * opens its signature; the same key's next `seq`, no rival) once the block it names in `prev` is held. `incoming` are sealed
 * messages { header, header_signature, ... }; `held` whole blocks, sealed messages or their headers. Returns { taken (the
 * messages), waiting, refused, equivocations }. Option: `takesPairs`, the node's own stated choice (required), as for `accept`.
 */
function acceptSealed(incoming, held = [], { takesPairs } = {}) {
  const messages = list(incoming), answer = door.acceptSealed(messages, held, { takes_pairs: takesPairs })
  const byHash = new Map(messages.map((message) => [message.header?.hash, message]))
  return { ...answer, taken: answer.taken.map((hash) => byHash.get(hash)) }
}
/**
 * What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. The node states both: `admission` is its
 * rule's state object or an explicit null (no rule), `strangersToday` a whole number. Nothing is defaulted.
 */
function admissionRefusals(block, receiver, blocks, admission, strangersToday) {
  if (admission === undefined) throw new TypeError('admissionRefusals: admission is the rule\'s state object or an explicit null (no rule); the node states it')
  if (!Number.isInteger(strangersToday)) throw new TypeError('admissionRefusals: strangersToday is a whole number; the node states how many blocks it took today from this sender')
  return door.admissionRefusals(block, receiver, blocks, admission, strangersToday)
}
/** Residency (profiles/residency.md): a block that stays in regions its node does not hold in. */
const residencyRefusals = (block, holdsIn) => door.residencyRefusals(block, holdsIn || [])
/** Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived). */
const waitedTooLong = door.waitedTooLong
/** A node's signed answer to a push. */
const pushAnswer = (parts, { node, privateKey, suite }) => door.pushAnswer(parts, node, privateKey, suite || null)
// `admission` is the hash of the owner's admission block, or null for no rule: stated either way, never filled in
const wellKnown = ({ node, holds = [], speaks_for = [], admission, endpoints = {} } = {}) => {
  if (admission === undefined) throw new TypeError('wellKnown: admission is required: the hash of the owner\'s admission block, or null for no rule')
  return door.wellKnown(node, holds, speaks_for, admission, endpoints)
}
const announcement = door.announcement
const wellKnownErrors = (doc) => door.wellKnownErrors(doc ?? null)

module.exports = { pullRequest, signPull, signPush, strictPush, newChallenge, pullRefusals, pushRefusals, messageRefusals, matches, headsOf, answerPull, answerSignedBy, pushRequest, recipientsOf, accept, acceptSealed, admissionRefusals, residencyRefusals, waitedTooLong, pushAnswer, wellKnown, announcement, wellKnownErrors }

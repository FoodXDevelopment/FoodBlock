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
const messageRefusals = (message, options = {}) => door.messageRefusals(message || {}, options.fields || require('./spec.cjs').CONVENTIONS.messages.signed_pull, freshness(options))
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
/** A push read from its text (nodes.md, Push): `{ refused, messages }`. A push that fails (size_limit, not_canonical) is `{ refused: { hash, code, detail }, messages: [] }`; else `{ messages }`, per message what its block's bytes say (strict writing). */
const strictPush = (text) => door.strictPush(String(text))
/**
 * What a node takes of a push (nodes.md, Push): { taken, unjudged, refused, unread, equivocations, false_headers }. `incoming` are blocks
 * and sealed header messages { header, header_signature, envelope? }. Options: `takesPairs` (the node's own stated choice, required: true
 * takes the blocks of a forked pair as well as listing them, false takes neither) and `schemas`. Validity reads no arrival (core.md, section 8).
 */
function accept(incoming, held = [], { takesPairs, schemas } = {}) {
  const blocks = list(incoming), answer = door.accept(blocks, held, { takes_pairs: takesPairs }, schemas ? list(schemas) : null)
  // the door names what it takes by the id the node computed, in the suite of the key its pieces name (core.md, section 2); a sealed
  // message by its header's hash
  const byHash = new Map(blocks.map((block) => [block.hash ?? block.header?.hash, block]))
  const all = [...list(held), ...blocks]
  const named = (hash) => byHash.get(hash) || (() => { for (const block of blocks) if (block.type && door.idOf(block, all) === hash) return { ...block, hash }; return null })()
  return { ...answer, taken: answer.taken.map(named) }
}
/**
 * What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. The node states both: `admission` is its
 * rule's state object or an explicit null (no rule), `asksToday` a whole number (the asks it took today from this sender: blocks that name
 * one of its people in a ref, never a block's pieces). Nothing is defaulted.
 */
function admissionRefusals(block, receiver, blocks, admission, asksToday) {
  if (admission === undefined) throw new TypeError('admissionRefusals: admission is the rule\'s state object or an explicit null (no rule); the node states it')
  if (!Number.isInteger(asksToday)) throw new TypeError('admissionRefusals: asksToday is a whole number; the node states how many asks it took today from this sender')
  return door.admissionRefusals(block, receiver, blocks, admission, asksToday)
}
/** What a door log's signed words show (nodes.md, The arrival log): { left_out, stopped_short }. */
const logShown = (receipts, request, answer, held = []) => door.logShown(list(receipts), request, answer, list(held))
/** Whether her export is whole (nodes.md, A host): { whole, lacks }. `log` names the door log; `last` is the receipt she holds. */
const exportWhole = (document, log, last) => door.exportWhole(document, String(log), String(last))
const residencyRefusals = (block, holdsIn) => door.residencyRefusals(block, holdsIn || [])
/** Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived). */
const waitedTooLong = door.waitedTooLong
/** A node's signed answer to a push. */
const pushAnswer = (parts, { node, privateKey, suite }) => door.pushAnswer(parts, node, privateKey, suite || null)
// `admission` is the hash of the owner's admission block, or null for no rule: stated either way, never filled in. `reads`: the rule sets the
// node runs (core.md, section 11; nodes.md, Discovery), listed only where it runs a build made from that set's files
const wellKnown = ({ node, reads = [], admission, endpoints = {}, log } = {}) => {
  if (admission === undefined) throw new TypeError('wellKnown: admission is required: the hash of the owner\'s admission block, or null for no rule')
  return door.wellKnown(node, reads, admission, endpoints, log ?? null)
}
const announcement = door.announcement
const wellKnownErrors = (doc) => door.wellKnownErrors(doc ?? null)

module.exports = { pullRequest, signPull, signPush, strictPush, newChallenge, pullRefusals, pushRefusals, messageRefusals, matches, headsOf, answerPull, answerSignedBy, pushRequest, recipientsOf, accept, admissionRefusals, logShown, exportWhole, residencyRefusals, waitedTooLong, pushAnswer, wellKnown, announcement, wellKnownErrors }

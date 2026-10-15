// Between nodes (modules/nodes.md): Pull and Push, signed, answered and discovered. The rules run in the Rust core; this
// module gives them JavaScript's option names. A signed request carries exactly one of `counter` or `challenge`: no time.
const { call, list, arrivals } = require('./core.cjs')

const pullRequest = (request = {}) => call('pull_request', request)
/** A signed pull: the request, plus signer, node and one proof against replay (`counter` or `challenge`), signed by one of the signer's keys. */
const signPull = (request, { signer, node, privateKey, suite, counter, challenge }) => call('sign_pull', request, { who: signer, node, private_key: privateKey, suite, counter, challenge })
/** A signed push: the push, plus signer, node and one proof against replay. */
const signPush = (push, { signer, node, privateKey, suite, counter, challenge }) => call('sign_push', push, { who: signer, node, private_key: privateKey, suite, counter, challenge })
/** A new challenge value a node hands out at its `challenge` endpoint (it keeps what it issued and what was used). */
const newChallenge = () => call('new_challenge')

// What the core wants to know of a node's memory: the signer's live keys, the highest counter seen from the signer, and
// the challenges issued and not yet used. No clock.
const freshness = ({ node, keys = [], highest, issued = [] } = {}) => ({ node, keys, highest: highest ?? null, issued })
const messageRefusals = (message, options = {}) => call('message_refusals', message || {}, options.fields || require('./spec.cjs').PROTOCOL.messages.signed_pull, freshness(options))
const pullRefusals = (message, options = {}) => call('pull_refusals', message || {}, freshness(options))
const pushRefusals = (message, options = {}) => call('push_refusals', message || {}, freshness(options))
const pullErrors = (message, options = {}) => call('pull_errors', message || {}, freshness(options))
const matches = (block, filter = {}, held) => call('matches', block, filter || {}, list(held))
const headsOf = (blocks) => call('heads_of', list(blocks))
/** Answer a pull from a node's arrival log [{ n, block, copies? }]. Signed by the node when `privateKey` is given. */
const answerPull = (log, request = {}, { node, privateKey, signer, cap = 500, held, suite } = {}) =>
  call('answer_pull', log, request, node, privateKey || null, cap, signer || null, held ? list(held) : null, suite || 'std')
const answerSignedBy = (answer, nodeKeys) => call('answer_signed_by', answer, [].concat(nodeKeys || []))
const recipientsOf = (forWhom, hash) => call('recipients_of', forWhom ?? null, hash == null ? '' : String(hash))
const pushRequest = (messages, forWhom) => call('push_request', messages, forWhom ?? null)
/** What a node takes of a push: { taken, waiting, refused, equivocations }. Options: `arrivedAt`, `schemas`. */
function accept(incoming, held = [], { arrivedAt, schemas } = {}) {
  const blocks = list(incoming), answer = call('accept', blocks, list(held), arrivals(arrivedAt, blocks, held), schemas ? list(schemas) : null)
  const byHash = new Map(blocks.map((block) => [block.hash, block])) // the door names what it takes by hash; callers get the blocks
  return { ...answer, taken: answer.taken.map((hash) => byHash.get(hash)) }
}
/** What a node's admission and strangers rules refuse of a block for a person: not_admitted, not_human, stopped. */
const admissionRefusals = (block, receiver, blocks, admission = {}, strangersToday = 0) => call('admission_refusals', block, receiver, list(blocks), admission || {}, strangersToday)
/** Residency (profiles/residency.md): a block that stays in regions its node does not hold in. */
const residencyRefusals = (block, holdsIn) => call('residency_refusals', block, holdsIn || [])
/** Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived). */
const waitedTooLong = (since, now, ttl) => call('waited_too_long', since, now, ttl)
/** A node's signed answer to a push. */
const pushAnswer = (parts, { node, privateKey, suite }) => call('push_answer', parts, node, privateKey, suite || 'std')
const wellKnown = ({ node, holds = [], speaks_for = [], admission = null, endpoints = {} } = {}) => call('well_known', node, holds, speaks_for, admission, endpoints)
const announcement = (doc) => call('announcement', doc)
const wellKnownErrors = (doc) => call('well_known_errors', doc ?? null)

module.exports = { pullRequest, signPull, signPush, newChallenge, pullErrors, pullRefusals, pushRefusals, messageRefusals, matches, headsOf, answerPull, answerSignedBy, pushRequest, recipientsOf, accept, admissionRefusals, residencyRefusals, waitedTooLong, pushAnswer, wellKnown, announcement, wellKnownErrors }

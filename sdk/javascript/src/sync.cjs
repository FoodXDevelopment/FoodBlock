// Between nodes (spec/protocol.md §10, Encoding: Messages): Pull and Push, signed, answered and discovered. The rules
// run in the Rust core; this module gives them JavaScript's option names.
const { call, list, arrivals } = require('./core.cjs')

/** A message of an older shape with its field names read as today's: `asker` and `pusher` read as `signer` (aliases.json `messages`). `kind` is signed_pull or signed_push. The signature still covers the bytes as sent. */
const readMessage = (kind, message) => call('read_message', kind, message)
const pullRequest = (request = {}) => call('pull_request', request)
/** A signed pull: the request, plus signer, node, a fresh nonce and at, signed by one of the signer's keys (`asker` is the older name for `signer`). */
const signPull = (request, { signer, asker, node, privateKey, nonce, at }) => call('sign_pull', request, { who: signer ?? asker, node, private_key: privateKey, nonce, at })
/** A signed push: the push, plus signer, node, a fresh nonce and at (`pusher` is the older name for `signer`). */
const signPush = (push, { signer, pusher, node, privateKey, nonce, at }) => call('sign_push', push, { who: signer ?? pusher, node, private_key: privateKey, nonce, at })

// What the core wants to know of a node's clock and memory: `seen(nonce)` is asked of the message's own nonce here.
const freshness = (message, { node, now, keys = [], seen, window } = {}) =>
  ({ node, now, keys, seen: typeof seen === 'function' && message && seen(message.nonce) ? [message.nonce] : [], window_ms: window })
const messageRefusals = (message, options = {}) => call('message_refusals', message || {}, options.fields || require('./spec.cjs').PROTOCOL.messages.signed_pull, freshness(message, options))
const pullRefusals = (message, options = {}) => call('pull_refusals', message || {}, freshness(message, options))
const pushRefusals = (message, options = {}) => call('push_refusals', message || {}, freshness(message, options))
const pullErrors = (message, options = {}) => call('pull_errors', message || {}, freshness(message, options))
const matches = (block, filter = {}, held) => call('matches', block, filter || {}, list(held))
const headsOf = (blocks) => call('heads_of', list(blocks))
/** Answer a pull from a node's arrival log [{ n, block, copies? }]. Signed by the node when `privateKey` is given. */
const answerPull = (log, request = {}, { node, privateKey, signer, asker, cap = 500, held } = {}) =>
  call('answer_pull', log, request, node, privateKey || null, cap, signer || asker || null, held ? list(held) : null)
const answerSignedBy = (answer, nodeKeys) => call('answer_signed_by', answer, [].concat(nodeKeys || []))
const recipientsOf = (forWhom, hash) => call('recipients_of', forWhom ?? null, hash == null ? '' : String(hash))
const pushRequest = (messages, forWhom) => call('push_request', messages, forWhom ?? null)
/** What a node takes of a push: { taken, waiting, refused, equivocations }. Options: `arrivedAt`, `schemas`. */
function accept(incoming, held = [], { arrivedAt, schemas } = {}) {
  const blocks = list(incoming), answer = call('accept', blocks, list(held), arrivals(arrivedAt, blocks, held), schemas ? list(schemas) : null)
  const byHash = new Map(blocks.map((block) => [block.hash, block])) // the door names what it takes by hash; callers get the blocks
  return { ...answer, taken: answer.taken.map((hash) => byHash.get(hash)) }
}
/** Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived). */
const waitedTooLong = (since, now, ttl) => call('waited_too_long', since, now, ttl)
/** A node's signed answer to a push. */
const pushAnswer = (parts, { node, privateKey }) => call('push_answer', parts, node, privateKey)
const wellKnown = ({ node, holds = [], speaks_for = [], admission = null, endpoints = {} } = {}) => call('well_known', node, holds, speaks_for, admission, endpoints)
const announcement = (doc) => call('announcement', doc)
const wellKnownErrors = (doc) => call('well_known_errors', doc ?? null)

module.exports = { readMessage, pullRequest, signPull, signPush, pullErrors, pullRefusals, pushRefusals, messageRefusals, matches, headsOf, answerPull, answerSignedBy, pushRequest, recipientsOf, accept, waitedTooLong, pushAnswer, wellKnown, announcement, wellKnownErrors }

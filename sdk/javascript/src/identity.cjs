// Who someone is (modules/identity.md): a genesis, key grants, and the keys an id has at any moment, read from its
// chain alone. The rules run in the Rust core; this module gives them JavaScript's option names.
const { call, list, arrivals } = require('./core.cjs')

/** The recovery key's hash, as a genesis names it: the hash, in the identity's suite, of its SPKI hex as UTF-8 text. */
const recoveryKeyHash = (publicKeyHex, suite = 'std') => call('recovery_key_hash', publicKeyHex, suite)

/**
 * A new person, agent, machine or circle that signs: their genesis, signed. `keys` is { public_key_sign, private_key }
 * and `suite` when it is not std. A genesis needs only kind, at, audience and the key; the recovery key and its reach
 * come as a pair or not at all.
 */
function genesis(keys, { kind = 'person', at, encryptionKey, recoveryKey, reach, recoverySuite, custodian } = {}) {
  return call('genesis', keys, { kind, at, encryption_key: encryptionKey, recovery_key: recoveryKey, reach, recovery_suite: recoverySuite, custodian })
}
const isGenesis = (block) => call('is_genesis', block ?? null)
/** A genesis is valid when its own key opens it, in its suite. */
const genesisOpens = (block) => call('genesis_opens', block ?? null)

/**
 * A key grant, signed: brings `newPublicKey` into the id. `signer` is { private_key, suite?, last, broughtIn } (a key
 * the id holds and its place in that key's chain), or { private_key, recoveryKey } for the recovery key. Options:
 * `suite` (the new key's), `skip`, `replaces`, `countedTo`, `at`, `after`, `encrypt`, `recovery` ({ key, reach }), `custodian`.
 */
function keyGrant(id, newPublicKey, signer, { replaces, countedTo, at, after = [], encrypt, recovery, custodian, suite, skip } = {}) {
  return call('key_grant', id, newPublicKey || null,
    { private_key: signer.private_key, suite: signer.suite, last: signer.last || null, brought_in: signer.broughtIn, recovery_key: signer.recoveryKey },
    { replaces, counted_to: countedTo, at, after, encrypt, recovery, custodian, suite, skip })
}
/** Take your keys (identity.md, Held keys): a key grant to a key on the person's own device that rotates the custodian's key out. */
const takeKeys = (id, ownPublicKey, signer, { heldKey, countedTo, ...options } = {}) => keyGrant(id, ownPublicKey, signer, { ...options, replaces: heldKey, countedTo })

/** What an id's keys are: { keys: [{ key, by, signer, void, frozen, suite }], rotations (old key to { by, countedTo, recovery, floor }), recovery, ended }. */
function identityOf(id, blocks, { arrivedAt } = {}) {
  const answer = call('identity_of', id, list(blocks), arrivals(arrivedAt, blocks))
  return { ...answer, rotations: new Map(answer.rotations) }
}
const keyTimeline = (id, blocks, { arrivedAt } = {}) => call('key_timeline', id, list(blocks), arrivals(arrivedAt, blocks))
const keysOf = (id, blocks, { arrivedAt } = {}) => call('keys_of', id, list(blocks), arrivals(arrivedAt, blocks))
/** Whether a signed block is its author's. */
const signedByAuthor = (block, blocks, { arrivedAt } = {}) => call('signed_by_author', block, list(blocks), arrivals(arrivedAt, blocks, [block]))
/** The identity fold: { signed_by_author, keys, frozen, operators }. */
const identityState = (id, blocks, { arrivedAt } = {}) => call('identity_state', id, list(blocks), arrivals(arrivedAt, blocks))
/** Which of an id's keys signed a block (its public key), or null. */
const signerOf = (block, keys) => call('signer_of', block, keys)
/** Each key's chain for an id: [{ key, by, head, length, gaps, skips, equivocations, broken, ok }]. */
const chainsOf = (id, blocks) => call('chains_of', id, list(blocks))
/** Where an id's next block goes for one of its keys: { seq, prev }. */
const nextLinkFor = (id, publicKey, blocks) => call('next_link_for', id, publicKey, list(blocks))
const counts = (block, blocks) => call('counts', block, list(blocks))
/** Whether a block is one of a pair of one key naming one prev, or a later block of that key. */
const forked = (block, blocks) => call('forked', block, list(blocks))
/** The pairs of blocks one key signed naming one prev. */
const forkPairs = (blocks) => call('fork_pairs', list(blocks))

module.exports = { genesis, takeKeys, isGenesis, genesisOpens, recoveryKeyHash, keyGrant, identityOf, identityState, keyTimeline, keysOf, signedByAuthor, signerOf, chainsOf, nextLinkFor, counts, forked, forkPairs }

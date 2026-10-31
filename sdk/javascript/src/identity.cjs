// Who someone is (modules/identity.md): a genesis, key grants, and the keys an id has at any moment, read from its
// chain alone. The rules run in the Rust core; this module gives them JavaScript's option names.
const door = require('./door.cjs')
const { arrivals } = require('./core.cjs')

/** The recovery key's hash, as a genesis names it: the hash, in the identity's suite, of its SPKI hex as UTF-8 text. */
const recoveryKeyHash = door.recoveryKeyHash

/**
 * A new person, autonomous system, machine or circle that signs: their genesis, signed. `keys` is { public_key_sign, private_key }
 * and `suite` when it is not std. A genesis needs only kind, at, audience and the key, each stated (nothing fills them in: a missing one is
 * refused); the recovery key and its reach come as a pair or not at all. `audience` is 'public' or recipients (then `salts` and `nonce` may be given).
 */
function genesis(keys, { kind, at, audience, encryptionKey, recoveryKey, reach, recoverySuite, custodian, salts, nonce } = {}) {
  return door.genesis(keys, { kind, at, audience, encryption_key: encryptionKey, recovery_key: recoveryKey, reach, recovery_suite: recoverySuite, custodian, salts, nonce })
}
const isGenesis = (block) => door.isGenesis(block ?? null)
/** A genesis is valid when its own key opens it, in its suite. */
const genesisOpens = (block) => door.genesisOpens(block ?? null)

/**
 * A key grant, signed: brings `newPublicKey` into the id. `signer` is { private_key, suite?, last, broughtIn } (a key
 * the id holds and its place in that key's chain), or { private_key, recoveryKey } for the recovery key. Options:
 * `suite` (the new key's), `skip`, `replaces`, `countedTo`, `at`, `after`, `encrypt`, `custodian`. The recovery pair is named only in a genesis.
 */
function keyGrant(id, newPublicKey, signer, { replaces, countedTo, at, after = [], encrypt, custodian, suite, skip } = {}) {
  return door.keyGrant(id, newPublicKey || null, { private_key: signer.private_key, suite: signer.suite, last: signer.last || null, brought_in: signer.broughtIn, recovery_key: signer.recoveryKey }, { replaces, counted_to: countedTo, at, after, encrypt, custodian, suite, skip })
}
/** Take your keys (identity.md, Held keys): a key grant to a key on the person's own device that rotates the custodian's key out. */
const takeKeys = (id, ownPublicKey, signer, { heldKey, countedTo, ...options } = {}) => keyGrant(id, ownPublicKey, signer, { ...options, replaces: heldKey, countedTo })

/** What an id's keys are: { keys: [{ key, by, signer, void, frozen, suite }], rotations (old key to { by, countedTo, recovery, floor }), recovery, ended }. */
function identityOf(id, blocks, { arrivedAt, unknownArrival } = {}) {
  const answer = door.identityOf(id, blocks, arrivals(arrivedAt, blocks), unknownArrival)
  return { ...answer, rotations: new Map(answer.rotations) }
}
const keyTimeline = (id, blocks, { arrivedAt, unknownArrival } = {}) => door.keyTimeline(id, blocks, arrivals(arrivedAt, blocks), unknownArrival)
const keysOf = (id, blocks, { arrivedAt, unknownArrival } = {}) => door.keysOf(id, blocks, arrivals(arrivedAt, blocks), unknownArrival)
/** The keys that may sign a request now (nodes.md, Messages): not void, not frozen, not rotated out. */
const liveKeys = door.liveKeys
/** Whether a signed block is its author's. */
const signedByAuthor = (block, blocks, { arrivedAt, unknownArrival } = {}) => door.signedByAuthor(block, blocks, arrivals(arrivedAt, blocks, [block]), unknownArrival)
/** The identity fold: { signed_by_author, keys, frozen, operators }. */
const identityState = (id, blocks, { arrivedAt, unknownArrival } = {}) => door.identityState(id, blocks, arrivals(arrivedAt, blocks), unknownArrival)
/** Which of an id's keys signed a block (its public key), or null. */
const signerOf = door.signerOf
/** Each key's chain for an id: [{ key, by, head, length, gaps, skips, equivocations, broken, ok }]. */
const chainsOf = door.chainsOf
/** Where an id's next block goes for one of its keys: { seq, prev }. */
const nextLinkFor = door.nextLinkFor
const counts = door.counts
/** Whether a block is one of a pair of one key naming one prev, or a later block of that key. */
const forked = door.forked
/** The pairs of blocks one key signed naming one prev. */
const forkPairs = door.forkPairs

module.exports = { genesis, takeKeys, isGenesis, genesisOpens, recoveryKeyHash, keyGrant, identityOf, identityState, keyTimeline, keysOf, liveKeys, signedByAuthor, signerOf, chainsOf, nextLinkFor, counts, forked, forkPairs }

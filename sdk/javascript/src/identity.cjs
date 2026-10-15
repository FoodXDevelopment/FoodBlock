// Who someone is (spec/protocol.md §2): a genesis, key grants, and the keys an id has at any moment, read from its
// chain alone. The rules run in the Rust core; this module gives them JavaScript's option names.
const { call, list, arrivals } = require('./core.cjs')

/** The recovery key's hash, as a genesis names it: SHA-256 of its SPKI hex, as UTF-8 text. */
const recoveryKeyHash = (publicKeyHex) => call('recovery_key_hash', publicKeyHex)

/** A new person, agent, machine or signing circle: their genesis, signed. `keys` is { public_key_sign, private_key }. */
function genesis(keys, { kind = 'person', at, encryptionKey, recoveryKey, reach = 'P30D', custodian, algSign, algEncrypt, algRecovery } = {}) {
  if (!recoveryKey) throw new Error('identity: a 1.6 genesis names its recovery key')
  return call('genesis', keys, { kind, at, encryption_key: encryptionKey, recovery_key: recoveryKey, reach, custodian, alg_sign: algSign, alg_encrypt: algEncrypt, alg_recovery: algRecovery })
}
const isGenesis = (block) => call('is_genesis', block ?? null)
/** A genesis with the recovery fields: a 1.6 genesis, which has no history. */
const is16Genesis = (block) => call('is_16_genesis', block ?? null)
/** A genesis is valid when its own key opens it. */
const genesisOpens = (block) => call('genesis_opens', block ?? null)

/**
 * A key grant, signed: brings `newPublicKey` into the id. `signer` is { private_key, last, broughtIn } (a key the id
 * holds and its place in that key's chain), or { private_key, recoveryKey } for the recovery key.
 */
function keyGrant(id, newPublicKey, signer, { replaces, countedTo, lastGood, at, after = [], encrypt, recovery, custodian, algSign, algEncrypt } = {}) {
  return call('key_grant', id, newPublicKey || null,
    { private_key: signer.private_key, last: signer.last || null, brought_in: signer.broughtIn, recovery_key: signer.recoveryKey },
    { replaces, counted_to: countedTo ?? lastGood, at, after, encrypt, recovery, custodian, alg_sign: algSign, alg_encrypt: algEncrypt })
}
/** Take your keys (§2 Held keys): a key grant to a key on the person's own device that rotates the custodian's key out. */
const takeKeys = (id, ownPublicKey, signer, { heldKey, countedTo, lastGood, ...options } = {}) => keyGrant(id, ownPublicKey, signer, { ...options, replaces: heldKey, countedTo: countedTo ?? lastGood })

/** What an id's keys are: { keys: [{ key, by, signer, void, frozen, alg }], rotations (old key → { by, countedTo, recovery, floor }), recovery, ended }. */
function identityOf(id, blocks, { arrivedAt } = {}) {
  const answer = call('identity_of', id, list(blocks), arrivals(arrivedAt, blocks))
  return { ...answer, rotations: new Map(answer.rotations) }
}
const keyTimeline = (id, blocks, { arrivedAt } = {}) => call('key_timeline', id, list(blocks), arrivals(arrivedAt, blocks))
const keysOf = (id, blocks, { arrivedAt } = {}) => call('keys_of', id, list(blocks), arrivals(arrivedAt, blocks))
/** Whether a signed block is its author's. */
const signedByAuthor = (block, blocks, { arrivedAt } = {}) => call('signed_by_author', block, list(blocks), arrivals(arrivedAt, blocks, [block]))
/** The identity fold (§11): { signed_by_author, keys, frozen, operators, history }. */
const identityState = (id, blocks, { arrivedAt } = {}) => call('identity_state', id, list(blocks), arrivals(arrivedAt, blocks))
/** Which of an id's keys signed a block (its public key), or null. */
const signerOf = (block, keys) => call('signer_of', block, keys)
/** Each key's chain for an id: [{ key, by, head, length, gaps, equivocations, broken, ok }]. */
const chainsOf = (id, blocks) => call('chains_of', id, list(blocks))
/** Where an id's next block goes for one of its keys: { seq, prev }. */
const nextLinkFor = (id, publicKey, blocks) => call('next_link_for', id, publicKey, list(blocks))
const historyCounts = (block, id, blocks) => call('history_counts', block, id, list(blocks))
const counts = (block, blocks) => call('counts', block, list(blocks))
const forked = (block, blocks) => call('forked', block, list(blocks))

module.exports = { genesis, takeKeys, isGenesis, is16Genesis, genesisOpens, recoveryKeyHash, keyGrant, identityOf, identityState, keyTimeline, keysOf, signedByAuthor, signerOf, chainsOf, nextLinkFor, historyCounts, counts, forked }

// Who someone is (modules/identity.md): her genesis (a list of one voice), her list of voices, the keys under a voice, and whether a
// word stands (blocks.md, Finality). The rules run in the Rust core; this module gives them JavaScript's option names.
const door = require('./door.cjs')
const write = require('./write.cjs')

/** A key named by its hash (identity.md, Her voices): its suite's hash of its SPKI hex as UTF-8 text. */
const keyHash = (publicKey, suite) => door.keyHash(publicKey, suite ?? null)

/**
 * A new person, autonomous system, machine or circle that signs: their genesis, signed, a list of one voice. `keys` is
 * { public_key_sign, private_key } and `suite` when it is not std. A genesis needs only kind, at, audience and the key, each stated (nothing
 * fills them in: a missing one is refused). `reach` (a duration) comes with `clocks` (her clock, { names, needed }). `audience` is 'public'
 * or recipients (then `salts` and `nonce` may be given).
 */
function genesis(keys, { kind, at, audience, encryptionKey, reach, clocks, salts, nonce } = {}) {
  return door.genesis(keys, { kind, at, audience, encryption_key: encryptionKey, reach, clocks, salts, nonce })
}
const isGenesis = (block) => door.isGenesis(block ?? null)
/** A genesis is valid when its own key opens it, in its suite. */
const genesisOpens = (block) => door.genesisOpens(block ?? null)

/**
 * A key grant about `id` (identity.md), written by `signer` ({ author, keys, blocks, at, after? }: one of her voices, or one of a voice of
 * named people, signing in their own name). Give `voices` (her whole list again, with `updates` the list it replaces and `clocks`
 * her clock), or `key` (one key under the signer's voice, in `suite`), or `encrypt` alone; `shownKey` when a key named by hash shows itself
 * (`keyRef` the list that holds its hash); `countedTo` the last block of a key a voice above ends.
 */
function keyGrant(id, signer, { voices, updates, clocks, key, suite, encrypt, shownKey, keyRef, countedTo } = {}) {
  const state = { kind: 'key' }
  if (voices) state.voices = voices
  if (clocks) state.clocks = clocks
  if (key) state.public_key_sign = key
  if (suite) state.suite = suite
  if (encrypt) state.public_key_encrypt = encrypt
  if (shownKey) state.shown_key = shownKey
  if (countedTo) state.counted_to = countedTo
  const refs = { subject: id }
  if (updates) refs.updates = updates
  if (keyRef) refs.key = keyRef
  return write.write('grant', state, refs, { audience: 'public', ...signer, author: signer.author || id, key: signer.keys || signer.key })
}
/** The second signature (blocks.md, Finality, Signed twice): a block of the same key, or of a voice above, naming the word in refs.confirms. */
const confirm = (word, signer) => write.write('observe', {}, { confirms: [word.hash || word] }, { audience: 'public', ...signer, author: signer.author, key: signer.keys || signer.key })

/** Every key a list or a key grant of hers brought in: [{ key, by, voice, under, suite, ended }]. */
const keyTimeline = (id, blocks) => door.keyTimeline(id, blocks)
/** The keys that speak for her now: of her standing voices and under them, not ended. Sorted. */
const liveKeys = door.liveKeys
/** Whether a key of the block's author spoke for her there (identity.md, invariant 8). A waiting block is true here; `stands` says it waits. */
const signedByAuthor = (block, blocks) => door.signedByAuthor(block, blocks)
/** Whether a word stands (blocks.md, Finality): { stands, waiting: [{ block, on }] }, read with no clock and no arrival. */
const stands = (block, blocks) => door.stands(block, blocks)
/** The identity fold: { signed_by_author, voices, clocks, keys, waiting }. */
const identityState = (id, blocks) => door.identityState(id, blocks)
/** Each key's chain for an id: [{ key, by, head, length, gaps, skips, equivocations, broken, ok }]. */
const chainsOf = door.chainsOf
/** Where an id's next block goes for one of its keys: { seq, prev }. */
const nextLinkFor = door.nextLinkFor
const counts = door.counts
/** Whether a block is one of a pair of one key naming one prev, or a later block of that key. */
const forked = door.forked
/** The pairs of blocks one key signed naming one prev. */
const forkPairs = door.forkPairs

module.exports = { genesis, isGenesis, genesisOpens, keyHash, keyGrant, confirm, identityState, keyTimeline, liveKeys, signedByAuthor, stands, chainsOf, nextLinkFor, counts, forked, forkPairs }

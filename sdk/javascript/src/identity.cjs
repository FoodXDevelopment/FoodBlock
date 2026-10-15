// Who someone is (spec/protocol.md §2). Their genesis is the one block with no author: a public `actor` naming its own
// signing key, its encryption key, the hash of an offline recovery key and how far back that key may reach, signed by
// its own key. Its hash is their id. A key comes in by a `grant` of kind key. A rotation (`replaces` and `last_good`)
// voids the old key's blocks after its last good block, and is signed only by that key or by the recovery key
// (invariant 8). A key brought in by a void block is void, and so is every key it brought in. Two rotations of one
// key that do not see each other freeze the keys they bring in, until the recovery key settles it; two recovery
// rotations that do not see each other end the identity. Recovery reach is read from arrival on the reader's node
// (`arrivedAt`), never from `at` (invariant 6). History is closed (invariant 16): a block without seq counts only in
// the causal past of an older identity's first 1.6 block, or in its manifest. A key comes in only by a key grant with
// seq, so history never brings in or rotates a key (a key's chain starts at the seq of the block that brought it in).
const crypto = require('crypto')
const { create } = require('./block.cjs')
const { sign, verify } = require('./sign.cjs')
const { causalOrder, pastOf, sees, indexOf } = require('./order.cjs')
const { nextLink, checkChain } = require('./chain.cjs')
const { addDuration, operatorsOf } = require('./grant.cjs')

const signed = (block, privateKey) => ({ ...block, signature: sign(block, privateKey) })
const opens = (block, publicKey) => Boolean(block?.signature && publicKey) && verify(block, block.signature, publicKey)

/** The recovery key's hash, as a genesis names it: SHA-256 of its SPKI hex, as UTF-8 text. */
const recoveryKeyHash = (publicKeyHex) => crypto.createHash('sha256').update(publicKeyHex, 'utf8').digest('hex')

/**
 * A new person, agent, machine or signing circle: their genesis, signed. `keys` is { public_key_sign, private_key };
 * a 1.6 genesis names the recovery key (only its hash is written) and its reach, and the encryption key (X25519
 * public) if the identity will receive sealed blocks: a micro that only signs leaves it out and adds one later by a
 * key grant. `custodian` (an id) says the key is held for the person by someone they chose (§2 Held keys): readers see
 * it and weigh the key so.
 */
function genesis(keys, { kind = 'person', at = new Date().toISOString(), encryptionKey, recoveryKey, reach = 'P30D', custodian } = {}) {
  if (!recoveryKey) throw new Error('identity: a 1.6 genesis names its recovery key')
  return signed(create('actor', { kind, at, audience: 'public', public_key_sign: keys.public_key_sign, ...(encryptionKey ? { public_key_encrypt: encryptionKey } : {}),
    ...(custodian ? { custodian } : {}), recovery_key_hash: recoveryKeyHash(recoveryKey), recovery_reach: reach }, {}), keys.private_key)
}

const isGenesis = (block) => block?.type === 'actor' && typeof block.state?.public_key_sign === 'string' && !block.refs?.author && block.state?.seq === undefined
/** A genesis with the recovery fields: a 1.6 genesis, which has no history. */
const is16Genesis = (block) => isGenesis(block) && block.state.recovery_key_hash !== undefined && block.state.recovery_reach !== undefined
/** A genesis is valid when its own key opens it. */
const genesisOpens = (block) => isGenesis(block) && opens(block, block.state.public_key_sign)

/**
 * A key grant, signed: brings `newPublicKey` into the id. `signer` is { private_key, last, broughtIn } (a key the id
 * holds and its place in that key's chain), or { private_key, recoveryKey } for the recovery key, whose chain starts
 * at the genesis. A rotation also names the key it `replaces` and that key's `lastGood` block.
 */
function keyGrant(id, newPublicKey, signer, { replaces, lastGood, at = new Date().toISOString(), after = [], encrypt, recovery, custodian } = {}) {
  const place = nextLink(signer.last, signer.broughtIn || id)
  const state = { seq: place.seq, at, audience: 'public', kind: 'key', ...(newPublicKey ? { public_key_sign: newPublicKey } : {}), ...(encrypt ? { public_key_encrypt: encrypt } : {}),
    ...(custodian ? { custodian } : {}), ...(replaces ? { replaces, last_good: lastGood } : {}), ...(signer.recoveryKey ? { recovery_key: signer.recoveryKey } : {}),
    ...(recovery ? { recovery_key_hash: recoveryKeyHash(recovery.key), recovery_reach: recovery.reach } : {}) }
  const seen = [...new Set(after)].sort()
  return signed(create('grant', state, { author: id, subject: id, prev: place.prev, ...(seen.length ? { after: seen } : {}) }), signer.private_key)
}

/**
 * Take your keys (§2 Held keys): a key grant to a key on the person's own device that rotates the custodian's key out.
 * `signer` is the held key's place in its chain ({ private_key, last, broughtIn }, or the recovery key), `heldKey` the
 * custodian-held public key and `lastGood` the hash of its last block the person stands behind. No `custodian` is
 * written, so the keys are the person's own from then on and their record stays one chain.
 */
const takeKeys = (id, ownPublicKey, signer, { heldKey, lastGood, ...options } = {}) => keyGrant(id, ownPublicKey, signer, { ...options, replaces: heldKey, lastGood })

// ---- History (§2) ----
/**
 * Whether a block without seq counts as its author's history: never for a 1.6 genesis (it has none); while an older
 * identity has written no 1.6 block, its history is open and counts; once it has, only what is in its first 1.6
 * block's causal past or manifest counts. What counts, counts in every fold under the rules it was written in, read
 * through aliases (an old membership or grant stands). A reader that holds neither the genesis nor a 1.6 block of
 * the author has nothing that closes the history, so it reads it as open.
 */
function historyCounts(block, id, blocks) {
  if (block.state?.seq !== undefined) return false
  const byHash = indexOf(blocks), root = byHash.get(id)
  if (root && is16Genesis(root)) return false
  const firsts = [...byHash.values()].filter((other) => other.refs?.author === id && other.state?.seq === 1 && other.refs?.prev === id)
  if (!firsts.length) return true
  return firsts.some((first) => pastOf(first, byHash).has(block.hash) || (first.state.manifest || []).includes(block.hash))
}
// ---- Two blocks at one seq (§2) ----
// A key's place in its chain, read from the chain alone (no signature): the block that brought the key in, found by
// walking `prev` back to seq 1 (the recovery key's chain, which also starts at the genesis, begins with a block naming
// `recovery_key`). A chain with a gap is named by the first missing link and the seq above it.
function chainRoot(block, byHash) {
  let at = block
  for (let steps = 0; steps <= block.state.seq; steps++) {
    if (at.state.seq === 1) return `${at.state.recovery_key ? 'recovery ' : ''}${at.refs?.prev}`
    const prev = byHash.get(at.refs?.prev)
    if (!prev || !Number.isInteger(prev.state?.seq) || prev.state.seq !== at.state.seq - 1) return `${at.refs?.prev}@${at.state.seq}`
    at = prev
  }
  return null
}
const FORKS = new WeakMap()
/**
 * Where each key of each author first signed two blocks at one seq: Map `${author} ${root}` → that seq. Read once per
 * set of blocks.
 */
function forksOf(byHash) {
  if (FORKS.has(byHash)) return FORKS.get(byHash)
  const bySlot = new Map(), out = new Map()
  for (const block of byHash.values()) {
    if (!block.refs?.author || !Number.isInteger(block.state?.seq)) continue
    const slot = `${block.refs.author} ${block.state.seq}`
    bySlot.set(slot, [...(bySlot.get(slot) || []), block])
  }
  for (const group of bySlot.values()) {
    if (group.length < 2) continue
    const roots = new Map()
    for (const block of group) { const root = chainRoot(block, byHash), key = `${block.refs.author} ${root}`; roots.set(key, (roots.get(key) || 0) + 1) }
    for (const [key, n] of roots) if (n > 1) { const seq = group[0].state.seq; if (!out.has(key) || out.get(key) > seq) out.set(key, seq) }
  }
  FORKS.set(byHash, out)
  return out
}
/**
 * Whether a block is one of two at one seq of its key, or a later block of that key: proof of a lie, counted for
 * nothing in every fold but the identity fold (§2, Two blocks at one seq; §11, Equivocations in folds).
 */
function forked(block, blocks) {
  if (!block?.refs?.author || !Number.isInteger(block.state?.seq)) return false
  const byHash = indexOf(blocks), forks = forksOf(byHash)
  if (!forks.size) return false
  const seq = forks.get(`${block.refs.author} ${chainRoot(block, byHash)}`)
  return seq !== undefined && block.state.seq >= seq
}

/**
 * Whether a block counts in a fold other than the identity fold: one with seq unless its key signed two blocks at one
 * seq at or before it (its signature is the reader's own check); one without, as history.
 */
const counts = (block, byHash) => isGenesis(block) || (block.state?.seq !== undefined ? !forked(block, byHash) : historyCounts(block, block.refs?.author, byHash))

// ---- Keys ----
const keyGrantsOf = (id, blocks) => causalOrder([...indexOf(blocks).values()].filter((block) => block.type === 'grant' && block.state?.kind === 'key' && block.refs?.author === id
  && block.refs?.subject === id && Number.isInteger(block.state?.seq) && block.state?.status === undefined))
// The earliest of a set of blocks: those whose causal past holds no other of them.
const earliest = (set, byHash) => set.filter((one) => !set.some((other) => other !== one && sees(one, other, byHash)))

/**
 * What an id's keys are, read from its chain alone: { keys: [{ key, by, signer, void, frozen }], rotations (old key →
 * { by, lastGood, recovery, floor }), recovery: [public keys proven], ended }. Options: `arrivedAt(hash)` (when a block
 * arrived on this node, an ISO time) for recovery reach.
 */
function identityOf(id, blocks, { arrivedAt } = {}) {
  const byHash = indexOf(blocks), root = byHash.get(id)
  if (!genesisOpens(root)) return { keys: [], rotations: new Map(), recovery: [], ended: false }
  const grants = keyGrantsOf(id, byHash)
  let rotations = new Map(), result
  // Rotations can void grants that came before them in causal order, so read until nothing changes.
  for (let pass = 0; pass <= grants.length + 1; pass++) {
    result = readKeys(id, root, grants, byHash, rotations, arrivedAt)
    const same = JSON.stringify([...result.rotations]) === JSON.stringify([...rotations])
    rotations = result.rotations
    if (same && pass) break
  }
  return result
}

function readKeys(id, root, grants, byHash, rotations, arrivedAt) {
  const recoveryHashes = [root.state.recovery_key_hash].filter(Boolean)
  const keys = [{ key: root.state.public_key_sign, by: root.hash, signer: null, void: false, frozen: false }]
  const recovery = [], selfRotations = new Map(), recoveryRotations = new Map(), slots = new Map()
  const context = { byHash, rotations, arrivedAt, id }
  for (const grant of grants) {
    const state = grant.state
    const byRecovery = typeof state.recovery_key === 'string' && recoveryHashes.includes(recoveryKeyHash(state.recovery_key)) && opens(grant, state.recovery_key)
    const signer = byRecovery ? null : keys.find((entry) => !entry.void && !entry.frozen && opens(grant, entry.key) && speaks(entry, grant, context))
    if (!byRecovery && !signer) continue
    if (byRecovery && !recovery.includes(state.recovery_key)) recovery.push(state.recovery_key)
    // An older genesis adds recovery once, by a key grant naming it.
    if (state.recovery_key_hash && !recoveryHashes.length) recoveryHashes.push(state.recovery_key_hash)
    if (state.replaces) {
      // A key is rotated only by itself or by the recovery key.
      if (!byRecovery && signer.key !== state.replaces) continue
      const list = byRecovery ? recoveryRotations : selfRotations
      list.set(state.replaces, [...(list.get(state.replaces) || []), grant])
    }
    if (state.public_key_sign) keys.push({ key: state.public_key_sign, by: grant.hash, signer: byRecovery ? 'recovery' : signer.key, void: false, frozen: false })
    if (!byRecovery) { const slot = `${signer.key} ${state.seq}`; slots.set(slot, [...(slots.get(slot) || []), grant]) }
  }
  // Each rotated key: the recovery's rotation rules; two that do not see each other freeze (self) or end (recovery).
  const next = new Map()
  const crossing = earliest([...recoveryRotations.values()].flat(), byHash)
  const ended = crossing.length > 1 ? crossing.map((grant) => grant.hash).sort() : null
  for (const old of new Set([...selfRotations.keys(), ...recoveryRotations.keys()])) {
    const byRecovery = earliest(recoveryRotations.get(old) || [], byHash), bySelf = earliest(selfRotations.get(old) || [], byHash)
    if (byRecovery.length) {
      const chain = causalOrder(recoveryRotations.get(old)), rule = chain.at(-1)
      for (const grant of selfRotations.get(old) || []) if (!sees(rule, grant, byHash)) for (const entry of keys) if (entry.by === grant.hash) entry.frozen = true
      const arrived = arrivedAt?.(rule.hash)
      next.set(old, { by: rule.hash, all: (selfRotations.get(old) || []).concat(recoveryRotations.get(old)).map((grant) => grant.hash).sort(), lastGood: rule.state.last_good, recovery: true,
        floor: arrived ? addDuration(arrived, root.state.recovery_reach || recoveryReachOf(id, byHash), -1) : null })
      continue
    }
    if (bySelf.length > 1) for (const grant of bySelf) for (const entry of keys) if (entry.by === grant.hash) entry.frozen = true
    const goods = bySelf.map((grant) => byHash.get(grant.state.last_good)).filter(Boolean)
    const lowest = goods.sort((a, b) => a.state.seq - b.state.seq)[0]
    next.set(old, { by: bySelf.map((grant) => grant.hash).sort().join(','), all: bySelf.map((grant) => grant.hash).sort(), lastGood: lowest?.hash || bySelf[0].state.last_good, recovery: false, floor: null })
  }
  // Two key grants at one seq of one key (a fork, rotating or not): Conflict applies. The keys they bring in freeze until
  // a recovery rotation of that key settles it; then those in its causal past speak.
  for (const [slot, pair] of slots) {
    if (pair.length < 2) continue
    const signer = slot.slice(0, slot.lastIndexOf(' ')), settle = recoveryRotations.get(signer)
    const rule = settle ? causalOrder(settle).at(-1) : null
    for (const grant of pair) if (!rule || !sees(rule, grant, byHash)) for (const entry of keys) if (entry.by === grant.hash) entry.frozen = true
  }
  // A key brought in by a void block is void, and so is every key it brought in.
  for (const entry of keys.slice(1)) {
    const grant = byHash.get(entry.by), signer = entry.signer === 'recovery' ? null : keys.find((other) => other.key === entry.signer)
    if (signer && (signer.void || !speaks(signer, grant, { ...context, rotations: next }))) entry.void = true
    if (signer?.frozen) entry.frozen = true
  }
  return { keys, rotations: next, recovery, ended }
}
const recoveryReachOf = (id, byHash) => [...byHash.values()].find((block) => block.type === 'grant' && block.refs?.author === id && block.state?.recovery_reach)?.state.recovery_reach

// Whether a key speaks for a block: never rotated, or the block is at or before its last good block (or is the
// rotation itself), or a recovery rotation cannot reach it.
function speaks(entry, block, { byHash, rotations, arrivedAt, id }) {
  if (entry.void || entry.frozen) return false
  if (block.state?.seq === undefined) return historyCounts(block, id, byHash)
  const rotation = rotations.get(entry.key)
  if (!rotation) return true
  if (rotation.all.includes(block.hash) && (!rotation.recovery || rotation.by === block.hash)) return earliestRotation(block, rotation, byHash)
  const good = byHash.get(rotation.lastGood)
  if (block.hash === rotation.lastGood) return true
  if (good && Number.isInteger(good.state?.seq) && block.state.seq <= good.state.seq) return true
  return rotation.recovery && beyondReach(block, rotation, byHash, arrivedAt)
}
// The rotation itself stands; a later rotation of the same key that has seen it does not.
const earliestRotation = (block, rotation, byHash) => !rotation.all.some((other) => other !== block.hash && sees(block, byHash.get(other), byHash))
// A recovery rotation cannot void a block that arrived, or that another identity built on and that arrived, before
// its reach began (the rotation's arrival, less recovery_reach). Without arrival times, everything is within reach.
function beyondReach(block, rotation, byHash, arrivedAt) {
  if (!rotation.floor || !arrivedAt) return false
  const users = [...byHash.values()].filter((other) => other.refs?.author !== block.refs?.author && pastOf(other, byHash).has(block.hash))
  return [block, ...users].some((one) => { const at = arrivedAt(one.hash); return at && at < rotation.floor })
}

/** The keys an id has held, each { key, by, signer, void, frozen } (the old shape of identityOf().keys). */
const keyTimeline = (id, blocks, options) => identityOf(id, blocks, options).keys
const keysOf = (id, blocks, options) => keyTimeline(id, blocks, options).filter((entry) => !entry.void).map((entry) => entry.key)

/**
 * Whether a signed block is its author's: its signature opens with one of the id's keys that speaks for it, or it is
 * a key grant the recovery key signed. Two recovery rotations that cross end the identity: then only what either of
 * them saw still stands.
 */
function signedByAuthor(block, blocks, options = {}) {
  if (isGenesis(block)) return genesisOpens(block)
  const byHash = indexOf(blocks)
  const all = byHash.has(block.hash) ? byHash : new Map([...byHash, [block.hash, block]])
  const id = block.refs?.author
  const state = identityOf(id, all, options)
  if (state.ended && !state.ended.some((hash) => hash === block.hash || pastOf(all.get(hash), all).has(block.hash))) return false
  if (block.type === 'grant' && state.recovery.includes(block.state?.recovery_key) && opens(block, block.state.recovery_key)) return true
  // The recovery key also signs defeats of a successor's trigger.
  if (block.type === 'observe' && block.refs?.defeats && state.recovery.some((key) => opens(block, key))) return true
  const context = { byHash: all, rotations: state.rotations, arrivedAt: options.arrivedAt, id }
  return state.keys.some((entry) => opens(block, entry.key) && speaks(entry, block, context))
}

/**
 * The identity fold (§11, What each fold returns): { signed_by_author (hash → true when the block is the id's, for the
 * genesis and every block naming it as author), keys (sorted), frozen (sorted), operators (sorted), history (none for a
 * 1.6 genesis, open or closed) }.
 */
function identityState(id, blocks, options = {}) {
  const byHash = indexOf(blocks), root = byHash.get(id)
  const timeline = keyTimeline(id, byHash, options)
  const firsts = [...byHash.values()].some((block) => block.refs?.author === id && block.state?.seq === 1 && block.refs?.prev === id)
  return {
    signed_by_author: Object.fromEntries([...byHash.values()].filter((block) => block.hash === id || block.refs?.author === id).map((block) => [block.hash, signedByAuthor(block, byHash, options)])),
    keys: timeline.filter((entry) => !entry.void).map((entry) => entry.key).sort(),
    frozen: timeline.filter((entry) => !entry.void && entry.frozen).map((entry) => entry.key).sort(),
    operators: operatorsOf(id, byHash, options),
    history: root && is16Genesis(root) ? 'none' : firsts ? 'closed' : 'open'
  }
}

/** Which of an id's keys signed a block (its public key), or null. */
const signerOf = (block, keys) => keys.find((entry) => opens(block, entry.key))?.key || null

/** Each key's chain for an id: [{ key, by, head, length, gaps, equivocations, broken, ok }]. Blocks without seq sit in no chain. */
function chainsOf(id, blocks) {
  const byHash = indexOf(blocks)
  const mine = [...byHash.values()].filter((block) => block.refs?.author === id && Number.isInteger(block.state?.seq))
  return keyTimeline(id, byHash).map((entry) => ({ key: entry.key, by: entry.by, ...checkChain(mine.filter((block) => opens(block, entry.key)), entry.by) }))
}

/** Where an id's next block goes for one of its keys: { seq, prev }. */
function nextLinkFor(id, publicKey, blocks) {
  const chain = chainsOf(id, blocks).find((entry) => entry.key === publicKey)
  if (!chain) throw new Error('identity: that key is not one of theirs')
  if (chain.equivocations.length) throw new Error('identity: this key has signed two blocks with one seq')
  return nextLink(chain.head, chain.by)
}

module.exports = { genesis, takeKeys, isGenesis, is16Genesis, genesisOpens, recoveryKeyHash, keyGrant, identityOf, identityState, keyTimeline, keysOf, signedByAuthor, signerOf, chainsOf, nextLinkFor, historyCounts, counts, forked }

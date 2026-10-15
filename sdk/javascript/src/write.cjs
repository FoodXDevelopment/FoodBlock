// Writing a block and carrying it (spec/protocol.md §1, §9, Encoding: Messages). `compose` stamps an author's words
// with what every block carries (who, when, its place in the signing key's chain, what was seen, who may see it);
// `write` is the one path every writer shares: compose, check, sign, chain. On the wire a public block is
// { version, block, signature }; a sealed one is { version, header, header_signature, envelope }, its public header
// { author, seq, prev, hash } signed by the key that signed the block, its body sealed to the audience.
const { create, hash } = require('./block.cjs')
const { sign, signMessage, verifyMessage } = require('./sign.cjs')
const { seal, open } = require('./envelope.cjs')
const { commit, newSalt } = require('./audience.cjs')
const { canonical } = require('./canonical.cjs')
const { refusals } = require('./protocol.cjs')
const { VERSION, LIMITS, PROTOCOL } = require('./spec.cjs')

const PUBLIC = 'public'

/**
 * A block as its author says it: `link` ({ seq, prev }, from chain.link or identity.nextLinkFor), `audience` ('public',
 * or recipients: people, circles, `circle#role`, written as commitments with a nonce), `after` (heads seen), `at`.
 * A private block comes back with its salts beside it (`salts`), never signed.
 */
function compose(type, state = {}, refs = {}, { author, audience = PUBLIC, after = [], at = new Date().toISOString(), link, salts: given } = {}) {
  if (!author) throw new Error('write: a block names its author')
  if (Number.isNaN(Date.parse(at))) throw new Error('write: at is a time')
  const seen = [...new Set(after)].sort()
  const { audience: written, salts } = audience === PUBLIC ? { audience: PUBLIC, salts: null } : commit(Array.isArray(audience) ? audience : [], given)
  const block = create(type, { ...state, at, audience: written, ...(link ? { seq: link.seq } : {}), ...(salts && !state.nonce ? { nonce: newSalt() } : {}) },
    { ...refs, author, ...(link ? { prev: link.prev } : {}), ...(seen.length ? { after: seen } : {}) })
  return salts ? { ...block, salts } : block
}

/**
 * The one way to write: compose, check (the write check, refusing never repairing), sign with the author's key, at
 * the next place in that key's chain among `held` (the author's genesis, key grants and blocks). `key`:
 * { public_key_sign, private_key }. Returns the signed block ({ hash, type, state, refs, signature }, and `salts` for
 * a private one); throws with every reason when the check refuses.
 */
function write(type, state, refs, { author, key, held = [], schemas, link, ...options } = {}) {
  const { nextLinkFor } = require('./identity.cjs')
  const block = compose(type, state, refs, { author, link: link || nextLinkFor(author, key.public_key_sign, held), ...options })
  const refused = refusals(block.type, block.state, block.refs, { schemas, held: new Map(held.map((one) => [one.hash, one])) })
  if (refused.length) throw Object.assign(new Error(`write: refused: ${refused.map((one) => `${one.code}: ${one.detail}`).join('; ')}`), { refused, wrong: refused.map((one) => one.detail) })
  return { ...block, signature: sign(block, key.private_key) }
}

// ---- Messages ----
/** A signed public block as it travels: { version, block, signature }. Never the hash: readers recompute it. */
const wrap = (signed, version = VERSION) => ({ version, block: { type: signed.type, state: signed.state, refs: signed.refs }, signature: signed.signature })

/** A block off the wire: its hash recomputed from its content, its signature and version kept beside. */
function unwrap(message) {
  const { type, state = {}, refs = {} } = message?.block || {}
  if (typeof type !== 'string' || typeof message.signature !== 'string') throw new Error('write: a message is { version, block, signature }')
  if (Buffer.byteLength(canonical(type, state, refs), 'utf8') > LIMITS.block_bytes) throw Object.assign(new Error(`write: a block is at most ${LIMITS.block_bytes} bytes`), { code: 'size_limit' })
  return { hash: hash(type, state, refs), type, state, refs, signature: message.signature, version: message.version, ...(message.reveals ? { reveals: message.reveals } : {}) }
}

/** A block's public header: { author, seq, prev, hash }. */
const header = (block) => ({ author: block.refs.author, seq: block.state.seq, prev: block.refs.prev, hash: block.hash || hash(block.type, block.state, block.refs) })

/**
 * A sealed copy: { version, header, header_signature, envelope }. The plaintext { version, block, signature, reveals }
 * is sealed to `keys` (encryption keys). A copy with reveals goes to one recipient, or to several who share every
 * reveal (the members of one circle). `privateKey` is the key that signed the block.
 */
function sealCopy(signed, { keys, reveals = [], privateKey, alg, fixed } = {}) {
  const top = header(signed)
  return { version: VERSION, header: top, header_signature: signMessage(top, privateKey).signature,
    envelope: seal({ ...wrap(signed), reveals }, keys, { ...(alg ? { alg } : {}), ...(fixed ? { fixed } : {}) }) }
}

/** Whether a sealed copy's header is signed by this key (the key that signed the block). */
const headerSignedBy = (message, publicKey) => verifyMessage({ ...message.header, signature: message.header_signature }, publicKey)

/** Open a sealed copy with a recipient's X25519 private key: the block, its signature and its reveals. The header must name it. */
function openCopy(message, x25519Private) {
  const plaintext = open(message.envelope, x25519Private)
  if (!PROTOCOL.messages.plaintext.every((key) => key === 'reveals' || key in plaintext)) throw new Error('write: a plaintext is { version, block, signature, reveals }')
  const inside = unwrap(plaintext)
  if (message.header && message.header.hash !== inside.hash) throw new Error('write: the header names another block')
  return { ...inside, reveals: plaintext.reveals || [] }
}

module.exports = { PUBLIC, compose, write, wrap, unwrap, header, sealCopy, headerSignedBy, openCopy }

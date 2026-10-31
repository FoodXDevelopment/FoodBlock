// The compact form (spec/modules/encoding.md): a signed public block as CBOR (RFC 8949) for links where JSON is too
// heavy. The rules run in the Rust core; this module turns bytes into the hex the door takes. The id of a decoded block
// is the hash of its canonical JSON, never of these bytes.
const door = require('./door.cjs')
const { list } = require('./core.cjs')

const hex = (bytes) => Buffer.from(bytes).toString('hex')
const bytesOf = (text) => new Uint8Array(Buffer.from(text, 'hex'))

/** A signed public block as the CBOR message [t, block, signature]. `short: true` uses the key table (protocol.json `cbor.keys`). */
const encode = (block, { short = false } = {}) => bytesOf(door.cborEncode(block, short))
/** The block a CBOR message carries, with its hash taken from its canonical JSON in the suite of the key that signed it (found among
 * `held`; without it, the suite the block shows). Refuses floats, tags, null, indefinite lengths, duplicate keys and anything after the signature. */
const decode = (bytes, { held } = {}) => (held === undefined ? door.cborDecode(hex(bytes)) : door.cborDecode(hex(bytes), list(held)))
/** A push of several blocks: an array of messages. */
const encodePush = (blocks, { short = false } = {}) => bytesOf(door.cborEncodePush(blocks, short))
const decodePush = (bytes) => door.cborDecodePush(hex(bytes))
/** A chain header { author, seq, prev, hash }. */
const encodeHeader = (header, { short = false } = {}) => bytesOf(door.cborEncodeHeader(header, short))
const decodeHeader = (bytes) => door.cborDecodeHeader(hex(bytes))

module.exports = { encode, decode, encodePush, decodePush, encodeHeader, decodeHeader, MEDIA_TYPE: 'application/foodblock+cbor' }

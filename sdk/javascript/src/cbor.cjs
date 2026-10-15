// The compact form (spec/modules/encoding.md): a signed public block as CBOR (RFC 8949) for links where JSON is too
// heavy. The rules run in the Rust core; this module turns bytes into the hex the door takes. The id of a decoded block
// is the hash of its canonical JSON, never of these bytes.
const { call } = require('./core.cjs')

const hex = (bytes) => Buffer.from(bytes).toString('hex')
const bytesOf = (text) => new Uint8Array(Buffer.from(text, 'hex'))

/** A signed public block as the CBOR message [t, block, signature]. `short: true` uses the key table (protocol.json `cbor.keys`). */
const encode = (block, { short = false } = {}) => bytesOf(call('cbor_encode', block, short))
/** The block a CBOR message carries, with its hash taken from its canonical JSON. Refuses floats, tags, null, indefinite lengths and duplicate keys. */
const decode = (bytes) => call('cbor_decode', hex(bytes))
/** A push of several blocks: an array of messages. */
const encodePush = (blocks, { short = false } = {}) => bytesOf(call('cbor_encode_push', blocks, short))
const decodePush = (bytes) => call('cbor_decode_push', hex(bytes))
/** A chain header { author, seq, prev, hash }. */
const encodeHeader = (header, { short = false } = {}) => bytesOf(call('cbor_encode_header', header, short))
const decodeHeader = (bytes) => call('cbor_decode_header', hex(bytes))

module.exports = { encode, decode, encodePush, decodePush, encodeHeader, decodeHeader, MEDIA_TYPE: 'application/foodblock+cbor' }

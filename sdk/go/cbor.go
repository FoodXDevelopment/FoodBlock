package foodblock

import "encoding/hex"

// The compact form (spec/modules/encoding.md): a signed public block as CBOR for small links. The rules run in the
// Rust core; these calls turn bytes into the hex the door takes. The id of a decoded block is the hash of its canonical
// JSON, never of these bytes. `short` uses the key table (protocol.json cbor.keys).

// CborMediaType is the media type of the compact form.
const CborMediaType = "application/foodblock+cbor"

func fromHex(h string, err error) ([]byte, error) {
	if err != nil {
		return nil, err
	}
	return hex.DecodeString(h)
}

// CborEncode is a signed public block as the CBOR message [t, block, signature].
func CborEncode(b Block, short bool) ([]byte, error) {
	return fromHex(ask[string]("cbor_encode", b, short))
}

// CborDecode is the block a CBOR message carries, its hash taken from its canonical JSON. It refuses floats, tags, null,
// indefinite lengths and duplicate keys.
func CborDecode(data []byte) (Block, error) {
	return ask[Block]("cbor_decode", hex.EncodeToString(data))
}

// CborEncodePush is a push of several blocks: an array of messages.
func CborEncodePush(blocks []Block, short bool) ([]byte, error) {
	return fromHex(ask[string]("cbor_encode_push", blocks, short))
}

func CborDecodePush(data []byte) ([]Block, error) {
	return ask[[]Block]("cbor_decode_push", hex.EncodeToString(data))
}

// CborEncodeHeader is a chain header { author, seq, prev, hash }.
func CborEncodeHeader(header map[string]any, short bool) ([]byte, error) {
	return fromHex(ask[string]("cbor_encode_header", header, short))
}

func CborDecodeHeader(data []byte) (map[string]any, error) {
	return ask[map[string]any]("cbor_decode_header", hex.EncodeToString(data))
}

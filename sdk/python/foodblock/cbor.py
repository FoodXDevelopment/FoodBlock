"""The compact form (spec/modules/encoding.md): a signed public block as CBOR for small links. The rules run in the
Rust core; this module turns bytes into the hex the door takes. The id of a decoded block is the hash of its canonical
JSON, never of these bytes."""

from . import _door as door

MEDIA_TYPE = "application/foodblock+cbor"


def encode(block, short=False) -> bytes:
    """A signed public block as the CBOR message [t, block, signature]. `short` uses the key table."""
    return bytes.fromhex(door.cbor_encode(block, bool(short)))


def decode(data, held=None) -> dict:
    """The block a CBOR message carries, its hash taken from its canonical JSON. Refuses floats, tags, null, indefinite
    lengths and duplicate keys. With `held` (the author's blocks) the id is taken in the suite of the key that signed it."""
    return door.cbor_decode(bytes(data).hex(), held)


def encode_push(blocks, short=False) -> bytes:
    return bytes.fromhex(door.cbor_encode_push(blocks, bool(short)))


def decode_push(data) -> list:
    return door.cbor_decode_push(bytes(data).hex())


def encode_header(header, short=False) -> bytes:
    return bytes.fromhex(door.cbor_encode_header(header, bool(short)))


def decode_header(data) -> dict:
    return door.cbor_decode_header(bytes(data).hex())

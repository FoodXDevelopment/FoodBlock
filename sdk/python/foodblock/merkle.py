"""Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block."""

from . import _door as door

root = door.merkle_root  # the root (64 hex) over the chunks (each hex)
proof = door.merkle_proof  # the sibling hashes (hex) that prove chunk `index`, from the leaf up


def verify(block, chunk, index, siblings) -> bool:
    """True when `siblings` show `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`), under its one merkle mark."""
    return door.merkle_verify(block, chunk, index, siblings)

"""Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block."""

from ._core import call


def root(chunks) -> str:
    """The root (64 hex) over the chunks (each hex)."""
    return call("merkle_root", list(chunks))


def proof(chunks, index) -> list:
    """The sibling hashes (hex) that prove chunk `index`, from the leaf up."""
    return call("merkle_proof", list(chunks), index)


def verify(block, chunk, index, siblings) -> bool:
    """True when `siblings` show `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`), under its one merkle mark."""
    return call("merkle_verify", block, chunk, index, list(siblings))

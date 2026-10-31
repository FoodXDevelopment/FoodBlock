package foodblock

// Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block.

// MerkleRoot is the root (64 hex) over the chunks (each hex).
func MerkleRoot(chunks []string) string { return doorMerkleRoot(chunks) }

// MerkleProof is the sibling hashes (hex) that prove chunk index, from the leaf up.
func MerkleProof(chunks []string, index int) []string { return doorMerkleProof(chunks, int64(index)) }

// MerkleVerify is whether siblings show chunk (hex) is chunk index of the count the block signs (state.chunks), under its one merkle mark.
func MerkleVerify(block Block, chunk string, index int, siblings []string) bool {
	return doorMerkleVerify(block, chunk, int64(index), siblings)
}

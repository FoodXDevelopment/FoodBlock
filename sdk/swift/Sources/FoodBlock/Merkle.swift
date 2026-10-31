import Foundation

/// Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block.
public enum Merkle {
    /// The root (64 hex) over the chunks (each hex).
    public static func root(_ chunks: [String]) throws -> String? { try Door.merkleRoot(chunks) }
    /// The sibling hashes (hex) that prove chunk `index`, from the leaf up.
    public static func proof(_ chunks: [String], _ index: Int) throws -> [String] { try Door.merkleProof(chunks, index) }
    /// True when `siblings` show `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`), under its one merkle mark.
    public static func verify(_ block: JSON, chunk: String, index: Int, siblings: [String]) throws -> Bool { try Door.merkleVerify(block, chunk, index, siblings) }
}

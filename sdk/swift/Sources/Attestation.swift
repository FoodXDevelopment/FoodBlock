import Foundation

// MARK: - Types

/// Result of tracing attestations and disputes for a block.
public struct AttestationTrace {
    /// All attestation blocks confirming the target.
    public let attestations: [FoodBlock]
    /// All dispute blocks challenging the target.
    public let disputes: [FoodBlock]
    /// Net trust score: attestations.count - disputes.count.
    public let score: Int
}

/// Errors that can occur during attestation operations.
public enum AttestationError: Error, CustomStringConvertible {
    case targetHashRequired
    case attestorHashRequired
    case disputerHashRequired
    case reasonRequired

    public var description: String {
        switch self {
        case .targetHashRequired:
            return "FoodBlock: targetHash is required"
        case .attestorHashRequired:
            return "FoodBlock: attestorHash is required"
        case .disputerHashRequired:
            return "FoodBlock: disputerHash is required"
        case .reasonRequired:
            return "FoodBlock: reason is required"
        }
    }
}

// MARK: - FoodBlockAttestation

/// Multi-party trust and dispute resolution.
/// Enables attestors to confirm or challenge claims via observe.attestation
/// and observe.dispute blocks.
public enum FoodBlockAttestation {

    /// Create an attestation block confirming a claim.
    ///
    /// - Parameters:
    ///   - targetHash: Hash of the block being attested.
    ///   - attestorHash: Hash of the attestor actor block.
    ///   - confidence: Confidence level: "verified", "probable", or "unverified". Defaults to "verified".
    ///   - method: Optional method string describing how the attestation was made.
    /// - Returns: An observe.attestation FoodBlock with refs.confirms and refs.attestor.
    public static func attest(
        targetHash: String,
        attestorHash: String,
        confidence: String = "verified",
        method: String? = nil
    ) -> FoodBlock {
        precondition(!targetHash.isEmpty, "FoodBlock: targetHash is required")
        precondition(!attestorHash.isEmpty, "FoodBlock: attestorHash is required")

        var state: [String: Any] = ["confidence": confidence]
        if let method = method {
            state["method"] = method
        }

        return FoodBlock.create(
            type: "observe.attestation",
            state: state,
            refs: [
                "confirms": targetHash,
                "attestor": attestorHash
            ]
        )
    }

    /// Create a dispute block challenging a claim.
    ///
    /// - Parameters:
    ///   - targetHash: Hash of the block being disputed.
    ///   - disputerHash: Hash of the disputer actor block.
    ///   - reason: Reason for the dispute.
    /// - Returns: An observe.dispute FoodBlock with refs.challenges and refs.disputor.
    public static func dispute(
        targetHash: String,
        disputerHash: String,
        reason: String
    ) -> FoodBlock {
        precondition(!targetHash.isEmpty, "FoodBlock: targetHash is required")
        precondition(!disputerHash.isEmpty, "FoodBlock: disputerHash is required")
        precondition(!reason.isEmpty, "FoodBlock: reason is required")

        return FoodBlock.create(
            type: "observe.dispute",
            state: ["reason": reason],
            refs: [
                "challenges": targetHash,
                "disputor": disputerHash
            ]
        )
    }

    /// Find all attestation and dispute blocks referencing a given hash.
    /// Searches through all provided blocks for those whose refs.confirms
    /// or refs.challenges match the target hash.
    ///
    /// - Parameters:
    ///   - hash: The target block hash to trace.
    ///   - allBlocks: Array of all known blocks to search through.
    /// - Returns: An `AttestationTrace` with matching attestations, disputes, and net score.
    public static func traceAttestations(
        hash: String,
        allBlocks: [FoodBlock]
    ) -> AttestationTrace {
        precondition(!hash.isEmpty, "FoodBlock: hash is required")

        var attestations: [FoodBlock] = []
        var disputes: [FoodBlock] = []

        for block in allBlocks {
            if let confirms = block.refs["confirms"]?.value as? String, confirms == hash {
                attestations.append(block)
            }
            if let challenges = block.refs["challenges"]?.value as? String, challenges == hash {
                disputes.append(block)
            }
        }

        let score = attestations.count - disputes.count

        return AttestationTrace(
            attestations: attestations,
            disputes: disputes,
            score: score
        )
    }

    /// Convenience function: returns just the numeric trust score for a block.
    /// Computed as attestations.count - disputes.count.
    ///
    /// - Parameters:
    ///   - hash: The target block hash.
    ///   - allBlocks: Array of all known blocks.
    /// - Returns: Net trust score (positive = more attestations than disputes).
    public static func trustScore(
        hash: String,
        allBlocks: [FoodBlock]
    ) -> Int {
        return traceAttestations(hash: hash, allBlocks: allBlocks).score
    }
}

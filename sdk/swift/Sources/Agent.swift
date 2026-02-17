import Foundation
import CryptoKit

public struct FoodBlockAgent {
    public let block: FoodBlock
    public let publicKeyHex: String
    public let privateKeyHex: String
    public let authorHash: String

    /// Create a new AI agent with its own identity and Ed25519 keypair.
    public static func create(name: String, operatorHash: String, opts: [String: Any] = [:]) throws -> FoodBlockAgent {
        guard !name.isEmpty else {
            throw FoodBlockError.invalidKey("FoodBlock Agent: name is required")
        }
        guard !operatorHash.isEmpty else {
            throw FoodBlockError.invalidKey("FoodBlock Agent: operatorHash is required")
        }

        let (pubHex, privHex) = FoodBlockVerify.generateKeypair()

        var state: [String: Any] = ["name": name]
        if let model = opts["model"] { state["model"] = model }
        if let caps = opts["capabilities"] { state["capabilities"] = caps }

        let block = FoodBlock.create(type: "actor.agent", state: state, refs: ["operator": operatorHash])

        return FoodBlockAgent(
            block: block,
            publicKeyHex: pubHex,
            privateKeyHex: privHex,
            authorHash: block.hash
        )
    }

    /// Sign a block on behalf of this agent.
    public func sign(block: FoodBlock) throws -> SignedBlock {
        return try FoodBlockVerify.sign(block: block, authorHash: authorHash, privateKeyHex: privateKeyHex)
    }

    /// Create a draft block on behalf of this agent.
    public func createDraft(type: String, state: [String: Any] = [:], refs: [String: Any] = [:]) throws -> (block: FoodBlock, signed: SignedBlock) {
        var draftState = state
        draftState["draft"] = true
        var draftRefs = refs
        draftRefs["agent"] = authorHash
        let block = FoodBlock.create(type: type, state: draftState, refs: draftRefs)
        let signed = try sign(block: block)
        return (block, signed)
    }

    /// Approve a draft block.
    public static func approveDraft(_ draftBlock: FoodBlock) -> FoodBlock {
        var approvedState: [String: Any] = [:]
        for (k, v) in draftBlock.state {
            if k != "draft" { approvedState[k] = v.value }
        }

        var approvedRefs: [String: Any] = [:]
        var agentHash: Any? = nil
        for (k, v) in draftBlock.refs {
            if k == "agent" { agentHash = v.value }
            else { approvedRefs[k] = v.value }
        }
        approvedRefs["updates"] = draftBlock.hash
        if let ah = agentHash { approvedRefs["approved_agent"] = ah }

        return FoodBlock.create(type: draftBlock.type, state: approvedState, refs: approvedRefs)
    }

    /// Load an existing agent from saved credentials.
    public static func load(authorHash: String, privateKeyHex: String, publicKeyHex: String = "") -> FoodBlockAgent {
        return FoodBlockAgent(
            block: FoodBlock.create(type: "actor.agent", state: [:]), // placeholder
            publicKeyHex: publicKeyHex,
            privateKeyHex: privateKeyHex,
            authorHash: authorHash
        )
    }
}

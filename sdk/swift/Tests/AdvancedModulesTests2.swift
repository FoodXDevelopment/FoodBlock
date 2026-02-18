import XCTest
import Foundation
@testable import FoodBlock

final class AdvancedModulesTests2: XCTestCase {

    // =========================================================================
    // MARK: - Helpers
    // =========================================================================

    /// Build a simple in-memory block store keyed by hash.
    private func makeStore(_ blocks: [FoodBlock]) -> [String: FoodBlock] {
        var store: [String: FoodBlock] = [:]
        for b in blocks { store[b.hash] = b }
        return store
    }

    /// Resolver that looks up a single block by hash from a dictionary.
    private func resolver(_ store: [String: FoodBlock]) -> (String) async -> FoodBlock? {
        return { hash in store[hash] }
    }

    /// Forward-resolver: given a hash, return all blocks in the store whose
    /// refs contain that hash (simulates a reverse-index lookup).
    private func forwardResolver(_ store: [String: FoodBlock]) -> (String) async -> [FoodBlock] {
        return { hash in
            store.values.filter { block in
                block.refs.values.contains { ref in
                    if let s = ref.value as? String { return s == hash }
                    if let arr = ref.value as? [Any] {
                        return arr.compactMap { $0 as? String }.contains(hash)
                    }
                    return false
                }
            }
        }
    }

    // =========================================================================
    // MARK: - Forward Tests
    // =========================================================================

    func testForward() async {
        // Create a source block and a block that references it.
        let source = FoodBlock.create(type: "substance.ingredient", state: ["name": "Flour"])
        let product = FoodBlock.create(
            type: "substance.product",
            state: ["name": "Bread"],
            refs: ["ingredient": source.hash]
        )
        let store = makeStore([source, product])
        let resolve = forwardResolver(store)

        let result = await FoodBlockForward.forward(hash: source.hash, resolveForward: resolve)

        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.referencing.first?.block.hash, product.hash)
        XCTAssertEqual(result.referencing.first?.role, "ingredient")
    }

    func testRecall() async {
        // Chain: ingredient -> transform -> product  (BFS should find both)
        let ingredient = FoodBlock.create(type: "substance.ingredient", state: ["name": "Flour"])
        let transform = FoodBlock.create(
            type: "transform.process",
            state: ["name": "Milling"],
            refs: ["input": ingredient.hash]
        )
        let product = FoodBlock.create(
            type: "substance.product",
            state: ["name": "Bread"],
            refs: ["origin": transform.hash]
        )
        let store = makeStore([ingredient, transform, product])
        let resolve = forwardResolver(store)

        let result = await FoodBlockForward.recall(sourceHash: ingredient.hash, resolveForward: resolve)

        XCTAssertEqual(result.affected.count, 2)
        XCTAssertGreaterThanOrEqual(result.depth, 2)
        let hashes = result.affected.map { $0.hash }
        XCTAssertTrue(hashes.contains(transform.hash))
        XCTAssertTrue(hashes.contains(product.hash))
    }

    func testRecallTypeFilter() async {
        // With type filter "substance.*", only substance blocks should be returned.
        let ingredient = FoodBlock.create(type: "substance.ingredient", state: ["name": "Flour"])
        let transform = FoodBlock.create(
            type: "transform.process",
            state: ["name": "Milling"],
            refs: ["input": ingredient.hash]
        )
        let product = FoodBlock.create(
            type: "substance.product",
            state: ["name": "Bread"],
            refs: ["origin": transform.hash]
        )
        let store = makeStore([ingredient, transform, product])
        let resolve = forwardResolver(store)

        let result = await FoodBlockForward.recall(
            sourceHash: ingredient.hash,
            resolveForward: resolve,
            types: ["substance.*"]
        )

        // transform.process is filtered out; only substance blocks pass.
        // But the BFS only follows blocks it includes, so product won't be found
        // because its ref points to transform (which is excluded).
        // The only substance block directly referencing ingredient is none;
        // transform references it. Since transform is excluded, BFS stops.
        XCTAssertEqual(result.affected.count, 0)

        // Now test with both type filters
        let result2 = await FoodBlockForward.recall(
            sourceHash: ingredient.hash,
            resolveForward: resolve,
            types: ["substance.*", "transform.*"]
        )
        XCTAssertEqual(result2.affected.count, 2)
    }

    func testDownstream() async {
        // downstream() is a convenience wrapper around recall() filtering for substance.*
        let ingredient = FoodBlock.create(type: "substance.ingredient", state: ["name": "Wheat"])
        let product = FoodBlock.create(
            type: "substance.product",
            state: ["name": "Flour"],
            refs: ["source": ingredient.hash]
        )
        let store = makeStore([ingredient, product])
        let resolve = forwardResolver(store)

        let downstream = await FoodBlockForward.downstream(
            ingredientHash: ingredient.hash,
            resolveForward: resolve
        )

        XCTAssertEqual(downstream.count, 1)
        XCTAssertEqual(downstream.first?.hash, product.hash)
    }

    // =========================================================================
    // MARK: - Merge Tests
    // =========================================================================

    func testDetectConflict() async {
        // Create a fork: original -> A and original -> B
        let original = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.50])
        let forkA = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 5.00])
        let forkB = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 5.50])

        let store = makeStore([original, forkA, forkB])
        let resolve = resolver(store)

        let conflict = await FoodBlockMerge.detectConflict(hashA: forkA.hash, hashB: forkB.hash, resolve: resolve)

        XCTAssertTrue(conflict.isConflict)
        XCTAssertEqual(conflict.commonAncestor, original.hash)
        XCTAssertFalse(conflict.chainA.isEmpty)
        XCTAssertFalse(conflict.chainB.isEmpty)
    }

    func testMergeManual() async throws {
        let original = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.50])
        let forkA = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 5.00])
        let forkB = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 5.50])

        let store = makeStore([original, forkA, forkB])
        let resolve = resolver(store)

        let merged = try await FoodBlockMerge.merge(
            hashA: forkA.hash,
            hashB: forkB.hash,
            resolve: resolve,
            strategy: "manual",
            state: ["name": "Bread", "price": 5.25]
        )

        XCTAssertEqual(merged.type, "observe.merge")
        XCTAssertEqual(merged.state["strategy"]?.value as? String, "manual")
        XCTAssertEqual(merged.state["name"]?.value as? String, "Bread")

        // refs.merges should contain both fork hashes
        if let merges = merged.refs["merges"]?.value as? [Any] {
            let mergeHashes = merges.compactMap { $0 as? String }
            XCTAssertTrue(mergeHashes.contains(forkA.hash))
            XCTAssertTrue(mergeHashes.contains(forkB.hash))
        } else {
            XCTFail("Expected refs.merges to be an array")
        }
    }

    func testMergeAWins() async throws {
        let original = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.50])
        let forkA = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Sourdough", "price": 6.00])
        let forkB = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Rye", "price": 5.50])

        let store = makeStore([original, forkA, forkB])
        let resolve = resolver(store)

        let merged = try await FoodBlockMerge.merge(
            hashA: forkA.hash,
            hashB: forkB.hash,
            resolve: resolve,
            strategy: "a_wins"
        )

        XCTAssertEqual(merged.type, "observe.merge")
        XCTAssertEqual(merged.state["strategy"]?.value as? String, "a_wins")
        XCTAssertEqual(merged.state["name"]?.value as? String, "Sourdough")
    }

    func testAutoMerge() async throws {
        let original = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.50])
        let forkA = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 5.00])
        let forkB = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 6.00])

        let store = makeStore([original, forkA, forkB])
        let resolve = resolver(store)

        // Vocabulary specifying per-field merge strategies
        let vocabulary: [String: Any] = [
            "fields": [
                "name": ["merge": "lww"],
                "price": ["merge": "max"]
            ]
        ]

        let merged = try await FoodBlockMerge.autoMerge(
            hashA: forkA.hash,
            hashB: forkB.hash,
            resolve: resolve,
            vocabulary: vocabulary
        )

        XCTAssertEqual(merged.type, "observe.merge")
        XCTAssertEqual(merged.state["strategy"]?.value as? String, "auto")
        // "max" strategy should pick the larger price
        XCTAssertEqual(merged.state["price"]?.value as? Double, 6.0)
        // "lww" strategy prefers B
        XCTAssertEqual(merged.state["name"]?.value as? String, "Bread")
    }

    // =========================================================================
    // MARK: - Merkle Tests
    // =========================================================================

    func testSha256Hex() {
        let hash = FoodBlockMerkle.sha256Hex("hello")
        XCTAssertEqual(hash.count, 64)
        // Known SHA-256 of "hello"
        XCTAssertEqual(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    }

    func testMerkleize() {
        let state: [String: Any] = ["name": "Bread", "price": 4.50]
        let result = FoodBlockMerkle.merkleize(state)

        XCTAssertEqual(result.root.count, 64)
        XCTAssertEqual(result.leaves.count, 2)
        XCTAssertTrue(result.leaves.keys.contains("name"))
        XCTAssertTrue(result.leaves.keys.contains("price"))
        // Tree should have at least leaf layer and root layer
        XCTAssertGreaterThanOrEqual(result.tree.count, 1)
    }

    func testSelectiveDisclose() {
        let state: [String: Any] = ["name": "Bread", "price": 4.50, "organic": true]
        let disclosure = FoodBlockMerkle.selectiveDisclose(state: state, fieldNames: ["name"])

        XCTAssertEqual(disclosure.disclosed.count, 1)
        XCTAssertEqual(disclosure.disclosed["name"] as? String, "Bread")
        XCTAssertEqual(disclosure.root.count, 64)
        XCTAssertFalse(disclosure.proof.isEmpty)
    }

    func testVerifyProof() {
        let state: [String: Any] = ["name": "Bread", "price": 4.50, "organic": true]
        let disclosure = FoodBlockMerkle.selectiveDisclose(state: state, fieldNames: ["name"])

        let valid = FoodBlockMerkle.verifyProof(
            disclosed: disclosure.disclosed,
            proof: disclosure.proof,
            root: disclosure.root
        )
        XCTAssertTrue(valid)

        // Tampered root should fail
        let tampered = FoodBlockMerkle.verifyProof(
            disclosed: disclosure.disclosed,
            proof: disclosure.proof,
            root: "0000000000000000000000000000000000000000000000000000000000000000"
        )
        XCTAssertFalse(tampered)
    }

    // =========================================================================
    // MARK: - Snapshot Tests
    // =========================================================================

    func testCreateSnapshot() {
        let blocks = [
            FoodBlock.create(type: "substance.product", state: ["name": "Bread"]),
            FoodBlock.create(type: "substance.product", state: ["name": "Cake"]),
            FoodBlock.create(type: "actor.producer", state: ["name": "Farm"]),
        ]

        let snapshot = FoodBlockSnapshot.createSnapshot(blocks: blocks)

        XCTAssertEqual(snapshot.type, "observe.snapshot")
        XCTAssertEqual(snapshot.state["block_count"]?.value as? Int, 3)
        XCTAssertNotNil(snapshot.state["merkle_root"]?.value as? String)
        let root = snapshot.state["merkle_root"]?.value as? String ?? ""
        XCTAssertEqual(root.count, 64)
    }

    func testVerifySnapshot() {
        let blocks = [
            FoodBlock.create(type: "substance.product", state: ["name": "Bread"]),
            FoodBlock.create(type: "substance.product", state: ["name": "Cake"]),
        ]

        let snapshot = FoodBlockSnapshot.createSnapshot(blocks: blocks)
        let result = FoodBlockSnapshot.verifySnapshot(snapshot: snapshot, blocks: blocks)

        XCTAssertTrue(result.valid)
        XCTAssertTrue(result.missing.isEmpty)

        // Verification with wrong blocks should fail
        let otherBlocks = [
            FoodBlock.create(type: "substance.product", state: ["name": "Pizza"]),
        ]
        let invalid = FoodBlockSnapshot.verifySnapshot(snapshot: snapshot, blocks: otherBlocks)
        XCTAssertFalse(invalid.valid)
    }

    func testSummarize() {
        let blocks = [
            FoodBlock.create(type: "substance.product", state: ["name": "Bread"]),
            FoodBlock.create(type: "substance.product", state: ["name": "Cake"]),
            FoodBlock.create(type: "actor.producer", state: ["name": "Farm"]),
            FoodBlock.create(type: "observe.review", state: ["rating": 5]),
        ]

        let summary = FoodBlockSnapshot.summarize(blocks: blocks)

        XCTAssertEqual(summary.total, 4)
        XCTAssertEqual(summary.byType["substance.product"], 2)
        XCTAssertEqual(summary.byType["actor.producer"], 1)
        XCTAssertEqual(summary.byType["observe.review"], 1)
    }

    // =========================================================================
    // MARK: - Attestation Tests
    // =========================================================================

    func testAttest() {
        let target = FoodBlock.create(type: "substance.product", state: ["name": "Organic Bread"])
        let attestor = FoodBlock.create(type: "actor.authority", state: ["name": "USDA"])

        let attestation = FoodBlockAttestation.attest(
            targetHash: target.hash,
            attestorHash: attestor.hash,
            confidence: "verified",
            method: "lab_test"
        )

        XCTAssertEqual(attestation.type, "observe.attestation")
        XCTAssertEqual(attestation.state["confidence"]?.value as? String, "verified")
        XCTAssertEqual(attestation.state["method"]?.value as? String, "lab_test")
        XCTAssertEqual(attestation.refs["confirms"]?.value as? String, target.hash)
        XCTAssertEqual(attestation.refs["attestor"]?.value as? String, attestor.hash)
    }

    func testDispute() {
        let target = FoodBlock.create(type: "substance.product", state: ["name": "Organic Bread"])
        let disputer = FoodBlock.create(type: "actor.authority", state: ["name": "FDA Inspector"])

        let dispute = FoodBlockAttestation.dispute(
            targetHash: target.hash,
            disputerHash: disputer.hash,
            reason: "Failed pesticide test"
        )

        XCTAssertEqual(dispute.type, "observe.dispute")
        XCTAssertEqual(dispute.state["reason"]?.value as? String, "Failed pesticide test")
        XCTAssertEqual(dispute.refs["challenges"]?.value as? String, target.hash)
        XCTAssertEqual(dispute.refs["disputor"]?.value as? String, disputer.hash)
    }

    func testTraceAttestations() {
        let target = FoodBlock.create(type: "substance.product", state: ["name": "Organic Bread"])
        let attestor1 = FoodBlock.create(type: "actor.authority", state: ["name": "USDA"])
        let attestor2 = FoodBlock.create(type: "actor.authority", state: ["name": "EU Organic"])
        let disputer = FoodBlock.create(type: "actor.authority", state: ["name": "Inspector"])

        let att1 = FoodBlockAttestation.attest(targetHash: target.hash, attestorHash: attestor1.hash)
        let att2 = FoodBlockAttestation.attest(targetHash: target.hash, attestorHash: attestor2.hash)
        let dis1 = FoodBlockAttestation.dispute(targetHash: target.hash, disputerHash: disputer.hash, reason: "Questionable source")

        let allBlocks = [target, attestor1, attestor2, disputer, att1, att2, dis1]
        let trace = FoodBlockAttestation.traceAttestations(hash: target.hash, allBlocks: allBlocks)

        XCTAssertEqual(trace.attestations.count, 2)
        XCTAssertEqual(trace.disputes.count, 1)
        XCTAssertEqual(trace.score, 1) // 2 attestations - 1 dispute
    }

    func testTrustScore() {
        let target = FoodBlock.create(type: "substance.product", state: ["name": "Cheese"])
        let actor1 = FoodBlock.create(type: "actor.authority", state: ["name": "A"])
        let actor2 = FoodBlock.create(type: "actor.authority", state: ["name": "B"])
        let actor3 = FoodBlock.create(type: "actor.authority", state: ["name": "C"])

        let att = FoodBlockAttestation.attest(targetHash: target.hash, attestorHash: actor1.hash)
        let dis1 = FoodBlockAttestation.dispute(targetHash: target.hash, disputerHash: actor2.hash, reason: "Bad")
        let dis2 = FoodBlockAttestation.dispute(targetHash: target.hash, disputerHash: actor3.hash, reason: "Worse")

        let allBlocks = [target, actor1, actor2, actor3, att, dis1, dis2]
        let score = FoodBlockAttestation.trustScore(hash: target.hash, allBlocks: allBlocks)

        XCTAssertEqual(score, -1) // 1 attestation - 2 disputes
    }

    // =========================================================================
    // MARK: - Verify Tests
    // =========================================================================

    func testGenerateKeypair() {
        let (pub, priv) = FoodBlockVerify.generateKeypair()
        XCTAssertEqual(pub.count, 64)
        XCTAssertEqual(priv.count, 64)
        // Keys should be hex strings
        let hexChars = CharacterSet(charactersIn: "0123456789abcdef")
        XCTAssertTrue(pub.unicodeScalars.allSatisfy { hexChars.contains($0) })
        XCTAssertTrue(priv.unicodeScalars.allSatisfy { hexChars.contains($0) })
    }

    func testSignAndVerify() throws {
        let (pub, priv) = FoodBlockVerify.generateKeypair()
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.50])
        let authorHash = "author123"

        let signed = try FoodBlockVerify.sign(block: block, authorHash: authorHash, privateKeyHex: priv)

        XCTAssertEqual(signed.foodblock.hash, block.hash)
        XCTAssertEqual(signed.author_hash, authorHash)
        XCTAssertFalse(signed.signature.isEmpty)

        let valid = FoodBlockVerify.verify(signed: signed, publicKeyHex: pub)
        XCTAssertTrue(valid)
    }

    func testRejectTampered() throws {
        let (pub, priv) = FoodBlockVerify.generateKeypair()
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Bread"])

        let signed = try FoodBlockVerify.sign(block: block, authorHash: "author", privateKeyHex: priv)

        // Tamper with the block by creating a different one and swapping it in
        let tampered = FoodBlock.create(type: "substance.product", state: ["name": "Cake"])
        let tamperedSigned = SignedBlock(
            foodblock: tampered,
            author_hash: signed.author_hash,
            signature: signed.signature,
            protocol_version: signed.protocol_version
        )

        let valid = FoodBlockVerify.verify(signed: tamperedSigned, publicKeyHex: pub)
        XCTAssertFalse(valid)
    }

    // =========================================================================
    // MARK: - Agent Tests
    // =========================================================================

    func testCreateAgent() throws {
        let operator_ = FoodBlock.create(type: "actor.producer", state: ["name": "Bakery Inc."])
        let agent = try FoodBlockAgent.create(name: "Bakery Assistant", operatorHash: operator_.hash)

        XCTAssertEqual(agent.block.type, "actor.agent")
        XCTAssertEqual(agent.block.state["name"]?.value as? String, "Bakery Assistant")
        XCTAssertEqual(agent.publicKeyHex.count, 64)
        XCTAssertEqual(agent.privateKeyHex.count, 64)
        XCTAssertFalse(agent.authorHash.isEmpty)
        XCTAssertEqual(agent.authorHash, agent.block.hash)
        XCTAssertEqual(agent.block.refs["operator"]?.value as? String, operator_.hash)
    }

    func testCreateDraft() throws {
        let operator_ = FoodBlock.create(type: "actor.producer", state: ["name": "Bakery"])
        let agent = try FoodBlockAgent.create(name: "Assistant", operatorHash: operator_.hash)

        let (draft, signed) = try agent.createDraft(
            type: "transfer.order",
            state: ["quantity": 50, "item": "Flour"],
            refs: ["supplier": "supplier_hash"]
        )

        XCTAssertEqual(draft.type, "transfer.order")
        XCTAssertEqual(draft.state["draft"]?.value as? Bool, true)
        XCTAssertEqual(draft.state["quantity"]?.value as? Int, 50)
        XCTAssertEqual(draft.refs["agent"]?.value as? String, agent.authorHash)

        // The signed block should be verifiable
        let valid = FoodBlockVerify.verify(signed: signed, publicKeyHex: agent.publicKeyHex)
        XCTAssertTrue(valid)
    }

    func testApproveDraft() throws {
        let operator_ = FoodBlock.create(type: "actor.producer", state: ["name": "Bakery"])
        let agent = try FoodBlockAgent.create(name: "Assistant", operatorHash: operator_.hash)

        let (draft, _) = try agent.createDraft(
            type: "transfer.order",
            state: ["quantity": 50],
            refs: [:]
        )

        let approved = FoodBlockAgent.approveDraft(draft)

        // draft flag should be removed
        XCTAssertNil(approved.state["draft"])
        // quantity should be preserved
        XCTAssertEqual(approved.state["quantity"]?.value as? Int, 50)
        // should reference the draft via updates
        XCTAssertEqual(approved.refs["updates"]?.value as? String, draft.hash)
        // should record which agent created it
        XCTAssertEqual(approved.refs["approved_agent"]?.value as? String, agent.authorHash)
        // type should be preserved
        XCTAssertEqual(approved.type, "transfer.order")
    }

    // =========================================================================
    // MARK: - Vocabulary Tests
    // =========================================================================

    func testVocabulariesExist() {
        let vocabs = FoodBlockVocabulary.vocabularies
        XCTAssertEqual(vocabs.count, 7)
        XCTAssertNotNil(vocabs["bakery"])
        XCTAssertNotNil(vocabs["restaurant"])
        XCTAssertNotNil(vocabs["farm"])
        XCTAssertNotNil(vocabs["retail"])
        XCTAssertNotNil(vocabs["lot"])
        XCTAssertNotNil(vocabs["units"])
        XCTAssertNotNil(vocabs["workflow"])
    }

    func testMapFields() {
        let bakeryVocab = FoodBlockVocabulary.vocabularies["bakery"]!
        let result = FoodBlockVocabulary.mapFields(text: "Sourdough bread, price 4.50, organic", vocabulary: bakeryVocab)

        // price should be extracted as a number
        XCTAssertNotNil(result.matched["price"])
        if let price = result.matched["price"] as? Double {
            XCTAssertEqual(price, 4.5, accuracy: 0.01)
        }

        // organic should be detected as a boolean flag
        XCTAssertNotNil(result.matched["organic"])
    }

    func testTransition() {
        // Valid transitions
        XCTAssertTrue(FoodBlockVocabulary.transition(from: "draft", to: "order"))
        XCTAssertTrue(FoodBlockVocabulary.transition(from: "order", to: "confirmed"))
        XCTAssertTrue(FoodBlockVocabulary.transition(from: "shipped", to: "delivered"))

        // Invalid transitions
        XCTAssertFalse(FoodBlockVocabulary.transition(from: "draft", to: "delivered"))
        XCTAssertFalse(FoodBlockVocabulary.transition(from: "paid", to: "draft"))
        XCTAssertFalse(FoodBlockVocabulary.transition(from: "nonexistent", to: "order"))
    }

    // =========================================================================
    // MARK: - Template Tests
    // =========================================================================

    func testTemplatesExist() {
        let templates = FoodBlockTemplate.templates
        XCTAssertEqual(templates.count, 3)
        XCTAssertNotNil(templates["supply-chain"])
        XCTAssertNotNil(templates["review"])
        XCTAssertNotNil(templates["certification"])
    }

    func testFromTemplate() {
        let template = FoodBlockTemplate.templates["supply-chain"]!

        let blocks = FoodBlockTemplate.fromTemplate(template, values: [
            "farm": StepOverrides(state: ["name": "Green Acres"]),
            "crop": StepOverrides(state: ["name": "Wheat"]),
            "processing": StepOverrides(state: ["name": "Milling"]),
            "product": StepOverrides(state: ["name": "Flour"]),
            "sale": StepOverrides(state: ["quantity": 100]),
        ])

        XCTAssertEqual(blocks.count, 5)

        // Check types
        XCTAssertEqual(blocks[0].type, "actor.producer")
        XCTAssertEqual(blocks[1].type, "substance.ingredient")
        XCTAssertEqual(blocks[2].type, "transform.process")
        XCTAssertEqual(blocks[3].type, "substance.product")
        XCTAssertEqual(blocks[4].type, "transfer.order")

        // Check that inter-block refs resolved correctly
        // crop.refs.source should be farm's hash
        XCTAssertEqual(blocks[1].refs["source"]?.value as? String, blocks[0].hash)
        // processing.refs.input should be crop's hash
        XCTAssertEqual(blocks[2].refs["input"]?.value as? String, blocks[1].hash)
        // product.refs.origin should be processing's hash
        XCTAssertEqual(blocks[3].refs["origin"]?.value as? String, blocks[2].hash)
        // sale.refs.item should be product's hash
        XCTAssertEqual(blocks[4].refs["item"]?.value as? String, blocks[3].hash)
    }

    func testCreateTemplate() {
        let steps = [
            TemplateStep(type: "actor.producer", alias: "farm", required: ["name"]),
            TemplateStep(type: "substance.ingredient", alias: "crop", refs: ["source": "@farm"]),
        ]

        let block = FoodBlockTemplate.createTemplate(
            name: "Custom Chain",
            description: "A custom supply chain",
            steps: steps,
            author: "author_hash"
        )

        XCTAssertEqual(block.type, "observe.template")
        XCTAssertEqual(block.state["name"]?.value as? String, "Custom Chain")
        XCTAssertEqual(block.state["description"]?.value as? String, "A custom supply chain")
        XCTAssertEqual(block.refs["author"]?.value as? String, "author_hash")

        // steps should be stored in state
        XCTAssertNotNil(block.state["steps"])
    }

    // =========================================================================
    // MARK: - FB Tests
    // =========================================================================

    func testFBProduct() {
        let result = FoodBlockFB.fb("Sourdough bread, $4.50, organic, contains gluten")

        XCTAssertEqual(result.type, "substance.product")
        XCTAssertFalse(result.blocks.isEmpty)
        XCTAssertEqual(result.text, "Sourdough bread, $4.50, organic, contains gluten")

        // Should extract price
        if let price = result.state["price"] as? [String: Any],
           let value = price["value"] as? Double {
            XCTAssertEqual(value, 4.5, accuracy: 0.01)
        }
    }

    func testFBReview() {
        let result = FoodBlockFB.fb("Amazing pizza at Luigi's, 5 stars")

        XCTAssertEqual(result.type, "observe.review")
        XCTAssertFalse(result.blocks.isEmpty)

        // Should extract rating
        if let rating = result.state["rating"] as? Double {
            XCTAssertEqual(rating, 5.0, accuracy: 0.01)
        }
    }

    func testFBFarm() {
        let result = FoodBlockFB.fb("Green Acres Farm, 200 acres, organic wheat in Oregon")

        XCTAssertEqual(result.type, "actor.producer")
        XCTAssertFalse(result.blocks.isEmpty)

        // Should detect organic flag
        if let organic = result.state["organic"] as? Bool {
            XCTAssertTrue(organic)
        }
    }
}

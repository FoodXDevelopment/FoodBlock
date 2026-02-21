import XCTest
import Foundation
@testable import FoodBlock

final class TrustSeedTests: XCTestCase {

    // =========================================================================
    // MARK: - instance_id Auto-Injection Tests
    // =========================================================================

    func testInstanceIdInjectedForTransferOrder() {
        let block = FoodBlock.create(type: "transfer.order", state: ["quantity": 10])
        let instanceId = block.state["instance_id"]?.value as? String
        XCTAssertNotNil(instanceId, "transfer.order should have auto-injected instance_id")
        XCTAssertFalse(instanceId!.isEmpty)
    }

    func testInstanceIdInjectedForTransformProcess() {
        let block = FoodBlock.create(type: "transform.process", state: ["name": "Baking"])
        let instanceId = block.state["instance_id"]?.value as? String
        XCTAssertNotNil(instanceId, "transform.process should have auto-injected instance_id")
    }

    func testInstanceIdInjectedForObserveReview() {
        let block = FoodBlock.create(type: "observe.review", state: ["rating": 5])
        let instanceId = block.state["instance_id"]?.value as? String
        XCTAssertNotNil(instanceId, "observe.review should have auto-injected instance_id")
    }

    func testInstanceIdNotInjectedForActorProducer() {
        let block = FoodBlock.create(type: "actor.producer", state: ["name": "Farm"])
        XCTAssertNil(block.state["instance_id"], "actor.producer should NOT get instance_id")
    }

    func testInstanceIdNotInjectedForSubstanceProduct() {
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Bread"])
        XCTAssertNil(block.state["instance_id"], "substance.product should NOT get instance_id")
    }

    func testInstanceIdNotInjectedForPlaceFarm() {
        let block = FoodBlock.create(type: "place.farm", state: ["name": "Field"])
        XCTAssertNil(block.state["instance_id"], "place.farm should NOT get instance_id")
    }

    func testInstanceIdNotInjectedForDefinitionalTypes() {
        let vocabBlock = FoodBlock.create(type: "observe.vocabulary", state: ["domain": "test"])
        XCTAssertNil(vocabBlock.state["instance_id"], "observe.vocabulary should NOT get instance_id")

        let templateBlock = FoodBlock.create(type: "observe.template", state: ["name": "test"])
        XCTAssertNil(templateBlock.state["instance_id"], "observe.template should NOT get instance_id")

        let schemaBlock = FoodBlock.create(type: "observe.schema", state: ["name": "test"])
        XCTAssertNil(schemaBlock.state["instance_id"], "observe.schema should NOT get instance_id")

        let policyBlock = FoodBlock.create(type: "observe.trust_policy", state: ["name": "test"])
        XCTAssertNil(policyBlock.state["instance_id"], "observe.trust_policy should NOT get instance_id")

        let protocolBlock = FoodBlock.create(type: "observe.protocol", state: ["version": "1.0"])
        XCTAssertNil(protocolBlock.state["instance_id"], "observe.protocol should NOT get instance_id")
    }

    func testInstanceIdPreservedWhenProvided() {
        let customId = "my-custom-instance-id"
        let block = FoodBlock.create(type: "transfer.order", state: ["instance_id": customId, "quantity": 10])
        let instanceId = block.state["instance_id"]?.value as? String
        XCTAssertEqual(instanceId, customId, "Provided instance_id should not be overwritten")
    }

    func testInstanceIdMakesEventBlocksUnique() {
        let a = FoodBlock.create(type: "transfer.order", state: ["quantity": 10])
        let b = FoodBlock.create(type: "transfer.order", state: ["quantity": 10])
        XCTAssertNotEqual(a.hash, b.hash, "Two event blocks should have different hashes due to unique instance_id")
    }

    func testDeterministicHashStillWorksForNonEventTypes() {
        let a = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.5])
        let b = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.5])
        XCTAssertEqual(a.hash, b.hash, "Non-event types should still produce deterministic hashes")
    }

    // =========================================================================
    // MARK: - Trust Computation Tests
    // =========================================================================

    func testDefaultTrustWeights() {
        XCTAssertEqual(DEFAULT_TRUST_WEIGHTS["authority_certs"], 3.0)
        XCTAssertEqual(DEFAULT_TRUST_WEIGHTS["peer_reviews"], 1.0)
        XCTAssertEqual(DEFAULT_TRUST_WEIGHTS["chain_depth"], 2.0)
        XCTAssertEqual(DEFAULT_TRUST_WEIGHTS["verified_orders"], 1.5)
        XCTAssertEqual(DEFAULT_TRUST_WEIGHTS["account_age"], 0.5)
        XCTAssertEqual(DEFAULT_TRUST_WEIGHTS.count, 5)
    }

    func testComputeTrustEmptyBlocks() {
        let result = FoodBlockTrust.computeTrust(actorHash: "actor123", blocks: [])
        XCTAssertEqual(result.score, 0)
        XCTAssertTrue(result.meetsMinimum)
    }

    func testComputeTrustWithCertification() {
        let actorHash = "actor123"
        let blocks: [[String: Any]] = [
            [
                "hash": "cert1",
                "type": "observe.certification",
                "state": ["name": "Organic Cert"] as [String: Any],
                "refs": ["subject": actorHash, "authority": "auth1"] as [String: Any]
            ]
        ]

        let result = FoodBlockTrust.computeTrust(actorHash: actorHash, blocks: blocks)
        XCTAssertGreaterThan(result.score, 0, "Score should be positive with a certification")

        let authCerts = result.inputs["authority_certs"] as? Int
        XCTAssertEqual(authCerts, 1)
    }

    func testComputeTrustWithReviews() {
        let actorHash = "actor123"
        let blocks: [[String: Any]] = [
            [
                "hash": "review1",
                "type": "observe.review",
                "state": ["rating": 5.0] as [String: Any],
                "refs": ["subject": actorHash, "author": "reviewer1"] as [String: Any],
                "author_hash": "reviewer1"
            ],
            [
                "hash": "review2",
                "type": "observe.review",
                "state": ["rating": 4.0] as [String: Any],
                "refs": ["subject": actorHash, "author": "reviewer2"] as [String: Any],
                "author_hash": "reviewer2"
            ]
        ]

        let result = FoodBlockTrust.computeTrust(actorHash: actorHash, blocks: blocks)
        XCTAssertGreaterThan(result.score, 0)

        let peerReviews = result.inputs["peer_reviews"] as? [String: Any]
        XCTAssertNotNil(peerReviews)
        XCTAssertEqual(peerReviews?["count"] as? Int, 2)
        let avgScore = peerReviews?["avg_score"] as? Double ?? 0
        XCTAssertEqual(avgScore, 4.5, accuracy: 0.01)
    }

    func testComputeTrustWithChainDepth() {
        let actorHash = "actor123"
        let blocks: [[String: Any]] = [
            [
                "hash": "b1",
                "type": "substance.product",
                "state": [:] as [String: Any],
                "refs": ["seller": actorHash] as [String: Any],
                "author_hash": "author_a"
            ],
            [
                "hash": "b2",
                "type": "substance.product",
                "state": [:] as [String: Any],
                "refs": ["seller": actorHash] as [String: Any],
                "author_hash": "author_b"
            ],
            [
                "hash": "b3",
                "type": "substance.product",
                "state": [:] as [String: Any],
                "refs": ["seller": actorHash] as [String: Any],
                "author_hash": "author_a"
            ]
        ]

        let result = FoodBlockTrust.computeTrust(actorHash: actorHash, blocks: blocks)
        let chainDepth = result.inputs["chain_depth"] as? Int
        XCTAssertEqual(chainDepth, 2, "Two distinct author_hash values")
    }

    func testComputeTrustWithVerifiedOrders() {
        let actorHash = "actor123"
        let blocks: [[String: Any]] = [
            [
                "hash": "o1",
                "type": "transfer.order",
                "state": ["adapter_ref": "stripe_123"] as [String: Any],
                "refs": ["buyer": actorHash] as [String: Any]
            ],
            [
                "hash": "o2",
                "type": "transfer.order",
                "state": ["payment_ref": "pay_456"] as [String: Any],
                "refs": ["seller": actorHash] as [String: Any]
            ],
            [
                "hash": "o3",
                "type": "transfer.order",
                "state": ["quantity": 5] as [String: Any],
                "refs": ["buyer": actorHash] as [String: Any]
            ]
        ]

        let result = FoodBlockTrust.computeTrust(actorHash: actorHash, blocks: blocks)
        let verifiedOrders = result.inputs["verified_orders"] as? Int
        XCTAssertEqual(verifiedOrders, 2, "Two orders with adapter_ref or payment_ref")
    }

    func testComputeTrustMeetsMinimum() {
        let result = FoodBlockTrust.computeTrust(
            actorHash: "actor123",
            blocks: [],
            policy: ["min_score": 10.0]
        )
        XCTAssertFalse(result.meetsMinimum, "Score 0 should not meet minimum 10")
    }

    func testComputeTrustCustomWeights() {
        let actorHash = "actor123"
        let blocks: [[String: Any]] = [
            [
                "hash": "cert1",
                "type": "observe.certification",
                "state": [:] as [String: Any],
                "refs": ["subject": actorHash] as [String: Any]
            ]
        ]

        let result = FoodBlockTrust.computeTrust(
            actorHash: actorHash,
            blocks: blocks,
            policy: ["weights": ["authority_certs": 10.0]]
        )
        XCTAssertEqual(result.score, 10.0, accuracy: 0.01, "1 cert * 10.0 weight = 10.0")
    }

    // =========================================================================
    // MARK: - Connection Density Tests
    // =========================================================================

    func testConnectionDensityNoConnection() {
        let blocks: [[String: Any]] = [
            ["hash": "b1", "type": "t", "state": [:] as [String: Any], "refs": ["a": "actorA"] as [String: Any]],
            ["hash": "b2", "type": "t", "state": [:] as [String: Any], "refs": ["a": "actorB"] as [String: Any]]
        ]
        let density = FoodBlockTrust.connectionDensity(actorA: "actorA", actorB: "actorB", blocks: blocks)
        XCTAssertEqual(density, 0, "No shared refs means density 0")
    }

    func testConnectionDensitySharedRefs() {
        let blocks: [[String: Any]] = [
            [
                "hash": "b1", "type": "t",
                "state": [:] as [String: Any],
                "refs": ["a": "actorA", "shared": "common_ref"] as [String: Any]
            ],
            [
                "hash": "b2", "type": "t",
                "state": [:] as [String: Any],
                "refs": ["a": "actorB", "shared": "common_ref"] as [String: Any]
            ]
        ]
        let density = FoodBlockTrust.connectionDensity(actorA: "actorA", actorB: "actorB", blocks: blocks)
        XCTAssertGreaterThan(density, 0, "Shared refs should produce positive density")
        XCTAssertLessThanOrEqual(density, 1.0)
    }

    func testConnectionDensityNilActors() {
        let density = FoodBlockTrust.connectionDensity(actorA: nil, actorB: "actor", blocks: [])
        XCTAssertEqual(density, 0)

        let density2 = FoodBlockTrust.connectionDensity(actorA: "actor", actorB: nil, blocks: [])
        XCTAssertEqual(density2, 0)
    }

    // =========================================================================
    // MARK: - Trust Policy Tests
    // =========================================================================

    func testCreateTrustPolicy() {
        let policy = FoodBlockTrust.createTrustPolicy(
            name: "Strict Policy",
            weights: ["authority_certs": 5.0, "peer_reviews": 2.0],
            requiredAuthorities: ["usda", "fda"],
            minScore: 15.0,
            author: "author_hash"
        )

        XCTAssertEqual(policy.type, "observe.trust_policy")
        XCTAssertEqual(policy.state["name"]?.value as? String, "Strict Policy")
        XCTAssertEqual(policy.state["min_score"]?.value as? Double, 15.0)
        XCTAssertEqual(policy.refs["author"]?.value as? String, "author_hash")

        let ra = policy.state["required_authorities"]?.value as? [Any]
        XCTAssertNotNil(ra)
        let raStrings = ra?.compactMap { $0 as? String }
        XCTAssertTrue(raStrings?.contains("usda") ?? false)
        XCTAssertTrue(raStrings?.contains("fda") ?? false)
    }

    func testCreateTrustPolicyMinimal() {
        let policy = FoodBlockTrust.createTrustPolicy(
            name: "Basic",
            weights: ["authority_certs": 1.0]
        )
        XCTAssertEqual(policy.type, "observe.trust_policy")
        XCTAssertEqual(policy.state["name"]?.value as? String, "Basic")
        XCTAssertNil(policy.state["required_authorities"])
        XCTAssertNil(policy.state["min_score"])
        XCTAssertNil(policy.refs["author"])
    }

    // =========================================================================
    // MARK: - Seed Tests
    // =========================================================================

    func testSeedVocabularies() {
        let vocabs = FoodBlockSeed.seedVocabularies()
        XCTAssertEqual(vocabs.count, FoodBlockVocabulary.vocabularies.count)
        for block in vocabs {
            XCTAssertEqual(block.type, "observe.vocabulary")
            XCTAssertEqual(block.hash.count, 64)
            XCTAssertNotNil(block.state["domain"])
            XCTAssertNotNil(block.state["for_types"])
            XCTAssertNotNil(block.state["fields"])
        }
    }

    func testSeedTemplates() {
        let templates = FoodBlockSeed.seedTemplates()
        XCTAssertEqual(templates.count, FoodBlockTemplate.templates.count)
        for block in templates {
            XCTAssertEqual(block.type, "observe.template")
            XCTAssertEqual(block.hash.count, 64)
            XCTAssertNotNil(block.state["name"])
            XCTAssertNotNil(block.state["description"])
            XCTAssertNotNil(block.state["steps"])
        }
    }

    func testSeedAll() {
        let all = FoodBlockSeed.seedAll()
        let expectedCount = FoodBlockVocabulary.vocabularies.count + FoodBlockTemplate.templates.count
        XCTAssertEqual(all.count, expectedCount, "seedAll should return vocabularies + templates")
    }

    func testSeedVocabularyDeterministic() {
        let a = FoodBlockSeed.seedVocabularies()
        let b = FoodBlockSeed.seedVocabularies()
        let hashesA = Set(a.map(\.hash))
        let hashesB = Set(b.map(\.hash))
        XCTAssertEqual(hashesA, hashesB, "Seed vocabularies should produce deterministic hashes")
    }

    func testSeedTemplateDeterministic() {
        let a = FoodBlockSeed.seedTemplates()
        let b = FoodBlockSeed.seedTemplates()
        let hashesA = Set(a.map(\.hash))
        let hashesB = Set(b.map(\.hash))
        XCTAssertEqual(hashesA, hashesB, "Seed templates should produce deterministic hashes")
    }

    func testSeedVocabularyContainsBakery() {
        let vocabs = FoodBlockSeed.seedVocabularies()
        let domains = vocabs.compactMap { $0.state["domain"]?.value as? String }
        XCTAssertTrue(domains.contains("bakery"), "Seed should include bakery vocabulary")
        XCTAssertTrue(domains.contains("restaurant"), "Seed should include restaurant vocabulary")
        XCTAssertTrue(domains.contains("farm"), "Seed should include farm vocabulary")
    }

    func testSeedTemplateContainsSupplyChain() {
        let templates = FoodBlockSeed.seedTemplates()
        let names = templates.compactMap { $0.state["name"]?.value as? String }
        XCTAssertTrue(names.contains("Farm-to-Table Supply Chain"), "Seed should include supply-chain template")
        XCTAssertTrue(names.contains("Product Review"), "Seed should include review template")
    }
}

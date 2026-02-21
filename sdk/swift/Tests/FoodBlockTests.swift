import XCTest
import Foundation
@testable import FoodBlock

final class FoodBlockTests: XCTestCase {

    // MARK: - Cross-Language Vector Tests

    func testCrossLanguageVectors() throws {
        let testsDir = URL(fileURLWithPath: #file).deletingLastPathComponent()
        let vectorsPath = testsDir
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // swift
            .deletingLastPathComponent() // sdk
            .appendingPathComponent("test")
            .appendingPathComponent("vectors.json")

        let data = try Data(contentsOf: vectorsPath)

        struct Vector: Decodable {
            let name: String
            let type: String
            let state: [String: AnyCodable]
            let refs: [String: AnyCodable]
            let expected_canonical: String
            let expected_hash: String
        }

        let vectors = try JSONDecoder().decode([Vector].self, from: data)

        for vector in vectors {
            let stateDict = vector.state.mapValues { $0.value }
            let refsDict = vector.refs.mapValues { $0.value }

            let c = Canonical.canonical(type: vector.type, state: stateDict, refs: refsDict)
            XCTAssertEqual(c, vector.expected_canonical, "Canonical mismatch for \"\(vector.name)\"")

            let block = FoodBlock.create(type: vector.type, state: stateDict, refs: refsDict)
            XCTAssertEqual(block.hash, vector.expected_hash, "Hash mismatch for \"\(vector.name)\"")
        }
    }

    // MARK: - Unit Tests

    func testGenesisBlock() {
        let block = FoodBlock.create(type: "actor.producer", state: ["name": "Test Farm"])
        XCTAssertEqual(block.type, "actor.producer")
        XCTAssertEqual(block.hash.count, 64)
    }

    func testDeterministicHash() {
        let a = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.5], refs: ["seller": "abc"])
        let b = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.5], refs: ["seller": "abc"])
        XCTAssertEqual(a.hash, b.hash)
    }

    func testDifferentContentDifferentHash() {
        let a = FoodBlock.create(type: "substance.product", state: ["name": "Bread"])
        let b = FoodBlock.create(type: "substance.product", state: ["name": "Cake"])
        XCTAssertNotEqual(a.hash, b.hash)
    }

    func testKeyOrderIndependence() {
        let a = FoodBlock.create(type: "test", state: ["a": 1, "b": 2])
        let b = FoodBlock.create(type: "test", state: ["b": 2, "a": 1])
        XCTAssertEqual(a.hash, b.hash)
    }

    func testRefsArraySorting() {
        // Use explicit instance_id so auto-injection doesn't add random UUIDs
        let iid = "test-instance-id"
        let a = FoodBlock.create(type: "transform.process", state: ["instance_id": iid], refs: ["inputs": ["abc", "def"]])
        let b = FoodBlock.create(type: "transform.process", state: ["instance_id": iid], refs: ["inputs": ["def", "abc"]])
        XCTAssertEqual(a.hash, b.hash)
    }

    func testUpdateChain() {
        let original = FoodBlock.create(type: "substance.product", state: ["name": "Bread", "price": 4.5])
        let updated = FoodBlock.update(previousHash: original.hash, type: "substance.product", state: ["name": "Bread", "price": 5.0])
        XCTAssertNotEqual(original.hash, updated.hash)
    }

    func testAllBaseTypes() {
        let types: [(String, [String: Any])] = [
            ("actor.producer", ["name": "Farm"]),
            ("place.farm", ["name": "Field"]),
            ("substance.product", ["name": "Bread"]),
            ("transform.process", ["name": "Baking"]),
            ("transfer.order", ["quantity": 2]),
            ("observe.review", ["rating": 5]),
        ]
        for (type, state) in types {
            let block = FoodBlock.create(type: type, state: state)
            XCTAssertEqual(block.hash.count, 64)
        }
    }

    func testVisibilityAffectsHash() {
        let a = FoodBlock.create(type: "observe.post", state: ["text": "Hello", "visibility": "direct"])
        let b = FoodBlock.create(type: "observe.post", state: ["text": "Hello", "visibility": "public"])
        XCTAssertNotEqual(a.hash, b.hash)
    }

    func testTombstone() {
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Test"])
        let ts = FoodBlock.tombstone(targetHash: block.hash, requestedBy: "user_hash")
        XCTAssertEqual(ts.type, "observe.tombstone")
    }
}

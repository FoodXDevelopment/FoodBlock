import XCTest
import Foundation
@testable import FoodBlock

final class AdvancedModulesTests: XCTestCase {

    // MARK: - Encrypt Tests

    func testGenerateEncryptionKeypair() {
        let keypair = FoodBlockEncrypt.generateEncryptionKeypair()
        XCTAssertEqual(keypair.publicKey.count, 64, "Public key should be 64 hex chars (32 bytes)")
        XCTAssertEqual(keypair.privateKey.count, 64, "Private key should be 64 hex chars (32 bytes)")
        XCTAssertNotEqual(keypair.publicKey, keypair.privateKey, "Public and private keys must differ")
    }

    func testEncryptDecryptRoundtrip() throws {
        let keypair = FoodBlockEncrypt.generateEncryptionKeypair()
        let original = "hello foodblock"
        let envelope = try FoodBlockEncrypt.encrypt(value: original, recipientPublicKeys: [keypair.publicKey])
        let decrypted = try FoodBlockEncrypt.decrypt(
            envelope: envelope,
            privateKeyHex: keypair.privateKey,
            publicKeyHex: keypair.publicKey
        )
        XCTAssertEqual(decrypted as? String, original, "Decrypted value should match original")
    }

    func testEncryptMultipleRecipients() throws {
        let keypair1 = FoodBlockEncrypt.generateEncryptionKeypair()
        let keypair2 = FoodBlockEncrypt.generateEncryptionKeypair()
        let original = "secret for two"
        let envelope = try FoodBlockEncrypt.encrypt(
            value: original,
            recipientPublicKeys: [keypair1.publicKey, keypair2.publicKey]
        )

        let decrypted1 = try FoodBlockEncrypt.decrypt(
            envelope: envelope,
            privateKeyHex: keypair1.privateKey,
            publicKeyHex: keypair1.publicKey
        )
        XCTAssertEqual(decrypted1 as? String, original, "Recipient 1 should decrypt successfully")

        let decrypted2 = try FoodBlockEncrypt.decrypt(
            envelope: envelope,
            privateKeyHex: keypair2.privateKey,
            publicKeyHex: keypair2.publicKey
        )
        XCTAssertEqual(decrypted2 as? String, original, "Recipient 2 should decrypt successfully")
    }

    func testDecryptWrongKeyFails() throws {
        let keypair1 = FoodBlockEncrypt.generateEncryptionKeypair()
        let keypair2 = FoodBlockEncrypt.generateEncryptionKeypair()
        let envelope = try FoodBlockEncrypt.encrypt(value: "secret", recipientPublicKeys: [keypair1.publicKey])

        XCTAssertThrowsError(
            try FoodBlockEncrypt.decrypt(
                envelope: envelope,
                privateKeyHex: keypair2.privateKey,
                publicKeyHex: keypair2.publicKey
            ),
            "Decrypting with wrong key should throw"
        )
    }

    // MARK: - Validate Tests

    func testValidateValidBlock() {
        let block = FoodBlock.create(
            type: "substance.product",
            state: ["name": "Sourdough", "$schema": "foodblock:substance.product@1.0"],
            refs: ["seller": "abc123"]
        )
        let errors = FoodBlockValidate.validate(block: block)
        XCTAssertTrue(errors.isEmpty, "Valid block should have no errors, got: \(errors)")
    }

    func testValidateMissingRequiredField() {
        let block = FoodBlock.create(
            type: "substance.product",
            state: ["price": 4.50, "$schema": "foodblock:substance.product@1.0"],
            refs: ["seller": "abc123"]
        )
        let errors = FoodBlockValidate.validate(block: block)
        XCTAssertFalse(errors.isEmpty, "Block without required name field should have errors")
        let hasNameError = errors.contains { $0.contains("name") }
        XCTAssertTrue(hasNameError, "Errors should mention missing 'name' field")
    }

    func testValidateNoSchema() {
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Bread"])
        let errors = FoodBlockValidate.validate(block: block)
        XCTAssertTrue(errors.isEmpty, "Block without $schema should be considered valid (empty errors)")
    }

    func testCoreSchemas() {
        let schemas = FoodBlockValidate.coreSchemas
        XCTAssertEqual(schemas.count, 5, "Should have 5 core schemas")
    }

    // MARK: - Offline Tests

    func testOfflineQueueCreate() {
        let queue = OfflineQueue()
        let block = queue.create(type: "substance.product", state: ["name": "Bread"])
        XCTAssertEqual(queue.blocks.count, 1, "Queue should contain 1 block")
        XCTAssertEqual(queue.blocks[0].hash, block.hash, "Queued block hash should match returned block")
    }

    func testOfflineQueueClear() {
        let queue = OfflineQueue()
        queue.create(type: "substance.product", state: ["name": "Bread"])
        queue.create(type: "substance.product", state: ["name": "Cake"])
        XCTAssertEqual(queue.count, 2)
        queue.clear()
        XCTAssertEqual(queue.count, 0, "Queue should be empty after clear")
        XCTAssertTrue(queue.blocks.isEmpty)
    }

    func testOfflineQueueSorted() {
        let queue = OfflineQueue()
        let farm = queue.create(type: "actor.producer", state: ["name": "Green Acres"])
        let bread = queue.create(type: "substance.product", state: ["name": "Bread"], refs: ["seller": farm.hash])
        let sorted = queue.sorted()
        XCTAssertEqual(sorted.count, 2)
        // Farm should come before bread because bread depends on farm
        let farmIdx = sorted.firstIndex(where: { $0.hash == farm.hash })!
        let breadIdx = sorted.firstIndex(where: { $0.hash == bread.hash })!
        XCTAssertTrue(farmIdx < breadIdx, "Dependency (farm) should come before dependent (bread)")
    }

    func testOfflineQueueLen() {
        let queue = OfflineQueue()
        XCTAssertEqual(queue.count, 0)
        queue.create(type: "actor.producer", state: ["name": "Farm"])
        XCTAssertEqual(queue.count, 1)
        queue.create(type: "substance.product", state: ["name": "Bread"])
        XCTAssertEqual(queue.count, 2)
        queue.create(type: "substance.product", state: ["name": "Cake"])
        XCTAssertEqual(queue.count, 3)
    }

    // MARK: - Alias Tests

    func testRegistrySetResolve() {
        let reg = FoodBlockAlias.registry()
        reg.set(alias: "farm", hash: "abc123def456")
        let resolved = reg.resolve("@farm")
        XCTAssertEqual(resolved, "abc123def456", "Resolving @farm should return the registered hash")
    }

    func testRegistryResolveAtPrefix() {
        let reg = FoodBlockAlias.registry()
        reg.set(alias: "bakery", hash: "deadbeef1234")

        // @name resolves to hash
        XCTAssertEqual(reg.resolve("@bakery"), "deadbeef1234")
        // Raw hash passes through unchanged
        let rawHash = "0123456789abcdef"
        XCTAssertEqual(reg.resolve(rawHash), rawHash, "Raw hash without @ should pass through unchanged")
    }

    func testRegistryCreate() {
        let reg = FoodBlockAlias.registry()
        let farm = reg.create(type: "actor.producer", state: ["name": "Green Acres"], alias: "farm")
        XCTAssertTrue(reg.has("farm"), "Registry should have the 'farm' alias after create")
        XCTAssertEqual(reg.resolve("@farm"), farm.hash, "Alias should resolve to the created block's hash")
    }

    func testRegistryHasSize() {
        let reg = FoodBlockAlias.registry()
        XCTAssertFalse(reg.has("farm"))
        XCTAssertEqual(reg.size, 0)

        _ = reg.create(type: "actor.producer", state: ["name": "Farm A"], alias: "farm")
        XCTAssertTrue(reg.has("farm"))
        XCTAssertEqual(reg.size, 1)

        _ = reg.create(type: "actor.producer", state: ["name": "Bakery B"], alias: "bakery")
        XCTAssertTrue(reg.has("bakery"))
        XCTAssertEqual(reg.size, 2)
    }

    // MARK: - Notation Tests

    func testParseSimple() {
        let result = FoodBlockNotation.parse("substance.product { name: \"Bread\" }")
        XCTAssertNotNil(result)
        XCTAssertEqual(result!.type, "substance.product")
        XCTAssertEqual(result!.state["name"] as? String, "Bread")
        XCTAssertNil(result!.alias)
    }

    func testParseWithAlias() {
        let result = FoodBlockNotation.parse("@bread = substance.product { name: \"Sourdough\" }")
        XCTAssertNotNil(result)
        XCTAssertEqual(result!.alias, "bread")
        XCTAssertEqual(result!.type, "substance.product")
        XCTAssertEqual(result!.state["name"] as? String, "Sourdough")
    }

    func testParseWithRefs() {
        let result = FoodBlockNotation.parse("substance.product { name: \"Bread\" } -> seller: @bakery")
        XCTAssertNotNil(result)
        XCTAssertEqual(result!.type, "substance.product")
        XCTAssertEqual(result!.refs["seller"] as? String, "@bakery")
    }

    func testParseAll() {
        let text = """
        # This is a comment
        @farm = actor.producer { name: "Green Acres" }
        // Another comment
        @bread = substance.product { name: "Sourdough" } -> seller: @farm

        """
        let results = FoodBlockNotation.parseAll(text)
        XCTAssertEqual(results.count, 2, "Should parse 2 lines, filtering comments and blanks")
        XCTAssertEqual(results[0].alias, "farm")
        XCTAssertEqual(results[1].alias, "bread")
        XCTAssertEqual(results[1].refs["seller"] as? String, "@farm")
    }

    // MARK: - Explain Tests

    func testExplainSimpleBlock() async {
        let bread = FoodBlock.create(type: "substance.product", state: ["name": "Sourdough", "price": 4.50])
        let blocks: [String: FoodBlock] = [bread.hash: bread]
        let resolver: FoodBlockExplain.Resolver = { hash in blocks[hash] }

        let narrative = await FoodBlockExplain.explain(hash: bread.hash, resolve: resolver)
        XCTAssertTrue(narrative.contains("Sourdough"), "Narrative should contain the block's name")
    }

    func testExplainWithSeller() async {
        let bakery = FoodBlock.create(type: "actor.producer", state: ["name": "Main Street Bakery"])
        let bread = FoodBlock.create(
            type: "substance.product",
            state: ["name": "Sourdough"],
            refs: ["seller": bakery.hash]
        )
        let blocks: [String: FoodBlock] = [
            bakery.hash: bakery,
            bread.hash: bread
        ]
        let resolver: FoodBlockExplain.Resolver = { hash in blocks[hash] }

        let narrative = await FoodBlockExplain.explain(hash: bread.hash, resolve: resolver)
        XCTAssertTrue(narrative.contains("Main Street Bakery"), "Narrative should include the seller's name")
    }

    func testExplainTombstoned() async {
        let erased = FoodBlock.create(type: "substance.product", state: ["tombstoned": true])
        let blocks: [String: FoodBlock] = [erased.hash: erased]
        let resolver: FoodBlockExplain.Resolver = { hash in blocks[hash] }

        let narrative = await FoodBlockExplain.explain(hash: erased.hash, resolve: resolver)
        XCTAssertTrue(narrative.contains("erased"), "Narrative should mention the block has been erased")
    }

    // MARK: - URI Tests

    func testToURIFromBlock() {
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Bread"])
        let uri = FoodBlockURI.toURI(block)
        XCTAssertEqual(uri, "fb:\(block.hash)", "URI should be fb:<hash>")
    }

    func testToURIWithAlias() {
        let block = FoodBlock.create(type: "substance.product", state: ["name": "Bread"])
        let uri = FoodBlockURI.toURI(block, alias: "sourdough")
        XCTAssertEqual(uri, "fb:substance.product/sourdough", "URI with alias should be fb:<type>/<alias>")
    }

    func testFromURIHash() throws {
        let hash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
        let result = try FoodBlockURI.fromURI("fb:\(hash)")
        XCTAssertEqual(result.hash, hash)
        XCTAssertNil(result.type)
        XCTAssertNil(result.alias)
    }

    func testFromURITyped() throws {
        let result = try FoodBlockURI.fromURI("fb:substance.product/sourdough")
        XCTAssertEqual(result.type, "substance.product")
        XCTAssertEqual(result.alias, "sourdough")
        XCTAssertNil(result.hash)
    }

    // MARK: - Federation Tests

    func testWellKnown() {
        let doc = FoodBlockFederation.wellKnown(
            name: "Test Server",
            types: ["substance.product"],
            count: 42
        )
        XCTAssertEqual(doc.protocol, "foodblock")
        XCTAssertEqual(doc.version, "0.4.0")
        XCTAssertEqual(doc.name, "Test Server")
        XCTAssertEqual(doc.count, 42)
        XCTAssertEqual(doc.types, ["substance.product"])
        XCTAssertEqual(doc.endpoints.blocks, "/blocks")
        XCTAssertEqual(doc.endpoints.batch, "/blocks/batch")
        XCTAssertEqual(doc.endpoints.handshake, "/.well-known/foodblock/handshake")
    }

    func testWellKnownDefaults() {
        let doc = FoodBlockFederation.wellKnown()
        XCTAssertEqual(doc.protocol, "foodblock")
        XCTAssertEqual(doc.version, "0.4.0")
        XCTAssertEqual(doc.name, "FoodBlock Server")
        XCTAssertEqual(doc.count, 0)
        XCTAssertTrue(doc.types.isEmpty)
        XCTAssertTrue(doc.peers.isEmpty)
        XCTAssertTrue(doc.schemas.isEmpty)
        XCTAssertTrue(doc.templates.isEmpty)
    }
}

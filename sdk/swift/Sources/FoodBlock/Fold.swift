import Foundation

/// The folds (spec/protocol.md §11): thin calls into the Rust core.
public enum Fold {
    /// A promise's stage, from its first promise and every block in its deal: a function of the blocks alone. No clock.
    public static func promiseStage(_ firstBlock: JSON, _ blocks: [JSON]) throws -> JSON {
        try Door.promiseStage(firstBlock, blocks, [:])
    }
    /// The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds.
    /// `arrivals` (hash to arrival time) is read with `unknownArrival` ("inside" or "outside"), which it then requires.
    public static func promiseView(_ firstBlock: JSON, _ blocks: [JSON], now: String? = nil, arrivals: [String: String]? = nil, unknownArrival: String? = nil) throws -> JSON {
        var o: JSON = [:]
        if let n = now { o["now"] = n }
        if let a = arrivals { o["arrivals"] = a }
        if let u = unknownArrival { o["unknown_arrival"] = u }
        return try Door.promiseView(firstBlock, blocks, o)
    }

    /// A member, as the spec names it: { roles, grant, counted_to } (counted_to nil for a current member).
    public final class Member {
        public internal(set) var roles: [String]
        public let grant: String?
        public internal(set) var counted_to: String?
        init(_ j: JSON) { roles = j["roles"] as? [String] ?? []; grant = j["grant"] as? String; counted_to = j["counted_to"] as? String }
    }
    /// A circle's members and roles: { founder, members: id → Member, removed: id → last counted block (or nil) }.
    public final class CircleState {
        public let founder: String?
        public let members: [String: Member]
        public internal(set) var removed: [String: String?]
        public let json: JSON
        init(_ j: JSON) {
            json = j
            founder = j["founder"] as? String
            members = (j["members"] as? [String: JSON] ?? [:]).mapValues(Member.init)
            removed = (j["removed"] as? JSON ?? [:]).mapValues { $0 as? String }
        }
        /// The member ids, in the order they joined (the core keeps it in the order of `json["members"]`).
        public var memberIds: [String] { Array(members.keys) }
    }
    public static func circleState(_ circle: String, _ blocks: [JSON], within: JSON? = nil) throws -> CircleState? {
        (try Door.circleState(circle, blocks, within)).map(CircleState.init)
    }
    public static func mayActAs(_ block: JSON, _ circle: String, _ blocks: [JSON], role: String? = nil) throws -> Bool { try Door.mayActAs(block, circle, blocks, role) }
    public static func membersThen(_ block: JSON, _ recipient: String, _ blocks: [JSON]) throws -> [String] { (try Door.membersThen(block, recipient, blocks) as? [String]) ?? [] }

    public struct Ownership {
        public let owner: String?
        public let transfers: [String]
        /// Two counted transfers that do not see each other: proof of a lie.
        public let conflict: [String]?
    }
    public static func ownership(_ instance: JSON, _ blocks: [JSON]) throws -> Ownership {
        let o = try Door.ownership(instance, blocks)
        return Ownership(owner: o["owner"] as? String, transfers: o["transfers"] as? [String] ?? [], conflict: o["conflict"] as? [String])
    }
    public static func ownerOf(_ instance: JSON, _ blocks: [JSON]) throws -> String? { try Door.ownerOf(instance, blocks) as? String }
    public static func whereNow(_ thing: JSON, _ blocks: [JSON]) throws -> [String] { (try Door.whereNow(thing, blocks) as? [String]) ?? [] }
    /// The optional successor profile's view: a grant's events, whether it fired, read at `now` and the arrivals.
    public static func successorView(_ grant: JSON, _ blocks: [JSON], now: String? = nil, arrivedAt: Identity.Arrival? = nil) throws -> JSON {
        (try Door.successorView(grant, blocks, now, Identity.log(arrivedAt, blocks)) as? JSON) ?? [:]
    }
    public static func receiverOf(_ promise: JSON, _ blocks: [JSON]) throws -> String? { try Door.receiverOf(promise, blocks) as? String }
    /// The consent fold: a person's live word about a sender (or none): { word, block }. `block` is the sender's block (or nil).
    public static func consent(_ person: String, _ sender: String?, _ blocks: [JSON], block: JSON?) throws -> JSON { try Door.consent(person, sender, blocks, block) }
    /// Views, each saying whose clock or arrivals it reads.
    public static func liveGrant(_ act: JSON, _ grants: [JSON], now: String) throws -> Bool { try Door.liveGrant(act, grants, now) }
    public static func withdrawalSeen(_ withdrawal: JSON, _ block: JSON, _ blocks: [JSON], arrivedAt: Identity.Arrival? = nil) throws -> Bool {
        try Door.withdrawalSeen(withdrawal, block, blocks, Identity.log(arrivedAt, blocks + [withdrawal, block]))
    }
    public static func due(_ promise: JSON, arrivedAt: Identity.Arrival? = nil, held: [JSON] = []) throws -> Any? { try Door.due(promise, Identity.log(arrivedAt, held + [promise])) }
    public static func circleKey(_ circle: String, _ blocks: [JSON]) throws -> JSON { (try Door.circleKey(circle, blocks) as? JSON) ?? [:] }
    public static func countedIn(_ result: JSON?, _ commitment: String, _ counter: String) throws -> Bool { try Door.countedIn(result ?? [:], commitment, counter) }
}

/// Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core.
public enum Strangers {
    /// A model's reading is the person's claim only once the person's own block confirms it.
    public static func readingIsPersonsClaim(_ reading: JSON, _ person: String, _ blocks: [JSON]) throws -> Bool { try Door.readingIsPersonsClaim(reading, person, blocks) }
    /// Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock.
    public static func readingConditionHolds(_ condition: JSON, _ blocks: [JSON], now: String) throws -> Bool { try Door.readingConditionHolds(condition, blocks, now) }
    /// Whether a condition holds on the blocks held, at the reader's clock (promises.md, Conditions): settled, a deed, a reading or a signal.
    /// It reads three ways: true, false, or nil for a condition of a shape the protocol does not read.
    public static func conditionHolds(_ condition: JSON, _ blocks: [JSON], now: String) throws -> Bool? { try Door.conditionHolds(condition, blocks, now) }
    /// Earnest profile: the shape of an admission's earnest, and whether an ask's earnest is paid.
    public static func earnestShapeOk(_ earnest: Any?) throws -> Bool { try Door.earnestShapeOk((earnest as? JSON) ?? [:]) }
    public static func earnestPaid(_ ask: JSON, _ earnest: JSON, _ blocks: [JSON]) throws -> Bool { try Door.earnestPaid(ask, earnest, blocks) }
    /// What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. `admission` is the rule's
    /// state or an explicit nil (no rule); `strangersToday` a whole number. Both are stated.
    public static func admissionRefusals(_ block: JSON, receiver: String, _ blocks: [JSON], admission: JSON?, strangersToday: Int) throws -> [FoodBlock.Finding] {
        FoodBlock.findings(try Door.admissionRefusals(block, receiver, blocks, admission, strangersToday))
    }
    /// Residency (profiles/residency.md): a block that stays in regions its node does not hold in.
    public static func residencyRefusals(_ block: JSON, holdsIn: [String]) throws -> [FoodBlock.Finding] { FoodBlock.findings(try Door.residencyRefusals(block, holdsIn)) }
}

/// The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node reads an older shape.
public enum Legacy {
    /// Convert old blocks into fresh 1.6 blocks, each deriving from the old hash, signed by the key given for each old identity.
    /// `keys` maps each old identity to `{ public_key_sign, private_key, suite? }`; `at` is the conversion time. `schemas` are published
    /// schemas a block may name instead of a new one; `custodianKey` signs only for the old ids in `custodianFor`, and only under a `channel`.
    /// Returns { blocks, map, skipped, deliveries }.
    public static func convert(_ oldBlocks: [JSON], keys: JSON, at: String, map: JSON = [:], existing: [JSON] = [], channel: String? = nil, requestHash: String? = nil,
                               schemas: [JSON] = [], custodianKey: JSON? = nil, custodianFor: [String] = []) throws -> JSON {
        var o: JSON = ["keys": keys, "map": map, "existing": existing, "schemas": schemas, "at": at, "custodian_for": custodianFor]
        if let c = channel { o["channel"] = c }
        if let r = requestHash { o["request_hash"] = r }
        if let k = custodianKey { o["custodian_key"] = k }
        return try Door.convert(oldBlocks, o)
    }
    /// The id an old block had under the old canonical form.
    public static func oldHash(_ block: JSON) throws -> String { try Door.oldHash(block) }
}

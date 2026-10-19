import Foundation

/// The folds (spec/protocol.md §11): thin calls into the Rust core.
public enum Fold {
    /// A promise's stage, from its first promise and every block in its deal. No clock.
    public static func promiseStage(_ firstBlock: JSON, _ blocks: [JSON], confirmers: [String] = []) -> JSON {
        (try? Core.json("promise_stage", firstBlock, blocks, ["confirmers": confirmers] as JSON)) ?? [:]
    }
    /// The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds.
    public static func promiseView(_ firstBlock: JSON, _ blocks: [JSON], now: String? = nil, confirmers: [String] = []) -> JSON {
        var o: JSON = ["confirmers": confirmers]
        if let n = now { o["now"] = n }
        return (try? Core.json("promise_view", firstBlock, blocks, o)) ?? [:]
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
    public static func circleState(_ circle: String, _ blocks: [JSON], within: JSON? = nil) -> CircleState? {
        (Core.maybe("circle_state", circle, blocks, within) as? JSON).map(CircleState.init)
    }
    public static func mayActAs(_ block: JSON, _ circle: String, _ blocks: [JSON], role: String? = nil) -> Bool { Core.bool("may_act_as", block, circle, blocks, role) }
    public static func membersThen(_ block: JSON, _ recipient: String, _ blocks: [JSON]) -> [String] { Core.strings("members_then", block, recipient, blocks) }

    public struct Ownership {
        public let owner: String?
        public let transfers: [String]
        /// Two counted transfers that do not see each other: proof of a lie.
        public let conflict: [String]?
    }
    public static func ownership(_ instance: JSON, _ blocks: [JSON]) -> Ownership {
        let o = (try? Core.json("ownership", instance, blocks)) ?? [:]
        return Ownership(owner: o["owner"] as? String, transfers: o["transfers"] as? [String] ?? [], conflict: o["conflict"] as? [String])
    }
    public static func ownerOf(_ instance: JSON, _ blocks: [JSON]) -> String? { Core.maybe("owner_of", instance, blocks) as? String }
    public static func whereNow(_ thing: JSON, _ blocks: [JSON]) -> [String] { Core.strings("where_now", thing, blocks) }
    /// The optional successor profile's view: a grant's events, whether it fired, read at `now` and the arrivals.
    public static func successorView(_ grant: JSON, _ blocks: [JSON], now: String? = nil, arrivedAt: Identity.Arrival? = nil) -> JSON {
        (try? Core.json("successor_view", grant, blocks, now, Identity.log(arrivedAt, blocks))) ?? [:]
    }
    /// The block's orderer (a record's `state.orderer`).
    public static func ordererOf(_ record: JSON) -> Any? { Core.maybe("orderer_of", record) }
    public static func receiverOf(_ promise: JSON, _ blocks: [JSON]) -> String? { Core.maybe("receiver_of", promise, blocks) as? String }
    /// The consent fold: a person's live word about a sender (or none): { word, block }.
    public static func consent(_ person: String, _ sender: String?, _ blocks: [JSON], under: String? = nil) -> JSON { (try? Core.json("consent", person, sender, blocks, under)) ?? [:] }
    /// Views, each saying whose clock or arrivals it reads.
    public static func liveGrant(_ act: JSON, _ grants: [JSON], now: String) -> Bool { Core.bool("live_grant", act, grants, now) }
    public static func withdrawalSeen(_ withdrawal: JSON, _ block: JSON, _ blocks: [JSON], arrivedAt: Identity.Arrival? = nil) -> Bool {
        Core.bool("withdrawal_seen", withdrawal, block, blocks, Identity.log(arrivedAt, blocks + [withdrawal, block]))
    }
    public static func due(_ promise: JSON, arrivedAt: Identity.Arrival? = nil, held: [JSON] = []) -> Any? { Core.maybe("due", promise, Identity.log(arrivedAt, held + [promise])) }
    public static func circleKey(_ circle: String, _ blocks: [JSON]) -> JSON { (try? Core.json("circle_key", circle, blocks)) ?? [:] }
    public static func countedIn(_ result: JSON?, _ commitment: String, _ counter: String) -> Bool { Core.bool("counted_in", result ?? [:], commitment, counter) }
}

/// Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core.
public enum Strangers {
    /// A model's reading is the person's claim only once the person's own block confirms it.
    public static func readingIsPersonsClaim(_ reading: JSON, _ person: String, _ blocks: [JSON]) -> Bool { Core.bool("reading_is_persons_claim", reading, person, blocks) }
    /// Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock.
    public static func readingConditionHolds(_ condition: JSON, _ blocks: [JSON], now: String) -> Bool { Core.bool("reading_condition_holds", condition, blocks, now) }
    /// Deposits profile: the shape of an admission's deposit, and whether an ask's deposit is paid.
    public static func depositShapeOk(_ deposit: Any?) -> Bool { Core.bool("deposit_shape_ok", deposit) }
    public static func depositPaid(_ ask: JSON, _ deposit: JSON, _ blocks: [JSON]) -> Bool { Core.bool("deposit_paid", ask, deposit, blocks) }
    /// What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human.
    public static func admissionRefusals(_ block: JSON, receiver: String, _ blocks: [JSON], admission: JSON = [:], strangersToday: Int = 0) -> [FoodBlock.Finding] {
        FoodBlock.findings(Core.maybe("admission_refusals", block, receiver, blocks, admission, strangersToday))
    }
    /// Residency (profiles/residency.md): a block that stays in regions its node does not hold in.
    public static func residencyRefusals(_ block: JSON, holdsIn: [String]) -> [FoodBlock.Finding] { FoodBlock.findings(Core.maybe("residency_refusals", block, holdsIn)) }
}

/// The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node reads an older shape.
public enum Legacy {
    /// Convert old blocks into fresh 1.6 blocks, each deriving from the old hash, signed by the key given for each old identity.
    /// `keys` maps each old identity to `{ public_key_sign, private_key, suite? }`. Returns { blocks, map, skipped }.
    public static func convert(_ oldBlocks: [JSON], keys: JSON, at: String, map: JSON = [:], existing: [JSON] = [], channel: String? = nil, requestHash: String? = nil) throws -> JSON {
        var o: JSON = ["keys": keys, "at": at, "map": map, "existing": existing]
        if let c = channel { o["channel"] = c }
        if let r = requestHash { o["request_hash"] = r }
        return try Core.json("convert", oldBlocks, o)
    }
    /// The id an old block had under the old canonical form.
    public static func oldHash(_ block: JSON) -> String { (try? Core.string("old_hash", block)) ?? "" }
}

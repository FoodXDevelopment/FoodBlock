import Foundation

/// The folds (spec/protocol.md §11): thin calls into the Rust core.
public enum Fold {
    public static func promiseStage(_ firstBlock: JSON, _ blocks: [JSON], now: String? = nil, confirmers: [String] = []) -> JSON {
        var o: JSON = ["confirmers": confirmers]
        if let n = now { o["now"] = n }
        return (try? Core.json("promise_stage", firstBlock, blocks, o)) ?? [:]
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
    public static func successorState(_ grant: JSON, _ blocks: [JSON], now: String? = nil, arrivedAt: Identity.Arrival? = nil) -> JSON {
        (try? Core.json("successor_state", grant, blocks, now, Identity.log(arrivedAt, blocks))) ?? [:]
    }
    public static func circleKey(_ circle: String, _ blocks: [JSON]) -> JSON { (try? Core.json("circle_key", circle, blocks)) ?? [:] }
    public static func countedIn(_ result: JSON?, _ commitment: String, _ counter: String) -> Bool { Core.bool("counted_in", result ?? [:], commitment, counter) }
}

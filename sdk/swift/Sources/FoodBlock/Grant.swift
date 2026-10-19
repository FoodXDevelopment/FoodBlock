import Foundation

/// Authority (spec/protocol.md §6): thin calls into the Rust core.
public enum Grant {
    public static func scopeRefusals(_ child: JSON, _ parent: JSON) -> [FoodBlock.Finding] { FoodBlock.findings(Core.maybe("scope_refusals", child, parent)) }
    /// The observe of kind limit for a grant, to hand to `write`: its audience is the autonomous system alone.
    public static func limitFence(_ grantHash: String, _ agent: String, limit: JSON, per: String? = nil, salt: String? = nil) -> JSON { (Core.maybe("limit_fence", grantHash, agent, limit, per, salt) as? JSON) ?? [:] }
    /// The commitment to a limit, for the grant's `scope.limit_commitment` (authority.md).
    public static func limitCommitment(limit: JSON, per: String? = nil, salt: String, suite: String? = nil) -> String { (Core.maybe("limit_commitment", limit, per, salt, suite) as? String) ?? "" }
    /// Whether the limit observe opens the grant's `scope.limit_commitment`.
    public static func limitOpens(_ grant: JSON, _ fence: JSON, suite: String? = nil) -> Bool { Core.bool("limit_opens", grant, fence, suite) }
    /// Whether spending `money` stays inside a limit; `spent` is what the principal's node has counted in the period (minor units).
    public static func withinLimit(_ limit: JSON, _ money: JSON, spent: Int = 0) -> Bool { Core.bool("within_limit", limit, money, spent) }
    public static func scopeWithin(_ child: JSON, _ parent: JSON) -> [String] { Core.strings("scope_within", child, parent) }
    public static func whyNotLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) -> [String] { Core.strings("why_not_live", grant, blocks, now) }
    public static func isLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) -> Bool { Core.bool("is_live", grant, blocks, now) }
    public static func ancestors(_ grant: JSON, _ blocks: [JSON]) -> [JSON] { (Core.maybe("ancestors", grant, blocks) as? [JSON]) ?? [] }
    public static func whyNotUnder(_ block: JSON?, _ blocks: [JSON], now: String? = nil) -> [String] { Core.strings("why_not_under", block, blocks, now) }
    public static func operatorsOf(_ agent: String, _ blocks: [JSON], now: String? = nil) -> [String] { Core.strings("operators_of", agent, blocks, now) }
    /// Why an act that cannot be undone (its schema says `undo: never`) is not live: empty when it has a specific accepted ask or a grant that names it with a limit.
    public static func whyNotLiveUndo(_ block: JSON, _ blocks: [JSON]) -> [String] { Core.strings("why_not_live_undo", block, blocks) }
    /// The act a block is, named `type.kind`.
    public static func actName(_ block: JSON) -> String { (try? Core.string("act_name", block)) ?? "" }
}

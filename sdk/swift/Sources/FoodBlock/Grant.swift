import Foundation

/// Authority (spec/protocol.md §6): thin calls into the Rust core.
public enum Grant {
    public static func scopeRefusals(_ child: JSON, _ parent: JSON) -> [FoodBlock.Finding] { FoodBlock.findings(Core.maybe("scope_refusals", child, parent)) }
    /// The observe of kind limit for a grant, to hand to `write`: its audience is the agent alone.
    public static func limitFence(_ grantHash: String, _ agent: String, limit: JSON, per: String? = nil) -> JSON { (Core.maybe("limit_fence", grantHash, agent, limit, per) as? JSON) ?? [:] }
    /// Whether spending `money` stays inside a limit; `spent` is what the principal's node has counted in the period (minor units).
    public static func withinLimit(_ limit: JSON, _ money: JSON, spent: Int = 0) -> Bool { Core.bool("within_limit", limit, money, spent) }
    public static func scopeWithin(_ child: JSON, _ parent: JSON) -> [String] { Core.strings("scope_within", child, parent) }
    public static func whyNotLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) -> [String] { Core.strings("why_not_live", grant, blocks, now) }
    public static func isLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) -> Bool { Core.bool("is_live", grant, blocks, now) }
    public static func ancestors(_ grant: JSON, _ blocks: [JSON]) -> [JSON] { (Core.maybe("ancestors", grant, blocks) as? [JSON]) ?? [] }
    public static func whyNotUnder(_ block: JSON?, _ blocks: [JSON], now: String? = nil) -> [String] { Core.strings("why_not_under", block, blocks, now) }
    public static func operatorsOf(_ agent: String, _ blocks: [JSON], now: String? = nil) -> [String] { Core.strings("operators_of", agent, blocks, now) }
}

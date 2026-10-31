import Foundation

/// Authority (spec/protocol.md §6): thin calls into the Rust core.
public enum Grant {
    public static func scopeRefusals(_ child: JSON, _ parent: JSON) throws -> [FoodBlock.Finding] { FoodBlock.findings(try Door.scopeRefusals(child, parent)) }
    /// The observe of kind limit for a grant, to hand to `write`: its audience is the autonomous system alone.
    public static func limitFence(_ grantHash: String, _ agent: String, limit: JSON?, every: String? = nil, salt: String? = nil, each: JSON? = nil) throws -> JSON { try Door.limitFence(grantHash, agent, limit, every, salt, each) }
    /// The commitment to a limit, for the grant's `scope.limit_commitment` (authority.md).
    public static func limitCommitment(limit: JSON?, every: String? = nil, salt: String, suite: String? = nil, each: JSON? = nil) throws -> String { try Door.limitCommitment(limit, every, salt, suite, each) }
    /// Whether the limit observe opens the grant's `scope.limit_commitment`.
    public static func limitOpens(_ grant: JSON, _ fence: JSON, suite: String? = nil) throws -> Bool { try Door.limitOpens(grant, fence, suite) }
    /// Whether one act of `value` (money or an amount) stays inside a limit; `spent` is what the principal's node has counted in the period:
    /// minor units of money, or an amount's value (a whole number, or a decimal string), compared exactly.
    public static func withinLimit(_ limit: JSON, _ value: JSON, spent: Any) throws -> Bool { try Door.withinLimit(limit, value, spent) }
    public static func scopeWithin(_ child: JSON, _ parent: JSON) throws -> [String] { try Door.scopeWithin(child, parent) }
    public static func whyNotLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) throws -> [String] { try Door.whyNotLive(grant ?? [:], blocks, now) }
    public static func isLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) throws -> Bool { try Door.isLive(grant ?? [:], blocks, now) }
    public static func ancestors(_ grant: JSON, _ blocks: [JSON]) throws -> [JSON] { (try Door.ancestors(grant, blocks) as? [JSON]) ?? [] }
    public static func whyNotUnder(_ block: JSON?, _ blocks: [JSON], now: String? = nil) throws -> [String] { try Door.whyNotUnder(block ?? [:], blocks, now) }
    public static func operatorsOf(_ agent: String, _ blocks: [JSON], now: String? = nil) throws -> [String] { try Door.operatorsOf(agent, blocks, now) }
    /// Why an act that cannot be undone (its schema says `undo: never`) is not live: empty when it has a specific accepted ask or a grant that names it with a limit.
    public static func whyNotLiveUndo(_ block: JSON, _ blocks: [JSON]) throws -> [String] { try Door.whyNotLiveUndo(block, blocks) }
    /// The act a block is, named `type.kind`.
    public static func actName(_ block: JSON) throws -> String { try Door.actName(block) }
}

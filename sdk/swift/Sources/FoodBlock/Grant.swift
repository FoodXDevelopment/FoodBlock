import Foundation

/// Authority (spec/protocol.md §6): thin calls into the Rust core.
public enum Grant {
    public static func scopeRefusals(_ child: JSON, _ parent: JSON) throws -> [FoodBlock.Finding] { FoodBlock.findings(try Door.scopeRefusals(child, parent)) }
    /// The one reading of a grant's `state.scope` (authority.md): acts, parties, limit, each, every, until, notice, sealed, condition and junk, with every default the spec states and nothing else filled in.
    /// A nil scope reads as an empty one. A non-empty `junk` (sorted names of fields that are there but cannot be read) means the grant is held to no word.
    public static func scopeReading(_ scope: Any? = nil) throws -> JSON { try Door.scopeReading(scope) }
    public static func scopeWithin(_ child: JSON, _ parent: JSON) throws -> [String] { try Door.scopeWithin(child, parent) }
    public static func whyNotLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) throws -> [String] { try Door.whyNotLive(grant ?? [:], blocks, now) }
    public static func isLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) throws -> Bool { try Door.isLive(grant ?? [:], blocks, now) }
    public static func ancestors(_ grant: JSON, _ blocks: [JSON]) throws -> [JSON] { (try Door.ancestors(grant, blocks) as? [JSON]) ?? [] }
    public static func whyNotUnder(_ block: JSON?, _ blocks: [JSON], now: String? = nil) throws -> [String] { try Door.whyNotUnder(block ?? [:], blocks, now) }
    /// Why an act that cannot be undone (its schema says `undo: never`) is not live: empty when it has a specific accepted ask or a grant that names it with a limit.
    public static func whyNotLiveUndo(_ block: JSON, _ blocks: [JSON]) throws -> [String] { try Door.whyNotLiveUndo(block, blocks) }
    /// A time moved by a duration (sign -1 goes back); nil when either is not one.
    public static func addDuration(_ time: String, _ duration: String, sign: Int = 1) throws -> String? { try Door.addDuration(time, duration, sign) }
    /// Two durations compared by adding both to one instant (§7): -1, 0 or 1.
    public static func compareDurations(_ a: String, _ b: String, from: String) throws -> Int { intOf(try Door.compareDurations(a, b, from)) ?? 0 }
    public static func parseDuration(_ text: String?) throws -> Any? { try Door.parseDuration(text) }
    /// Is the machine inside the fence of its grant: { within, why, alone, alone_until }. No clock is read.
    public static func fenceReading(_ fence: Any?, at: String, readings: Any? = nil, heard: String? = nil) throws -> JSON { try Door.fenceReading(fence, at, readings, heard) }
    /// Whether a promise C keeps to a promise A: { keeps, why }.
    public static func keepsTo(_ c: JSON, _ a: JSON, _ blocks: [JSON] = []) throws -> JSON { try Door.keepsTo(c, a, blocks) }
    /// The line a grant's blocks are counted on (authority.md): { grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back }.
    public static func meter(_ grant: JSON, _ blocks: [JSON], block: JSON? = nil) throws -> JSON { try Door.meter(grant, blocks, block) }
    /// The worst case of a grant, from her grant and the promises it names alone: `at_most` and `can_lose` per kind.
    public static func worstCase(_ grant: JSON, _ blocks: [JSON]) throws -> JSON { try Door.worstCase(grant, blocks) }
    /// Her deadline's lowest offer, read on the meter's line: { offer, received, cutoff, why }.
    public static func lowestOffer(_ grant: JSON, _ blocks: [JSON]) throws -> JSON { try Door.lowestOffer(grant, blocks) }
    /// What a promise's terms come to at a chosen quantity: { minor, currency }, or nil when it cannot be computed.
    public static func termsTotal(_ terms: Any?, quantity: Any? = nil) throws -> JSON? { try Door.termsTotal(terms, quantity) as? JSON }
    /// Whether the machine is locked now: { locked, locks, lifted }.
    public static func machineLock(_ machine: JSON, _ blocks: [JSON], now: String? = nil) throws -> JSON { try Door.machineLock(machine, blocks, now) }
}

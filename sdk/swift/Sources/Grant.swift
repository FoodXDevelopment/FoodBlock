import Foundation

/// Authority (spec/protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`.
/// A child grant (`refs.parent`) is a subset of its parent on every field, and a grant is live only while every
/// ancestor is. A grant carries no status: its author ends it by an `updates` with stopped; the receiver declines or
/// leaves by an `answers`. Durations count calendar months and years in UTC.
public enum Grant {
    public struct Duration { public let years: Int, months: Int, days: Int, ms: Double }

    public static func parseDuration(_ text: Any?) -> Duration? {
        guard let s = text as? String, FoodBlock.test("duration", s),
              let re = try? NSRegularExpression(pattern: "^P(?:(\\d+)Y)?(?:(\\d+)M)?(?:(\\d+)W)?(?:(\\d+)D)?(T(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?)?$"),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        func n(_ i: Int) -> Int { let r = m.range(at: i); return r.location == NSNotFound ? 0 : Int((s as NSString).substring(with: r)) ?? 0 }
        return Duration(years: n(1), months: n(2), days: n(3) * 7 + n(4), ms: Double((n(6) * 3600 + n(7) * 60 + n(8)) * 1000))
    }

    /// A time moved by a duration (sign -1 goes back), months and years by the UTC calendar (as JavaScript's Date).
    public static func addDuration(_ time: String?, _ duration: Any?, _ sign: Int = 1) -> String? {
        guard let parts = parseDuration(duration), let at = parseTime(time) else { return nil }
        var days = Int((at / 86_400_000).rounded(.down))
        let timeOfDay = at - Double(days) * 86_400_000
        let (y, m, d) = civilFromDays(days)
        let months = y * 12 + (m - 1) + sign * (parts.years * 12 + parts.months)
        let year = Int((Double(months) / 12).rounded(.down)), month = months - year * 12
        days = daysFromCivil(year, month + 1, 1) + (d - 1) + sign * parts.days
        return isoString(Double(days) * 86_400_000 + timeOfDay + Double(sign) * parts.ms)
    }

    /// Two durations compared by adding both to one instant, the parent grant's `at`: -1, 0 or 1. Arithmetic only.
    public static func compareDurations(_ a: Any?, _ b: Any?, _ from: String) -> Int {
        guard let x = parseTime(addDuration(from, a)), let y = parseTime(addDuration(from, b)) else { return 0 }
        return x < y ? -1 : x > y ? 1 : 0
    }

    static func contains(_ outer: Any?, _ inner: Any?) -> Bool {
        guard let inner = inner else { return true }
        if let a = inner as? [Any] { return (outer as? [Any]).map { o in a.allSatisfy { item in o.contains { contains($0, item) && contains(item, $0) } } } ?? false }
        if let o = inner as? JSON { return (outer as? JSON).map { out in o.keys.allSatisfy { contains(out[$0], o[$0]) } } ?? false }
        return outer != nil && stableJSON(outer) == stableJSON(inner)
    }

    /// What makes a child grant wider than its parent: [{ code, detail }] (`wider_than_parent`, `not_receiver`); [] when
    /// it is within it.
    public static func scopeRefusals(_ child: JSON, _ parent: JSON) -> [FoodBlock.Finding] {
        let c = obj(dig(child, "state.scope")) ?? [:], p = obj(dig(parent, "state.scope")) ?? [:]
        let from = dig(parent, "state.at") as? String ?? "2000-01-01T00:00:00.000Z"
        var wrong: [FoodBlock.Finding] = []
        func wider(_ detail: String) { wrong.append(FoodBlock.Finding(code: "wider_than_parent", detail: detail)) }
        for set in ["acts", "parties"] where has(p[set]) {
            let pl = (p[set] as? [Any])?.map(stableJSON) ?? []
            if !has(c[set]) || !((c[set] as? [Any])?.allSatisfy { pl.contains(stableJSON($0)) } ?? false) { wider("scope.\(set) is a subset of the parent's") }
        }
        if let pl = obj(p["limit"]) {
            let cl = obj(c["limit"])
            if !(cl != nil && same(cl?["currency"] as? String, pl["currency"] as? String) && (numberOf(cl?["minor"]) ?? .infinity) <= (numberOf(pl["minor"]) ?? -.infinity)) {
                wider("scope.limit is no larger than the parent's")
            }
        }
        if truthy(p["per"]) && !(truthy(c["per"]) && compareDurations(c["per"], p["per"], from) <= 0) { wider("scope.per is no longer than the parent's") }
        if let pu = p["until"] as? String, !pu.isEmpty, !((c["until"] as? String).map { !$0.isEmpty && !jsLess(pu, $0) } ?? false) { wider("scope.until is no later than the parent's") }
        if truthy(p["notice"]) && !(truthy(c["notice"]) && compareDurations(c["notice"], p["notice"], from) >= 0) { wider("scope.notice is no shorter than the parent's") }
        if has(p["condition"]) && !contains(c["condition"], p["condition"]) { wider("scope.condition keeps every condition of the parent's") }
        let depth = numberOf(dig(parent, "state.depth")) ?? 0
        if !(depth >= 1 && (numberOf(dig(child, "state.depth")) ?? 0) <= depth - 1) {
            wider("state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)")
        }
        if let to = dig(parent, "refs.to") as? String, dig(child, "refs.author") as? String != to { wrong.append(FoodBlock.Finding(code: "not_receiver", detail: "a grant is passed on by the one who received it")) }
        return wrong
    }

    /// What makes a child grant wider than its parent, in plain words ([] when it is within it).
    public static func scopeWithin(_ child: JSON, _ parent: JSON) -> [String] { scopeRefusals(child, parent).map { $0.detail } }

    /// Why a grant is not live among these blocks (its own end, the receiver's, its `until` on the reader's clock, an ancestor's): [] when live.
    public static func whyNotLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) -> [String] { whyNotLive(grant, Index(blocks), now: now) }
    static func whyNotLive(_ grant: JSON?, _ byHash: Index, now: String?, seen: Set<String> = []) -> [String] {
        guard let grant = grant else { return ["the grant is not held"] }
        let gh = grant["hash"] as? String ?? ""
        if seen.contains(gh) { return ["its parents form a cycle"] }
        var wrong: [String] = []
        let author = dig(grant, "refs.author") as? String, gas = dig(grant, "refs.as") as? String, to = dig(grant, "refs.to") as? String
        for block in byHash.values where block["type"] as? String == "grant" {
            guard let status = dig(block, "state.status") as? String else { continue }
            let ends = status == "stopped" || status == "declined"
            if ends && list(dig(block, "refs.updates")).contains(gh) && (dig(block, "refs.author") as? String == author || (gas != nil && dig(block, "refs.as") as? String == gas)) { wrong.append("its author stopped it") }
            if ends && list(dig(block, "refs.answers")).contains(gh) && to != nil && dig(block, "refs.author") as? String == to { wrong.append("its receiver ended it") }
        }
        if let now = now, let until = dig(grant, "state.scope.until") as? String, !until.isEmpty, !jsLess(now, until) { wrong.append("its scope.until has passed") }
        if let parentHash = dig(grant, "refs.parent") as? String {
            let parent = byHash[parentHash]
            let above = whyNotLive(parent, byHash, now: now, seen: seen.union([gh]))
            if !above.isEmpty { wrong.append("its parent is not live (\(above.joined(separator: "; ")))") } else { wrong += scopeWithin(grant, parent!) }
        }
        return wrong
    }
    public static func isLive(_ grant: JSON?, _ blocks: [JSON], now: String? = nil) -> Bool { whyNotLive(grant, blocks, now: now).isEmpty }
    static func isLive(_ grant: JSON?, _ byHash: Index, now: String?) -> Bool { whyNotLive(grant, byHash, now: now).isEmpty }

    /// The grants above this one, nearest first.
    public static func ancestors(_ grant: JSON, _ blocks: [JSON]) -> [JSON] {
        let byHash = Index(blocks)
        var out: [JSON] = [], seen = Set<String>()
        var at = byHash[dig(grant, "refs.parent") as? String]
        while let g = at, let h = g["hash"] as? String, !seen.contains(h) { seen.insert(h); out.append(g); at = byHash[dig(g, "refs.parent") as? String] }
        return out
    }

    /// Whether a block signed under a grant (refs.under) speaks for its grantor: [] or why not.
    public static func whyNotUnder(_ block: JSON?, _ blocks: [JSON], now: String? = nil) -> [String] {
        let byHash = Index(blocks)
        guard let block = block, let grant = byHash[dig(block, "refs.under") as? String], grant["type"] as? String == "grant" else {
            return ["refs.under names no grant this reader holds"]
        }
        var wrong: [String] = []
        if let to = dig(grant, "refs.to") as? String, to != dig(block, "refs.author") as? String { wrong.append("the grant is for someone else") }
        if let acts = dig(grant, "state.scope.acts") as? [Any] {
            let type = block["type"] as? String ?? "", kind = dig(block, "state.kind")
            let names = acts.compactMap { $0 as? String }
            if !names.contains(type) && !names.contains("\(type).\(kind.map { "\($0)" } ?? "undefined")") {
                wrong.append("the grant's acts do not cover a \(type)\(kind.map { ".\($0)" } ?? "")")
            }
        }
        return wrong + whyNotLive(grant, byHash, now: now)
    }

    /// Who answers for an agent or machine: the authors of its live grants of kind operator, naming it in refs.to (§2).
    public static func operatorsOf(_ agent: String, _ blocks: [JSON], now: String? = nil) -> [String] {
        let byHash = Index(blocks)
        return sortedJS(unique(byHash.values.filter { b in
            b["type"] as? String == "grant" && dig(b, "state.kind") as? String == "operator" && dig(b, "refs.to") as? String == agent
                && !has(dig(b, "state.status")) && isLive(b, byHash, now: now)
        }.compactMap { dig($0, "refs.author") as? String }))
    }
}

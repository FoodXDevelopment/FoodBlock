import Foundation

// The write check (spec/protocol.md §1, Refusals): `refusals(type, state, refs)` says what is wrong with a block as
// every node checks it before writing: [{ code, detail }], one entry per rule found, in the order of protocol.json's
// `refusals.codes.block` ([] when it is a well-formed 1.6 block). The code carries the meaning; the detail is free text
// for people. `check` gives the details alone. Every list and grammar it reads comes from protocol.json; none is
// written here. Older shapes are read (Aliases.swift), never re-checked.
extension FoodBlock {
    /// One finding of a check: a code from protocol.json (`refusals.codes`) and free text for people.
    public struct Finding: Equatable, CustomStringConvertible {
        public let code: String, detail: String
        public init(code: String, detail: String) { self.code = code; self.detail = detail }
        public var description: String { "\(code): \(detail)" }
    }
    static func w(_ code: String, _ detail: String) -> Finding { Finding(code: code, detail: detail) }
    /// Findings as a refusal list: one entry per code, in the order of `order` (a group of protocol.json's
    /// refusals.codes), the details of one code joined with "; ".
    public static func ordered(_ found: [Finding], _ order: [String] = refusalCodes["block"]!) -> [Finding] {
        var codes: [String] = [], details: [String: [String]] = [:]
        for f in found {
            if details[f.code] == nil { codes.append(f.code); details[f.code] = [] }
            if !details[f.code]!.contains(f.detail) { details[f.code]!.append(f.detail) }
        }
        let place = { (code: String) in order.firstIndex(of: code) ?? -1 }
        return stableSorted(codes) { place($0) < place($1) }.map { Finding(code: $0, detail: details[$0]!.joined(separator: "; ")) }
    }

    static let rrule = "^FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,:+-]+)*$"

    static func isTime(_ v: Any?) -> Bool { test("time", v) && parseTime(v) != nil && realCalendar(v) }
    static func isDate(_ v: Any?) -> Bool { test("date", v) && parseTime(v) != nil && realCalendar(v) }
    /// A real calendar value: a month that exists, a day within it (29 February only in a leap year), an hour 00 to 23,
    /// a minute and second 00 to 59 (never Date.parse, which rolls 30 February into March and reads 24:00 as the next day).
    static func realCalendar(_ v: Any?) -> Bool {
        guard let s = v as? String else { return false }
        let n = s.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) } + [0, 0, 0]
        let (year, month, day, hour, minute, second) = (n[0], n[1], n[2], n[3], n[4], n[5])
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        let days = month == 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].contains(month) ? 30 : 31
        return (1...12).contains(month) && day >= 1 && day <= days && hour <= 23 && minute <= 59 && second <= 59
    }
    static func keysWithin(_ v: JSON, _ allowed: [String]) -> Bool { v.keys.allSatisfy(allowed.contains) }
    static func sameSet(_ a: [String], _ b: Any?) -> Bool { has(b) && sortedJS(unique(a)) == sortedJS(unique(list(b))) }

    // ---- Shapes (protocol.json `shapes`), recognised by their keys wherever they sit in state ----
    static func amountShape(_ v: Any?, _ name: String) -> [Finding] {
        guard has(v) else { return [] }
        guard let o = obj(v), keysWithin(o, shape("amount")), let value = o["value"] as? String,
              let unit = o["unit"] as? String, !unit.trimmingCharacters(in: .whitespaces).isEmpty else {
            return [w("shape", "\(name) is an amount: { value (a decimal string), unit (UCUM or a pack) }")]
        }
        return test("decimal", value) ? [] : [w("decimal", "\(name).value is a decimal string (-?(0|[1-9][0-9]*)(.[0-9]+)?)")]
    }
    static func moneyShape(_ v: Any?, _ name: String) -> [Finding] {
        guard has(v) else { return [] }
        if let o = obj(v), keysWithin(o, shape("money")), isInteger(o["minor"]), matches("^[A-Z]{3}$", o["currency"]) { return [] }
        return [w("shape", "\(name) is money: { minor (whole minor units), currency (ISO 4217) }")]
    }
    // A time or date in the right shape that is not a real calendar instant is `calendar`; any other, `time`.
    static func calendarShape(_ v: Any?, _ name: String, _ grammar: String, _ words: String) -> [Finding] {
        guard has(v) else { return [] }
        if grammar == "date" ? isDate(v) : isTime(v) { return [] }
        return test(grammar, v) ? [w("calendar", "\(name) is not a real calendar \(grammar == "date" ? "date" : "instant")")] : [w("time", "\(name) is \(words)")]
    }
    static func timeShape(_ v: Any?, _ name: String) -> [Finding] { calendarShape(v, name, "time", "a UTC time, exactly YYYY-MM-DDTHH:MM:SS.sssZ") }
    static func dateShape(_ v: Any?, _ name: String) -> [Finding] { calendarShape(v, name, "date", "a date") }
    static func durationShape(_ v: Any?, _ name: String) -> [Finding] { !has(v) || test("duration", v) ? [] : [w("time", "\(name) is an ISO 8601 duration (P30D)")] }
    static func hashShape(_ v: Any?, _ name: String) -> [Finding] { !has(v) || test("hash", v) ? [] : [w("grammar", "\(name) is a hash")] }
    static func hashListShape(_ v: Any?, _ name: String) -> [Finding] {
        guard has(v) else { return [] }
        if let a = v as? [Any], !a.isEmpty, a.allSatisfy({ test("hash", $0) }) { return [] }
        return [w("grammar", "\(name) is a set of hashes")]
    }
    static func wholeShape(_ v: Any?, _ name: String, _ min: Int = 0) -> [Finding] {
        guard has(v) else { return [] }
        if let n = numberOf(v), isInteger(v), n >= Double(min) { return [] }
        return [w("shape", "\(name) is a whole number\(min > 0 ? " from \(min)" : "")")]
    }
    static func whenShape(_ v: Any?, _ name: String = "state.when") -> [Finding] {
        if !has(v) || v is String { return timeShape(v, name) }
        guard let o = obj(v), keysWithin(o, shape("when")), has(o["from"]), has(o["to"]) else { return [w("shape", "\(name) is a time, or { from, to }")] }
        let wrong = timeShape(o["from"], "\(name).from") + timeShape(o["to"], "\(name).to")
        if !wrong.isEmpty { return wrong }
        if let f = o["from"] as? String, let t = o["to"] as? String, jsLess(t, f) { return [w("shape", "\(name).from is after its to")] }
        return []
    }
    static func decimalIn(_ v: Any?, _ low: Double, _ high: Double) -> Bool {
        guard let s = v as? String, test("decimal", s), let d = Double(s) else { return false }
        return d >= low && d <= high
    }
    static func whereShape(_ v: Any?) -> [Finding] {
        guard has(v) else { return [] }
        let area = (shapes["where"] as! JSON)["area"] as! [String]
        if let o = obj(v), keysWithin(o, area), decimalIn(o["lat"], -90, 90), decimalIn(o["lon"], -180, 180),
           !has(o["radius"]) || (amountShape(o["radius"], "radius").isEmpty && dig(o, "radius.unit") as? String == "m") { return [] }
        return [w("shape", "state.where is a point { lat, lon } (WGS84 degrees, decimal strings), or an area: a point with radius (an amount in m)")]
    }
    static func marksShape(_ v: Any?, _ name: String) -> [Finding] {
        guard has(v) else { return [] }
        if let a = v as? [Any], a.allSatisfy({ m in
            guard let o = obj(m) else { return false }
            return keysWithin(o, shape("mark")) && o["scheme"] is String && o["value"] is String
        }) { return [] }
        return [w("shape", "\(name) lists exact marks: [{ scheme, value }]")]
    }
    // A price is money, money per unit ({ money, per }), or a share of something measured ({ share, of }).
    static func perUnit(_ v: Any?) -> Bool { obj(v)?["per"] != nil }
    static func priceShape(_ v: Any?, _ name: String) -> [Finding] {
        if perUnit(v), let o = obj(v) {
            return (keysWithin(o, shape("price_per")) ? [] : [w("shape", "\(name) per unit is { money, per }")])
                + (!has(o["money"]) ? [w("shape", "\(name).money is the price")] : moneyShape(o["money"], "\(name).money"))
                + amountShape(o["per"], "\(name).per")
        }
        if let o = obj(v), o["share"] != nil {
            guard keysWithin(o, shape("price_share")), o["share"] is String, test("hash", o["of"] ?? "") else {
                return [w("shape", "\(name) as a share is { share (a decimal string), of (the schema saying what is measured) }")]
            }
            return test("decimal", o["share"]) ? [] : [w("decimal", "\(name).share is a decimal string")]
        }
        return moneyShape(v, name)
    }
    // A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within.
    static func quantityShape(_ v: Any?, _ price: Any?, _ name: String) -> [Finding] {
        guard let o = obj(v), o["min"] != nil || o["max"] != nil else { return amountShape(v, name) }
        var out = (perUnit(price) ? [] : [w("shape", "\(name) is a range only under a per-unit price")]) + (keysWithin(o, shape("range")) ? [] : [w("shape", "\(name) as a range is { min, max }")])
        out += amountShape(o["min"], "\(name).min") + amountShape(o["max"], "\(name).max")
        if let lo = obj(o["min"]), let hi = obj(o["max"]), truthy(lo["unit"]), lo["unit"] as? String == hi["unit"] as? String,
           let a = Double(lo["value"] as? String ?? ""), let b = Double(hi["value"] as? String ?? ""), a > b { out.append(w("shape", "\(name).min is above its max")) }
        return out
    }
    static func stopShape(_ stop: Any?) -> [Finding] {
        let words = Array(stops.prefix(2))
        if let s = stop as? String, words.contains(s) { return [] }
        if let o = obj(stop), keysWithin(o, ["occurrences"]), let a = o["occurrences"] as? [Any], a.allSatisfy(isTime) { return [] }
        return [w("bad_status", "state.stop is \(words.joined(separator: " or ")), or { occurrences: [start times] }")]
    }

    // Numbers in signed content are integers within protocol.json's bounds; never floats. Keys are written in NFC.
    static func numbers(_ v: Any?, _ path: String) -> [Finding] {
        if let n = numberOf(v) {
            if !isInteger(v) { return [w("float", "\(path) is a float; write a decimal string, money { minor, currency } or an amount { value, unit }")] }
            return n < integerMin || n > integerMax ? [w("integer_range", "\(path) is outside the whole numbers a block may hold (±(2^53 - 1))")] : []
        }
        if let a = v as? [Any] { return a.enumerated().flatMap { numbers($0.element, "\(path)[\($0.offset)]") } }
        guard let o = obj(v) else { return [] }
        let keys = o.keys.sorted(by: jsLess)
        return keys.filter { $0.unicodeScalars.elementsEqual($0.precomposedStringWithCanonicalMapping.unicodeScalars) == false }
            .map { w("not_canonical", "\(path) has a key not written in NFC (\"\($0)\")") } + keys.flatMap { numbers(o[$0], "\(path).\($0)") }
    }
    // Every amount and money object, wherever it sits in state.
    static func shapesIn(_ v: Any?, _ path: String) -> [Finding] {
        if let a = v as? [Any] { return a.enumerated().flatMap { shapesIn($0.element, "\(path)[\($0.offset)]") } }
        guard let o = obj(v) else { return [] }
        let keys = o.keys.sorted(by: jsLess)
        let own = o["unit"] != nil && keysWithin(o, shape("amount")) ? amountShape(o, path)
            : o["minor"] != nil && keysWithin(o, shape("money")) ? moneyShape(o, path) : []
        return own + keys.flatMap { shapesIn(o[$0], "\(path).\($0)") }
    }
    // The time and date fields (protocol.json `time_fields`, `date_fields`) in state, its terms and lines, and its scope.
    static func timesIn(_ v: Any?, _ path: String) -> [Finding] {
        guard let o = obj(v) else { return [] }
        return o.keys.sorted(by: jsLess).flatMap { key -> [Finding] in
            key == "when" ? whenShape(o[key], "\(path).\(key)") : timeFields.contains(key) ? timeShape(o[key], "\(path).\(key)")
                : dateFields.contains(key) ? dateShape(o[key], "\(path).\(key)") : []
        }
    }

    static func termsShape(_ terms: Any?, _ refs: JSON, _ state: JSON) -> [Finding] {
        guard has(terms) else { return [] }
        guard let t = obj(terms) else { return [w("shape", "state.terms is { price, quantity, lines, ... }")] }
        var out = t.keys.sorted(by: jsLess).filter { !termKeys.contains($0) }.map { w("undeclared_field", "terms.\($0) is not a 1.6 term (\(termKeys.joined(separator: ", ")))") }
        if has(t["price"]) { out += priceShape(t["price"], "terms.price") }
        out += quantityShape(t["quantity"], t["price"], "terms.quantity") + timesIn(t, "terms")
        out += hashShape(t["text"], "terms.text") + hashShape(t["settled_by"], "terms.settled_by")
        if has(t["repeat"]) && !matches(rrule, t["repeat"]) { out.append(w("grammar", "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR)")) }
        if has(t["repeat"]) && !has(state["when"]) { out.append(w("shape", "a repeating promise counts its occurrences from state.when")) }
        if has(t["needs"]) && !(t["needs"] is JSON || t["needs"] is [Any]) { out.append(w("shape", "terms.needs is data from a schema, never a name")) }
        guard has(t["lines"]) else { return out }
        guard let lines = t["lines"] as? [Any], !lines.isEmpty else { return out + [w("lines", "terms.lines lists { id, what, quantity, price }")] }
        for (i, item) in lines.enumerated() {
            let line = obj(item)
            if !(line.map { keysWithin($0, lineKeys) } ?? false) { out.append(w("lines", "terms.lines[\(i)] is { \(lineKeys.joined(separator: ", ")) }")) }
            if !((line?["id"] as? String).map { !$0.isEmpty } ?? false) { out.append(w("lines", "terms.lines[\(i)].id names the line")) }
            if !test("hash", line?["what"] ?? "") { out.append(w("lines", "terms.lines[\(i)].what is a thing's hash")) }
            out += timesIn(line, "terms.lines[\(i)]") + quantityShape(line?["quantity"], line?["price"], "terms.lines[\(i)].quantity")
            if has(line?["price"]) { out += priceShape(line?["price"], "terms.lines[\(i)].price") }
        }
        let ids = lines.map { stableJSON(obj($0)?["id"]) }
        if Set(ids).count != lines.count { out.append(w("lines", "each line id is unique in the promise")) }
        if has(t["price"]) || has(t["quantity"]) { out.append(w("lines", "with lines, the price and quantity are on each line")) }
        if !sameSet(lines.compactMap { obj($0)?["what"] as? String }, refs["what"]) { out.append(w("lines", "refs.what is the set of every line's what")) }
        return out
    }

    static func scopeShape(_ scope: Any?, _ kind: Any?) -> [Finding] {
        guard let s = obj(scope) else { return [w("shape", "state.scope is { \(scopeKeys.joined(separator: ", ")) }")] }
        var out = s.keys.sorted(by: jsLess).filter { !scopeKeys.contains($0) }.map { w("undeclared_field", "scope.\($0) is not part of a 1.6 scope (\(scopeKeys.joined(separator: ", ")))") }
        // A grant of the id's own kinds (key, member, successor, operator) carries no until; one others act under does.
        if let k = kind as? String, grantKinds.contains(k) {
            if has(s["until"]) { out.append(w("scope_until", "a \(k) grant carries no scope.until")) }
        } else if !has(s["until"]) { out.append(w("scope_until", "a grant others act under carries scope.until (a UTC time)")) }
        out += timesIn(s, "scope")
        if has(s["acts"]) && !((s["acts"] as? [Any])?.allSatisfy { $0 is String } ?? false) { out.append(w("shape", "scope.acts lists acts")) }
        if has(s["parties"]) && !((s["parties"] as? [Any])?.allSatisfy { test("hash", $0) } ?? false) { out.append(w("grammar", "scope.parties lists hashes (left out, it is everyone)")) }
        return out + moneyShape(s["limit"], "scope.limit") + durationShape(s["per"], "scope.per") + durationShape(s["notice"], "scope.notice")
    }

    static func audienceShape(_ state: JSON) -> [Finding] {
        let audience = state["audience"]
        if audience as? String == "public" { return [] }
        guard let a = audience as? [Any], !a.isEmpty, a.allSatisfy({ test("hash", $0) }) else {
            return [w("audience", "state.audience is \"public\" or a list of commitments (salted hashes)")]
        }
        let s = a.map { $0 as! String }
        var out: [Finding] = []
        if !s.indices.allSatisfy({ $0 == 0 || jsLess(s[$0 - 1], s[$0]) }) { out.append(w("audience", "state.audience commitments are sorted, each once")) }
        if !test("nonce", state["nonce"]) { out.append(w("audience", "a private block carries state.nonce (16 random bytes, hex)")) }
        return out
    }

    // The genesis (§2): the one block with no author, prev, after or seq; public, naming its own keys and its recovery.
    // An encryption key is optional (genesis_optional): a micro that only signs leaves it out and adds one by a key grant.
    // What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code.
    static func genesisErrors(_ state: JSON, _ refs: JSON) -> [Finding] {
        var out = refs.keys.sorted(by: jsLess).map { w("bad_genesis", "a genesis has no refs (refs.\($0))") }
        out += state.keys.sorted(by: jsLess).filter { !genesisFields.contains($0) && !genesisOptional.contains($0) }
            .map { w("bad_genesis", "a genesis names only \(genesisFields.joined(separator: ", ")), and \(genesisOptional.joined(separator: ", ")) if it has one (state.\($0))") }
        if !truthy(state["kind"]) { out.append(w("bad_genesis", "state.kind says what they are")) }
        out += !has(state["at"]) ? [w("bad_genesis", "state.at is when it was said")] : timeShape(state["at"], "state.at")
        if state["audience"] as? String != "public" { out.append(w("bad_genesis", "a genesis is public: anyone checks signatures against its key")) }
        if !has(state["public_key_sign"]) { out.append(w("bad_genesis", "state.public_key_sign names its signing key")) }
        else if !test("sign_key", state["public_key_sign"]) { out.append(w("grammar", "state.public_key_sign is an Ed25519 key, SPKI DER hex")) }
        if has(state["public_key_encrypt"]) && !test("encrypt_key", state["public_key_encrypt"]) { out.append(w("grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")) }
        if !has(state["recovery_key_hash"]) { out.append(w("bad_genesis", "state.recovery_key_hash names the recovery key")) }
        else if !test("hash", state["recovery_key_hash"]) { out.append(w("grammar", "state.recovery_key_hash is the hash of the recovery key")) }
        out += !has(state["recovery_reach"]) ? [w("bad_genesis", "state.recovery_reach says how far back the recovery key may reach")] : durationShape(state["recovery_reach"], "state.recovery_reach")
        return out
    }
    static func isGenesisShape(_ type: String, _ state: JSON, _ refs: JSON) -> Bool { type == "actor" && !truthy(refs["author"]) && !has(state["seq"]) }

    // A side signs for itself, or a member signs as it (refs.as), or an agent under its grant (refs.under).
    static func speaksFor(_ refs: JSON, _ side: Any?) -> Bool {
        guard let side = side as? String else { return false }
        return refs["author"] as? String == side || refs["as"] as? String == side || truthy(refs["under"])
    }
    static func statusShape(_ state: JSON, _ refs: JSON) -> [Finding] {
        guard has(state["status"]) else { return has(state["stop"]) ? [w("bad_status", "state.stop goes with status stopped")] : [] }
        var out: [Finding] = []
        if !(truthy(refs["answers"]) || truthy(refs["updates"])) { out.append(w("status_not_answer", "only an answer (refs.answers) or the author stopping their own (refs.updates) carries a status")) }
        if !((state["status"] as? String).map(answers.contains) ?? false) { out.append(w("bad_status", "state.status is one of \(answers.joined(separator: ", "))")) }
        if state["status"] as? String == "stopped" { out += stopShape(state["stop"]) } else if has(state["stop"]) { out.append(w("bad_status", "state.stop goes with status stopped")) }
        return out
    }

    // What each type needs beyond what every block needs. An answer has the type of what it answers; the type's other
    // required fields do not apply to it (§6).
    static func rules(_ type: String, _ state: JSON, _ refs: JSON) -> [Finding] {
        switch type {
        case "actor":
            var out = truthy(state["kind"]) ? [] : [w("shape", "state.kind says what it is: a person, an agent, a circle, a contact")]
            out += ["public_key_sign", "recovery_key_hash", "recovery_reach"].filter { has(state[$0]) }.map { w("undeclared_field", "only a genesis names state.\($0); a key comes in by a key grant") }
            if state["kind"] as? String == "contact" && has(state["public_key_encrypt"]) { out.append(w("undeclared_field", "a contact has no keys")) }
            if has(state["signers"]) && !((state["signers"] as? [Any]).map { !$0.isEmpty && $0.allSatisfy { ($0 as? String).map { !$0.isEmpty } ?? false } } ?? false) {
                out.append(w("shape", "state.signers lists the roles that may sign as the circle"))
            }
            if has(state["removal"]) && !(obj(state["removal"]).map { keysWithin($0, circleRules["removal"] as! [String]) && (intOf($0["needed"]) ?? 0) >= 1 && isInteger($0["needed"]) } ?? false) {
                out.append(w("shape", "state.removal is { needed: N }, how many other admins must agree to remove an admin"))
            }
            if has(state["public_key_encrypt"]) && !test("encrypt_key", state["public_key_encrypt"]) { out.append(w("grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")) }
            return out
        case "thing":
            var out = truthy(state["kind"]) || truthy(refs["kind"]) ? [] : [w("shape", "a thing is a kind (state.kind) or one of a kind (refs.kind)")]
            out += marksShape(state["marks"], "state.marks")
            if has(state["words"]) && !(state["words"] is String) { out.append(w("shape", "state.words are the words printed on it, as read")) }
            out += state["kind"] as? String == "schema" ? schemaShape(state) : schemaKeys.filter { has(state[$0]) }.map { w("undeclared_field", "state.\($0) belongs to a schema (a thing of kind schema)") }
            return out
        case "transform":
            guard has(state["shares"]) else { return [] }
            let inputs = list(refs["derives_from"])
            let ok = (state["shares"] as? [Any])?.allSatisfy { item in
                guard let o = obj(item) else { return false }
                return keysWithin(o, shape("share")) && inputs.contains(o["from"] as? String ?? "\u{0}") && test("decimal", o["share"])
            } ?? false
            return ok ? [] : [w("shape", "state.shares lists { from (an input it derives_from), share (a decimal string) }")]
        case "transfer":
            var out = truthy(refs["answers"]) || truthy(refs["to_owner"]) || truthy(refs["to_holder"]) || truthy(refs["to_place"]) || has(state["count"]) ? []
                : [w("shape", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)")]
            out += wholeShape(state["count"], "state.count", 1) + marksShape(state["marks"], "state.marks")
            if has(state["split"]) {
                guard let split = state["split"] as? [Any], !split.isEmpty else { return out + [w("shape", "state.split lists { for, line, money }")] }
                let fors = list(refs["for"])
                for (i, item) in split.enumerated() {
                    let part = obj(item)
                    if !(part.map { keysWithin($0, shape("split")) && fors.contains($0["for"] as? String ?? "\u{0}") } ?? false) { out.append(w("shape", "state.split[\(i)].for is one of what it is for (refs.for)")) }
                    if !has(part?["money"]) { out.append(w("shape", "state.split[\(i)].money says how much")) }
                    if has(part?["line"]) && !(part?["line"] is String) { out.append(w("shape", "state.split[\(i)].line is a line id")) }
                }
            }
            return out
        case "observe":
            var out: [Finding] = []
            if (truthy(refs["confirms"]) || truthy(refs["same_as"])) && !has(state["confidence"]) { out.append(w("shape", "a confirm or a same_as carries a confidence")) }
            if has(state["dkim"]) && !(obj(state["dkim"]).map { $0["domain"] is String && isBool($0["pass"]) } ?? false) { out.append(w("shape", "state.dkim is { domain, pass }")) }
            return out
        case "promise":
            let answer = truthy(refs["answers"]) && has(state["status"]), stopping = truthy(refs["updates"]) && has(state["status"])
            let asked = speaksFor(refs, refs["to"]) && !speaksFor(refs, refs["from"])
            var out = statusShape(state, refs)
            if !(answer || stopping || speaksFor(refs, refs["from"]) || speaksFor(refs, refs["to"])) { out.append(w("not_a_side", "a promise is signed by a side: from (an offer) or to (an ask), as it, or under its grant")) }
            if !answer && !stopping && asked && !isTime(dig(state, "terms.expires")) { out.append(w("ask_without_expires", "every ask carries terms.expires")) }
            if truthy(refs["answers"]) && !truthy(refs["for"]) { out.append(w("deal_not_named", "an answer or a counter names its deal in refs.for (the first promise)")) }
            if has(state["not"]) && !(isBool(state["not"]) && truthy(state["not"])) { out.append(w("shape", "state.not is true (a promise not to do the step), or left out")) }
            if has(state["what"]) && !(state["what"] is String || state["what"] is JSON) { out.append(w("shape", "state.what describes time or a job (text, or data under a schema)")) }
            return out + termsShape(state["terms"], refs, state)
        case "grant":
            let ending = (truthy(refs["answers"]) || truthy(refs["updates"])) && has(state["status"])
            var out = truthy(state["kind"]) ? [] : [w("shape", "state.kind says what authority it gives")]
            out += statusShape(state, refs) + wholeShape(state["depth"], "state.depth")
            if has(state["scope"]) { out += scopeShape(state["scope"], state["kind"]) }
            if !(ending || truthy(refs["answers"])) {
                switch state["kind"] as? String {
                case "key": out += keyGrantShape(state, refs)
                case "member": out += memberShape(state, refs)
                case "successor": out += successorShape(state, refs)
                case "operator": if !truthy(refs["to"]) { out.append(w("shape", "an operator grant names the agent or machine it answers for (refs.to)")) }
                default: break
                }
            }
            return out + hashShape(state["last_counted"], "state.last_counted")
        default: return []
        }
    }
    static func keyGrantShape(_ state: JSON, _ refs: JSON) -> [Finding] {
        var out: [Finding] = []
        if !truthy(refs["subject"]) { out.append(w("shape", "a key grant names the id it is for (refs.subject)")) }
        if !(has(state["public_key_sign"]) || has(state["public_key_encrypt"]) || has(state["recovery_key_hash"])) { out.append(w("shape", "a key grant names the new key (state.public_key_sign or public_key_encrypt)")) }
        if has(state["public_key_sign"]) && !test("sign_key", state["public_key_sign"]) { out.append(w("grammar", "state.public_key_sign is an Ed25519 key, SPKI DER hex")) }
        if has(state["public_key_encrypt"]) && !test("encrypt_key", state["public_key_encrypt"]) { out.append(w("grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")) }
        if has(state["replaces"]) != has(state["last_good"]) { out.append(w("shape", "a rotation names both the key it replaces and that key's last good block")) }
        if has(state["replaces"]) && !test("sign_key", state["replaces"]) { out.append(w("grammar", "state.replaces is the key it replaces")) }
        out += hashShape(state["last_good"], "state.last_good")
        if has(state["recovery_key"]) && !test("sign_key", state["recovery_key"]) { out.append(w("grammar", "state.recovery_key is the recovery key that signed it")) }
        if has(state["recovery_key_hash"]) != has(state["recovery_reach"]) { out.append(w("shape", "adding recovery names both recovery_key_hash and recovery_reach")) }
        out += hashShape(state["recovery_key_hash"], "state.recovery_key_hash") + durationShape(state["recovery_reach"], "state.recovery_reach")
        out += wholeShape(state["epoch"], "state.epoch", 1)
        if has(state["epoch"]) && !truthy(refs["as"]) { out.append(w("shape", "a rekey (state.epoch) is signed as the circle (refs.as)")) }
        if has(state["epoch"]) && (!has(state["keys"]) || !truthy(refs["after"])) { out.append(w("shape", "a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after")) }
        return out
    }
    static func memberShape(_ state: JSON, _ refs: JSON) -> [Finding] {
        var out: [Finding] = []
        if !truthy(refs["subject"]) { out.append(w("shape", "a member grant names the circle (refs.subject)")) }
        if stableJSON(refs["as"]) != stableJSON(refs["subject"]) { out.append(w("shape", "a member grant is signed as the circle (refs.as)")) }
        if has(state["roles"]) && !((state["roles"] as? [Any])?.allSatisfy { ($0 as? String).map { !$0.isEmpty } ?? false } ?? false) { out.append(w("shape", "state.roles lists the roles it gives (words)")) }
        return out
    }
    static func successorShape(_ state: JSON, _ refs: JSON) -> [Finding] {
        var out: [Finding] = []
        if !truthy(refs["to"]) { out.append(w("shape", "a successor grant names the successor (refs.to)")) }
        out += !has(state["witnesses"]) ? [w("shape", "state.witnesses names who may record the event")] : hashListShape(state["witnesses"], "state.witnesses")
        let count = (state["witnesses"] as? [Any])?.count ?? 0
        if !(isInteger(state["needed"]) && (intOf(state["needed"]) ?? 0) >= 1 && (intOf(state["needed"]) ?? 0) <= count) { out.append(w("shape", "state.needed is how many witnesses must record it (1 to their number)")) }
        out += !has(state["wait"]) ? [w("shape", "state.wait is how long the trigger waits (a duration)")] : durationShape(state["wait"], "state.wait")
        if has(state["public_key_sign"]) { out.append(w("undeclared_field", "a successor gets decryption keys only, never signing keys")) }
        return out
    }
    static func schemaShape(_ state: JSON) -> [Finding] {
        let target = (state["target"] as? String) ?? ""
        let parts = target.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        var out: [Finding] = []
        let kind = parts.dropFirst().joined(separator: ".")
        if !(types.contains(parts[0]) && (parts.count == 1 || !kind.isEmpty)) { out.append(w("shape", "a schema names its target: a type (\(types.joined(separator: ", "))) or type.kind")) }
        if has(state["fields"]) && !(obj(state["fields"]).map { $0.values.allSatisfy { ($0 as? String).map(fieldTypes.contains) ?? false } } ?? false) {
            out.append(w("shape", "state.fields maps each field to a field type (\(fieldTypes.joined(separator: ", ")))"))
        }
        if has(state["roles"]) && !((state["roles"] as? [Any])?.allSatisfy { $0 is String } ?? false) { out.append(w("shape", "state.roles lists the ref keys it declares")) }
        if has(state["grounds"]) && !(obj(state["grounds"]).map { keysWithin($0, groundsKeys) } ?? false) { out.append(w("shape", "state.grounds is { \(groundsKeys.joined(separator: ", ")) }")) }
        if let c = dig(state, "grounds.confirmers"), !((c as? [Any])?.allSatisfy { test("hash", $0) || test("role_ref", $0) } ?? false) { out.append(w("grammar", "state.grounds.confirmers lists ids or circle#role")) }
        return out
    }

    // Every finding, in the order found.
    static func findings(_ type: String, _ state: JSON, _ refs: JSON, schemas: [String: JSON]?, held: [String: JSON]?) -> [Finding] {
        guard types.contains(type) else { return [w("unknown_type", "\(type) is not a FoodBlock 1.6 type (\(types.joined(separator: ", ")))")] }
        var wrong: [Finding] = []
        do { if try canonical(type, state, refs).utf8.count > blockBytes { wrong.append(w("size_limit", "a block's canonical body is at most \(blockBytes) bytes; link larger content by its hash")) } }
        catch { return [w("not_canonical", "\(error)")] }
        for key in refs.keys.sorted(by: jsLess) {
            let value = refs[key]
            if key == "prev" {
                if !test("hash", value) { wrong.append(w("grammar", "refs.prev is one hash")) }
            } else {
                let hs: [Any] = (value as? [Any]) ?? [value as Any]
                if hs.isEmpty || !hs.allSatisfy({ test("hash", $0) }) { wrong.append(w("grammar", "refs.\(key) is a hash or a set of hashes (64 lowercase hex)")) }
            }
        }
        wrong += numbers(state, "state") + numbers(refs, "refs")
        if isGenesisShape(type, state, refs) { return wrong + genesisErrors(state, refs) }
        if !truthy(refs["author"]) { wrong.append(w("chain", "refs.author names who said it")) }
        if !(isInteger(state["seq"]) && (numberOf(state["seq"]) ?? 0) >= 1) { wrong.append(w("chain", "state.seq is its place in its signing key's chain (1, 2, 3...)")) }
        if !truthy(refs["prev"]) { wrong.append(w("chain", "refs.prev names the key's previous block (or the block that brought the key in)")) }
        if !has(state["at"]) { wrong.append(w("time", "state.at is when it was said")) }
        wrong += timesIn(state, "state") + audienceShape(state) + whereShape(state["where"]) + shapesIn(state, "state")
        if has(state["confidence"]) && !test("confidence", state["confidence"]) { wrong.append(w("grammar", "state.confidence is a decimal string from 0 to 1")) }
        if has(state["sequencer"]) && !test("sign_key", state["sequencer"]) { wrong.append(w("grammar", "state.sequencer is the signing key that orders the record")) }
        wrong += hashListShape(state["manifest"], "state.manifest") + hashListShape(state["counted"], "state.counted")
        if has(state["line"]) && !(state["line"] is String) { wrong.append(w("shape", "state.line is a line id")) }
        if has(refs["after"]) && list(refs["after"]).count > afterHeads { wrong.append(w("after_limit", "refs.after names at most \(afterHeads) heads")) }
        if let held = held, has(refs["after"]), isTime(state["at"]), let at = state["at"] as? String {
            for h in list(refs["after"]) {
                if let seen = dig(held[h], "state.at") as? String, isTime(seen), jsLess(at, seen) { wrong.append(w("at_before_after", "state.at is earlier than \(h), which it names as seen")) }
            }
        }
        if let held = held, type == "grant", let parentHash = refs["parent"] as? String, let parent = held[parentHash] {
            wrong += Grant.scopeRefusals(["state": state, "refs": refs], parent)
        }
        let schemaHash = refs["schema"] as? String
        let schema = schemaHash.flatMap { schemas?[$0] }
        if schemaHash != nil && schemas != nil && schema == nil { wrong.append(w("undeclared_ref", "refs.schema names a schema this node does not hold: ask for it")) }
        if schemaHash == nil || schema != nil {
            let fields = everyFields + (FoodBlock.fields[type] ?? []) + ((dig(schema, "state.fields") as? JSON)?.keys.map { $0 } ?? [])
            let roles = refKeys + ((dig(schema, "state.roles") as? [Any])?.compactMap { $0 as? String } ?? [])
            wrong += refs.keys.sorted(by: jsLess).filter { !roles.contains($0) }.map { w("undeclared_ref", "refs.\($0) is not declared (the shared refs, or the schema's roles)") }
            wrong += state.keys.sorted(by: jsLess).filter { !fields.contains($0) }.map { w("undeclared_field", "state.\($0) is not declared for \(type) (its base fields, or the schema's)") }
        }
        return wrong + rules(type, state, refs)
    }

    /// What is wrong with a FoodBlock 1.6 block: [{ code, detail }], one entry per rule found, in the order of
    /// protocol.json's `refusals.codes.block` ([] when it may be written). `schemas` (hash → schema block) lets a named
    /// schema's fields and roles count as declared (a schema not held is refused); `held` (hash → block) checks `at`
    /// against what refs.after names and a child grant against its parent.
    public static func refusals(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], schemas: [String: JSON]? = nil, held: [String: JSON]? = nil) -> [Finding] {
        ordered(findings(type, state, refs, schemas: schemas, held: held))
    }
    /// What is wrong with a FoodBlock 1.6 block, in plain words (each finding's detail); [] when it may be written.
    public static func check(_ type: String, _ state: JSON = [:], _ refs: JSON = [:], schemas: [String: JSON]? = nil, held: [String: JSON]? = nil) -> [String] {
        findings(type, state, refs, schemas: schemas, held: held).map { $0.detail }
    }

    /// An amount: amount("2.5", "kg"). The value is a decimal string.
    public static func amount(_ value: String, _ unit: String) -> JSON { ["value": value, "unit": unit] }
    /// Money in whole minor units: money(420, "GBP") is £4.20.
    public static func money(_ minor: Int, _ currency: String) -> JSON { ["minor": minor, "currency": currency] }
    /// A confidence from 0 to 1, as the decimal string 1.6 signs.
    public static func confidence(_ value: String) throws -> String {
        guard test("confidence", value) else { throw FoodBlockError.invalid("protocol: a confidence is from 0 to 1") }
        return value
    }
    /// Terms on a promise; only the 1.6 terms given are kept.
    public static func terms(_ given: JSON) -> JSON { given.filter { termKeys.contains($0.key) && has($0.value) } }
}

import Foundation

// Reading older blocks (spec/protocol.md: strict writing, generous reading; Encoding: Aliases). Every earlier shape is
// read as its 1.6 form through the one table, aliases.json, in the order protocol.json gives: type names, then the
// shape rules for the block's type.kind, its type and `*`, then the shared ref renames, then `outside`. Every row is
// read, the `draft: true` rows too. Reading never changes a block or its hash: what readAs adds beside the content
// (readFrom, settles, outside, retired) is a reader's mark, never signed.
extension FoodBlock {
    static let aliasOrder: [String] = {
        let order = (spec["aliases"] as! JSON)["order"] as! [String]
        precondition(order == ["types", "shapes", "refs", "outside"], "aliases: this reader follows the order types, shapes, refs, outside; protocol.json says \(order)")
        return order
    }()
    static let aliasTypes = aliasesOrdered["types"] as! Ordered
    static let aliasShapes = aliasesOrdered["shapes"] as! Ordered
    static let aliasRefs = aliases["refs"] as! [String: String]
    static let outsidePrefix = aliases["outside"] as! String

    static func holds(_ block: JSON, _ when: Ordered?) -> Bool {
        (when?.pairs ?? []).allSatisfy { path, value in
            let got = dig(block, path)
            if value as? String == "*" { return got != nil }
            if value is NSNull { return got == nil }
            guard let got = got else { return false }
            return isObject(value) || value is [Any] ? false : stableJSON(got) == stableJSON(value) && (got is String) == (value is String)
        }
    }

    /// Set a dotted path; never over a value already there unless `force`. Non-objects on the way become {}.
    static func put(_ node: inout JSON, _ keys: ArraySlice<String>, _ value: Any, _ force: Bool) {
        let key = keys.first!
        if keys.count == 1 {
            if force || !has(node[key]) { node[key] = value }
            return
        }
        var child = obj(node[key]) ?? JSON()
        put(&child, keys.dropFirst(), value, force)
        node[key] = child
    }
    static func put(_ block: inout JSON, _ path: String, _ value: Any, _ force: Bool) {
        put(&block, ArraySlice(path.split(separator: ".").map(String.init)), value, force)
    }
    static func remove(_ node: inout JSON, _ keys: ArraySlice<String>) {
        let key = keys.first!
        if keys.count == 1 { node.removeValue(forKey: key); return }
        guard var child = obj(node[key]) else { return }
        remove(&child, keys.dropFirst())
        node[key] = child
    }
    static func remove(_ block: inout JSON, _ path: String) { remove(&block, ArraySlice(path.split(separator: ".").map(String.init))) }

    /// The 1.6 type and kind an old type name reads as. Any other old `base.kind` reads as its base's type, with that kind.
    static func typeOf(_ name: String) -> Ordered? {
        func just(_ t: String) -> Ordered { let o = Ordered(); o.pairs = [("type", t)]; return o }
        if types.contains(name) { return just(name) }
        if let alias = aliasTypes[name] as? Ordered { return alias }
        let parts = name.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        let base = parts[0], rest = parts.dropFirst()
        let found: Ordered? = types.contains(base) ? just(base) : aliasTypes[base] as? Ordered
        if let found = found, !truthy(found["retired"]), !rest.isEmpty {
            let o = Ordered()
            o.pairs = found.pairs.filter { $0.0 != "kind" } + [("kind", rest.joined(separator: "."))]
            return o
        }
        // A type the shapes still read (the draft name `schema`).
        return name != "*" && aliasShapes[name] != nil ? just(name) : nil
    }

    static func apply(_ read: inout JSON, _ rule: Ordered, _ marks: inout JSON) {
        let force = truthy(rule["force"])
        for (from, to) in (rule["refs"] as? Ordered)?.pairs ?? [] {
            var refs = read["refs"] as! JSON
            if let value = refs[from] {
                refs.removeValue(forKey: from)
                read["refs"] = refs
                put(&read, "refs.\(to as! String)", value, force)
            }
        }
        for (from, to) in (rule["move"] as? Ordered)?.pairs ?? [] {
            if let value = dig(read, from) { remove(&read, from); put(&read, to as! String, value, force) }
        }
        for (to, from) in (rule["copy"] as? Ordered)?.pairs ?? [] {
            if let value = dig(read, from as! String) { put(&read, to, value, force) }
        }
        for (to, from) in (rule["join"] as? Ordered)?.pairs ?? [] {
            let parts = (from as! [Any]).compactMap { dig(read, $0 as! String) }.map { v -> String in
                if let s = v as? String { return s }
                if let d = numberOf(v) { return (try? numberString(d)) ?? "\(d)" }
                return isBool(v) ? (truthy(v) ? "true" : "false") : "\(v)"
            }
            if !parts.isEmpty { put(&read, to, parts.joined(separator: "."), true) }
        }
        for path in rule["drop"] as? [Any] ?? [] { remove(&read, path as! String) }
        for (path, value) in (rule["set"] as? Ordered)?.pairs ?? [] { put(&read, path, plain(value)!, force) }
        if let t = rule["type"] as? String, !t.isEmpty { read["type"] = t }
        if let k = rule["kind"] as? String, !k.isEmpty { var s = read["state"] as! JSON; s["kind"] = k; read["state"] = s }
        if let settles = rule["settles"] as? String { marks["settles"] = (read["refs"] as! JSON)[settles] ?? NSNull() }
    }

    /// Per-type rows (type.kind, then type), then the every-type rows (`*`).
    static func shapesOf(_ read: JSON) -> [Ordered] {
        let type = read["type"] as? String ?? "", kind = kindText(read)
        return ["\(type).\(kind)", type, "*"].flatMap { (aliasShapes[$0] as? [Any] ?? []).compactMap { $0 as? Ordered } }
    }
    static func kindText(_ block: JSON) -> String {
        guard let k = dig(block, "state.kind") else { return "undefined" }
        if let s = k as? String { return s }
        return stableJSON(k)
    }

    /// A block of any earlier shape, read as FoodBlock 1.6; a block that needs no reading comes back as itself.
    public static func readAs(_ block: JSON) -> JSON {
        guard let typeName = block["type"] as? String, let alias = typeOf(typeName) else { return block }
        if truthy(alias["retired"]) { var out = block; out["retired"] = true; return out }
        var state = obj(block["state"]) ?? [:]
        for (from, to) in (alias["fields"] as? Ordered)?.pairs ?? [] where state[from] != nil {
            state[to as! String] = state[from]; state.removeValue(forKey: from)
        }
        var merged = JSON()
        for (k, v) in alias.pairs where !["type", "fields", "retired", "outside"].contains(k) { merged[k] = plain(v) }
        for (k, v) in state { merged[k] = v }
        var read: JSON = ["type": alias["type"] as! String, "state": merged, "refs": obj(block["refs"]) ?? JSON()]
        var marks = JSON()
        var seen = Set<String>()
        while !seen.contains("\(read["type"] as! String).\(kindText(read))") {
            seen.insert("\(read["type"] as! String).\(kindText(read))")
            for rule in shapesOf(read) where holds(read, rule["when"] as? Ordered) { apply(&read, rule, &marks) }
        }
        var refs = JSON(), outside = JSON()
        for (old, value) in read["refs"] as! JSON {
            let role = aliasRefs[old] ?? old
            // A ref naming someone with no record (`outside:Plenish`) is an open side: the name is kept beside, never as a ref.
            if let s = value as? String, s.hasPrefix(outsidePrefix) { outside[role] = String(s.dropFirst(outsidePrefix.count)) } else { refs[role] = value }
        }
        if !outside.isEmpty { marks["outside"] = outside }
        read["refs"] = refs
        if read["type"] as? String == typeName && sameJSON(read["state"], obj(block["state"]) ?? [:]) && sameJSON(refs, obj(block["refs"]) ?? [:]) && marks.isEmpty { return block }
        var out = block
        for (k, v) in read { out[k] = v }
        for (k, v) in marks { out[k] = v }
        out["readFrom"] = typeName
        return out
    }

    /// Whether a block, old or new, is of this 1.6 type (and kind, when named): the one test every reader uses.
    public static func isA(_ block: JSON, _ type: String, _ kind: String? = nil) -> Bool {
        let read = readAs(block)
        return !truthy(read["retired"]) && read["type"] as? String == type && (kind == nil || dig(read, "state.kind") as? String == kind)
    }
}

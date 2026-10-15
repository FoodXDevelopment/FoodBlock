import Foundation

/// The folds (spec/protocol.md §11): a set of blocks read into one answer, the same on every node from the same
/// blocks. Every block is first read as 1.6 through aliases.json. No step reads another author's clock or breaks a
/// tie on authority by hash; `now` is only the reader's own clock, for views (expired, until).
public enum Fold {
    static func readAll(_ blocks: [JSON]) -> Index { Index(blocks.map(FoodBlock.readAs)) }
    static func hashOf(_ b: JSON?) -> String { b?["hash"] as? String ?? "" }
    static func status(_ b: JSON) -> String? { dig(b, "state.status") as? String }
    static func refStr(_ b: JSON?, _ key: String) -> String? { dig(b, "refs.\(key)") as? String }

    // ---- A promise's stage ----
    // Who a block speaks for: a side it names as its author or `as`, or a side whose live grant it acts under.
    static func speaksAs(_ block: JSON?, _ side: String?, _ byHash: Index, _ now: String?) -> Bool {
        guard let side = side, let block = block else { return false }
        if refStr(block, "author") == side || refStr(block, "as") == side { return true }
        guard let grant = byHash[refStr(block, "under")], grant["type"] as? String == "grant", refStr(grant, "author") == side else { return false }
        return (refStr(grant, "to") == nil || refStr(grant, "to") == refStr(block, "author")) && Grant.isLive(grant, byHash, now: now)
    }
    static func decimal(_ v: Any?) -> Double {
        if let s = v as? String { return Double(s) ?? .nan }
        return numberOf(v) ?? .nan
    }
    static func amountIn(_ amount: Any?, _ unit: String?) -> Double? {
        guard let a = obj(amount), a["unit"] as? String == unit else { return nil }
        return decimal(a["value"])
    }
    // A decimal string as an exact fraction of whole numbers: "1.25" is 125 / 100 (Decimal holds 38 digits exactly).
    static func fraction(_ text: Any?) -> (n: Decimal, d: Decimal)? {
        guard let s = text as? String, FoodBlock.test("decimal", s) else { return nil }
        let parts = s.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        let part = parts.count > 1 ? parts[1] : ""
        guard let n = Decimal(string: parts[0] + part) else { return nil }
        return (n, pow(Decimal(10), part.count))
    }
    // n / d rounded to the nearest whole number, halves up (toward +infinity), exactly: the floor of (2n + d) / 2d.
    static func roundHalfUp(_ n0: Decimal, _ d0: Decimal) -> Decimal {
        var (n, d) = (n0, d0)
        if d < 0 { n = -n; d = -d }
        let top = 2 * n + d, den = 2 * d
        var q = top / den, floor = Decimal()
        NSDecimalRound(&floor, &q, 0, .down)
        // Decimal division rounds at 38 digits; set the floor right by the exact remainder.
        while floor * den > top { floor -= 1 }
        while (floor + 1) * den <= top { floor += 1 }
        return floor
    }
    // The total a price comes to for a quantity: money; money per unit, `money.minor` times the quantity over `per`,
    // rounded to the nearest minor unit, halves up (§6); or nil when it is a share of something measured.
    static func totalOf(_ price: Any?, _ quantity: Any?) -> JSON? {
        guard let p = obj(price) else { return nil }
        if isInteger(p["minor"]) { return ["minor": p["minor"]!, "currency": p["currency"] ?? NSNull()] }
        if let per = obj(p["per"]), let m = obj(p["money"]) {
            guard let qa = obj(quantity), qa["unit"] as? String == per["unit"] as? String, let q = fraction(qa["value"]), let pf = fraction(per["value"]),
                  let minor = intOf(m["minor"]) else { return nil }
            let total = roundHalfUp(Decimal(minor) * q.n * pf.d, q.d * pf.n)
            return ["minor": NSDecimalNumber(decimal: total).intValue, "currency": m["currency"] ?? NSNull()]
        }
        return nil
    }
    static func ns(_ v: Any?) -> Any { v ?? NSNull() }

    /// A promise's stage, from its first promise and every block in its deal: offered, asked, expired, declined, stopped,
    /// accepted, underway, done or reversed. Returns { stage, offer, accept, sides, quantity, total, paid, lines, takers,
    /// stopped (occurrences), forks }. `now` is the reader's clock, for expired; `confirmers` are ids whose confirms
    /// count a transfer (beside the schema's grounds).
    public static func promiseStage(_ firstBlock: JSON, _ blocks: [JSON], now: String? = nil, confirmers: [String] = []) -> JSON {
        let byHash = readAll([firstBlock] + Index(blocks).values)
        let first = byHash[hashOf(firstBlock)]!, fh = hashOf(first)
        // The deal: every block naming the first promise in `for`, or answering a block in it (history only where it counts).
        var deal: [String] = [fh], dealSet: Set<String> = [fh]
        var grew = true
        while grew {
            grew = false
            for block in byHash.values {
                let h = hashOf(block)
                if dealSet.contains(h) || !Identity.counts(block, byHash) { continue }
                if list(dig(block, "refs.for")).contains(fh) || list(dig(block, "refs.answers")).contains(where: dealSet.contains) || list(dig(block, "refs.updates")).contains(where: dealSet.contains) {
                    deal.append(h); dealSet.insert(h); grew = true
                }
            }
        }
        let from = refStr(first, "from"), to = refStr(first, "to")
        let offererSide = speaksAs(first, from, byHash, now) ? "from" : "to"
        let offerer = refStr(first, offererSide), otherSide = offererSide == "from" ? "to" : "from"
        let open = !truthy(dig(first, "refs.\(otherSide)"))
        func sideOf(_ b: JSON) -> String? { speaksAs(b, from, byHash, now) ? "from" : speaksAs(b, to, byHash, now) ? "to" : nil }
        // 1. Only blocks a side signed (an open side is anyone, until an accept binds).
        let inDeal = FoodBlock.causalOrder(deal.compactMap { byHash[$0] }).filter { b in
            hashOf(b) != fh && (sideOf(b) != nil || (open && !speaksAs(b, offerer, byHash, now)))
        }
        func answersOf(_ h: String, _ word: String?) -> [JSON] {
            inDeal.filter { list(dig($0, "refs.answers")).contains(h) && (word == nil ? dig($0, "state.status") == nil : status($0) == word) }
        }
        func byOfferer(_ b: JSON) -> Bool { speaksAs(b, offerer, byHash, now) }

        // 2. The live offers: the first promise, or the latest counters between the same two sides.
        var live = [first]
        if !open {
            while true {
                let next = live.flatMap { offer in answersOf(hashOf(offer), nil).filter { c in c["type"] as? String == "promise" && sideOf(c) != nil && sideOf(c) != sideOf(offer) } }
                if next.isEmpty { break }
                live = next
            }
        }
        // 6. A binding accept: the other side's accept of a live offer (one to one), unless the offerer declined it; or,
        // for an offer open to many, the offerer's own allocation, each seeing the one before.
        func declinedByOfferer(_ a: JSON) -> Bool { answersOf(hashOf(a), "declined").contains(where: byOfferer) }
        var takers: [JSON] = [], forks: [String] = []
        var accept: JSON? = nil
        // To yourself: a promise whose from and to both name its author is accepted when made.
        let toSelf = from != nil && from == to && refStr(first, "author") == from
        if toSelf { accept = first }
        else if !open {
            accept = live.flatMap { offer in answersOf(hashOf(offer), "accepted").filter { b in sideOf(b) != nil && sideOf(b) != sideOf(offer) && !declinedByOfferer(b) } }.first
        } else {
            let requests = answersOf(fh, "accepted").filter { !byOfferer($0) }
            let requestHashes = Set(requests.map(hashOf))
            let allocations = inDeal.filter { byOfferer($0) && status($0) == "accepted" && list(dig($0, "refs.answers")).contains(where: requestHashes.contains) }
            let terms = obj(dig(first, "state.terms"))
            let cap = obj(dig(terms, "quantity.max")) ?? obj(terms?["quantity"])
            // The sequencer's allocations form one chain, each seeing the one before. Two that do not see each other prove a
            // lie: neither counts, nor anything after them; only what came before the pair binds.
            var allocated = 0.0
            for allocation in FoodBlock.causalOrder(allocations) {
                if let crossed = takers.firstIndex(where: { !FoodBlock.sees(allocation, byHash[$0["allocation"] as? String], byHash) }) {
                    forks += sortedJS([takers[crossed]["allocation"] as! String, hashOf(allocation)])
                    takers.removeSubrange(crossed...)
                    break
                }
                let request = requests.first { list(dig(allocation, "refs.answers")).contains(hashOf($0)) }!
                let quantity = dig(allocation, "state.terms.quantity") ?? dig(request, "state.terms.quantity")
                let q = cap != nil && quantity != nil ? amountIn(quantity, cap!["unit"] as? String) : nil
                // What is bound from an offer never exceeds what is offered (invariant 11).
                if let q = q, allocated + q > decimal(cap!["value"]) { continue }
                allocated += q ?? 0
                takers.append(["who": ns(refStr(request, "author")), "request": hashOf(request), "allocation": hashOf(allocation), "quantity": ns(quantity)])
            }
            if let t = takers.first { accept = byHash[t["allocation"] as? String] }
        }
        let offer = accept != nil && !open && !toSelf ? byHash[list(dig(accept, "refs.answers")).first]! : live[0]
        func result(_ stage: String, _ more: JSON = [:]) -> JSON {
            // Every name the spec gives (§11, What each fold returns): a field that does not apply is null, or an empty list.
            var out: JSON = ["stage": stage, "stop": NSNull(), "from": NSNull(), "offer": hashOf(offer), "accept": accept.map { hashOf($0) as Any } ?? NSNull(),
                             "sides": ["from": ns(from), "to": ns(to)], "quantity": NSNull(), "takers": takers, "forks": forks,
                             "lines": [Any](), "total": NSNull(), "paid": NSNull(), "stopped": [Any]()]
            for (k, v) in more { out[k] = v }
            return out
        }

        // 3. Stopped before: by the offerer (an updates) or the other side (an answers), unless an accept binds over it.
        let stops = inDeal.filter { status($0) == "stopped" }
        let before = stops.filter { dig($0, "state.stop") as? String == "before" }
        if !before.isEmpty && (accept == nil || before.contains { FoodBlock.sees(accept, $0, byHash) }) { return result("stopped", ["stop": "before"]) }
        // 4. Declined by the other side.
        if accept == nil && !open && live.contains(where: { one in answersOf(hashOf(one), "declined").contains { b in sideOf(b) != nil && sideOf(b) != sideOf(one) } }) { return result("declined") }
        // 5. No binding accept: offered or asked; expired once the reader's clock passes `expires` (a view).
        guard let accepted = accept else {
            let expires = dig(live[0], "state.terms.expires") as? String
            if let now = now, let e = expires, !e.isEmpty, jsLess(e, now) { return result("expired") }
            return result(offererSide == "from" ? "offered" : "asked")
        }
        // 7, 8. Settling: a giver's transfer counts once the receiver accepts it, or a party the grounds name confirms it.
        let terms = obj(dig(offer, "state.terms")) ?? [:]
        let takerQuantity = takers.first.flatMap { has($0["quantity"]) ? $0["quantity"] : nil }
        let chosen = dig(accepted, "state.terms.quantity") ?? takerQuantity ?? terms["quantity"]
        func receiver(_ side: String) -> String? {
            if let s = refStr(first, side), !s.isEmpty { return s }
            if side == otherSide { return (takers.first?["who"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? refStr(accepted, "author") }
            return nil
        }
        let toSide = receiver("to"), fromSide = receiver("from")
        // A confirmer is one given, or one the deal's schema names in its grounds (an id, or circle#role: its holders).
        let schema = byHash[refStr(first, "schema")]
        let named = (confirmers + ((dig(schema, "state.grounds.confirmers") as? [Any])?.compactMap { $0 as? String } ?? [])).flatMap { who -> [String] in
            let parts = who.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            return parts.count > 1 && !parts[1].isEmpty ? holdersOf(circleState(parts[0], byHash.values), parts[1]) : [who]
        }
        func counted(_ block: JSON, _ receiverId: String?) -> Bool {
            answersOf(hashOf(block), "accepted").contains { same(refStr($0, "author"), receiverId) || same(refStr($0, "as"), receiverId) }
                || byHash.values.contains { list(dig($0, "refs.confirms")).contains(hashOf(block)) && named.contains(refStr($0, "author") ?? "\u{0}") }
        }
        func names(_ b: JSON, _ key: String, _ who: String?) -> Bool { who != nil && list(dig(b, "refs.\(key)")).contains(who!) }
        let transfers = inDeal.filter { $0["type"] as? String == "transfer" && dig($0, "state.status") == nil }
        // Goods count when they move ownership: to a named receiver once it answers accepted; to an open receiver (a
        // count) on the sequencer's own signature.
        let goods = transfers.filter { b in
            !truthy(dig(b, "state.money")) && (((names(b, "to_owner", toSide) || names(b, "to_holder", toSide)) && counted(b, toSide))
                || (dig(b, "state.count") != nil && !truthy(dig(b, "refs.to_owner")) && byOfferer(b) && offererSide == "from"))
        }
        let pays = transfers.filter { truthy(dig($0, "state.money")) && names($0, "to_owner", fromSide) && counted($0, fromSide) }
        let refunds = transfers.filter { truthy(dig($0, "state.money")) && names($0, "to_owner", toSide) && counted($0, toSide) }
        let work = inDeal.filter { b in
            (b["type"] as? String == "transform" || (b["type"] as? String == "observe" && dig(b, "state.kind") as? String == "work")) && sideOf(b) != nil && dig(b, "state.status") == nil
        }
        // A job is done when the receiving side accepts the work; time, when accepted work covers terms.quantity.
        let acceptedWork = work.filter { counted($0, toSide) }
        func moneyFor(_ b: JSON) -> Double {
            if let split = dig(b, "state.split") as? [Any] {
                return split.compactMap(obj).filter { $0["for"] as? String == fh }.reduce(0) { $0 + (numberOf(dig($1, "money.minor")) ?? .nan) }
            }
            return numberOf(dig(b, "state.money.minor")) ?? .nan
        }
        let paid = pays.reduce(0) { $0 + moneyFor($1) }, back = refunds.reduce(0) { $0 + moneyFor($1) }
        // Each line (or the whole) is covered when counted transfers move at least its quantity of `what` to the `to` side.
        let lines: [JSON] = (terms["lines"] as? [Any])?.compactMap(obj) ?? [["id": NSNull(), "what": ns(dig(offer, "refs.what")), "quantity": ns(chosen), "price": ns(terms["price"])]]
        func moved(_ line: JSON) -> Double {
            let id = line["id"] as? String
            return goods.filter { id == nil || id!.isEmpty ? true : dig($0, "state.line") as? String == id }.reduce(0.0) { sum, b in
                let unit = dig(line, "quantity.unit") as? String
                if let a = amountIn(dig(b, "state.amount"), unit) { return sum + a }
                let packs = list(dig(b, "refs.what")).compactMap { amountIn(dig(byHash[$0], "state.pack"), unit) }
                return sum + (packs.isEmpty ? .infinity : packs.reduce(0, +))
            }
        }
        struct LineState { let id: Any; let needed: Double?; let moved: Double; let total: JSON? }
        let lineState = lines.map { line in
            LineState(id: ns(line["id"]), needed: obj(line["quantity"]).map { decimal($0["value"]) }, moved: moved(line), total: totalOf(line["price"], line["quantity"]))
        }
        let priced = lineState.compactMap { $0.total }
        let total: JSON? = priced.isEmpty ? nil : ["minor": priced.reduce(0.0) { $0 + (numberOf($1["minor"]) ?? .nan) }, "currency": priced[0]["currency"] ?? NSNull()]
        let goodsDone = lines.indices.allSatisfy { i in
            !truthy(lines[i]["what"]) || (lineState[i].needed == nil ? lineState[i].moved > 0 : lineState[i].moved >= lineState[i].needed!)
        }
        let tq = obj(terms["quantity"])
        let workDone = tq != nil && !truthy(dig(offer, "refs.what"))
            ? acceptedWork.reduce(0.0) { sum, b in
                let a = amountIn(dig(b, "state.amount"), tq!["unit"] as? String)
                return sum + ((a == nil || a!.isNaN || a == 0) ? 0 : a!)
            } >= decimal(tq!["value"])
            : !acceptedWork.isEmpty
        let totalMinor = total.flatMap { numberOf($0["minor"]) }
        let done = goodsDone && (totalMinor.map { paid >= $0 } ?? true) && (truthy(dig(offer, "refs.what")) || truthy(terms["lines"]) ? true : workDone)
        let occurrences = sortedJS(unique(stops.flatMap { (dig($0, "state.stop.occurrences") as? [Any] ?? []).compactMap { $0 as? String } }))
        // What is paid carries a currency: the total's, else the first counted payment's.
        let currency = total?["currency"] ?? pays.compactMap { dig($0, "state.money.currency") }.first
        var paidOut: Any = NSNull()
        if total != nil || (paid != 0 && !paid.isNaN) { paidOut = ["minor": paid, "currency": ns(currency)] as JSON }
        var more: JSON = ["quantity": truthy(chosen) ? chosen! : NSNull(), "total": ns(total), "paid": paidOut,
                          "lines": lineState.map { l -> JSON in ["id": l.id, "needed": ns(l.needed), "moved": l.moved.isFinite ? l.moved : ns(l.needed)] },
                          "stopped": occurrences]
        // 10. Reversed: a done promise with counted transfers back for it covering what was paid.
        if done && paid > 0 && back >= paid { return result("reversed", more) }
        // 9. Stopped onward, from that block.
        if let onward = stops.first(where: { dig($0, "state.stop") as? String == "onward" }) {
            more["stop"] = "onward"; more["from"] = hashOf(onward)
            return result("stopped", more)
        }
        if done { return result("done", more) }
        return result(!goods.isEmpty || !pays.isEmpty || !work.isEmpty ? "underway" : "accepted", more)
    }

    // ---- A circle: membership and roles ----
    /// A member, as the spec names it: { roles, grant, last_counted } (last_counted nil for a current member).
    public final class Member {
        public internal(set) var roles: [String]
        public let grant: String?
        public internal(set) var last_counted: String? = nil
        init(roles: [String], grant: String?) { self.roles = roles; self.grant = grant }
        /// { roles, grant, last_counted }.
        public var json: JSON { ["roles": roles, "grant": grant ?? NSNull(), "last_counted": last_counted ?? NSNull()] }
    }
    /// A circle's members and roles: { founder, members: id → Member, removed: id → last counted block (or nil) }.
    public final class CircleState {
        public let founder: String?
        public private(set) var order: [String] = []
        var map: [String: Member] = [:]
        public internal(set) var removed: [String: String?] = [:]
        init(founder: String?) { self.founder = founder }
        public var members: [String: Member] { map }
        /// { founder, members: { id: { roles, grant, last_counted } }, removed: { id: last_counted or null } }, the spec's names.
        public var json: JSON {
            ["founder": founder ?? NSNull(), "members": map.mapValues { $0.json }, "removed": removed.mapValues { $0.map { $0 as Any } ?? NSNull() }]
        }
        /// The member ids, in the order they joined.
        public var memberIds: [String] { order }
        func set(_ who: String, _ m: Member) { if map[who] == nil { order.append(who) }; map[who] = m }
        func delete(_ who: String) { map.removeValue(forKey: who); order.removeAll { $0 == who } }
    }

    /// A circle's members and roles from its member grants, in causal order. A member grant counts if signed as the
    /// circle by someone holding admin in the fold of its own causal past; a member holds its roles once their own
    /// answer accepts it; roles taken away count at once, roles added once answered. Crossing removals of admins: the
    /// admin whose admin grant is earlier in causal order wins (the founder above all); if neither is earlier, both
    /// stand. `within`: fold only that block's causal past.
    public static func circleState(_ circle: String, _ blocks: [JSON], within: JSON? = nil) -> CircleState? {
        let byHash = readAll(blocks)
        guard let root = byHash[circle] else { return nil }
        let id = hashOf(root), founder = refStr(root, "author")
        // Every member grant and answer naming the circle that counts: with seq, or as its author's history.
        let related = byHash.values.filter { $0["type"] as? String == "grant" && dig($0, "state.kind") as? String == "member" && list(dig($0, "refs.subject")).contains(id) && Identity.counts($0, byHash) }
        let needed = intOf(dig(root, "state.removal.needed")).flatMap { $0 == 0 ? nil : $0 } ?? (intOf(dig(FoodBlock.circleRules, "removal_default.needed")) ?? 1)
        var memo: [String: CircleState] = [:]
        struct Target { let update: Bool; let to: String?; let roles: [String]; let grant: String?; let added: [String] }
        func pastFold(_ block: JSON) -> CircleState {
            let past = FoodBlock.pastOf(block, byHash)
            return fold(related.filter { past.contains(hashOf($0)) })
        }
        // Whose admin grant is earlier in causal order (the circle itself, the founder's, above all).
        func earlier(_ a: String?, _ b: String?) -> Bool {
            guard let a = a, let b = b, a != b else { return false }
            return a == id || FoodBlock.sees(byHash[b], byHash[a], byHash)
        }
        func isStop(_ b: JSON) -> Bool { status(b) == "stopped" && !list(dig(b, "refs.updates")).isEmpty && list(dig(b, "refs.answers")).isEmpty }
        // One pass in causal order: each invitation, answer, change and removal applies where it falls, so a member
        // removed and later invited again is in, by the new grant; a grant once ended stays ended.
        func fold(_ set: [JSON]) -> CircleState {
            let key = sortedJS(set.map(hashOf)).joined(separator: ",")
            if let m = memo[key] { return m }
            let state = CircleState(founder: founder)
            if let f = founder { state.set(f, Member(roles: ["admin"], grant: id)) }
            memo[key] = state
            var invitations: [String: Target] = [:], updates: [String: Target] = [:]
            var ended: Set<String> = [], agreed: [String: [String]] = [:], held: [String: String] = [:]
            if let f = founder { held[f] = id }
            func admin(_ b: JSON) -> Bool {
                guard let author = refStr(b, "author"), refStr(b, "as") == id else { return false }
                return (pastFold(b).members[author]?.roles ?? []).contains("admin")
            }
            let stops = set.filter { isStop($0) && admin($0) }
            func remove(_ who: String, _ lastCounted: Any?) { state.removed[who] = .some(lastCounted as? String); state.delete(who) }
            for block in FoodBlock.causalOrder(set) {
                let answered = list(dig(block, "refs.answers")), updated = list(dig(block, "refs.updates"))
                let st = status(block)
                if answered.isEmpty && updated.isEmpty && dig(block, "state.status") == nil {
                    if admin(block) { invitations[hashOf(block)] = Target(update: false, to: refStr(block, "to"), roles: (dig(block, "state.roles") as? [Any])?.compactMap { $0 as? String } ?? [], grant: nil, added: []) }
                } else if !answered.isEmpty {
                    guard let grant = answered.first(where: { invitations[$0] != nil || updates[$0] != nil }), let target = invitations[grant] ?? updates[grant] else { continue }
                    guard let who = refStr(block, "author") else { continue }
                    if let t = target.to, t != who { continue }
                    let current = state.members[who]
                    if st == "accepted" {
                        if target.update {
                            if let member = current, member.grant == target.grant, !ended.contains(target.grant ?? "") { member.roles = unique(member.roles + target.added) }
                        } else if !ended.contains(grant) {
                            state.set(who, Member(roles: target.roles, grant: grant)); held[who] = grant; state.removed.removeValue(forKey: who)
                        }
                    } else if (st == "stopped" || st == "declined") && who != founder, let member = current, member.grant == (target.update ? target.grant : grant) {
                        if let g = member.grant { ended.insert(g) }
                        remove(who, dig(block, "state.last_counted"))
                    }
                } else if !updated.isEmpty && admin(block) {
                    guard let grant = updated.first(where: { invitations[$0] != nil }), !ended.contains(grant) else { continue }
                    let who = state.memberIds.first { state.members[$0]?.grant == grant }
                    if isStop(block) {
                        // An invitation not yet answered simply ends.
                        guard let w = who else { ended.insert(grant); continue }
                        if w == founder { continue }
                        // Removing an admin takes `state.removal.needed` other admins (default 1); a member, one admin.
                        let remover = refStr(block, "author") ?? ""
                        if !(agreed[grant] ?? []).contains(remover) { agreed[grant, default: []].append(remover) }
                        if (state.members[w]?.roles ?? []).contains("admin") && (agreed[grant] ?? []).filter({ $0 != w }).count < needed { continue }
                        // Crossing removals of admins: the one whose admin grant is earlier wins; if neither is, both stand.
                        let rival = stops.first { other in
                            refStr(other, "author") == w && held[remover] != nil && list(dig(other, "refs.updates")).contains(held[remover]!) && !FoodBlock.sees(other, block, byHash) && !FoodBlock.sees(block, other, byHash)
                        }
                        if rival != nil && remover != founder && earlier(held[w], held[remover]) { continue }
                        ended.insert(grant)
                        remove(w, dig(block, "state.last_counted"))
                    } else if let after = (dig(block, "state.roles") as? [Any])?.compactMap({ $0 as? String }), let w = who, let member = state.members[w] {
                        let before = member.roles
                        member.roles = before.filter(after.contains)
                        updates[hashOf(block)] = Target(update: true, to: w, roles: [], grant: grant, added: after.filter { !before.contains($0) })
                    }
                }
            }
            return state
        }
        if let w = within { return pastFold(byHash[hashOf(w)] ?? w) }
        return fold(related)
    }

    /// The holders of a role in a circle (the members holding it), sorted.
    public static func holdersOf(_ state: CircleState?, _ role: String) -> [String] {
        sortedJS((state?.members ?? [:]).filter { $0.value.roles.contains(role) }.map { $0.key })
    }

    /// Whether a block may be signed as a circle: its author holds, in the fold of its causal past, `role` if one is
    /// named, else a role the circle actor lists in `state.signers` (default protocol.json's).
    public static func mayActAs(_ block: JSON, _ circle: String, _ blocks: [JSON], role: String? = nil) -> Bool {
        let state = circleState(circle, blocks, within: block)
        let root = Index(blocks)[circle].map(FoodBlock.readAs)
        guard let author = refStr(block, "author"), let member = state?.members[author] else { return false }
        let roles = role.map { [$0] } ?? ((dig(root, "state.signers") as? [Any])?.compactMap { $0 as? String } ?? (FoodBlock.circleRules["signers_default"] as! [String]))
        return member.roles.contains(where: roles.contains)
    }

    // ---- Audience: members then ----
    /// Who a circle (or `circle#role`) in a block's audience means: the members (or holders) in the fold of the circle's
    /// grants within that block's causal past.
    public static func membersThen(_ block: JSON, _ recipient: String, _ blocks: [JSON]) -> [String] {
        let parts = recipient.split(separator: "#", omittingEmptySubsequences: false).map(String.init)
        let circle = parts[0], role = parts.count > 1 && !parts[1].isEmpty ? parts[1] : nil
        guard Index(blocks).contains(circle), let state = circleState(circle, blocks, within: block) else { return [] }
        return role.map { holdersOf(state, $0) } ?? sortedJS(state.memberIds)
    }

    // ---- Things: who owns an instance, and where it is now ----
    public struct Ownership {
        public let owner: String?
        public let transfers: [String]
        /// Two counted transfers that do not see each other: proof of a lie.
        public let conflict: [String]?
    }
    /// Who owns an instance: the `to_owner` of its last counted ownership transfer, else its maker. A transfer of
    /// ownership counts only if signed by the owner the previous counted transfer named (or the maker, for the first),
    /// with that transfer in its causal past. A part (state.amount) leaves ownership where it is.
    public static func ownership(_ instance: JSON, _ blocks: [JSON]) -> Ownership {
        let byHash = readAll([instance] + Index(blocks).values)
        let thing = byHash[hashOf(instance)]!, th = hashOf(thing)
        var owner = refStr(thing, "author")
        var last: JSON? = nil
        // A transfer to a named receiver moves ownership once the receiver answers it accepted; to an open receiver
        // (a count), on the owner's own signature, to nobody named.
        func accepted(_ t: JSON) -> Bool {
            byHash.values.contains { b in
                b["type"] as? String == "transfer" && status(b) == "accepted" && Identity.counts(b, byHash) && list(dig(b, "refs.answers")).contains(hashOf(t)) && list(dig(t, "refs.to_owner")).contains(refStr(b, "author") ?? "\u{0}")
            }
        }
        var transfers: [String] = []
        let candidates = byHash.values.filter { b in
            b["type"] as? String == "transfer" && Identity.counts(b, byHash) && dig(b, "state.status") == nil && list(dig(b, "refs.what")).contains(th) && dig(b, "state.amount") == nil
                && (truthy(dig(b, "refs.to_owner")) ? accepted(b) : dig(b, "state.count") != nil)
        }
        while true {
            let next = Identity.earliest(candidates.filter { b in
                !transfers.contains(hashOf(b)) && (same(refStr(b, "author"), owner) || same(refStr(b, "as"), owner)) && (last == nil || FoodBlock.sees(b, last, byHash))
            }, byHash)
            if next.count > 1 { return Ownership(owner: owner, transfers: transfers, conflict: sortedJS(next.map(hashOf))) }
            guard let n = next.first else { return Ownership(owner: owner, transfers: transfers, conflict: nil) }
            last = n; transfers.append(hashOf(n)); owner = list(dig(n, "refs.to_owner")).first
            if owner == nil { return Ownership(owner: nil, transfers: transfers, conflict: nil) }
        }
    }
    public static func ownerOf(_ instance: JSON, _ blocks: [JSON]) -> String? { ownership(instance, blocks).owner }

    /// Who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to itself.
    public static func receiverOf(_ promise: JSON, _ blocks: [JSON]) -> String? {
        let byHash = Index(blocks), to = refStr(promise, "to")
        if let thing = byHash[to], thing["type"] as? String == "thing" { return ownerOf(thing, blocks) }
        return to
    }

    /// Where a thing is now: the `to_place` of its latest counted move (by its owner, or a holder its owner named), else
    /// its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves that do not
    /// see each other give both places. A sorted list of hashes.
    public static func whereNow(_ thing: JSON, _ blocks: [JSON]) -> [String] {
        var seen = Set<String>()
        return whereNow(thing, Index(blocks), &seen)
    }
    static func whereNow(_ thing: JSON, _ byHash: Index, _ seen: inout Set<String>) -> [String] {
        let me = FoodBlock.readAs(byHash[hashOf(thing)] ?? thing), mh = hashOf(me)
        if seen.contains(mh) { return [mh] }
        seen.insert(mh)
        let owner = ownerOf(me, byHash.values)
        let read = readAll(byHash.values)
        let all = read.values.filter { $0["type"] as? String == "transfer" && dig($0, "state.status") == nil && list(dig($0, "refs.what")).contains(mh) && Identity.counts($0, read) }
        var holders = Set<String>(owner.map { [$0] } ?? [])
        for b in all where same(refStr(b, "author"), owner) { holders.formUnion(list(dig(b, "refs.to_holder"))) }
        let moves = all.filter { truthy(dig($0, "refs.to_place")) && holders.contains(refStr($0, "author") ?? "\u{0}") }
        let places = !moves.isEmpty ? unique(FoodBlock.headsAmong(moves).flatMap { list(dig($0, "refs.to_place")) }) : list(dig(me, "refs.place"))
        if places.isEmpty { return [] }
        var out: [String] = []
        for place in places {
            guard let at = byHash[place], FoodBlock.readAs(at)["type"] as? String == "thing" else { out.append(place); continue }
            let further = whereNow(at, byHash, &seen)
            out += further.isEmpty ? [place] : further
        }
        return sortedJS(unique(out))
    }

    // ---- A successor's trigger (§7) ----
    /// Where a successor grant's trigger stands: the needed witnesses' event observes (each a witness's observe naming
    /// the grant in refs.under), less those the person (a live key, or the recovery key) defeats before it fires. It fires
    /// `wait` after the needed-th event arrived on this node (`arrivedAt`), on the reader's own clock (`now`).
    /// Returns { events, cancelled, since, fires, fired }.
    public static func successorState(_ grant: JSON, _ blocks: [JSON], now: String? = nil, arrivedAt: Identity.Arrival? = nil) -> JSON {
        let byHash = Index(blocks), person = refStr(grant, "author"), gh = hashOf(grant)
        let witnesses = list(dig(grant, "state.witnesses"))
        let needed = intOf(dig(grant, "state.needed"))
        let events = byHash.values.filter { $0["type"] as? String == "observe" && refStr($0, "under") == gh && witnesses.contains(refStr($0, "author") ?? "\u{0}") && Identity.counts($0, byHash) }
        func arrived(_ b: JSON) -> String? { arrivedAt?(hashOf(b)) }
        let defeats = byHash.values.filter { same(refStr($0, "author"), person) && !list(dig($0, "refs.defeats")).isEmpty && Identity.signedByAuthor($0, byHash, arrivedAt: nil) }
        // A defeat cancels an event only if it arrived before the trigger fires; cancelling moves the trigger, so read until it settles.
        func read(_ until: String?) -> (cancelled: [String], standing: [JSON], since: String?, fires: String?) {
            var cancelled: [String] = [], standing: [JSON] = []
            var since: String? = nil, fires: String? = nil
            for event in stableSorted(events, by: { jsLess(arrived($0) ?? "null", arrived($1) ?? "null") }) {
                if defeats.contains(where: { d in list(dig(d, "refs.defeats")).contains(hashOf(event)) && (until == nil || arrived(d) == nil || jsLess(arrived(d)!, until!)) }) {
                    cancelled.append(hashOf(event)); continue
                }
                if !standing.contains(where: { refStr($0, "author") == refStr(event, "author") }) { standing.append(event) }
                if standing.count == needed && since == nil { since = arrived(event); fires = since.flatMap { Grant.addDuration($0, dig(grant, "state.wait")) } }
            }
            return (cancelled, standing, since, fires)
        }
        var state = read(nil)
        for _ in 0...events.count {
            let next = read(state.fires)
            if next.fires == state.fires { state = next; break }
            state = next
        }
        let fired = state.fires != nil && now != nil && !jsLess(now!, state.fires!)
        return ["events": sortedJS(state.standing.map(hashOf)), "cancelled": sortedJS(state.cancelled), "since": ns(state.since), "fires": ns(state.fires), "fired": fired]
    }

    // ---- A circle's key, by epoch (§8) ----
    /// A circle's encryption key now: the key grants signed as the circle by an admin, each with state.epoch one
    /// higher. Two rekeys in one epoch both open; the next settles. Returns { epoch, keys, grants } (epoch 0 is the key
    /// in the circle's actor).
    public static func circleKey(_ circle: String, _ blocks: [JSON]) -> JSON {
        let byHash = readAll(blocks)
        guard let root = byHash[circle] else { return ["epoch": 0, "keys": [String](), "grants": [String]()] }
        let rh = hashOf(root)
        let rekeys = byHash.values.filter { b in
            b["type"] as? String == "grant" && dig(b, "state.kind") as? String == "key" && refStr(b, "as") == rh && isInteger(dig(b, "state.epoch")) && truthy(dig(b, "state.public_key_encrypt")) && Identity.counts(b, byHash)
        }.filter { mayActAs($0, rh, byHash.values, role: "admin") }
        var epoch = 0
        var open: [(hash: String, key: String)] = [(rh, dig(root, "state.public_key_encrypt") as? String ?? "")]
        var next = 1
        while true {
            // Epoch n names epoch n-1 in after (epoch 0 is the circle itself).
            let these = rekeys.filter { b in intOf(dig(b, "state.epoch")) == next && open.contains { list(dig(b, "refs.after")).contains($0.hash) } }
            if these.isEmpty { break }
            epoch = next
            open = these.map { (hashOf($0), dig($0, "state.public_key_encrypt") as? String ?? "") }
            next += 1
        }
        return ["epoch": epoch, "keys": sortedJS(open.map { $0.key }), "grants": sortedJS(open.map { $0.hash })]
    }

    // ---- A secret ballot (§8) ----
    /// Whether a voter's commitment is among those the named counter signed as counted (`state.counted`).
    public static func countedIn(_ result: JSON?, _ commitment: String, _ counter: String) -> Bool {
        refStr(result, "author") == counter && list(dig(result, "state.counted")).contains(commitment)
    }

    /// A record's sequencer: the key its first block's state.sequencer names, else its author (the key that signed it).
    public static func sequencerOf(_ record: JSON) -> JSON {
        if let key = dig(record, "state.sequencer") as? String { return ["key": key] }
        return ["author": ns(refStr(record, "author"))]
    }
}

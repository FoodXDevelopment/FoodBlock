import Foundation

/// One key's chain checked: `gaps` the missing seq numbers, `equivocations` the sets of hashes sharing a seq,
/// `broken` the blocks whose prev is not the block before them.
public struct ChainCheck {
    public let head: JSON?
    public let length: Int
    public let gaps: [Int]
    public let equivocations: [[String]]
    public let broken: [String]
    public var ok: Bool { gaps.isEmpty && equivocations.isEmpty && broken.isEmpty }
}

// A key's own chain (spec/protocol.md §1). Every block but a genesis sits in its signing key's chain: `state.seq` its
// number, `refs.prev` the key's previous block. A key's first block has seq 1 and its prev is the block that brought
// the key in (the genesis, or the key grant). Gaps show what is missing; two blocks with one seq prove a lie.
extension FoodBlock {
    /// Where the next block for a key goes. `last` is the key's latest block; with none, the key's first block follows
    /// `broughtIn` (the hash of the genesis or key grant that brought the key in).
    public static func nextLink(_ last: JSON?, _ broughtIn: String?) throws -> Link {
        if let last = last {
            guard let seq = intOf(dig(last, "state.seq")), let h = last["hash"] as? String else {
                throw FoodBlockError.invalid("chain: the last block has no seq; a key whose blocks have no seq starts again from the block that brought it in")
            }
            return Link(seq: seq + 1, prev: h)
        }
        guard let b = broughtIn, !b.isEmpty else { throw FoodBlockError.invalid("chain: a key's first block follows the block that brought the key in") }
        return Link(seq: 1, prev: b)
    }

    /// Check one key's chain: blocks it signed (each with state.seq and refs.prev), in any order, and the block that brought it in.
    public static func checkChain(_ blocks: [JSON], _ broughtIn: String?) -> ChainCheck {
        var bySeq: [Int: [String]] = [:]
        for block in blocks {
            guard let seq = intOf(dig(block, "state.seq")), seq >= 1, let h = block["hash"] as? String else { continue }
            bySeq[seq] = unique((bySeq[seq] ?? []) + [h])
        }
        let byHash = Index(blocks)
        let length = bySeq.keys.max() ?? 0
        var gaps: [Int] = [], equivocations: [[String]] = [], broken: [String] = []
        if length > 0 {
            for seq in 1...length {
                guard let here = bySeq[seq] else { gaps.append(seq); continue }
                if here.count > 1 { equivocations.append(sortedJS(here)) }
                let before: [String?]? = seq == 1 ? [broughtIn] : bySeq[seq - 1]
                if let before = before, before.count == 1 {
                    for h in here where dig(byHash[h], "refs.prev") as? String != before[0] { broken.append(h) }
                }
            }
        }
        let top = bySeq[length]
        return ChainCheck(head: top?.count == 1 ? byHash[top![0]] : nil, length: length, gaps: gaps, equivocations: equivocations, broken: broken)
    }

    // ---- Causal order (spec/protocol.md §1, §11) ----
    // A block's causal past is every block reachable from it through its refs. Blocks with no causal link are listed by
    // lowest hash only so every reader lists them the same way; no rule of authority reads that order.

    /// The hashes a block names, through every ref.
    public static func causesOf(_ block: JSON?) -> [String] {
        guard let refs = obj(block?["refs"]) else { return [] }
        return unique(refs.keys.sorted(by: jsLess).flatMap { list(refs[$0]) }.filter { test("hash", $0) })
    }

    /// Every held block in a block's causal past (hashes; the block itself is not in it).
    public static func pastOf(_ block: JSON?, _ blocks: [JSON]) -> Set<String> { pastOf(block, Index(blocks)) }
    static func pastOf(_ block: JSON?, _ byHash: Index) -> Set<String> {
        var past = Set<String>(), todo = causesOf(block)
        while let h = todo.popLast() {
            if past.contains(h) { continue }
            past.insert(h)
            if let b = byHash[h] { todo += causesOf(b) }
        }
        return past
    }

    /// Whether `later` has `earlier` in its causal past.
    public static func sees(_ later: JSON?, _ earlier: JSON?, _ blocks: [JSON]) -> Bool { sees(later, earlier, Index(blocks)) }
    static func sees(_ later: JSON?, _ earlier: JSON?, _ byHash: Index) -> Bool {
        guard let later = later, let h = earlier?["hash"] as? String else { return false }
        return pastOf(later, byHash).contains(h)
    }

    /// The blocks no other block among them has in its causal past.
    public static func headsAmong(_ blocks: [JSON]) -> [JSON] {
        let byHash = Index(blocks)
        var named = Set<String>()
        for b in blocks { named.formUnion(pastOf(b, byHash)) }
        return blocks.filter { !named.contains($0["hash"] as? String ?? "") }
    }

    /// Causes first; each step places, of the blocks whose held causes are all placed, the one with the lowest hash.
    public static func causalOrder(_ blocks: [JSON]) -> [JSON] {
        let byHash = Index(blocks)
        var waits: [String: Int] = [:], next: [String: [String]] = [:]
        for h in byHash.keys {
            let causes = causesOf(byHash[h]).filter { $0 != h && byHash.contains($0) }
            waits[h] = causes.count
            for c in causes { next[c, default: []].append(h) }
        }
        var ready = sortedJS(byHash.keys.filter { waits[$0] == 0 })
        var placed: [JSON] = []
        while placed.count < byHash.count {
            // A cycle (only made-up data can have one) is broken at its lowest hash.
            let h = !ready.isEmpty ? ready.removeFirst() : sortedJS(waits.filter { $0.value > 0 }.map { $0.key })[0]
            waits[h] = -1
            placed.append(byHash[h]!)
            for after in next[h] ?? [] where (waits[after] ?? 0) > 0 {
                waits[after]! -= 1
                if waits[after] == 0 {
                    let at = ready.firstIndex { jsLess(after, $0) } ?? ready.count
                    ready.insert(after, at: at)
                }
            }
        }
        return placed
    }
}

import Foundation

/// The folds (spec/protocol.md §11): thin calls into the Rust core.
public enum Fold {
    /// A promise's stage, from its first promise and every block in its deal: a function of the blocks alone. No clock.
    public static func promiseStage(_ firstBlock: JSON, _ blocks: [JSON]) throws -> JSON {
        try Door.promiseStage(firstBlock, blocks, [:])
    }
    /// The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds.
    public static func promiseView(_ firstBlock: JSON, _ blocks: [JSON], now: String? = nil) throws -> JSON {
        try Door.promiseView(firstBlock, blocks, now.map { ["now": $0] } ?? [:])
    }
    /// The views of many deals of one store at once, read against one reading of it: { hash: view }. Each first promise is among `blocks`.
    public static func promiseViews(_ firsts: [String], _ blocks: [JSON], now: String? = nil) throws -> JSON {
        try Door.promiseViews(firsts, blocks, now.map { ["now": $0] } ?? [:])
    }
    /// The occurrences of a standing promise's calendar repeat from `from` up to, not including, `to`: UTC start times.
    public static func repeatOccurrences(_ promise: JSON, _ from: String, _ to: String) throws -> [String] { try Door.repeatOccurrences(promise, from, to) }

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
    public static func circleState(_ circle: String, _ blocks: [JSON], within: JSON? = nil) throws -> CircleState? {
        (try Door.circleState(circle, blocks, within)).map(CircleState.init)
    }
    /// The one party a fold counts a block for (authority.md, Who a block speaks for): its id, or nil when it speaks for no one. The block need not be among `blocks` yet; no clock is read.
    public static func speaksFor(_ block: JSON, _ blocks: [JSON]) throws -> String? { try Door.speaksFor(block, blocks) }
    public static func membersThen(_ block: JSON, _ recipient: String, _ blocks: [JSON]) throws -> [String] { (try Door.membersThen(block, recipient, blocks) as? [String]) ?? [] }

    public struct Ownership {
        public let owner: String?
        public let transfers: [String]
        /// Two counted transfers that do not see each other: proof of a lie.
        public let conflict: [String]?
    }
    public static func ownership(_ instance: JSON, _ blocks: [JSON]) throws -> Ownership {
        let o = try Door.ownership(instance, blocks)
        return Ownership(owner: o["owner"] as? String, transfers: o["transfers"] as? [String] ?? [], conflict: o["conflict"] as? [String])
    }
    public static func ownerOf(_ instance: JSON, _ blocks: [JSON]) throws -> String? { try Door.ownerOf(instance, blocks) as? String }
    public static func whereNow(_ thing: JSON, _ blocks: [JSON]) throws -> [String] { (try Door.whereNow(thing, blocks) as? [String]) ?? [] }
    public static func receiverOf(_ promise: JSON, _ blocks: [JSON]) throws -> String? { try Door.receiverOf(promise, blocks) as? String }
    /// The consent fold: a person's live word about a sender (or none): { word, block }. `block` is the sender's block (or nil).
    public static func consent(_ person: String, _ sender: String?, _ blocks: [JSON], block: JSON?) throws -> JSON { try Door.consent(person, sender, blocks, block) }
    /// Views, each saying whose clock or arrivals it reads.
    public static func due(_ promise: JSON, arrivedAt: Identity.Arrival? = nil, held: [JSON] = []) throws -> Any? { try Door.due(promise, Identity.log(arrivedAt, held + [promise])) }
    public static func circleKey(_ circle: String, _ blocks: [JSON]) throws -> JSON { (try Door.circleKey(circle, blocks) as? JSON) ?? [:] }
    public static func countedIn(_ result: JSON?, _ commitment: String, _ counter: String) throws -> Bool { try Door.countedIn(result ?? [:], commitment, counter) }
    // ---- 1.9 readings: thin calls, each returns what the core's door gives ----
    /// An amount moved in `person`'s name that they do not back (promises.md, What is to come back): { to_come: [{ block, amount, to, why }] }.
    public static func toComeBack(_ person: String, _ blocks: [JSON]) throws -> JSON { try Door.toComeBack(person, blocks) }
    /// Is `block` backed by `person`? { backed, why, chain }.
    public static func backed(_ block: JSON, _ person: String, _ blocks: [JSON]) throws -> JSON { try Door.backed(block, person, blocks) }
    /// `backed` for a whole set at once: { hash: { backed, why } }.
    public static func backedAll(_ person: String, _ blocks: [JSON]) throws -> JSON { try Door.backedAll(person, blocks) }
    /// What of `person`'s would become whose if `block` stands: { gives, bench }.
    public static func gives(_ block: JSON, _ person: String, _ blocks: [JSON]) throws -> JSON { try Door.gives(block, person, blocks) }
    public static func listingCheck(_ lookup: JSON, _ listing: JSON, _ blocks: [JSON]) throws -> JSON { try Door.listingCheck(lookup, listing, blocks) }
    public static func checkReads(_ check: JSON, _ blocks: [JSON]) throws -> JSON { try Door.checkReads(check, blocks) }
    public static func clearingApplied(_ clearing: JSON, _ blocks: [JSON]) throws -> JSON { try Door.clearingApplied(clearing, blocks) }
    /// Whether a judge's ruling releases a stake that names it. No reader's clock.
    public static func rulingReleases(_ stake: JSON, _ blocks: [JSON], now: String? = nil) throws -> JSON { try Door.rulingReleases(stake, blocks, now) }
    public static func feeBack(_ offer: JSON, _ deal: JSON, _ blocks: [JSON]) throws -> JSON { try Door.feeBack(offer, deal, blocks) }
    public static func countOf(_ needed: Any?, _ members: Int) throws -> Int? { intOf(try Door.countOf(needed, members)) }
    public static func ownershipView(_ instance: JSON, _ blocks: [JSON], now: String? = nil) throws -> JSON { try Door.ownershipView(instance, blocks, now) }
    public static func madeFrom(_ instance: JSON, _ blocks: [JSON]) throws -> Any? { try Door.madeFrom(instance, blocks) }
    public static func sharesOn(_ thing: JSON, _ blocks: [JSON]) throws -> Any? { try Door.sharesOn(thing, blocks) }
    public static func pot(_ head: JSON, _ blocks: [JSON]) throws -> Any? { try Door.pot(head, blocks) }
    /// Where `who` says money to them goes: { who, destinations, hash, at }, or nil.
    public static func accountOf(_ who: String, _ blocks: [JSON]) throws -> Any? { try Door.accountOf(who, blocks) }
    public static func releaseShown(_ subject: JSON, _ blocks: [JSON]) throws -> Any? { try Door.releaseShown(subject, blocks) }
    public static func useShown(_ place: JSON, _ blocks: [JSON], keepers: Any? = nil) throws -> Any? { try Door.useShown(place, blocks, keepers) }
    public static func notFreeShown(_ block: JSON, _ blocks: [JSON]) throws -> Any? { try Door.notFreeShown(block, blocks) }
    public static func invasionShown(_ claim: JSON, _ blocks: [JSON]) throws -> Any? { try Door.invasionShown(claim, blocks) }
    public static func circleVersions(_ circle: String, _ blocks: [JSON]) throws -> JSON? { try Door.circleVersions(circle, blocks) }
    /// Whether a row of the circle a block is `as` holds for it (circles.md): the fewest hands each row needs.
    public static func rowHolds(_ block: JSON, _ blocks: [JSON]) throws -> JSON { try Door.rowHolds(block, blocks) }
    public static func waysIn(_ circle: String, _ blocks: [JSON]) throws -> JSON { try Door.waysIn(circle, blocks) }
    /// The read-back of a block to the person `to`: { answer, text, state }; a renderer's words for an answer; a second reader's redo.
    public static func readback(_ block: Any?, _ held: [JSON], to: String? = nil, renderer: String? = nil, digits: Any? = nil) throws -> JSON { try Door.readback(block, held, to, renderer, digits) }
    public static func render(_ answer: JSON, _ renderer: String) throws -> String { try Door.render(answer, renderer) }
    public static func readbackRedo(_ rb: JSON, _ held: [JSON]) throws -> JSON { try Door.readbackRedo(rb, held) }

}

/// Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core.
public enum Strangers {
    /// Whether `receiver` is a stranger to `sender` among `blocks` (consent.md): true unless her accept, her counter-offer, a deal she opened naming him or her own live yes makes him no stranger.
    /// `block` is the sender's own block (or nil): it names whom the sender speaks for.
    public static func isStranger(_ receiver: String, _ sender: String, _ blocks: [JSON], block: JSON? = nil) throws -> Bool { try Door.isStranger(receiver, sender, blocks, block) }
    /// A model's reading is the person's claim only once the person's own block confirms it.
    public static func readingIsPersonsClaim(_ reading: JSON, _ person: String, _ blocks: [JSON]) throws -> Bool { try Door.readingIsPersonsClaim(reading, person, blocks) }
    /// Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock.
    public static func readingConditionHolds(_ condition: JSON, _ blocks: [JSON], now: String) throws -> Bool { try Door.readingConditionHolds(condition, blocks, now) }
    /// Whether a condition holds on the blocks held, at the reader's clock (promises.md, Conditions): settled, a deed, a reading or a signal.
    /// It reads three ways: true, false, or nil for a condition of a shape the protocol does not read.
    public static func conditionHolds(_ condition: JSON, _ blocks: [JSON], now: String) throws -> Bool? { try Door.conditionHolds(condition, blocks, now) }
    /// What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. `admission` is the rule's
    /// state or an explicit nil (no rule); `strangersToday` a whole number. Both are stated.
    public static func admissionRefusals(_ block: JSON, receiver: String, _ blocks: [JSON], admission: JSON?, strangersToday: Int) throws -> [FoodBlock.Finding] {
        FoodBlock.findings(try Door.admissionRefusals(block, receiver, blocks, admission, strangersToday))
    }
    /// Residency (profiles/residency.md): a block that stays in regions its node does not hold in.
    public static func residencyRefusals(_ block: JSON, holdsIn: [String]) throws -> [FoodBlock.Finding] { FoodBlock.findings(try Door.residencyRefusals(block, holdsIn)) }
}

package world.foodx.foodblock

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

// Who someone is, what they may do, and where things stand: each one a fold, worked out from blocks alone.
// `arrivals` is this node's own log of when each block arrived ({ hash: at }), where a fold needs it; null if none.
// Given arrivals, `unknownArrival` ("inside" or "outside": how a block with no arrival is read) is required; the core refuses without it.

/** One key an id has held: `by` the block that brought it in, `voice` its place in her list of voices (null for a key under a voice), `under` the voice a key sits under, `suite`, and `ended` the block that ended it (null while it speaks). */
data class KeyEntry(val key: String, val by: String, val voice: Long?, val under: Long?, val suite: String = "std", val ended: String? = null)

object Identity {
    /**
     * A new person, autonomous system, machine or circle: their genesis, signed (in the suite of `keys`), a list of one voice. It needs
     * only `kind`, `at`, `audience` (all required: [PUBLIC] or recipients; nothing is filled in) and the key. `reach` (a duration) comes
     * with `clocks` (her clock, `{ names, needed }`). `encryptionKey` is the public encryption key, or null for a device that only signs.
     */
    fun genesis(
        keys: Keypair, kind: String, at: String, audience: List<String>,
        encryptionKey: String? = null, reach: String? = null, clocks: JsonObject? = null,
        salts: JsonObject? = null, nonce: String? = null,
    ): JsonObject = Door.genesis(keys.toJson(), buildJsonObject {
        put("kind", kind)
        put("at", at)
        audienceJson(audience)?.let { put("audience", it) }
        salts?.let { put("salts", it) }
        nonce?.let { put("nonce", it) }
        encryptionKey?.let { put("encryption_key", it) }
        reach?.let { put("reach", it) }
        clocks?.let { put("clocks", it) }
    }).obj()

    /** A key named by its hash (identity.md, Her voices): its suite's hash of its SPKI hex as UTF-8 text. */
    fun keyHash(publicKey: String, suite: String? = null): String = Door.keyHash(JsonPrimitive(publicKey), text(suite)).string()

    /** Whether a block is a genesis (no block: the question of the thing itself, as the door reads it). */
    fun isGenesis(block: JsonObject? = null): Boolean = Door.isGenesis(block ?: JsonNull).bool()

    /** A genesis is valid when its own key opens it, in its suite. */
    fun genesisOpens(block: JsonObject? = null): Boolean = Door.genesisOpens(block ?: JsonNull).bool()

    /** The identity fold: `{ signed_by_author, voices, clocks, keys, waiting }`. */
    fun identityState(id: String, blocks: List<JsonObject>): JsonObject =
        Door.identityState(JsonPrimitive(id), JsonArray(blocks)).obj()

    /** The keys that speak for an id now: of her standing voices and under them, not ended. Sorted. */
    fun liveKeys(id: String, blocks: List<JsonObject>): List<String> =
        Door.liveKeys(JsonPrimitive(id), JsonArray(blocks)).strings()

    /** Every key a list or a key grant of hers brought in, in order. */
    fun keyTimeline(id: String, blocks: List<JsonObject>): List<KeyEntry> =
        Door.keyTimeline(JsonPrimitive(id), JsonArray(blocks)).jsonArray.map {
            val k = it.jsonObject
            fun str(n: String) = (k[n] as? JsonPrimitive)?.takeIf { p -> p.isString }?.content
            fun num(n: String) = (k[n] as? JsonPrimitive)?.takeIf { p -> !p.isString && p !is JsonNull }?.long
            KeyEntry(k["key"]!!.string(), k["by"]!!.string(), num("voice"), num("under"), str("suite") ?: "std", str("ended"))
        }

    /** Whether a key of the block's author spoke for her there (identity.md, invariant 8). A waiting block is true here; [stands] says it waits. */
    fun signedByAuthor(block: JsonObject, blocks: List<JsonObject>): Boolean =
        Door.signedByAuthor(block, JsonArray(blocks)).bool()

    /** Whether a word stands (blocks.md, Finality): `{ stands, waiting: [{ block, on }] }`, read with no clock and no arrival. */
    fun stands(block: JsonObject, blocks: List<JsonObject>): JsonObject = Door.stands(block, JsonArray(blocks)).obj()

    /** Each key's chain for an id: `[{ key, by, head, length, gaps, skips, equivocations, broken, ok }]`. */
    fun chainsOf(id: String, blocks: List<JsonObject>): JsonElement = Door.chainsOf(JsonPrimitive(id), JsonArray(blocks))

    /** Where an id's next block goes for one of its keys. */
    fun nextLinkFor(id: String, publicKey: String, blocks: List<JsonObject>): Link {
        val l = Door.nextLinkFor(JsonPrimitive(id), JsonPrimitive(publicKey), JsonArray(blocks)).jsonObject
        return Link(l["seq"]!!.jsonPrimitive.long, l["prev"]!!.string())
    }

    /** Whether a block counts for its key's chain. */
    fun counts(block: JsonObject, blocks: List<JsonObject>): Boolean = Door.counts(block, JsonArray(blocks)).bool()

    /** Whether a block is one of a pair of one key naming one prev, or a later block of that key. */
    fun forked(block: JsonObject, blocks: List<JsonObject>): Boolean = Door.forked(block, JsonArray(blocks)).bool()
}

object Grant {

    /** The one reading of a grant's `state.scope` (authority.md), with every default the spec states and nothing else filled in. A null scope reads as an empty one. A non-empty `junk` means the grant is held to no word. */
    fun scopeReading(scope: JsonElement? = null): JsonObject = Door.scopeReading(scope ?: JsonNull).obj()

    /** Whether a child scope is within its parent's, and the refusals when it is not. */
    fun scopeWithin(child: JsonElement, parent: JsonElement): Boolean = Door.scopeWithin(child, parent).bool()
    fun scopeRefusals(child: JsonElement, parent: JsonElement): JsonElement = Door.scopeRefusals(child, parent)

    /** Is the machine inside the fence of its grant (authority.md): `{ within, why, alone, alone_until }`. No clock is read: `at` is the time asked about. */
    fun fenceReading(fence: JsonElement?, at: String, readings: JsonObject? = null, heard: String? = null): JsonObject =
        Door.fenceReading(fence ?: JsonNull, JsonPrimitive(at), readings ?: JsonNull, text(heard)).obj()

    /** Why a block does not stand under the grant it names: empty when it does. */
    fun whyNotUnder(block: JsonObject, blocks: List<JsonObject>, now: String? = null): List<String> =
        Door.whyNotUnder(block, JsonArray(blocks), text(now)).strings()

    /** Why a grant is not live (stopped, expired, its parent gone): empty when it is. Check before an act that cannot be undone. */
    fun whyNotLive(grant: JsonObject, blocks: List<JsonObject>, now: String? = null): List<String> =
        Door.whyNotLive(grant, JsonArray(blocks), text(now)).strings()

    fun isLive(grant: JsonObject, blocks: List<JsonObject>, now: String? = null): Boolean =
        Door.isLive(grant, JsonArray(blocks), text(now)).bool()

    fun ancestors(grant: JsonObject, blocks: List<JsonObject>): JsonElement = Door.ancestors(grant, JsonArray(blocks))

    /** Whether a promise C keeps to a promise A (authority.md, Keeps to): `{ keeps, why }`. */
    fun keepsTo(c: JsonObject, a: JsonObject, blocks: List<JsonObject> = emptyList()): JsonObject =
        Door.keepsTo(c, a, JsonArray(blocks)).obj()

    /** The line a grant's blocks are counted on (authority.md, A limit is counted along one line), for one block under it or for the grant's own draws. */
    fun meter(grant: JsonObject, blocks: List<JsonObject>, block: JsonObject? = null): JsonObject =
        Door.meter(grant, JsonArray(blocks), block ?: JsonNull).obj()

    /** The worst case of a grant, from her grant and the promises it names alone: `at_most` and `can_lose` per kind. */
    fun worstCase(grant: JsonObject, blocks: List<JsonObject>): JsonObject = Door.worstCase(grant, JsonArray(blocks)).obj()

    /** Her deadline's lowest offer, read on the meter's line: `{ offer, received, cutoff, why }`. */
    fun lowestOffer(grant: JsonObject, blocks: List<JsonObject>): JsonObject = Door.lowestOffer(grant, JsonArray(blocks)).obj()

    /** What a promise's terms come to for an answer's chosen lines ([{ id, quantity }], else the terms'), or null when it cannot be computed. */
    fun termsTotal(terms: JsonElement? = null, lines: JsonElement? = null): JsonElement = Door.termsTotal(terms ?: JsonNull, lines ?: JsonNull)

    /** A duration read (ISO 8601), or null; a time moved by a duration (sign -1 goes back); two durations compared by adding both to one instant (-1, 0, 1). */
    fun parseDuration(text: String? = null): JsonElement = Door.parseDuration(text(text))
    fun addDuration(time: String, duration: String, sign: Long = 1): JsonElement =
        Door.addDuration(JsonPrimitive(time), JsonPrimitive(duration), JsonPrimitive(sign))
    fun compareDurations(a: String, b: String, from: String): Long = Door.compareDurations(JsonPrimitive(a), JsonPrimitive(b), JsonPrimitive(from)).jsonPrimitive.long
}

/** Who owns an instance, the transfers that moved it, and a conflict (two transfers that do not see each other). */
data class Ownership(val owner: String?, val transfers: List<String>, val conflict: List<String>?)

/** The folds (edge and node profiles). */
/** Large content (modules/encoding.md): the Merkle root of chunks (hex), a chunk's proof, and the reader's check of a block. */
object Merkle {
    /** The root (64 hex) over the chunks (each hex). */
    fun root(chunks: List<String>): String = Door.merkleRoot(texts(chunks)).string()

    /** The sibling hashes (hex) that prove chunk `index`, from the leaf up. */
    fun proof(chunks: List<String>, index: Int): List<String> = Door.merkleProof(texts(chunks), JsonPrimitive(index)).strings()

    /** True when `siblings` show `chunk` (hex) is chunk `index` of the count the block signs (`state.chunks`), under its one merkle mark. */
    fun verify(block: JsonObject, chunk: String, index: Int, siblings: List<String>): Boolean =
        Door.merkleVerify(block, JsonPrimitive(chunk), JsonPrimitive(index), texts(siblings)).bool()
}

object Fold {
    /** A promise's stage from its first promise and the blocks of its deal: `{ stage, offer, accept, sides, ... }`. No clock. */
    fun promiseStage(
        first: JsonObject, blocks: List<JsonObject>,
    ): JsonObject = Door.promiseStage(first, JsonArray(blocks), buildJsonObject {}).obj()

    /** The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds. */
    fun promiseView(
        first: JsonObject, blocks: List<JsonObject>, now: String? = null,
    ): JsonObject = Door.promiseView(first, JsonArray(blocks), buildJsonObject {
        now?.let { put("now", it) }
    }).obj()

    /** The views of many deals of one store at once, read against one reading of it: `{ hash: view }`. Each first promise is among `blocks`. */
    fun promiseViews(firsts: List<String>, blocks: List<JsonObject>, now: String? = null): JsonObject =
        Door.promiseViews(texts(firsts), JsonArray(blocks), buildJsonObject { now?.let { put("now", it) } }).obj()

    /** The occurrences of a standing promise's calendar repeat from `from` up to, not including, `to`: UTC start times. */
    fun repeatOccurrences(promise: JsonObject, from: String, to: String): List<String> =
        Door.repeatOccurrences(promise, JsonPrimitive(from), JsonPrimitive(to)).strings()

    /** The consent fold: a person's live word about a sender (or none): `{ word, block }`. `block` is the sender's block (it names the grant it acts under), or null. */
    fun consent(person: String, sender: String?, blocks: List<JsonObject>, block: JsonObject? = null): JsonObject =
        Door.consent(JsonPrimitive(person), text(sender), JsonArray(blocks), block ?: JsonNull).obj()

    fun due(promise: JsonObject, arrivals: Map<String, String>? = null): JsonElement = Door.due(promise, arrivals(arrivals))

    /** A circle's owners and rows: null when the circle is not among the blocks. `within` folds only its causal past. */
    fun circleState(circle: String, blocks: List<JsonObject>, within: JsonObject? = null): JsonObject? =
        Door.circleState(JsonPrimitive(circle), JsonArray(blocks), within ?: JsonNull) as? JsonObject

    /** A circle's versions and who is on each (circles.md): null for a block that is not a circle's founding block. */
    fun circleVersions(circle: String, blocks: List<JsonObject>): JsonObject? =
        Door.circleVersions(JsonPrimitive(circle), JsonArray(blocks)) as? JsonObject

    /** Whether a row of the circle a block is `as` holds for it (circles.md). */
    fun rowHolds(block: JsonObject, blocks: List<JsonObject>): JsonObject = Door.rowHolds(block, JsonArray(blocks)).obj()
    fun waysIn(circle: String, blocks: List<JsonObject>): JsonObject = Door.waysIn(JsonPrimitive(circle), JsonArray(blocks)).obj()

    /** A circle's current key, from its rekeys. */
    fun circleKey(circle: String, blocks: List<JsonObject>): JsonObject =
        Door.circleKey(JsonPrimitive(circle), JsonArray(blocks)).obj()

    /** Is a machine locked now (authority.md): `{ locked, locks, lifted }`. With no `now`, only a lock that needs no clock stands. */
    fun machineLock(machine: JsonObject, blocks: List<JsonObject>, now: String? = null): JsonObject =
        Door.machineLock(machine, JsonArray(blocks), text(now)).obj()

    /** The one party a fold counts a block for (authority.md, Who a block speaks for): its id, or null when it speaks for no one. The block need not be among `blocks` yet; no clock is read. */
    fun speaksFor(block: JsonObject, blocks: List<JsonObject>): String? =
        Door.speaksFor(block, JsonArray(blocks)).let { if (it is JsonNull) null else it.string() }

    /** Is `block` backed by `person` (authority.md, Backed by a person)? `{ backed, why, chain }`. */
    fun backed(block: JsonObject, person: String, blocks: List<JsonObject>): JsonObject =
        Door.backed(block, JsonPrimitive(person), JsonArray(blocks)).obj()

    /** `backed` for a whole set at once: `{ hash: { backed, why } }`. */
    fun backedAll(person: String, blocks: List<JsonObject>): JsonObject = Door.backedAll(JsonPrimitive(person), JsonArray(blocks)).obj()

    /** An amount moved in `person`'s name that they do not back (promises.md, What is to come back): `{ to_come: [{ block, amount, to, why }] }`. */
    fun toComeBack(person: String, blocks: List<JsonObject>): JsonObject = Door.toComeBack(JsonPrimitive(person), JsonArray(blocks)).obj()

    /** What of `person`'s would become whose if `block` stands (promises.md, What becomes whose): `{ gives: [...], bench }`. */
    fun gives(block: JsonObject, person: String, blocks: List<JsonObject>): JsonObject =
        Door.gives(block, JsonPrimitive(person), JsonArray(blocks)).obj()

    /** A list-keeper's answer against the lookup it answers (promises.md, Finding): `{ ok, why, bad, left_out }`. */
    fun listingCheck(lookup: JsonObject, listing: JsonObject, blocks: List<JsonObject>): JsonObject =
        Door.listingCheck(lookup, listing, JsonArray(blocks)).obj()

    /** A signed check of someone's record against the blocks it names (promises.md, A signed check). */
    fun checkReads(check: JsonObject, blocks: List<JsonObject>): JsonObject = Door.checkReads(check, JsonArray(blocks)).obj()

    /** A circle of IOUs cancelled (promises.md, Clearing). */
    fun clearingApplied(clearing: JsonObject, blocks: List<JsonObject>): JsonObject = Door.clearingApplied(clearing, JsonArray(blocks)).obj()

    /** Whether a judge's ruling releases a stake that names it (promises.md, Rulings): `{ releases, to, amount, ruling, why }`. No reader's clock (promises.md, Conditions). */
    fun rulingReleases(stake: JsonObject, blocks: List<JsonObject>): JsonObject = Door.rulingReleases(stake, JsonArray(blocks)).obj()

    /** What a judge's offer gives back of her fee: `{ settled, releases, to_come, why }`. */
    fun feeBack(offer: JsonObject, deal: JsonObject, blocks: List<JsonObject>): JsonObject = Door.feeBack(offer, deal, JsonArray(blocks)).obj()

    /** A threshold read against a set of `members` voices (folds.md, Counts): the number of voices it asks for, or null when it names no count. */
    fun countOf(needed: JsonElement?, members: List<String>): JsonElement = Door.countOf(needed ?: JsonNull, texts(members))

    /** Who a recipient (a circle or `circle#role`) meant when the block was written. */
    fun membersThen(block: JsonObject, recipient: String, blocks: List<JsonObject>): List<String> =
        Door.membersThen(block, JsonPrimitive(recipient), JsonArray(blocks)).strings()

    fun whereNow(thing: JsonObject, blocks: List<JsonObject>): List<String> =
        Door.whereNow(thing, JsonArray(blocks)).strings()

    /** Who owns an instance, read from the blocks alone (no clock; folds.md). */
    fun ownership(instance: JsonObject, blocks: List<JsonObject>): Ownership {
        val o = Door.ownership(instance, JsonArray(blocks)).jsonObject
        return Ownership(
            (o["owner"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            o["transfers"]!!.strings(),
            (o["conflict"] as? JsonArray)?.strings(),
        )
    }

    /** The same fold read at the reader's clock `now`. */
    fun ownershipView(instance: JsonObject, blocks: List<JsonObject>, now: String? = null): JsonObject =
        Door.ownershipView(instance, JsonArray(blocks), text(now)).obj()

    fun ownerOf(instance: JsonObject, blocks: List<JsonObject>): String? =
        (Door.ownerOf(instance, JsonArray(blocks)) as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** What was made from an instance (folds.md): `[{ thing, from, make, took }]`. */
    fun madeFrom(instance: JsonObject, blocks: List<JsonObject>): JsonElement = Door.madeFrom(instance, JsonArray(blocks))
    fun receiverOf(promise: JsonObject, blocks: List<JsonObject>): JsonElement = Door.receiverOf(promise, JsonArray(blocks))
    fun sharesOn(thing: JsonObject, blocks: List<JsonObject>): JsonElement = Door.sharesOn(thing, JsonArray(blocks))
    fun notFreeShown(block: JsonObject, blocks: List<JsonObject>): JsonElement = Door.notFreeShown(block, JsonArray(blocks))
    fun invasionShown(claim: JsonObject, blocks: List<JsonObject>): JsonElement = Door.invasionShown(claim, JsonArray(blocks))
    fun useShown(place: JsonObject, blocks: List<JsonObject>, keepers: JsonElement? = null): JsonElement = Door.useShown(place, JsonArray(blocks), keepers ?: JsonNull)
    fun releaseShown(subject: JsonObject, blocks: List<JsonObject>): JsonElement = Door.releaseShown(subject, JsonArray(blocks))

    /** A pot read from its head block and the blocks given; no clock (folds.md). */
    fun pot(head: JsonObject, blocks: List<JsonObject>, now: String? = null): JsonElement = Door.pot(head, JsonArray(blocks), text(now))

    /** Where `who` says money to them goes (promises.md, Where to pay me), or null. */
    fun accountOf(who: String, blocks: List<JsonObject>): JsonElement = Door.accountOf(JsonPrimitive(who), JsonArray(blocks))

    fun countedIn(result: JsonObject, commitment: String, counter: String): Boolean =
        Door.countedIn(result, JsonPrimitive(commitment), JsonPrimitive(counter)).bool()

    // ---- The read-back (readings): no protocol op; the door's class `reading` ----

    /** The read-back of a block to the person `to`: `{ answer, text, state }`. */
    fun readback(block: JsonObject, blocks: List<JsonObject>, to: String? = null, renderer: String? = null, digits: Long? = null): JsonObject =
        Door.readback(block, JsonArray(blocks), text(to), text(renderer), digits?.let { JsonPrimitive(it) } ?: JsonNull).obj()

    /** A renderer's words for an answer. */
    fun render(answer: JsonElement, renderer: String): JsonElement = Door.render(answer, JsonPrimitive(renderer))

    /** A second reader's redo of a read-back: `{ same, readback, lacks, not_run }`. */
    fun readbackRedo(rb: JsonObject, blocks: List<JsonObject>): JsonObject = Door.readbackRedo(rb, JsonArray(blocks)).obj()
}

/**
 * What a node remembers when it judges a signed pull or push: this node, the signer's live keys, the highest counter
 * seen from the signer, and the challenges it issued and has not seen used. No clock.
 */
data class Freshness(
    val node: String,
    val keys: List<String>,
    val highest: Long? = null,
    val issued: List<String> = emptyList(),
) {
    internal fun toJson(): JsonElement = buildJsonObject {
        put("node", node)
        put("keys", texts(keys))
        put("highest", highest?.let { JsonPrimitive(it) } ?: JsonNull)
        put("issued", texts(issued))
    }
}

/** Between nodes (edge and node profiles): pull, push, signed answers and discovery. */
object Sync {
    /**
     * What a node takes of a push (nodes.md, Push): `{ taken, unjudged, refused, unread, equivocations, false_headers, ... }`. `incoming` are
     * blocks and sealed header messages. `takesPairs` is the node's own stated choice (true takes both blocks of a forked pair as well as
     * listing them, false takes neither); `copies` its admission rule for copies (`{ signed?, handed_on?, unsigned?, mailboxes? }`); `push`
     * the push's `{ signer?, for? }`. `taken` are the ids the core computed, in the suite of the key that signed each (core.md, section 2).
     * Sealed headers are judged here too: there is no separate op. Validity reads no arrival (core.md, section 8).
     */
    fun accept(
        incoming: List<JsonObject>, blocks: List<JsonObject>, takesPairs: Boolean,
        schemas: List<JsonObject>? = null, copies: JsonObject? = null, push: JsonObject? = null,
    ): JsonObject = Door.accept(JsonArray(incoming), JsonArray(blocks), buildJsonObject {
        put("takes_pairs", takesPairs)
        copies?.let { put("copies", it) }
    }, schemas?.let(::JsonArray) ?: JsonNull, push ?: JsonNull).obj()

    /**
     * A node's answer to a pull, from its arrival log. The node states its own choices: `cap` (1 or more; there is no
     * default) and `servesPairs` (true sends a fork's other half with its proof, false only what matches). Signed by the node.
     */
    fun answerPull(
        log: List<JsonObject>, request: JsonObject, node: String, privateKey: String, cap: Long, servesPairs: Boolean,
        asker: String? = null, blocks: List<JsonObject>? = null, suite: String? = null, through: Long? = null,
    ): JsonObject = Door.answerPull(JsonArray(log), request, JsonPrimitive(node), JsonPrimitive(privateKey),
        buildJsonObject { put("cap", cap); put("serves_pairs", servesPairs) }, text(asker), blocks?.let(::JsonArray) ?: JsonNull, text(suite),
        through?.let { JsonPrimitive(it) } ?: JsonNull,
    ).obj()

    /** A signed pull: the request plus signer, node and exactly one proof against replay (`counter` or `challenge`); no time. */
    fun signPull(
        request: JsonObject, signer: String, node: String, privateKey: String,
        suite: String? = null, counter: Long? = null, challenge: String? = null,
    ): JsonObject = Door.signPull(request, signOptions(signer, node, privateKey, suite, counter, challenge)).obj()

    fun signPush(
        push: JsonObject, signer: String, node: String, privateKey: String,
        suite: String? = null, counter: Long? = null, challenge: String? = null,
    ): JsonObject = Door.signPush(push, signOptions(signer, node, privateKey, suite, counter, challenge)).obj()

    private fun signOptions(signer: String, node: String, privateKey: String, suite: String?, counter: Long?, challenge: String?) =
        buildJsonObject {
            put("who", signer); put("node", node); put("private_key", privateKey)
            suite?.let { put("suite", it) }
            counter?.let { put("counter", it) }
            challenge?.let { put("challenge", it) }
        }

    /** A new challenge value a node hands out at its `challenge` endpoint. */
    fun newChallenge(): String = Door.newChallenge().string()

    /** The refusals of a signed pull (each a code from protocol.json). */
    fun pullRefusals(message: JsonObject, freshness: Freshness): List<Refusal> =
        Door.pullRefusals(message, freshness.toJson()).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    fun pushRefusals(message: JsonObject, freshness: Freshness): List<Refusal> =
        Door.pushRefusals(message, freshness.toJson()).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** What a node's admission and consent rules refuse of a block for a person: not_admitted, not_human. `admission` is the rule's state or an explicit null (no rule); `strangersToday` is the node's own count; neither is filled in. */
    fun admissionRefusals(
        block: JsonObject, receiver: String, blocks: List<JsonObject>, admission: JsonObject?, strangersToday: Long,
    ): List<Refusal> = Door.admissionRefusals(block, JsonPrimitive(receiver), JsonArray(blocks), admission ?: JsonNull, JsonPrimitive(strangersToday))
        .jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** Residency (profiles/residency.md): a block that stays in regions its node does not hold in. */
    fun residencyRefusals(block: JsonObject, holdsIn: List<String>): List<Refusal> =
        Door.residencyRefusals(block, texts(holdsIn)).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** A node's signed answer to a push, from its parts. */
    fun pushAnswer(parts: JsonObject, node: String, privateKey: String, suite: String = "std"): JsonObject =
        Door.pushAnswer(parts, JsonPrimitive(node), JsonPrimitive(privateKey), JsonPrimitive(suite)).obj()

    fun pushRequest(messages: List<JsonObject>, forWhom: JsonObject? = null): JsonObject =
        Door.pushRequest(JsonArray(messages), forWhom ?: JsonNull).obj()

    fun answerSignedBy(answer: JsonObject, nodeKeys: List<String>): Boolean =
        Door.answerSignedBy(answer, texts(nodeKeys)).bool()

    /**
     * A node's discovery document (nodes.md, Discovery): `{ protocol, reads, node, admission, endpoints, log? }`. `reads` lists the rule sets
     * the node runs (core.md, section 11), only where it runs a build made from that set's files. `admission` is the hash of the owner's
     * admission block, or null for no rule: stated either way, never filled in.
     */
    fun wellKnown(node: String, reads: List<String>, admission: String?, endpoints: JsonObject, log: String? = null): JsonObject =
        Door.wellKnown(JsonPrimitive(node), texts(reads), text(admission), endpoints, text(log)).obj()

    /** A push read from its text (nodes.md, Push): `{ refused, messages }`. */
    fun strictPush(text: String): JsonObject = Door.strictPush(JsonPrimitive(text)).obj()

    /** The signed pull's request, as the door shapes it. */
    fun pullRequest(request: JsonObject = JsonObject(emptyMap())): JsonObject = Door.pullRequest(request).obj()

    /** What a door log's signed words show (nodes.md, The arrival log): `{ left_out, stopped_short }`. */
    fun logShown(receipts: List<JsonObject>, request: JsonObject, answer: JsonObject, blocks: List<JsonObject> = emptyList()): JsonObject =
        Door.logShown(JsonArray(receipts), request, answer, JsonArray(blocks)).obj()

    /** Whether her export is whole (nodes.md, A host): `{ whole, lacks }`. `log` names the door log; `last` is the receipt she holds. */
    fun exportWhole(document: JsonObject, log: String, last: String): JsonObject =
        Door.exportWhole(document, JsonPrimitive(log), JsonPrimitive(last)).obj()

    /** Whether a waiting block has waited past the node's own time to live (`ttl` ms since it arrived). */
    fun waitedTooLong(since: String, now: String, ttl: Long): Boolean =
        Door.waitedTooLong(JsonPrimitive(since), JsonPrimitive(now), JsonPrimitive(ttl)).bool()

    /** What is wrong with a `.well-known/foodblock` document: empty when it is right. */
    fun wellKnownErrors(doc: JsonObject): List<String> = Door.wellKnownErrors(doc).strings()

    /** The local announcement a node makes nearby, from its discovery document. */
    fun announcement(doc: JsonObject): JsonObject = Door.announcement(doc).obj()
}

/** Strangers (modules/consent.md) and the small profiles. */
object Strangers {
    /** Whether `receiver` is a stranger to `sender` among `blocks` (consent.md): true unless her accept, her counter-offer, a deal she opened naming him or her own live yes makes him no stranger. `block` is the sender's own block (or null): it names whom the sender speaks for. */
    fun isStranger(receiver: String, sender: String, blocks: List<JsonObject>, block: JsonObject? = null): Boolean =
        Door.isStranger(JsonPrimitive(receiver), JsonPrimitive(sender), JsonArray(blocks), block ?: JsonNull).bool()

    /** A model's reading is the person's claim only once the person's own block confirms it. */
    fun readingIsPersonsClaim(reading: JsonObject, person: String, blocks: List<JsonObject>): Boolean =
        Door.readingIsPersonsClaim(reading, JsonPrimitive(person), JsonArray(blocks)).bool()

    /** Tasks profile: whether a `reading_condition` holds on the readings given, at the reader's clock. */
    fun readingConditionHolds(condition: JsonObject, blocks: List<JsonObject>, now: String): Boolean =
        Door.readingConditionHolds(condition, JsonArray(blocks), JsonPrimitive(now)).bool()

    /** Whether a condition holds on the blocks given, at the reader's clock (promises.md, Conditions): settled, a deed, a reading or a signal.
     *  It reads three ways: true, false, or null for a condition of a shape the protocol does not read. */
    fun conditionHolds(condition: JsonObject, blocks: List<JsonObject>, now: String): Boolean? =
        Door.conditionHolds(condition, JsonArray(blocks), JsonPrimitive(now)).let { if (it is JsonNull) null else it.bool() }

    /** The short reply (profiles/short-form.md, way 1): `FB1 ` and what the receiver cannot rebuild of her signed answer. */
    fun shortReply(answer: JsonObject): JsonElement = Door.shortReply(answer)

    /** The answer rebuilt from a short reply among the blocks given (null: nothing was said). */
    fun shortReplyOpen(text: String, signer: String, blocks: List<JsonObject>): JsonElement =
        Door.shortReplyOpen(JsonPrimitive(text), JsonPrimitive(signer), JsonArray(blocks))
}

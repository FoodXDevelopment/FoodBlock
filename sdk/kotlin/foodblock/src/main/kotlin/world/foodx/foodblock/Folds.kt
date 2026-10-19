package world.foodx.foodblock

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

// Who someone is, what they may do, and where things stand: each one a fold, worked out from blocks alone.
// `arrivals` is this node's own log of when each block arrived ({ hash: at }), where a fold needs it; null if none.

/** One key an id has held. `by` is the block that brought it in; `signer` the key that signed that block; `suite` its suite. */
data class KeyEntry(val key: String, val by: String, val signer: String?, val void: Boolean, val frozen: Boolean, val suite: String = "std")

object Identity {
    /**
     * A new person, agent, machine or circle: their genesis, signed (in the suite of `keys`). It needs only `kind`,
     * `at` and the key; `recoveryKey` (the offline key's public signing key, only its hash is written) and `reach`
     * come as a pair or not at all. `encryptionKey` is the public encryption key, or null for a device that only signs.
     */
    fun genesis(
        keys: Keypair, kind: String, recoveryKey: String? = null, encryptionKey: String? = null,
        at: String? = null, reach: String? = null, recoverySuite: String? = null, custodian: String? = null,
    ): JsonObject = Native.invoke("genesis", keys.toJson(), buildJsonObject {
        put("kind", kind)
        recoveryKey?.let { put("recovery_key", it) }
        encryptionKey?.let { put("encryption_key", it) }
        at?.let { put("at", it) }
        reach?.let { put("reach", it) }
        recoverySuite?.let { put("recovery_suite", it) }
        custodian?.let { put("custodian", it) }
    }).obj()

    /** The recovery key's hash, as a genesis names it, in the identity's suite. */
    fun recoveryKeyHash(publicKey: String, suite: String = "std"): String =
        Native.invoke("recovery_key_hash", JsonPrimitive(publicKey), JsonPrimitive(suite)).string()

    /** The identity fold: `{ signed_by_author, keys, frozen, operators }`. */
    fun identityState(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): JsonObject =
        Native.invoke("identity_state", JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals)).obj()

    /** The voided blocks a recovery rotation's reach protects, read at the reader's arrivals. */
    fun recoveryReach(rotation: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): JsonElement =
        Native.invoke("recovery_reach", rotation, JsonArray(blocks), arrivals(arrivals))

    /** The keys that speak for an id now. */
    fun keysOf(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): List<String> =
        Native.invoke("keys_of", JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals)).strings()

    fun keyTimeline(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): List<KeyEntry> =
        Native.invoke("key_timeline", JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals)).jsonArray.map {
            val k = it.jsonObject
            KeyEntry(
                k["key"]!!.string(), k["by"]!!.string(), (k["signer"] as? JsonPrimitive)?.takeIf { p -> p.isString }?.content,
                k["void"]!!.bool(), k["frozen"]!!.bool(), (k["suite"] as? JsonPrimitive)?.content ?: "std",
            )
        }

    /** Whether a block is signed by a key that spoke for its author when it was signed. */
    fun signedByAuthor(block: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): Boolean =
        Native.invoke("signed_by_author", block, JsonArray(blocks), arrivals(arrivals)).bool()
}

object Grant {
    /** Why an act that cannot be undone is not live: empty when it has a specific accepted ask or a grant that names it with a limit. */
    fun whyNotLiveUndo(block: JsonObject, blocks: List<JsonObject>): List<String> =
        Native.invoke("why_not_live_undo", block, JsonArray(blocks)).strings()

    /** The act a block is, named `type.kind`. */
    fun actName(block: JsonObject): String = Native.invoke("act_name", block).string()

    /** The observe of kind limit for a grant, to hand to `write`: its audience is the agent alone. */
    fun limitFence(grantHash: String, agent: String, limit: JsonObject, per: String? = null): JsonObject =
        Native.invoke("limit_fence", JsonPrimitive(grantHash), JsonPrimitive(agent), limit, text(per)).obj()

    /** Whether spending `money` stays inside a limit; `spent` is what the principal's node has counted in the period (minor units). */
    fun withinLimit(limit: JsonObject, money: JsonObject, spent: Long = 0): Boolean =
        Native.invoke("within_limit", limit, money, JsonPrimitive(spent)).bool()

    /** The people an agent acts for, by the live grants among `blocks`. */
    fun operatorsOf(agent: String, blocks: List<JsonObject>, now: String? = null): List<String> =
        Native.invoke("operators_of", JsonPrimitive(agent), JsonArray(blocks), text(now)).strings()

    /** Why a block does not stand under the grant it names: empty when it does. */
    fun whyNotUnder(block: JsonObject, blocks: List<JsonObject>, now: String? = null): List<String> =
        Native.invoke("why_not_under", block, JsonArray(blocks), text(now)).strings()

    /** Why a grant is not live (stopped, expired, its parent gone): empty when it is. Check before an act that cannot be undone. */
    fun whyNotLive(grant: JsonObject, blocks: List<JsonObject>, now: String? = null): List<String> =
        Native.invoke("why_not_live", grant, JsonArray(blocks), text(now)).strings()
}

/** Who owns an instance, the transfers that moved it, and a conflict (two transfers that do not see each other). */
data class Ownership(val owner: String?, val transfers: List<String>, val conflict: List<String>?)

/** The folds (edge and node profiles). */
object Fold {
    /** A promise's stage from its first promise and the blocks of its deal: `{ stage, offer, accept, sides, ... }`. No clock. */
    fun promiseStage(
        first: JsonObject, blocks: List<JsonObject>, confirmers: List<String> = emptyList(),
    ): JsonObject = Native.invoke("promise_stage", first, JsonArray(blocks), buildJsonObject {
        put("confirmers", texts(confirmers))
    }).obj()

    /** The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds. */
    fun promiseView(
        first: JsonObject, blocks: List<JsonObject>, now: String? = null, confirmers: List<String> = emptyList(),
    ): JsonObject = Native.invoke("promise_view", first, JsonArray(blocks), buildJsonObject {
        now?.let { put("now", it) }
        put("confirmers", texts(confirmers))
    }).obj()

    /** The consent fold: a person's live word about a sender (or none): `{ word, block }`. */
    fun consent(person: String, sender: String?, blocks: List<JsonObject>, under: String? = null): JsonObject =
        Native.invoke("consent", JsonPrimitive(person), text(sender), JsonArray(blocks), text(under)).obj()

    /** Whether an act stands under a live grant at the reader's `now`. */
    fun liveGrant(act: JsonObject, grants: List<JsonObject>, now: String): Boolean =
        Native.invoke("live_grant", act, JsonArray(grants), JsonPrimitive(now)).bool()

    fun withdrawalSeen(
        withdrawal: JsonObject, block: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null,
    ): Boolean = Native.invoke("withdrawal_seen", withdrawal, block, JsonArray(blocks), arrivals(arrivals)).bool()

    fun due(promise: JsonObject, arrivals: Map<String, String>? = null): JsonElement = Native.invoke("due", promise, arrivals(arrivals))

    /** The orderer a record names (`state.orderer`). */
    fun ordererOf(record: JsonObject): JsonElement = Native.invoke("orderer_of", record)

    /** A circle's founder, members and roles, and who was removed: null when the circle is not among the blocks. */
    fun circleState(circle: String, blocks: List<JsonObject>, within: JsonObject? = null): JsonObject? =
        Native.invoke("circle_state", JsonPrimitive(circle), JsonArray(blocks), within ?: JsonNull) as? JsonObject

    fun mayActAs(block: JsonObject, circle: String, blocks: List<JsonObject>, role: String? = null): Boolean =
        Native.invoke("may_act_as", block, JsonPrimitive(circle), JsonArray(blocks), text(role)).bool()

    /** Who a recipient (a circle or `circle#role`) meant when the block was written. */
    fun membersThen(block: JsonObject, recipient: String, blocks: List<JsonObject>): List<String> =
        Native.invoke("members_then", block, JsonPrimitive(recipient), JsonArray(blocks)).strings()

    fun whereNow(thing: JsonObject, blocks: List<JsonObject>): List<String> =
        Native.invoke("where_now", thing, JsonArray(blocks)).strings()

    fun ownership(instance: JsonObject, blocks: List<JsonObject>): Ownership {
        val o = Native.invoke("ownership", instance, JsonArray(blocks)).jsonObject
        return Ownership(
            (o["owner"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
            o["transfers"]!!.strings(),
            (o["conflict"] as? JsonArray)?.strings(),
        )
    }

    fun ownerOf(instance: JsonObject, blocks: List<JsonObject>): String? =
        (Native.invoke("owner_of", instance, JsonArray(blocks)) as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** A successor grant's view (optional profile): `{ events, cancelled, since, fires, fired }`. */
    fun successorView(
        grant: JsonObject, blocks: List<JsonObject>, now: String? = null, arrivals: Map<String, String>? = null,
    ): JsonObject = Native.invoke("successor_view", grant, JsonArray(blocks), text(now), arrivals(arrivals)).obj()

    fun countedIn(result: JsonObject, commitment: String, counter: String): Boolean =
        Native.invoke("counted_in", result, JsonPrimitive(commitment), JsonPrimitive(counter)).bool()

    /** A circle's current key, from its rekeys. */
    fun circleKey(circle: String, blocks: List<JsonObject>): JsonObject =
        Native.invoke("circle_key", JsonPrimitive(circle), JsonArray(blocks)).obj()
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
    /** What a node takes of a push: `{ taken, waiting, refused, equivocations }`. */
    fun accept(
        incoming: List<JsonObject>, held: List<JsonObject>,
        arrivals: Map<String, String>? = null, schemas: List<JsonObject>? = null,
    ): JsonObject = Native.invoke(
        "accept", JsonArray(incoming), JsonArray(held), arrivals(arrivals), schemas?.let(::JsonArray) ?: JsonNull,
    ).obj()

    /** What a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that speaks for it opens its signature; the same key's next seq; no rival) once the block it names in prev is held. `taken` are hashes. */
    fun acceptSealed(incoming: List<JsonObject>, held: List<JsonObject>, arrivals: Map<String, String>? = null): JsonObject =
        Native.invoke("accept_sealed", JsonArray(incoming), JsonArray(held), arrivals(arrivals)).obj()

    /** A signed pull: the request plus signer, node and exactly one proof against replay (`counter` or `challenge`); no time. */
    fun signPull(
        request: JsonObject, signer: String, node: String, privateKey: String,
        suite: String? = null, counter: Long? = null, challenge: String? = null,
    ): JsonObject = Native.invoke("sign_pull", request, signOptions(signer, node, privateKey, suite, counter, challenge)).obj()

    fun signPush(
        push: JsonObject, signer: String, node: String, privateKey: String,
        suite: String? = null, counter: Long? = null, challenge: String? = null,
    ): JsonObject = Native.invoke("sign_push", push, signOptions(signer, node, privateKey, suite, counter, challenge)).obj()

    private fun signOptions(signer: String, node: String, privateKey: String, suite: String?, counter: Long?, challenge: String?) =
        buildJsonObject {
            put("who", signer); put("node", node); put("private_key", privateKey)
            suite?.let { put("suite", it) }
            counter?.let { put("counter", it) }
            challenge?.let { put("challenge", it) }
        }

    /** A new challenge value a node hands out at its `challenge` endpoint. */
    fun newChallenge(): String = Native.invoke("new_challenge").string()

    /** The refusals of a signed pull (each a code from protocol.json). */
    fun pullRefusals(message: JsonObject, freshness: Freshness): List<Refusal> =
        Native.invoke("pull_refusals", message, freshness.toJson()).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    fun pushRefusals(message: JsonObject, freshness: Freshness): List<Refusal> =
        Native.invoke("push_refusals", message, freshness.toJson()).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** What a node's admission and strangers rules refuse of a block for a person: not_admitted, not_human. */
    fun admissionRefusals(
        block: JsonObject, receiver: String, blocks: List<JsonObject>, admission: JsonObject = JsonObject(emptyMap()), strangersToday: Long = 0,
    ): List<Refusal> = Native.invoke("admission_refusals", block, JsonPrimitive(receiver), JsonArray(blocks), admission, JsonPrimitive(strangersToday))
        .jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** Residency (profiles/residency.md): a block that stays in regions its node does not hold in. */
    fun residencyRefusals(block: JsonObject, holdsIn: List<String>): List<Refusal> =
        Native.invoke("residency_refusals", block, texts(holdsIn)).jsonArray.map { Refusal(it.jsonObject["code"]!!.string(), it.jsonObject["detail"]!!.string()) }

    /** A node's signed answer to a push, from its parts. */
    fun pushAnswer(parts: JsonObject, node: String, privateKey: String, suite: String = "std"): JsonObject =
        Native.invoke("push_answer", parts, JsonPrimitive(node), JsonPrimitive(privateKey), JsonPrimitive(suite)).obj()

    fun pushRequest(messages: List<JsonObject>, forWhom: JsonObject? = null): JsonObject =
        Native.invoke("push_request", JsonArray(messages), forWhom ?: JsonNull).obj()

    fun pullErrors(message: JsonObject, freshness: Freshness): List<String> =
        Native.invoke("pull_errors", message, freshness.toJson()).strings()

    fun pushErrors(message: JsonObject, freshness: Freshness): List<String> =
        Native.invoke("push_errors", message, freshness.toJson()).strings()

    fun answerSignedBy(answer: JsonObject, nodeKeys: List<String>): Boolean =
        Native.invoke("answer_signed_by", answer, texts(nodeKeys)).bool()

    /** What is wrong with a `.well-known/foodblock` document: empty when it is right. */
    fun wellKnownErrors(doc: JsonObject): List<String> = Native.invoke("well_known_errors", doc).strings()

    /** The local announcement a node makes nearby, from its discovery document. */
    fun announcement(doc: JsonObject): JsonObject = Native.invoke("announcement", doc).obj()
}

/** Strangers (modules/consent.md) and the small profiles. */
object Strangers {
    /** A model's reading is the person's claim only once the person's own block confirms it. */
    fun readingIsPersonsClaim(reading: JsonObject, person: String, blocks: List<JsonObject>): Boolean =
        Native.invoke("reading_is_persons_claim", reading, JsonPrimitive(person), JsonArray(blocks)).bool()

    /** Tasks profile: whether a `reading_condition` holds on the readings held, at the reader's clock. */
    fun readingConditionHolds(condition: JsonObject, blocks: List<JsonObject>, now: String): Boolean =
        Native.invoke("reading_condition_holds", condition, JsonArray(blocks), JsonPrimitive(now)).bool()

    /** Deposits profile: the shape of an admission's deposit, and whether an ask's deposit is paid. */
    fun depositShapeOk(deposit: JsonElement): Boolean = Native.invoke("deposit_shape_ok", deposit).bool()
    fun depositPaid(ask: JsonObject, deposit: JsonObject, blocks: List<JsonObject>): Boolean =
        Native.invoke("deposit_paid", ask, deposit, JsonArray(blocks)).bool()
}

/** The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node reads an older shape. */
object Legacy {
    /**
     * Convert old blocks into fresh 1.6 blocks, each deriving from the old hash, signed by the key given for each old
     * identity. `keys` maps each old identity to `{ public_key_sign, private_key, suite? }`. Returns `{ blocks, map, skipped }`.
     */
    fun convert(
        oldBlocks: List<JsonObject>, keys: JsonObject, at: String, map: JsonObject = JsonObject(emptyMap()),
        existing: List<JsonObject> = emptyList(), channel: String? = null, requestHash: String? = null,
    ): JsonObject = Native.invoke("convert", JsonArray(oldBlocks), buildJsonObject {
        put("keys", keys); put("at", at); put("map", map); put("existing", JsonArray(existing))
        channel?.let { put("channel", it) }
        requestHash?.let { put("request_hash", it) }
    }).obj()

    /** The id an old block had under the old canonical form. */
    fun oldHash(block: JsonObject): String = Native.invoke("old_hash", block).string()
}

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

/** One key an id has held. `by` is the block that brought it in; `signer` the key that signed that block. */
data class KeyEntry(val key: String, val by: String, val signer: String?, val void: Boolean, val frozen: Boolean)

object Identity {
    /**
     * A new person, agent, machine or circle: their genesis, signed. `recoveryKey` is the offline key's public
     * signing key (only its hash is written); `encryptionKey` the X25519 public key, or "" for a device that only signs.
     */
    fun genesis(
        keys: Keypair, kind: String, recoveryKey: String, encryptionKey: String = "",
        at: String? = null, reach: String = "P30D", custodian: String? = null,
    ): JsonObject = Native.invoke("genesis", keys.toJson(), buildJsonObject {
        put("kind", kind)
        put("recovery_key", recoveryKey)
        put("encryption_key", encryptionKey)
        at?.let { put("at", it) }
        put("reach", reach)
        custodian?.let { put("custodian", it) }
    }).obj()

    /** The keys that speak for an id now. */
    fun keysOf(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): List<String> =
        Native.invoke("keys_of", JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals)).strings()

    fun keyTimeline(id: String, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): List<KeyEntry> =
        Native.invoke("key_timeline", JsonPrimitive(id), JsonArray(blocks), arrivals(arrivals)).jsonArray.map {
            val k = it.jsonObject
            KeyEntry(
                k["key"]!!.string(), k["by"]!!.string(), (k["signer"] as? JsonPrimitive)?.takeIf { p -> p.isString }?.content,
                k["void"]!!.bool(), k["frozen"]!!.bool(),
            )
        }

    /** Whether a block is signed by a key that spoke for its author when it was signed. */
    fun signedByAuthor(block: JsonObject, blocks: List<JsonObject>, arrivals: Map<String, String>? = null): Boolean =
        Native.invoke("signed_by_author", block, JsonArray(blocks), arrivals(arrivals)).bool()
}

object Grant {
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
    /** A promise's stage from its first promise and the blocks of its deal: `{ stage, offer, accept, sides, ... }`. */
    fun promiseStage(
        first: JsonObject, blocks: List<JsonObject>, now: String? = null, confirmers: List<String> = emptyList(),
    ): JsonObject = Native.invoke("promise_stage", first, JsonArray(blocks), buildJsonObject {
        now?.let { put("now", it) }
        put("confirmers", texts(confirmers))
    }).obj()

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

    /** A successor grant's state: `{ events, cancelled, since, fires, fired }`. */
    fun successorState(
        grant: JsonObject, blocks: List<JsonObject>, now: String? = null, arrivals: Map<String, String>? = null,
    ): JsonObject = Native.invoke("successor_state", grant, JsonArray(blocks), text(now), arrivals(arrivals)).obj()

    fun countedIn(result: JsonObject, commitment: String, counter: String): Boolean =
        Native.invoke("counted_in", result, JsonPrimitive(commitment), JsonPrimitive(counter)).bool()

    /** A circle's current key, from its rekeys. */
    fun circleKey(circle: String, blocks: List<JsonObject>): JsonObject =
        Native.invoke("circle_key", JsonPrimitive(circle), JsonArray(blocks)).obj()
}

/** How a node judges a signed pull or push: this node, its clock, the signer's keys, the nonces it has seen. */
data class Freshness(
    val node: String,
    val now: String,
    val keys: List<String>,
    val seen: Set<String> = emptySet(),
    val windowMs: Long = 5 * 60 * 1000,
) {
    internal fun toJson(): JsonElement = buildJsonObject {
        put("node", node)
        put("now", now)
        put("keys", texts(keys))
        put("seen", texts(seen.toList()))
        put("window_ms", windowMs)
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

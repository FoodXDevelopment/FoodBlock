package world.foodx.foodblock.window

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** One block waiting for the host (or refused by it, with the reason). */
data class QueueItem(val hash: String, val block: JsonObject, val failed: String?)

/**
 * The phone's own small store: the signed blocks waiting to reach the host, in the order they were written, and the last blocks the host showed (so the
 * window still reads offline). A block is kept exactly as signed. A refused block stays, with the host's reason, never silently dropped.
 * [JdbcWindowStore] is SQLite over JDBC (the JVM); `AndroidWindowStore` (the android module) is the same tables over android.database.sqlite.
 */
interface WindowStore {
    fun enqueue(block: JsonObject)
    fun items(): List<QueueItem>
    fun taken(hash: String)
    fun fail(hash: String, reason: String)
    fun put(key: String, value: String)
    fun get(key: String): String?
    fun pending(): List<QueueItem> = items().filter { it.failed == null }
}

object Schema {
    const val QUEUE = "CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT UNIQUE NOT NULL, block TEXT NOT NULL, failed TEXT)"
    const val KV = "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)"
    fun parse(text: String): JsonObject = Json.parseToJsonElement(text) as JsonObject
}

/** SQLite through JDBC (`org.xerial:sqlite-jdbc` on the classpath). [path] is a file, or ":memory:". */
class JdbcWindowStore(path: String = ":memory:") : WindowStore, AutoCloseable {
    private val db = java.sql.DriverManager.getConnection("jdbc:sqlite:$path").also { c -> c.createStatement().use { it.execute(Schema.QUEUE); it.execute(Schema.KV) } }
    @Synchronized override fun enqueue(block: JsonObject) {
        db.prepareStatement("INSERT OR IGNORE INTO queue (hash, block) VALUES (?, ?)").use { it.setString(1, (block["hash"] as kotlinx.serialization.json.JsonPrimitive).content); it.setString(2, block.toString()); it.executeUpdate() }
    }
    @Synchronized override fun items(): List<QueueItem> = db.createStatement().use { s ->
        s.executeQuery("SELECT hash, block, failed FROM queue ORDER BY id").use { r -> buildList { while (r.next()) add(QueueItem(r.getString(1), Schema.parse(r.getString(2)), r.getString(3))) } }
    }
    @Synchronized override fun taken(hash: String) { db.prepareStatement("DELETE FROM queue WHERE hash = ?").use { it.setString(1, hash); it.executeUpdate() } }
    @Synchronized override fun fail(hash: String, reason: String) { db.prepareStatement("UPDATE queue SET failed = ? WHERE hash = ?").use { it.setString(1, reason); it.setString(2, hash); it.executeUpdate() } }
    @Synchronized override fun put(key: String, value: String) { db.prepareStatement("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").use { it.setString(1, key); it.setString(2, value); it.executeUpdate() } }
    @Synchronized override fun get(key: String): String? = db.prepareStatement("SELECT v FROM kv WHERE k = ?").use { it.setString(1, key); it.executeQuery().use { r -> if (r.next()) r.getString(1) else null } }
    override fun close() = db.close()
}

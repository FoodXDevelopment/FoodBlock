package world.foodx.foodblock.window

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The window's queue and cache in the app's own SQLite database (the same tables as [JdbcWindowStore]). Pass `name = null` for an in-memory one. */
class AndroidWindowStore(context: Context, name: String? = "foodblock-window.db") : WindowStore {
    private val db: SQLiteDatabase = object : SQLiteOpenHelper(context, name, null, 1) {
        override fun onCreate(db: SQLiteDatabase) { db.execSQL(Schema.QUEUE); db.execSQL(Schema.KV) }
        override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {}
    }.writableDatabase

    override fun enqueue(block: JsonObject) { db.execSQL("INSERT OR IGNORE INTO queue (hash, block) VALUES (?, ?)", arrayOf(block["hash"]!!.jsonPrimitive.content, block.toString())) }
    override fun items(): List<QueueItem> = db.rawQuery("SELECT hash, block, failed FROM queue ORDER BY id", null).use { c ->
        buildList { while (c.moveToNext()) add(QueueItem(c.getString(0), Schema.parse(c.getString(1)), if (c.isNull(2)) null else c.getString(2))) }
    }
    override fun taken(hash: String) { db.execSQL("DELETE FROM queue WHERE hash = ?", arrayOf(hash)) }
    override fun fail(hash: String, reason: String) { db.execSQL("UPDATE queue SET failed = ? WHERE hash = ?", arrayOf(reason, hash)) }
    override fun put(key: String, value: String) { db.execSQL("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", arrayOf(key, value)) }
    override fun get(key: String): String? = db.rawQuery("SELECT v FROM kv WHERE k = ?", arrayOf(key)).use { if (it.moveToFirst()) it.getString(0) else null }
}

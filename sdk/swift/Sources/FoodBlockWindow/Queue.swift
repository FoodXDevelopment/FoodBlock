import Foundation
import FoodBlock
import SQLite3

/// The phone's own small store (SQLite): the signed blocks waiting to reach the host, in the order they were written, and the last blocks the host
/// showed (so the window still reads offline). A block is kept exactly as signed. A refused block stays, with the host's reason, never silently dropped.
public final class WindowStore {
    public struct Item { public let id: Int64, hash: String, block: JSON, failed: String? }
    private var db: OpaquePointer?
    public init(path: String = ":memory:") throws {
        guard sqlite3_open(path, &db) == SQLITE_OK else { throw WindowError.bad("cannot open the queue") }
        try exec("CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT UNIQUE NOT NULL, block TEXT NOT NULL, failed TEXT)")
        try exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
    }
    deinit { sqlite3_close(db) }
    private func exec(_ sql: String) throws { if sqlite3_exec(db, sql, nil, nil, nil) != SQLITE_OK { throw WindowError.bad(String(cString: sqlite3_errmsg(db))) } }
    private func run(_ sql: String, _ args: [String?], _ row: ((OpaquePointer) -> Void)? = nil) throws {
        var s: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &s, nil) == SQLITE_OK, let stmt = s else { throw WindowError.bad(String(cString: sqlite3_errmsg(db))) }
        defer { sqlite3_finalize(stmt) }
        for (i, a) in args.enumerated() { if let a = a { sqlite3_bind_text(stmt, Int32(i + 1), a, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) } else { sqlite3_bind_null(stmt, Int32(i + 1)) } }
        while true {
            let r = sqlite3_step(stmt)
            if r == SQLITE_ROW { row?(stmt) } else if r == SQLITE_DONE { break } else { throw WindowError.bad(String(cString: sqlite3_errmsg(db))) }
        }
    }
    private func text(_ s: OpaquePointer, _ i: Int32) -> String? { sqlite3_column_text(s, i).map { String(cString: $0) } }

    public func enqueue(_ block: JSON) throws {
        let data = try JSONSerialization.data(withJSONObject: block, options: [.withoutEscapingSlashes, .sortedKeys])
        try run("INSERT OR IGNORE INTO queue (hash, block) VALUES (?, ?)", [block["hash"] as? String, String(decoding: data, as: UTF8.self)])
    }
    /// Everything not yet taken by the host, oldest first (failed ones included, marked).
    public func items() throws -> [Item] {
        var out: [Item] = []
        try run("SELECT id, hash, block, failed FROM queue ORDER BY id", []) { s in
            let block = (try? JSONSerialization.jsonObject(with: Data((self.text(s, 2) ?? "{}").utf8))) as? JSON ?? [:]
            out.append(Item(id: sqlite3_column_int64(s, 0), hash: self.text(s, 1) ?? "", block: block, failed: self.text(s, 3)))
        }
        return out
    }
    public func pending() throws -> [Item] { try items().filter { $0.failed == nil } }
    public func taken(_ hash: String) throws { try run("DELETE FROM queue WHERE hash = ?", [hash]) }
    public func fail(_ hash: String, _ reason: String) throws { try run("UPDATE queue SET failed = ? WHERE hash = ?", [reason, hash]) }
    public func put(_ key: String, _ value: String) throws { try run("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", [key, value]) }
    public func get(_ key: String) throws -> String? { var v: String?; try run("SELECT v FROM kv WHERE k = ?", [key]) { s in v = self.text(s, 0) }; return v }
}

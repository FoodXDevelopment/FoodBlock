import Foundation
import CFoodBlock

/// The one door into the Rust core (sdk/rust, src/door.rs). An op's name and its arguments as a JSON array go in;
/// `{ "ok": value }` or `{ "error": kind, "message", "code", "reasons", "refusals" }` comes out. Every function of
/// this package is a call through `Core.ask`, so the protocol has one implementation, not a copy.
enum Core {
    /// Ask the core; throws `FoodBlockError` when it says no. `nil` arguments are JSON null.
    @discardableResult
    static func ask(_ op: String, _ args: Any?...) throws -> Any? { try call(op, args) }
    /// The core's whole answer to one op: `{ ok }` or `{ error, message, code?, refusals? }`.
    static func raw(_ op: String, _ args: [Any?]) throws -> JSON {
        let payload = try JSONSerialization.data(withJSONObject: args.map { $0 ?? NSNull() }, options: [.withoutEscapingSlashes])
        var out: UnsafeMutablePointer<CChar>? = nil
        let status = op.withCString { o in String(decoding: payload, as: UTF8.self).withCString { a in fb_call(o, a, &out) } }
        defer { fb_free(out) }
        let text = out.map { String(cString: $0) } ?? ""
        if status != FB_OK { throw FoodBlockError.invalid(text.isEmpty ? "foodblock: status \(status)" : text) }
        guard let answer = try JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed]) as? JSON else {
            throw FoodBlockError.invalid("foodblock: the core gave no answer")
        }
        return answer
    }
    static func call(_ op: String, _ args: [Any?]) throws -> Any? {
        let answer = try raw(op, args)
        if let ok = answer["ok"] { return ok is NSNull ? nil : ok }
        let message = answer["message"] as? String ?? "foodblock: error"
        if answer["error"] as? String == "refused", let list = answer["refusals"] as? [JSON], !list.isEmpty {
            throw FoodBlockError.refused(list.map { FoodBlock.Finding(code: $0["code"] as? String ?? "", detail: $0["detail"] as? String ?? "") })
        }
        if let code = answer["code"] as? String { throw FoodBlockError.coded(code, message) }
        throw FoodBlockError.invalid(message)
    }
    /// For questions that cannot fail (a yes or no, a list). A failure throws: it never reads as the empty answer, because
    /// the empty answer ("no refusals", "live", false) is often the permissive one (security J).
    static func maybe(_ op: String, _ args: Any?...) throws -> Any? { try call(op, args) }
    /// A list of blocks or findings. An answer that is not a list throws: it never reads as the empty list.
    static func list(_ op: String, _ args: Any?...) throws -> [JSON] {
        let v = try call(op, args)
        if v == nil { return [] }
        guard let list = v as? [JSON] else { throw FoodBlockError.invalid("foodblock: \(op) gave no list") }
        return list
    }
    static func bool(_ op: String, _ args: Any?...) throws -> Bool {
        guard let v = try call(op, args) as? Bool else { throw FoodBlockError.invalid("foodblock: \(op) gave no yes or no") }
        return v
    }
    static func strings(_ op: String, _ args: Any?...) throws -> [String] {
        let v = try call(op, args)
        if v == nil { return [] }
        guard let list = v as? [String] else { throw FoodBlockError.invalid("foodblock: \(op) gave no list of text") }
        return list
    }
    static func json(_ op: String, _ args: Any?...) throws -> JSON {
        guard let v = try call(op, args) as? JSON else { throw FoodBlockError.invalid("foodblock: \(op) gave no object") }
        return v
    }
    static func string(_ op: String, _ args: Any?...) throws -> String {
        guard let v = try call(op, args) as? String else { throw FoodBlockError.invalid("foodblock: \(op) gave no text") }
        return v
    }
}

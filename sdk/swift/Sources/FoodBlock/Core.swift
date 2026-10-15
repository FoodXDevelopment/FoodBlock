import Foundation
import CFoodBlock

/// The one door into the Rust core (sdk/rust, src/door.rs). An op's name and its arguments as a JSON array go in;
/// `{ "ok": value }` or `{ "error": kind, "message", "code", "reasons", "refusals" }` comes out. Every function of
/// this package is a call through `Core.ask`, so the protocol has one implementation, not a copy.
enum Core {
    /// Ask the core; throws `FoodBlockError` when it says no. `nil` arguments are JSON null.
    @discardableResult
    static func ask(_ op: String, _ args: Any?...) throws -> Any? { try call(op, args) }
    static func call(_ op: String, _ args: [Any?]) throws -> Any? {
        let payload = try JSONSerialization.data(withJSONObject: args.map { $0 ?? NSNull() }, options: [.withoutEscapingSlashes])
        var out: UnsafeMutablePointer<CChar>? = nil
        let status = op.withCString { o in String(decoding: payload, as: UTF8.self).withCString { a in fb_call(o, a, &out) } }
        defer { fb_free(out) }
        let text = out.map { String(cString: $0) } ?? ""
        if status != FB_OK { throw FoodBlockError.invalid(text.isEmpty ? "foodblock: status \(status)" : text) }
        guard let answer = try JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed]) as? JSON else {
            throw FoodBlockError.invalid("foodblock: the core gave no answer")
        }
        if let ok = answer["ok"] { return ok is NSNull ? nil : ok }
        let message = answer["message"] as? String ?? "foodblock: error"
        if answer["error"] as? String == "refused", let list = answer["refusals"] as? [JSON], !list.isEmpty {
            throw FoodBlockError.refused(list.map { FoodBlock.Finding(code: $0["code"] as? String ?? "", detail: $0["detail"] as? String ?? "") })
        }
        if let code = answer["code"] as? String { throw FoodBlockError.coded(code, message) }
        throw FoodBlockError.invalid(message)
    }
    /// For questions that cannot fail (a yes or no, a list): a failure reads as the empty answer.
    static func maybe(_ op: String, _ args: Any?...) -> Any? { try? call(op, args) }
    static func bool(_ op: String, _ args: Any?...) -> Bool { (try? call(op, args)) as? Bool ?? false }
    static func strings(_ op: String, _ args: Any?...) -> [String] { (try? call(op, args)) as? [String] ?? [] }
    static func json(_ op: String, _ args: Any?...) throws -> JSON {
        guard let v = try call(op, args) as? JSON else { throw FoodBlockError.invalid("foodblock: \(op) gave no object") }
        return v
    }
    static func string(_ op: String, _ args: Any?...) throws -> String {
        guard let v = try call(op, args) as? String else { throw FoodBlockError.invalid("foodblock: \(op) gave no text") }
        return v
    }
}

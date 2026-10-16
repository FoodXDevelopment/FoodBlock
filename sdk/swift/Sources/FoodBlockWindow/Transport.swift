import Foundation
import FoodBlock

public enum WindowError: Error, CustomStringConvertible {
    case bad(String)
    /// The host answered with a refusal (status and its reason).
    case refused(Int, String)
    /// The phone cannot reach the host: the write waits in the queue, the read comes from the cache.
    case offline
    case notSignedIn
    public var description: String {
        switch self { case .bad(let s): return s; case .refused(let c, let s): return "refused \(c): \(s)"; case .offline: return "offline"; case .notSignedIn: return "not signed in" }
    }
}

/// How the window reaches its host: one call, JSON in and out. A transport that cannot reach the host throws `WindowError.offline`.
public protocol Transport {
    func send(_ method: String, _ path: String, body: JSON?, token: String?) async throws -> (status: Int, body: JSON)
}

public struct URLSessionTransport: Transport {
    public let base: URL, session: URLSession
    public init(base: URL, session: URLSession = .shared) { self.base = base; self.session = session }
    public func send(_ method: String, _ path: String, body: JSON?, token: String?) async throws -> (status: Int, body: JSON) {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let t = token { request.setValue("Bearer \(t)", forHTTPHeaderField: "authorization") }  // never in a URL
        if let b = body { request.httpBody = try JSONSerialization.data(withJSONObject: b, options: [.withoutEscapingSlashes]) }
        do {
            let (data, response) = try await session.data(for: request)
            let json = (try? JSONSerialization.jsonObject(with: data)) as? JSON ?? [:]
            return ((response as? HTTPURLResponse)?.statusCode ?? 0, json)
        } catch let e as URLError where [.notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .timedOut, .cannotFindHost, .dnsLookupFailed].contains(e.code) {
            throw WindowError.offline
        }
    }
}

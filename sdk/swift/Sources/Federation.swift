import Foundation

/// FoodBlock Federation — multi-server discovery, replication, and peer handshake.
///
/// Servers publish a `/.well-known/foodblock` endpoint describing their capabilities.
/// Blocks can be resolved, pushed, and pulled across multiple servers.

public enum FoodBlockFederation {

    // MARK: - Types

    /// Standard endpoint paths for a FoodBlock server.
    public struct WellKnownEndpoints: Codable, Equatable {
        public let blocks: String
        public let batch: String
        public let chain: String
        public let heads: String
        public let push: String
        public let pull: String
        public let handshake: String

        public init(
            blocks: String = "/blocks",
            batch: String = "/blocks/batch",
            chain: String = "/chain",
            heads: String = "/heads",
            push: String = "/.well-known/foodblock/push",
            pull: String = "/.well-known/foodblock/pull",
            handshake: String = "/.well-known/foodblock/handshake"
        ) {
            self.blocks = blocks
            self.batch = batch
            self.chain = chain
            self.heads = heads
            self.push = push
            self.pull = pull
            self.handshake = handshake
        }
    }

    /// The full discovery document published at `/.well-known/foodblock`.
    public struct WellKnownDoc: Codable, Equatable {
        public let `protocol`: String
        public let version: String
        public let name: String
        public let types: [String]
        public let count: Int
        public let schemas: [String]
        public let templates: [String]
        public let peers: [String]
        public let endpoints: WellKnownEndpoints

        public init(
            protocol: String = "foodblock",
            version: String = "0.4.0",
            name: String = "FoodBlock Server",
            types: [String] = [],
            count: Int = 0,
            schemas: [String] = [],
            templates: [String] = [],
            peers: [String] = [],
            endpoints: WellKnownEndpoints = WellKnownEndpoints()
        ) {
            self.`protocol` = `protocol`
            self.version = version
            self.name = name
            self.types = types
            self.count = count
            self.schemas = schemas
            self.templates = templates
            self.peers = peers
            self.endpoints = endpoints
        }
    }

    // MARK: - Well-Known Document

    /// Generate the well-known discovery document for a server.
    ///
    /// - Parameters:
    ///   - name: Server name. Defaults to "FoodBlock Server".
    ///   - version: Protocol version. Defaults to "0.4.0".
    ///   - types: Block types this server supports.
    ///   - count: Total number of blocks stored.
    ///   - schemas: Schema hashes this server recognizes.
    ///   - templates: Template hashes available.
    ///   - peers: URLs of known peer servers.
    /// - Returns: A `WellKnownDoc` ready for JSON serialization.
    public static func wellKnown(
        name: String = "FoodBlock Server",
        version: String = "0.4.0",
        types: [String] = [],
        count: Int = 0,
        schemas: [String] = [],
        templates: [String] = [],
        peers: [String] = []
    ) -> WellKnownDoc {
        return WellKnownDoc(
            protocol: "foodblock",
            version: version,
            name: name,
            types: types,
            count: count,
            schemas: schemas,
            templates: templates,
            peers: peers,
            endpoints: WellKnownEndpoints()
        )
    }

    // MARK: - Discovery

    /// Discover a FoodBlock server's capabilities by fetching its well-known endpoint.
    ///
    /// - Parameter serverUrl: Base URL of the server (e.g., "https://api.example.com").
    /// - Throws: An error if the request fails or the response cannot be decoded.
    /// - Returns: The server's `WellKnownDoc` describing its capabilities, types, and peers.
    public static func discover(serverUrl: String) async throws -> WellKnownDoc {
        let trimmed = serverUrl.hasSuffix("/")
            ? String(serverUrl.dropLast())
            : serverUrl

        guard let url = URL(string: "\(trimmed)/.well-known/foodblock") else {
            throw FederationError.invalidURL(serverUrl)
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw FederationError.discoveryFailed(serverUrl, 0)
        }

        guard httpResponse.statusCode >= 200, httpResponse.statusCode < 300 else {
            throw FederationError.discoveryFailed(serverUrl, httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        return try decoder.decode(WellKnownDoc.self, from: data)
    }

    // MARK: - Federated Resolver

    /// Create a federated resolver that tries multiple servers in priority order.
    ///
    /// Returns a closure compatible with `FoodBlockChain.Resolver` that attempts to
    /// fetch a block from each server in sequence, returning the first successful result.
    ///
    /// - Parameter servers: Array of server base URLs, in priority order (local first).
    /// - Returns: An async closure `(String) async -> FoodBlock?` that resolves block hashes.
    public static func federatedResolver(
        servers: [String]
    ) -> (String) async -> FoodBlock? {
        return { hash in
            for server in servers {
                let trimmed = server.hasSuffix("/")
                    ? String(server.dropLast())
                    : server

                guard let url = URL(string: "\(trimmed)/blocks/\(hash)") else {
                    continue
                }

                var request = URLRequest(url: url)
                request.timeoutInterval = 10

                do {
                    let (data, response) = try await URLSession.shared.data(for: request)

                    guard let httpResponse = response as? HTTPURLResponse,
                          httpResponse.statusCode >= 200,
                          httpResponse.statusCode < 300 else {
                        continue
                    }

                    let decoder = JSONDecoder()
                    let block = try decoder.decode(FoodBlock.self, from: data)
                    return block
                } catch {
                    continue
                }
            }
            return nil
        }
    }

    // MARK: - Errors

    public enum FederationError: Error, CustomStringConvertible {
        case invalidURL(String)
        case discoveryFailed(String, Int)

        public var description: String {
            switch self {
            case .invalidURL(let url):
                return "FoodBlock: invalid server URL '\(url)'"
            case .discoveryFailed(let url, let status):
                return "FoodBlock: discovery failed for \(url): \(status)"
            }
        }
    }
}

import Foundation

public struct StateFilter {
    public let field: String
    public let op: String
    public let value: Any
}

public struct QueryParams {
    public var type: String?
    public var refs: [String: String] = [:]
    public var stateFilters: [StateFilter] = []
    public var limit: Int = 50
    public var offset: Int = 0
    public var headsOnly: Bool = false
}

public class FoodBlockQuery {
    public typealias Resolver = (QueryParams) async throws -> [FoodBlock]

    private let resolve: Resolver
    private var params = QueryParams()

    public init(resolve: @escaping Resolver) {
        self.resolve = resolve
    }

    @discardableResult
    public func type(_ t: String) -> FoodBlockQuery {
        params.type = t
        return self
    }

    @discardableResult
    public func byRef(role: String, hash: String) -> FoodBlockQuery {
        params.refs[role] = hash
        return self
    }

    @discardableResult
    public func whereEq(field: String, value: Any) -> FoodBlockQuery {
        params.stateFilters.append(StateFilter(field: field, op: "eq", value: value))
        return self
    }

    @discardableResult
    public func whereLt(field: String, value: Any) -> FoodBlockQuery {
        params.stateFilters.append(StateFilter(field: field, op: "lt", value: value))
        return self
    }

    @discardableResult
    public func whereGt(field: String, value: Any) -> FoodBlockQuery {
        params.stateFilters.append(StateFilter(field: field, op: "gt", value: value))
        return self
    }

    @discardableResult
    public func latest() -> FoodBlockQuery {
        params.headsOnly = true
        return self
    }

    @discardableResult
    public func limit(_ n: Int) -> FoodBlockQuery {
        params.limit = n
        return self
    }

    @discardableResult
    public func offset(_ n: Int) -> FoodBlockQuery {
        params.offset = n
        return self
    }

    public func exec() async throws -> [FoodBlock] {
        return try await resolve(params)
    }
}

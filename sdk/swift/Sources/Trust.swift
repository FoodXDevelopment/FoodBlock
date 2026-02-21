import Foundation

/// Default trust weights (Section 6.3).
public let DEFAULT_TRUST_WEIGHTS: [String: Double] = [
    "authority_certs": 3.0,
    "peer_reviews": 1.0,
    "chain_depth": 2.0,
    "verified_orders": 1.5,
    "account_age": 0.5
]

/// Trust computation result.
public struct TrustResult {
    public let score: Double
    public let inputs: [String: Any]
    public let meetsMinimum: Bool
}

/// Peer review sub-result.
public struct PeerReviewResult {
    public let count: Int
    public let avgScore: Double
    public let weightedScore: Double
}

// MARK: - FoodBlockTrust

public enum FoodBlockTrust {

    /// Compute trust score for an actor from five inputs derived from the block graph.
    ///
    /// Blocks are passed as `[[String: Any]]` dicts with keys:
    /// `"hash"`, `"type"`, `"state"`, `"refs"`, `"author_hash"`, `"created_at"`.
    public static func computeTrust(
        actorHash: String,
        blocks: [[String: Any]],
        policy: [String: Any] = [:]
    ) -> TrustResult {
        precondition(!actorHash.isEmpty, "FoodBlock: actorHash is required")

        let policyWeights = policy["weights"] as? [String: Double] ?? [:]
        var weights = DEFAULT_TRUST_WEIGHTS
        for (k, v) in policyWeights { weights[k] = v }

        let requiredAuthorities = policy["required_authorities"] as? [String]
        let now = Date().timeIntervalSince1970 * 1000

        let authorityCerts = countAuthorityCerts(
            actorHash: actorHash, blocks: blocks, requiredAuthorities: requiredAuthorities
        )
        let peerReviews = computePeerReviews(actorHash: actorHash, blocks: blocks)
        let chainDepth = computeChainDepth(actorHash: actorHash, blocks: blocks)
        let verifiedOrders = countVerifiedOrders(actorHash: actorHash, blocks: blocks)
        let accountAge = computeAccountAge(actorHash: actorHash, blocks: blocks, now: now)

        let score =
            Double(authorityCerts) * weights["authority_certs"]! +
            peerReviews.weightedScore * weights["peer_reviews"]! +
            Double(chainDepth) * weights["chain_depth"]! +
            Double(verifiedOrders) * weights["verified_orders"]! +
            accountAge * weights["account_age"]!

        let minScore = policy["min_score"] as? Double ?? 0
        let meetsMinimum = score >= minScore

        let inputs: [String: Any] = [
            "authority_certs": authorityCerts,
            "peer_reviews": [
                "count": peerReviews.count,
                "avg_score": peerReviews.avgScore,
                "weighted_score": peerReviews.weightedScore
            ] as [String: Any],
            "chain_depth": chainDepth,
            "verified_orders": verifiedOrders,
            "account_age": accountAge
        ]

        return TrustResult(score: score, inputs: inputs, meetsMinimum: meetsMinimum)
    }

    /// Measure connection density between two actors (Section 6.3 sybil resistance).
    /// Returns 0..1 where 0 = no shared refs, 1 = fully connected.
    public static func connectionDensity(
        actorA: String?,
        actorB: String?,
        blocks: [[String: Any]]
    ) -> Double {
        guard let actorA = actorA, !actorA.isEmpty,
              let actorB = actorB, !actorB.isEmpty else { return 0 }

        var refsA = Set<String>()
        var refsB = Set<String>()

        for block in blocks {
            guard let refs = block["refs"] as? [String: Any] else { continue }
            let vals = flattenRefValues(refs)

            if vals.contains(actorA) {
                for v in vals where v != actorA { refsA.insert(v) }
            }
            if vals.contains(actorB) {
                for v in vals where v != actorB { refsB.insert(v) }
            }
        }

        if refsA.isEmpty || refsB.isEmpty { return 0 }

        let shared = refsA.intersection(refsB).count
        let union = refsA.union(refsB).count
        return union > 0 ? Double(shared) / Double(union) : 0
    }

    /// Create a trust policy block.
    public static func createTrustPolicy(
        name: String,
        weights: [String: Any],
        requiredAuthorities: [String]? = nil,
        minScore: Double? = nil,
        author: String? = nil
    ) -> FoodBlock {
        var state: [String: Any] = ["name": name, "weights": weights]
        if let ra = requiredAuthorities { state["required_authorities"] = ra }
        if let ms = minScore { state["min_score"] = ms }

        var refs: [String: Any] = [:]
        if let a = author { refs["author"] = a }

        return FoodBlock.create(type: "observe.trust_policy", state: state, refs: refs)
    }

    // MARK: - Private Helpers

    private static func flattenRefValues(_ refs: [String: Any]) -> [String] {
        var result: [String] = []
        for (_, value) in refs {
            if let s = value as? String {
                result.append(s)
            } else if let arr = value as? [Any] {
                result.append(contentsOf: arr.compactMap { $0 as? String })
            }
        }
        return result
    }

    private static func countAuthorityCerts(
        actorHash: String,
        blocks: [[String: Any]],
        requiredAuthorities: [String]?
    ) -> Int {
        var count = 0
        for block in blocks {
            guard let type = block["type"] as? String, type == "observe.certification" else { continue }
            guard let refs = block["refs"] as? [String: Any],
                  refs["subject"] as? String == actorHash else { continue }

            if let state = block["state"] as? [String: Any],
               let validUntil = state["valid_until"] as? String {
                let formatter = ISO8601DateFormatter()
                if let date = formatter.date(from: validUntil), date < Date() {
                    continue
                }
            }

            count += 1
        }
        return count
    }

    private static func computePeerReviews(
        actorHash: String,
        blocks: [[String: Any]]
    ) -> PeerReviewResult {
        var reviews: [[String: Any]] = []
        for block in blocks {
            guard let type = block["type"] as? String, type == "observe.review" else { continue }
            guard let refs = block["refs"] as? [String: Any],
                  refs["subject"] as? String == actorHash else { continue }
            guard let state = block["state"] as? [String: Any],
                  state["rating"] is Double || state["rating"] is Int else { continue }
            reviews.append(block)
        }

        if reviews.isEmpty {
            return PeerReviewResult(count: 0, avgScore: 0, weightedScore: 0)
        }

        var totalWeighted = 0.0
        var totalWeight = 0.0

        for review in reviews {
            let refs = review["refs"] as? [String: Any] ?? [:]
            let reviewerHash = refs["author"] as? String ?? review["author_hash"] as? String
            let density = connectionDensity(actorA: reviewerHash, actorB: actorHash, blocks: blocks)
            let weight = 1.0 - density

            let state = review["state"] as! [String: Any]
            let rating: Double
            if let r = state["rating"] as? Double { rating = r }
            else if let r = state["rating"] as? Int { rating = Double(r) }
            else { continue }

            totalWeighted += (rating / 5.0) * weight
            totalWeight += weight
        }

        let ratingSum = reviews.reduce(0.0) { sum, r in
            let state = r["state"] as! [String: Any]
            if let rating = state["rating"] as? Double { return sum + rating }
            if let rating = state["rating"] as? Int { return sum + Double(rating) }
            return sum
        }
        let avgScore = ratingSum / Double(reviews.count)
        let weightedScore = totalWeight > 0
            ? totalWeighted / totalWeight * Double(reviews.count)
            : 0

        return PeerReviewResult(count: reviews.count, avgScore: avgScore, weightedScore: weightedScore)
    }

    private static func computeChainDepth(
        actorHash: String,
        blocks: [[String: Any]]
    ) -> Int {
        var authors = Set<String>()
        for block in blocks {
            guard let refs = block["refs"] as? [String: Any] else { continue }
            let vals = flattenRefValues(refs)
            let refsActor = vals.contains(actorHash)
            if refsActor, let authorHash = block["author_hash"] as? String {
                authors.insert(authorHash)
            }
        }
        return authors.count
    }

    private static func countVerifiedOrders(
        actorHash: String,
        blocks: [[String: Any]]
    ) -> Int {
        var count = 0
        for block in blocks {
            guard let type = block["type"] as? String,
                  type.hasPrefix("transfer.order") else { continue }
            guard let refs = block["refs"] as? [String: Any],
                  (refs["buyer"] as? String == actorHash || refs["seller"] as? String == actorHash) else { continue }
            if let state = block["state"] as? [String: Any],
               (state["adapter_ref"] != nil || state["payment_ref"] != nil) {
                count += 1
            }
        }
        return count
    }

    private static func computeAccountAge(
        actorHash: String,
        blocks: [[String: Any]],
        now: Double
    ) -> Double {
        for block in blocks {
            guard let hash = block["hash"] as? String, hash == actorHash,
                  let createdAt = block["created_at"] as? String else { continue }
            let formatter = ISO8601DateFormatter()
            if let date = formatter.date(from: createdAt) {
                let ms = date.timeIntervalSince1970 * 1000
                let days = (now - ms) / (1000 * 60 * 60 * 24)
                return min(days, 365)
            }
        }
        return 0
    }
}

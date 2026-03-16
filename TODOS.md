# FoodBlock TODOs

Deferred work with enough context to pick up without re-researching.

---

## TODO-1: `max_per_period` enforcement in `checkAuthorization`

**What:** Enforce the `max_per_period` / `period` fields in `transfer.authorization` blocks.

**Why:** `createAuthorization` accepts `maxPerPeriod` and `period` (e.g. `max_per_period: 250, period: "7d"`), and `checkAuthorization` reads these fields from state — but never enforces them. An agent with `max_per_period: 250` can currently spend unlimited amounts as long as each transaction is under `max_per_transaction`.

**Current state:** `checkAuthorization` in `sdk/javascript/src/agent.js` destructures `max_per_period` from state but the enforcement block was deferred pending a design decision on where period totals are tracked.

**Design decision needed:** Period total enforcement requires querying all blocks the agent created within the window (e.g., all `transfer.order` blocks with `refs.author = agent_hash` in the last 7 days) and summing their value fields. This means `checkAuthorization` needs DB access — it can't remain a pure function. Options:
- Pass the period total in as an argument: `checkAuthorization(authBlock, type, value, periodTotal)` — caller is responsible for computing it
- Move period enforcement to a new async `checkAuthorizationAsync(store, authBlock, type, value)` function
- Enforce only at the Backend layer and document that the SDK function is stateless

**Effort:** M
**Priority:** P2
**Depends on:** Reference implementation (FoodX Backend) using `transfer.authorization` — drives which approach fits best.

---

## TODO-2: Python / Go / Swift SDK parity for `createAuthorization` + `checkAuthorization`

**What:** Port `createAuthorization` and `checkAuthorization` from `sdk/javascript/src/agent.js` to the Python, Go, and Swift SDKs.

**Why:** Cross-language parity is a protocol requirement. Any agent built in Python, Go, or Swift cannot currently create or check `transfer.authorization` blocks using SDK-native functions. They'd have to construct the blocks manually.

**Current state:** `sdk/javascript/src/agent.js` has both functions with full test coverage (`test/agent-authorization.test.js`, 20 tests). The other three SDKs have `agent.py` / `agent.go` / `Agent.swift` with `createAgent`, `createDraft`, `approveDraft`, `loadAgent` — but not the authorization functions.

**Where to start:**
- Python: `sdk/python/foodblock/agent.py` — add `create_authorization(agent_hash, scope, opts)` and `check_authorization(auth_block, type, value)`
- Go: `sdk/go/agent.go` — add `CreateAuthorization` and `CheckAuthorization`
- Swift: `sdk/swift/Sources/FoodBlock/Agent.swift` — add `createAuthorization` and `checkAuthorization`

The logic is pure (no DB, no async) — straightforward port. Use the JS test file as the spec for expected behaviour.

**Effort:** M (all three SDKs together)
**Priority:** P1 — should be done before the agent spec is published externally
**Depends on:** TODO-1 design decision (if period enforcement changes the function signature, port the final design, not the interim one)

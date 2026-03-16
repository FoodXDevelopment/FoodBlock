# FoodBlock Agent Specification

**Version 1.0**
*March 2026*
*Apache License 2.0*

---

## Abstract

This specification defines how AI agents participate in the FoodBlock protocol. It covers agent identity, the five primitive tool operations, the authorization block schema, instruction conventions, and the progressive escalation model. Any AI system that implements this specification can act on behalf of a food business — creating orders, managing inventory, negotiating with other agents, and responding to events — with full cryptographic provenance and human-controlled authority bounds.

The specification is deliberately minimal. An agent needs exactly five operations and one new block type. Everything else is protocol.

---

## 1. Design Principles

**An agent is an actor.** Every agent has an Ed25519 keypair. Every block it creates carries its signature. Its identity is its public key hash — not a token, not a session, not a credential that expires. The agent's authority is visible in the block graph for anyone to inspect.

**The graph is memory.** Agents do not maintain separate state. Standing instructions are `observe.preference` blocks. Conversation history is `observe.message` blocks. Authorization is a `transfer.authorization` block. Past actions are the blocks the agent created. The graph is the agent's memory, and it is shared, signed, and permanent.

**Authorization is a block.** An agent's spending authority, action scope, and approval mode are declared in a `transfer.authorization` block created and signed by its operator. When the operator tombstones that block, authority ends. There is no token to rotate, no permission table to update, no API call to an auth service.

**Every action is observable.** Because every agent action is a signed block in the graph, the full history of what an agent did, on whose authority, and with what result is always reconstructable. There is no separate audit log — the protocol is the audit log.

**The spec defines the interface, not the intelligence.** This specification is model-agnostic. A Claude-powered agent and a GPT-powered agent that both implement this spec can transact with each other and with human participants, using identical block structures.

---

## 2. Agent Identity

An agent is an `actor.agent` block. It has an Ed25519 keypair. Its identity (`authorHash`) is the SHA-256 hash of its genesis block.

```json
{
  "type": "actor.agent",
  "state": {
    "name": "FoodX Assistant",
    "model": "claude-opus-4-6",
    "capabilities": ["transfer.order", "observe.post", "substance.*"]
  },
  "refs": {
    "operator": "<operator_actor_hash>"
  }
}
```

**Required fields:**
- `state.name` — human-readable agent name
- `refs.operator` — hash of the actor (human or business) that controls this agent

**Optional fields:**
- `state.model` — LLM model identifier
- `state.capabilities` — declared block types the agent is designed to work with (informational; actual authority is governed by `transfer.authorization` blocks)

**Capability wildcards:** `transfer.*` matches all `transfer.*` subtypes. `*` matches everything.

An agent created but not yet authorized has no spending authority. Authorization is granted separately via `transfer.authorization` (Section 4).

---

## 3. The Five Tool Operations

An agent-compatible FoodBlock implementation must expose exactly these five operations. They map directly to block graph primitives.

### 3.1 `read_blocks(filter)`

Query the block graph. Returns blocks matching the filter.

```
filter:
  type?      string   — block type or prefix (e.g. "transfer.order", "transfer.*")
  author?    string   — filter by author hash
  refs?      object   — filter by ref values (e.g. { subject: "<hash>" })
  heads?     boolean  — only return latest blocks in each chain (default: true)
  limit?     number   — max results (default: 20, max: 100)
  since?     string   — ISO 8601 timestamp — blocks created after this time
```

This is a read-only operation. No authorization check required. An agent may only read blocks whose visibility permits it (see visibility model in the core protocol).

### 3.2 `insert_block(type, state, refs)`

Create a new block, signed by the agent. This is how agents act: create orders, post updates, record observations, declare surplus, send messages.

```
type    string   — block type (e.g. "transfer.order")
state   object   — block state fields
refs    object   — named references to other blocks
```

**Authorization check:** Before creating a block, the implementation must verify that a valid, non-expired, non-tombstoned `transfer.authorization` block exists where:
- `refs.agent` equals the agent's hash
- `state.scope` permits the requested block type (exact match or wildcard)
- If `state.max_per_transaction` is set and the block contains a value field, that value must not exceed the limit
- `state.approval_mode` determines whether the block is created directly (`auto`) or as a draft (`draft`)

If no valid authorization exists, the operation must fail with `UNAUTHORIZED`.

If `approval_mode` is `draft`, the block is created with `state.draft = true` and `refs.agent = <agent_hash>`. It becomes effective only when the operator approves it (creates an update removing `draft` and adding `refs.updates`).

### 3.3 `tombstone_block(hash)`

Erase a block's content. The hash remains in the graph (provenance is preserved) but `state`, `refs`, and `author_hash` are zeroed. This is the GDPR erasure mechanism.

An agent may tombstone only blocks it authored (where `author_hash` equals the agent's hash). Tombstoning another actor's block requires that actor's signature.

### 3.4 `ref_block(target_hash, type, state, refs_extra)`

Create a new block that explicitly references an existing block. Convenience wrapper over `insert_block` that ensures `refs.subject` (or a caller-specified ref name) points to `target_hash`.

Used for: reviews referencing a place or product, responses referencing a message, updates referencing a prior block in the agent's own chain.

### 3.5 `notify_actor(actor_hash, message, opts)`

Send a private message to another actor (human or agent). Creates an `observe.message` block addressed to the recipient.

```
actor_hash   string   — recipient's actor hash
message      string   — message content
opts:
  encrypted? boolean  — encrypt with recipient's public key (default: true)
  thread?    string   — refs.thread hash for conversation threading
```

The message block is signed by the sending agent. If encrypted, only the recipient can decrypt it using their private key.

---

## 4. The Authorization Block

`transfer.authorization` is the primitive that grants an agent bounded spending authority. It is created and signed by the operator (human or business actor). It is tombstoned by the operator to revoke authority.

### 4.1 Schema

```json
{
  "type": "transfer.authorization",
  "state": {
    "scope": ["transfer.order", "substance.*"],
    "max_per_transaction": 100.00,
    "max_per_period": 500.00,
    "period": "7d",
    "approval_mode": "auto",
    "expires": "2026-09-01T00:00:00Z",
    "currency": "GBP"
  },
  "refs": {
    "agent": "<agent_actor_hash>",
    "author": "<operator_actor_hash>"
  }
}
```

**Required fields:**
- `refs.agent` — hash of the agent being authorized
- `state.scope` — array of permitted block types; supports wildcards (`transfer.*`, `*`)
- `state.approval_mode` — one of `"auto"`, `"draft"`, `"ask"`

**Optional fields:**
- `state.max_per_transaction` — maximum value of a single transaction (currency-denominated)
- `state.max_per_period` — maximum total value across all transactions within `state.period`
- `state.period` — time window for `max_per_period` (e.g. `"24h"`, `"7d"`, `"30d"`)
- `state.expires` — ISO 8601 datetime after which this authorization is void
- `state.currency` — ISO 4217 currency code for monetary limits

**Signed by:** the operator (not the agent). An agent cannot self-authorize.

### 4.2 Approval Modes

| Mode | Behaviour |
|------|-----------|
| `"auto"` | Agent creates blocks directly, within scope and value limits |
| `"draft"` | Agent creates blocks with `state.draft = true`; operator must approve before blocks become effective |
| `"ask"` | Agent surfaces a proposed action to the operator via `notify_actor`; waits for an `observe.approval` block before proceeding |

### 4.3 Authorization Lifecycle

```
Operator creates transfer.authorization
         │
         ▼
    Agent is authorized
         │
    ┌────┴────────────────────────────────────┐
    │                                         │
    ▼                                         ▼
Agent acts within scope              Operator tombstones auth block
(auto / draft / ask per mode)                │
    │                                         ▼
    ▼                                   Agent is unauthorized
Blocks appear in graph                  (all future insert_block
with refs.author = agent_hash            calls return UNAUTHORIZED)
```

### 4.4 Progressive Escalation

Authorization is not static. The natural pattern is:

```
Day 1:   approval_mode: "draft"          — every action reviewed
Week 2:  approval_mode: "ask"            — agent proposes, human approves classes
Month 1: approval_mode: "auto"           — bounded autonomous action
         max_per_transaction: 50
Month 3: max_per_transaction: 500        — trust earned, limits raised
```

An agent may propose its own escalation by creating an `observe.post` or `notify_actor` message: *"I've processed 47 reorders over 3 weeks with 100% accuracy. Request: raise auto-approve limit from £50 to £200."* The operator responds by creating a new `transfer.authorization` block that tombstones the previous one via `refs.updates`.

---

## 5. Instruction Conventions

Agents receive instructions through two block types. Both are existing protocol primitives — no new types are introduced.

### 5.1 Standing Instructions (`observe.preference`)

Persistent behavioural rules the agent references whenever it acts autonomously.

```json
{
  "type": "observe.preference",
  "state": {
    "rule": "Always prefer UK suppliers when price difference is less than 15%",
    "category": "procurement"
  },
  "refs": {
    "author": "<operator_hash>",
    "subject": "<agent_hash>"
  }
}
```

Agents retrieve standing instructions via `read_blocks({ type: "observe.preference", refs: { subject: agent_hash } })` at startup and cache them for the session.

### 5.2 Task Instructions (`observe.message`)

Ephemeral instructions for a specific task or conversation turn. The operator or user sends a message; the agent responds with actions or a reply message.

```json
{
  "type": "observe.message",
  "state": {
    "text": "Reorder flour — we're running low. Don't exceed £80.",
    "encrypted": true
  },
  "refs": {
    "author": "<operator_hash>",
    "recipient": "<agent_hash>",
    "thread": "<optional_thread_hash>"
  }
}
```

The agent receives new instructions by subscribing to the block stream (`GET /stream`) and filtering for `observe.message` blocks where `refs.recipient` equals its hash.

### 5.3 Action Results

After completing a task, the agent creates a result message back to the operator:

```json
{
  "type": "observe.message",
  "state": {
    "text": "Reordered 25kg flour from Green Acres Mill for £62.50. Order hash: abc123...",
    "encrypted": true
  },
  "refs": {
    "author": "<agent_hash>",
    "recipient": "<operator_hash>",
    "thread": "<same_thread_hash>",
    "subject": "<order_block_hash>"
  }
}
```

The full action record — instruction, action block, result — is traceable through `refs.thread` and `refs.subject`.

---

## 6. Agent Lifecycle

```
                    ┌─────────────────────────────────────┐
                    │         AGENT LIFECYCLE              │
                    └─────────────────────────────────────┘

  createAgent()                    loadAgent()
       │                                │
       ▼                                ▼
  actor.agent block            Restore from stored
  + Ed25519 keypair            authorHash + keypair
       │                                │
       └───────────────┬────────────────┘
                       ▼
              [Unauthorized state]
              No transfer.authorization exists
                       │
                       │  Operator creates transfer.authorization
                       ▼
              [Authorized state]
              Agent can read_blocks freely
              Agent can insert_block within scope
                       │
           ┌───────────┼───────────────┐
           ▼           ▼               ▼
      approval_mode  approval_mode   approval_mode
        "auto"        "draft"          "ask"
           │           │               │
    Creates block  Creates draft   Sends proposal
    directly       (draft: true)   via notify_actor
           │           │               │
           │      Operator         Operator creates
           │      approves         observe.approval
           │      (removes         block, then agent
           │       draft flag)     proceeds
           └───────────┴───────────────┘
                       │
              Block appears in graph
              signed by agent
                       │
                       │  Operator tombstones transfer.authorization
                       ▼
              [Unauthorized state]
              Agent reads are unaffected
              Agent writes return UNAUTHORIZED
```

---

## 7. Multi-Agent Interaction

Agents discover each other through the block graph. There is no agent registry or directory service — agents are actors with `type: "actor.agent"`.

```
Agent A discovers Agent B:
  read_blocks({ type: "actor.agent" })
  → finds actor.agent blocks
  → inspects state.capabilities to find matching agents

Agent A sends a request to Agent B:
  notify_actor(agentB.hash, "Can you supply 10kg of rye flour this week?")
  → creates observe.message block, refs.recipient = agentB.hash

Agent B receives and responds:
  (subscribing to stream, filtered for refs.recipient = agentB.hash)
  → reads the message
  → creates an offer: insert_block("transfer.offer", { ... })
  → notify_actor(agentA.hash, "Yes, 10kg rye at £18. See offer: <hash>")

Agent A reviews the offer:
  read_blocks({ type: "transfer.offer", refs: { author: agentB.hash } })
  → verifies price against standing instructions
  → if within authorization: insert_block("transfer.order", { ... })
```

Every step — discovery, negotiation, agreement — is recorded as signed blocks. The negotiation chain is reconstructable from the graph indefinitely.

---

## 8. Reference Implementation

The FoodX Activity tab is the reference implementation of this specification. It demonstrates:

- Agent identity (`actor.agent` with operator keypair, FoodX backend)
- Authorization (`transfer.authorization` created by user, governing agent scope)
- Standing instructions (`observe.preference` blocks set via Activity tab input bar)
- Task instructions (`observe.message` from user to agent via Activity tab)
- Agent consoles (filtered projections of the block graph: Orders, Stock, Reviews, Tonight)
- Progressive escalation (observe-only → draft+approve → auto-approve → autonomous)

The reference implementation is available at [github.com/FoodXDevelopment/foodx-ios](https://github.com/FoodXDevelopment/foodx-ios).

---

## 9. Conformance

A conformant agent implementation must:

1. Represent agents as `actor.agent` blocks with Ed25519 keypairs
2. Implement all five tool operations (Section 3)
3. Enforce authorization checks on `insert_block` (Section 4)
4. Honour `approval_mode` (`auto`, `draft`, `ask`) from the active `transfer.authorization`
5. Refuse `insert_block` when no valid authorization exists
6. Read standing instructions from `observe.preference` blocks
7. Accept task instructions via `observe.message` blocks

Optional (recommended):

- Support `notify_actor` encryption using recipient's public key
- Subscribe to the block stream for real-time instruction delivery
- Implement progressive escalation proposals

---

## 10. Security Properties

**Agents cannot self-authorize.** A `transfer.authorization` must be signed by the operator's keypair, not the agent's. Any implementation that allows an agent to create its own authorization block is non-conformant.

**Revocation is immediate.** Tombstoning a `transfer.authorization` block voids all future agent actions that would reference it. Implementations must check authorization status on every `insert_block` call, not at session start.

**Draft blocks are not effective.** A block with `state.draft = true` must not trigger any downstream effects (order fulfillment, payment, notifications) until an operator update removes the draft flag.

**Signatures are verifiable by any party.** Because every agent block carries a signature verifiable against the agent's public key (stored in its `actor.agent` block), any participant in the network can verify that a block was created by a specific agent — without contacting the agent or any central service.

**Capability declarations are informational.** `state.capabilities` in an `actor.agent` block describes what an agent is designed to do. Actual authority is governed exclusively by `transfer.authorization` blocks. An agent with `capabilities: ["*"]` but no valid authorization block has no write authority.

---

## Appendix A: Block Type Reference

| Type | Purpose |
|------|---------|
| `actor.agent` | Agent identity block. Genesis block of the agent's chain. |
| `transfer.authorization` | Grants an agent bounded write authority. Signed by operator. |
| `observe.preference` | Standing instruction from operator to agent. |
| `observe.message` | Task instruction or result message between operator and agent. |
| `observe.approval` | Operator approval of a draft block. |

**Deprecation note:** The `observe.permission` block type (defined in technical whitepaper Section 10.5.3, prior to this spec) is superseded by `transfer.authorization`. `observe.permission` should not be used in new implementations. Existing `observe.permission` blocks remain valid for reading but should be migrated to `transfer.authorization` when authorization grants are next updated.

All other block types (`transfer.order`, `substance.product`, etc.) are created by agents in the normal course of operation, subject to authorization.

---

## Appendix B: Error Codes

| Code | Meaning |
|------|---------|
| `UNAUTHORIZED` | No valid `transfer.authorization` exists for this agent and block type |
| `EXCEEDED_LIMIT` | Transaction value exceeds `max_per_transaction` |
| `PERIOD_LIMIT_REACHED` | Period total would exceed `max_per_period` |
| `AUTHORIZATION_EXPIRED` | `transfer.authorization` `state.expires` is in the past |
| `DRAFT_REQUIRED` | `approval_mode` is `draft` — block created as draft, not effective |
| `APPROVAL_REQUIRED` | `approval_mode` is `ask` — awaiting operator `observe.approval` |
| `SCOPE_MISMATCH` | Requested block type not in `state.scope` |

---

## Appendix C: Example Authorization Flows

### Minimal authorization (draft mode)
```json
{
  "type": "transfer.authorization",
  "state": {
    "scope": ["transfer.order"],
    "approval_mode": "draft"
  },
  "refs": {
    "agent": "<agent_hash>"
  }
}
```

### Bounded autonomous authorization
```json
{
  "type": "transfer.authorization",
  "state": {
    "scope": ["transfer.order", "observe.post", "substance.surplus"],
    "max_per_transaction": 50.00,
    "max_per_period": 250.00,
    "period": "7d",
    "approval_mode": "auto",
    "currency": "GBP",
    "expires": "2026-12-31T23:59:59Z"
  },
  "refs": {
    "agent": "<agent_hash>"
  }
}
```

### Full autonomous authorization (trusted agent)
```json
{
  "type": "transfer.authorization",
  "state": {
    "scope": ["transfer.*", "observe.*", "substance.*"],
    "approval_mode": "auto",
    "currency": "GBP"
  },
  "refs": {
    "agent": "<agent_hash>"
  }
}
```

---

*Licensed under the MIT License. See [LICENSE](../LICENSE) for terms.*
*Community contributions welcome at [github.com/FoodXDevelopment/foodblock](https://github.com/FoodXDevelopment/foodblock)*

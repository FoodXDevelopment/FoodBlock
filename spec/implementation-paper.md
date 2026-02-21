# FoodBlock Implementation Paper: From Protocol to Product

**Version 0.1, February 2026**

## Abstract

The FoodBlock whitepaper defines the protocol. The technical whitepaper specifies its mechanics. This paper addresses the gap between specification and deployment: how money moves, how consumers authenticate without managing cryptographic keys, how real-time experiences are built on an append-only data model, and how the system bootstraps from zero participants to a functioning economy. Each section identifies a concrete problem, proposes a solution within the protocol's constraints, and provides implementation details sufficient to build against.

## 1. Payment Protocol

### 1.1 The Problem

The protocol defines `transfer.order` blocks but is silent on how money moves. A block is immutable once created. If payment fails after an order block exists, the graph contains an unresolvable record of a transaction that never completed. Commerce requires atomic coordination between the block graph and an external payment system.

### 1.2 The Settlement Chain

Payment is modelled as a chain of blocks, not a single block. Each block represents a state transition in the payment lifecycle:

```
transfer.order (draft: true)
    │
transfer.payment (status: "authorized")
    │
transfer.order (draft removed, refs: { updates: draft, payment: payment_hash })
    │
transfer.payment (status: "captured", refs: { updates: auth_hash })
    │
[optional] transfer.refund (refs: { order: order_hash, payment: captured_hash })
```

### 1.3 Block Definitions

**Order draft** — created by the buyer (or their agent):

```json
{
  "type": "transfer.order",
  "state": {
    "instance_id": "uuid",
    "items": [{ "product": "product_hash", "quantity": 1, "unit_price": 5.00 }],
    "total": 5.00,
    "currency": "GBP",
    "draft": true
  },
  "refs": { "buyer": "buyer_hash", "seller": "seller_hash", "agent": "agent_hash" }
}
```

**Payment authorization** — created by the payment adapter agent after the payment processor places a hold:

```json
{
  "type": "transfer.payment",
  "state": {
    "instance_id": "uuid",
    "adapter": "stripe",
    "adapter_ref": "pi_abc123",
    "amount": 5.00,
    "currency": "GBP",
    "status": "authorized"
  },
  "refs": { "order": "draft_order_hash", "processor": "stripe_actor_hash" }
}
```

**Order confirmation** — created after successful authorization. This is the canonical order record:

```json
{
  "type": "transfer.order",
  "state": {
    "instance_id": "uuid",
    "items": [{ "product": "product_hash", "quantity": 1, "unit_price": 5.00 }],
    "total": 5.00,
    "currency": "GBP"
  },
  "refs": {
    "buyer": "buyer_hash",
    "seller": "seller_hash",
    "payment": "payment_auth_hash",
    "updates": "draft_order_hash"
  }
}
```

**Payment capture** — created when funds are actually transferred (may be immediate or delayed):

```json
{
  "type": "transfer.payment",
  "state": {
    "instance_id": "uuid",
    "adapter": "stripe",
    "adapter_ref": "pi_abc123",
    "amount": 5.00,
    "currency": "GBP",
    "status": "captured",
    "captured_at": "2026-02-20T10:30:00Z"
  },
  "refs": { "order": "confirmed_order_hash", "processor": "stripe_actor_hash", "updates": "payment_auth_hash" }
}
```

**Refund** — a new block, not a modification:

```json
{
  "type": "transfer.refund",
  "state": {
    "instance_id": "uuid",
    "amount": 5.00,
    "currency": "GBP",
    "reason": "customer_request",
    "refund_ref": "re_xyz789"
  },
  "refs": { "order": "confirmed_order_hash", "payment": "captured_payment_hash", "processor": "stripe_actor_hash" }
}
```

### 1.4 Failure Handling

| Failure Point | State | Recovery |
|---------------|-------|----------|
| Payment authorization fails | Draft order exists, no payment block | Draft remains as head. Agent notifies buyer. No confirmed order is ever created. |
| Authorization succeeds, capture fails | Auth payment block exists, confirmed order exists | Create a `transfer.payment` update with `status: "capture_failed"`. Create a `transfer.refund` to release the hold. |
| Network failure between auth and order confirmation | Auth payment block exists, no confirmed order | The payment adapter agent retries order confirmation. Idempotent: same content produces same hash. |
| Dispute / chargeback | Captured payment exists | Create `transfer.dispute` block referencing the payment. Seller's agent is notified. |

### 1.5 The Invariant

**A confirmed `transfer.order` (no `draft` field) always has a `refs.payment` pointing to a successful `transfer.payment`.** This is the protocol-level guarantee. Any system reading the graph can verify that a confirmed order has a corresponding payment by following the ref.

### 1.6 Payment Processor as Actor

The payment processor (Stripe, etc.) is represented as an `actor.processor` block:

```json
{
  "type": "actor.processor",
  "state": {
    "name": "Stripe",
    "platform": "stripe",
    "public_key_sign": "ed25519_hex..."
  },
  "refs": {}
}
```

Payment blocks signed by a recognised processor carry higher trust than self-declared payment records. Trust computation (Section 6 of the technical whitepaper) uses `actor.processor` identity to validate `payment_ref` claims.

### 1.7 Tab Model

For the walk-in commerce scenario (coffee shop, farmer's market), the settlement chain is compressed into a tab:

**Tab open** — created when the customer enters the venue (via geolocation or explicit action):

```json
{
  "type": "transfer.tab",
  "state": {
    "instance_id": "uuid",
    "status": "open",
    "venue": "venue_name",
    "pre_auth_ref": "pi_preauth_abc"
  },
  "refs": { "customer": "buyer_hash", "venue": "venue_hash", "processor": "stripe_hash" }
}
```

**Tab item** — created for each purchase (by the seller's agent):

```json
{
  "type": "transfer.tab_item",
  "state": {
    "instance_id": "uuid",
    "name": "Flat white",
    "price": 5.00,
    "currency": "GBP"
  },
  "refs": { "tab": "tab_hash", "product": "product_hash", "seller": "seller_hash" }
}
```

**Tab close** — created when the customer leaves or explicitly closes:

```json
{
  "type": "transfer.tab",
  "state": {
    "instance_id": "uuid",
    "status": "settled",
    "total": 5.00,
    "currency": "GBP",
    "items_count": 1
  },
  "refs": {
    "customer": "buyer_hash",
    "venue": "venue_hash",
    "payment": "captured_payment_hash",
    "updates": "tab_open_hash"
  }
}
```

The tab model defers payment to the end. A pre-authorization hold is placed when the tab opens. Capture happens when the tab closes. The customer never interacts with payment at the counter.

## 2. Consumer Identity

### 2.1 The Problem

The protocol requires Ed25519 keypairs for signing. Consumers will not manage private keys. The gap between cryptographic identity and user experience must be bridged without compromising the protocol's guarantees.

### 2.2 Custodial Key Architecture

The application holds the user's private key. The user authenticates with familiar credentials (biometrics, email/password, social login). The key signs blocks on their behalf.

```
User authenticates (Face ID / email+password / OAuth)
    │
    ▼
App unlocks encrypted keystore
    │
    ▼
Private key available in memory
    │
    ▼
App signs blocks with user's Ed25519 key
    │
    ▼
Key cleared from memory after signing
```

### 2.3 Key Storage

Private keys are encrypted at rest on the device using a key derived from the user's authentication credential:

```json
{
  "actor_hash": "user_actor_block_hash",
  "encrypted_private_key": "AES-256-GCM encrypted blob",
  "key_derivation": {
    "algorithm": "PBKDF2",
    "iterations": 600000,
    "salt": "random_salt_hex"
  },
  "device_id": "device_uuid",
  "created_at": "2026-02-20T10:00:00Z"
}
```

On iOS, the encrypted key is stored in the Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. On Android, in the Android Keystore with biometric binding. On web, in an encrypted IndexedDB entry derived from the user's password.

The server never holds the user's private key in plaintext. During account creation, the key is generated on-device, the public key is published in the actor block, and the encrypted private key is backed up to the server for recovery purposes only.

### 2.4 Key Recovery

When a user loses their device, they need to recover their identity (actor block) and signing capability (private key).

**Recovery flow:**

1. User authenticates on new device (email + password, or OAuth)
2. Server delivers the encrypted private key backup
3. New device decrypts using the password-derived key
4. User's actor block hash is restored — they can sign blocks again

**Recovery block** — recorded for audit:

```json
{
  "type": "observe.key_recovery",
  "state": {
    "instance_id": "uuid",
    "device_id": "new_device_uuid",
    "method": "password_backup",
    "recovered_at": "2026-02-20T10:00:00Z"
  },
  "refs": { "actor": "user_actor_hash" }
}
```

### 2.5 Key Rotation

If a key is compromised, the user rotates to a new keypair:

1. Generate new Ed25519 keypair on device
2. Create an `observe.key_rotation` block signed by the OLD key (proving ownership):

```json
{
  "type": "observe.key_rotation",
  "state": {
    "instance_id": "uuid",
    "old_public_key": "old_ed25519_public_hex",
    "new_public_key": "new_ed25519_public_hex",
    "reason": "device_compromise",
    "rotated_at": "2026-02-20T10:00:00Z"
  },
  "refs": { "actor": "user_actor_hash" }
}
```

3. Update the actor block with the new public key (chain update, `refs.updates` pointing to previous actor block)
4. All subsequent blocks are signed with the new key
5. Verifiers encountering old signatures check the key rotation chain to validate historical blocks

**If the old key is fully compromised** (attacker has it), the rotation must be authenticated through the recovery channel (email/password + server-side verification) rather than the old key. The server creates the rotation block on behalf of the user after identity verification.

### 2.6 Multi-Device

A user may have multiple devices. Two approaches:

**Shared key (recommended for simplicity):** All devices hold the same encrypted private key. Key sync happens through the encrypted backup on the server. Every device produces identical signatures.

**Per-device keys (recommended for security):** Each device has its own keypair. The user's actor block lists all active device public keys. Blocks signed by any listed device key are valid. Revocation removes a device key from the list.

The per-device model is more secure (compromising one device doesn't compromise all) but more complex (verifiers must check against a set of keys). For consumer use, shared key is the pragmatic default. Per-device keys can be offered as an opt-in for security-conscious users.

### 2.7 Anonymous Participation

Not every interaction requires identity. A consumer scanning a QR code to view provenance does not need an account. Read operations are public by default.

Identity is required only for write operations: placing orders, leaving reviews, following sellers. The identity requirement is progressive:

| Action | Identity Required | Why |
|--------|------------------|-----|
| View provenance (scan QR) | No | Public data, read-only |
| Browse products / venues | No | Public data, read-only |
| Place order | Yes | Payment requires identity |
| Leave review | Yes | Signature required for trust computation |
| Follow seller | Yes | Social graph requires identity |
| Receive agent notifications | Yes | Routing requires identity |

## 3. Real-Time Communication

### 3.1 The Problem

The protocol is append-only: blocks are written to a database. The event system uses `pg_notify`, which has no persistence, no delivery guarantees, and adds latency (write → trigger → notify → handler → write). Consumer-facing interactions (ordering at a counter, live negotiation, chat) require sub-second updates.

### 3.2 The Two-Layer Model

Real-time communication operates on two layers:

**Layer 1: The block graph (source of truth).** Every state change is a block. Blocks are permanent, signed, and auditable. This layer is the protocol.

**Layer 2: The event stream (ephemeral notification).** When a block is created, an event is emitted on a real-time channel (WebSocket / SSE). This layer is an implementation detail, not part of the protocol. It carries no authority — only the block graph is authoritative.

```
Block created (INSERT into foodblocks)
    │
    ├──→ pg_notify('new_block')          Layer 1: database event (for server-side handlers)
    │
    └──→ WebSocket emit to subscribers   Layer 2: real-time push (for client UX)
```

### 3.3 Event Stream Specification

Clients subscribe to an event stream filtered by type, author, or ref:

```
GET /stream?type=transfer.order&refs.seller=<my_hash>
Accept: text/event-stream
```

Server-Sent Events (SSE) response:

```
event: block
data: {"hash":"abc123","type":"transfer.order","state":{...},"refs":{...}}

event: block
data: {"hash":"def456","type":"transfer.payment","state":{...},"refs":{...}}
```

For bidirectional communication (e.g. agent chat), WebSocket:

```
// Subscribe
{ "action": "subscribe", "filters": { "type": "transfer.*", "refs.seller": "my_hash" } }

// Server pushes
{ "event": "block", "data": { "hash": "...", "type": "...", "state": {...}, "refs": {...} } }
```

### 3.4 The Coffee Shop Flow (Real-Time)

```
Timeline    Barista                  System                    Customer

  0ms       Says "flat white"
 50ms       Barista's app sends      Block created:
            create request           transfer.order (draft)
100ms                                WebSocket push to         Customer's phone
                                     customer's app            shows: "Flat white
                                     (geo-filtered)            £5 — confirm?"
200ms                                                          Customer taps confirm
250ms                                Payment authorized
300ms                                Confirmed order block
350ms                                WebSocket push to
                                     barista's app             Barista sees: "Confirmed"
```

Total latency: ~350ms. The critical path is: create block (50ms) → WebSocket push (50ms) → customer sees it (100ms). The rest is payment processing happening in parallel.

### 3.5 Geo-Filtered Event Routing

For the "which customer gets this order" problem at a busy coffee shop:

1. Customer's app reports their location when they open it near a venue
2. The system maintains a transient presence list per venue (not a block — ephemeral, in-memory)
3. When the barista creates an order, it's pushed to the presence list for that venue
4. If only one customer is present, it routes directly. If multiple, the order appears as claimable

**Presence is NOT a block.** It's ephemeral WebSocket state. It exists in memory, has no hash, and is not part of the protocol. When the customer leaves (disconnects), their presence disappears. This is intentional — presence is real-time UI state, not auditable data.

### 3.6 Delivery Guarantees

The real-time layer provides **at-most-once delivery**. If a WebSocket push is missed (client offline, network glitch), the client catches up by querying the block graph on reconnect:

```
GET /blocks?type=transfer.order&refs.buyer=<my_hash>&created_after=<last_seen_timestamp>
```

The block graph is the source of truth. The real-time layer is a performance optimization, not a reliability mechanism.

## 4. Physical Media Resolution

### 4.1 The Problem

QR codes and NFC tags on food packaging need to resolve to provenance data. The resolution path must work without an app, without an account, and without depending on a single server.

### 4.2 The Resolution URI

Every FoodBlock product carries a URI:

```
https://fb.link/<hash>
```

This URI is encoded in QR codes, NFC tags, and printed URLs. `fb.link` is a resolution service, not a data store. It redirects to the appropriate server.

### 4.3 Resolution Flow

```
Consumer scans QR code
    │
    ▼
https://fb.link/a1b2c3...
    │
    ▼
fb.link looks up which server hosts this hash
    │
    ▼
302 redirect to https://greenacresfarm.com/trace/a1b2c3...
    │
    ▼
Server calls explain(hash) and renders the provenance story
```

### 4.4 The Resolution Registry

`fb.link` maintains a lightweight hash → server mapping. Servers register their hash ranges:

```
POST https://fb.link/register
{
  "server": "https://greenacresfarm.com",
  "hashes": ["a1b2c3...", "d4e5f6..."],
  "well_known": "https://greenacresfarm.com/.well-known/foodblock"
}
```

This is a directory, not a data store. It holds only (hash, server_url) pairs. The actual block data lives on the origin server. If `fb.link` is unreachable, the QR code still contains the hash — any client with a server list can resolve it directly.

### 4.5 Fallback Resolution

If `fb.link` is unavailable or the consumer has the FoodX app:

1. App intercepts `fb.link` URLs via deep link / universal link
2. App resolves the hash against its configured servers (local first, then peers)
3. No external resolution service needed

For fully decentralised resolution:

```
fb:<hash>
```

The `fb:` URI scheme is registered as a custom URL scheme. Apps that handle it resolve the hash locally. This is the long-term target; `fb.link` is the pragmatic bridge for non-app users.

### 4.6 QR Code Contents

| Scenario | QR Content | Size |
|----------|-----------|------|
| Product provenance | `https://fb.link/a1b2c3...` | ~80 chars, Version 5 QR |
| Venue menu | `https://fb.link/a1b2c3...` | ~80 chars, Version 5 QR |
| NFC tap-to-pay | `https://fb.link/a1b2c3...?action=order` | ~95 chars |
| Receipt | `https://fb.link/a1b2c3...` | ~80 chars |

All fit comfortably in a standard QR code (Version 5 handles up to 134 alphanumeric characters).

### 4.7 The Provenance Page

The resolution target renders a web page (no app required):

```
┌─────────────────────────────────────┐
│                                     │
│  🍞 Sourdough                       │
│  Green Acres Bakery                 │
│  £4.50                              │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Made from:                         │
│  ├── Stoneground Flour              │
│  │   └── Valley Mill, Somerset      │
│  ├── Organic Wheat                  │
│  │   └── Green Acres Farm, Wales    │
│  │       ✓ Certified organic        │
│  │         Soil Association          │
│  │         Expires: Dec 2026        │
│  └── Water                          │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Reviews (4.8 ★, 23 reviews)       │
│  "Best sourdough in London" — Sarah │
│                                     │
│  [Order on FoodX]                   │
│                                     │
└─────────────────────────────────────┘
```

This page is generated by calling `explain()` on the block hash and rendering the result as HTML. The page is static, cacheable, and works in any browser.

## 5. Trust Bootstrapping

### 5.1 The Problem

The trust formula (technical whitepaper Section 6.3) produces zero for new participants. A new bakery with no certifications, no reviews, no orders, and no history has a trust score of zero. Zero-trust actors cannot participate in marketplaces that enforce minimum scores.

### 5.2 Genesis Trust

Every new actor starts with a base trust score derived from their onboarding actions:

| Onboarding Action | Trust Contribution | Rationale |
|-------------------|--------------------|-----------|
| Email verified | 0.5 | Minimal identity verification |
| Phone verified | 1.0 | Harder to fake than email |
| Payment method added (Stripe) | 2.0 | Economic identity, Stripe does KYC |
| Business registration linked | 3.0 | Legal entity verified |
| First product created | 0.5 | Active participant |
| Profile photo added | 0.5 | Social signal |

These are **not blocks in the trust formula**. They are a separate genesis trust score that decays as real trust accumulates. After 30 days or 10 verified transactions (whichever comes first), genesis trust is replaced entirely by the graph-computed trust score.

```
effective_trust = max(genesis_trust, graph_trust)
```

This ensures new participants can transact immediately while preventing genesis trust from being a permanent shortcut around real verification.

### 5.3 Vouching

An existing trusted actor can vouch for a new participant:

```json
{
  "type": "observe.vouch",
  "state": {
    "instance_id": "uuid",
    "confidence": "high",
    "relationship": "supplier_for_3_years",
    "note": "I've bought flour from them weekly since 2023"
  },
  "refs": { "voucher": "trusted_actor_hash", "subject": "new_actor_hash" }
}
```

Vouching transfers a fraction of the voucher's trust to the subject:

```
vouch_trust = voucher_trust * 0.15 * confidence_multiplier
```

Where `confidence_multiplier` is 1.0 for "high", 0.5 for "medium", 0.25 for "low".

A single vouch from a well-trusted actor (trust score 50) gives the new participant 7.5 points — enough to clear most marketplace minimums. Vouching is rate-limited: an actor can vouch for at most 5 new participants per month, preventing trust inflation.

### 5.4 Marketplace Onboarding

For marketplaces with minimum trust requirements, a graduated access model:

| Trust Level | Access |
|-------------|--------|
| 0 - 5 | Can create profile, list products. Cannot receive orders. Visible in search with "New" badge. |
| 5 - 15 | Can receive orders up to £50 per transaction. |
| 15 - 30 | Full transaction access. Eligible for featured placement. |
| 30+ | Trusted seller. Eligible for auto-approval on agent transactions. |

These thresholds are marketplace-level policy (stored as `observe.trust_policy` blocks), not protocol-level rules.

## 6. Encryption Standard

### 6.1 The Problem

The technical whitepaper Section 7.2 specifies `X25519-XSalsa20-Poly1305` (NaCl box). The SDK implements `X25519 + AES-256-GCM`. These are different algorithms with different security properties. The protocol must specify one canonical encryption scheme.

### 6.2 Decision: AES-256-GCM with X25519 Key Agreement

**Chosen standard:** X25519 for key agreement, AES-256-GCM for symmetric encryption.

**Rationale:**

| Property | XSalsa20-Poly1305 | AES-256-GCM |
|----------|-------------------|-------------|
| Hardware acceleration | Rare | Ubiquitous (AES-NI on all modern CPUs, ARM Cryptography Extensions) |
| Browser support | Requires libsodium WASM | Native WebCrypto API |
| Mobile support | Requires libsodium binding | Native on iOS (CryptoKit) and Android (javax.crypto) |
| Go support | golang.org/x/crypto | crypto/aes + crypto/cipher (stdlib) |
| Swift support | Requires CryptoSwift or libsodium | Apple CryptoKit (native) |
| FIPS compliance | No | Yes (FIPS 140-2) |
| Security margin | Both are considered secure | Both are considered secure |

AES-256-GCM is the pragmatic choice: native support across all target platforms (browser, iOS, Android, Go, Swift) without third-party dependencies. For a protocol that targets non-technical food businesses, minimising dependency chains matters.

### 6.3 Updated Algorithm Identifier

```json
{
  "_supplier_cost": {
    "alg": "x25519-aes-256-gcm",
    "recipients": [
      { "key_hash": "abc123...", "encrypted_key": "base64..." }
    ],
    "nonce": "base64_12_byte_nonce",
    "ciphertext": "base64_ciphertext_with_tag"
  }
}
```

The `alg` field is updated from `x25519-xsalsa20-poly1305` to `x25519-aes-256-gcm`. Implementations encountering the old algorithm identifier should support both for backwards compatibility during the 0.x development period. At version 1.0, only `x25519-aes-256-gcm` will be supported.

## 7. Inventory and Point-of-Sale Patterns

### 7.1 The Problem

Multiple devices (barista's phone, counter tablet, owner's laptop) may sell the same product simultaneously. The protocol's append-only model means you cannot decrement a counter atomically across devices. Without a conflict-free inventory model, simultaneous sales can oversell.

### 7.2 Event-Sourced Inventory

Inventory is never stored as a count. It is computed from events:

```
current_stock = initial_stock + sum(all restock deltas) - sum(all sale deltas)
```

Each sale creates a `transfer.order` block. Each restock creates a `transfer.restock` block. The current inventory is a read projection over these blocks.

### 7.3 The Sale Block (Inventory Perspective)

Every `transfer.order` implicitly decrements inventory. No separate inventory block is needed for sales:

```json
{
  "type": "transfer.order",
  "state": {
    "instance_id": "uuid",
    "items": [
      { "product": "sourdough_hash", "quantity": 2 }
    ]
  },
  "refs": { "buyer": "customer_hash", "seller": "bakery_hash" }
}
```

### 7.4 Restock Block

```json
{
  "type": "transfer.restock",
  "state": {
    "instance_id": "uuid",
    "product": "sourdough_hash",
    "quantity": 50,
    "note": "Morning bake"
  },
  "refs": { "seller": "bakery_hash", "product": "sourdough_hash" }
}
```

### 7.5 Inventory Projection

```sql
CREATE MATERIALIZED VIEW mv_inventory AS
SELECT
    p.hash AS product_hash,
    p.state->>'name' AS product_name,
    p.refs->>'seller' AS seller_hash,
    COALESCE(restocks.total, 0) - COALESCE(sales.total, 0) AS current_stock
FROM foodblocks p
LEFT JOIN (
    SELECT
        state->>'product' AS product_hash,
        SUM((state->>'quantity')::numeric) AS total
    FROM foodblocks
    WHERE type = 'transfer.restock' AND is_head = TRUE
    GROUP BY state->>'product'
) restocks ON restocks.product_hash = p.hash
LEFT JOIN (
    SELECT
        item->>'product' AS product_hash,
        SUM((item->>'quantity')::numeric) AS total
    FROM foodblocks,
        jsonb_array_elements(state->'items') AS item
    WHERE type = 'transfer.order' AND is_head = TRUE AND state->>'draft' IS NULL
    GROUP BY item->>'product'
) sales ON sales.product_hash = p.hash
WHERE p.type = 'substance.product' AND p.is_head = TRUE;
```

### 7.6 Oversell Prevention

The event-sourced model cannot prevent overselling at the protocol level (no global lock). Prevention happens at the application layer:

1. **Optimistic check**: before creating an order, query `mv_inventory` for current stock. If stock <= 0, reject.
2. **Race condition window**: between the check and the INSERT, another device may sell the last item. This window is typically < 100ms.
3. **Acceptance**: for most food businesses, occasional overselling is acceptable. The barista looks at the shelf and knows how many loaves are left. The system is a helper, not a gatekeeper.
4. **Alert on zero**: when the projection hits zero, push a notification to the seller: "Sourdough sold out. Mark as unavailable?"

For high-volume scenarios (online ordering for a busy restaurant), a Redis counter can provide a fast, atomic check:

```
DECR inventory:<product_hash>
if result < 0:
    INCR inventory:<product_hash>  // rollback
    reject order
```

The Redis counter is a cache, synchronised from the block graph. The blocks remain the source of truth.

### 7.7 Offline Sales

When a device is offline, it creates `transfer.order` blocks locally (offline queue). When connectivity returns, blocks sync via `/blocks/batch`. The inventory projection recalculates. If the total goes negative (two offline devices both sold the "last" item), an `observe.inventory_discrepancy` block is created automatically to flag the issue for the seller.

## 8. Federation Sync Protocol

### 8.1 The Problem

The technical whitepaper defines federation discovery (`.well-known/foodblock`) and cross-server resolution (try each server). It does not define how blocks replicate between servers, how conflicts are detected, or how bandwidth is managed.

### 8.2 Pull-Based Selective Sync

Federation uses pull-based sync. A server requests blocks from a peer that match its interests:

```
GET /blocks?type=substance.product&created_after=2026-02-19T00:00:00Z
Host: peer-server.com
FoodBlock-Version: 0.5
```

The requesting server stores blocks that match its peering criteria. Blocks that don't match are ignored.

### 8.3 Peering Configuration

Peering preferences are stored as a FoodBlock (self-describing):

```json
{
  "type": "observe.peering",
  "state": {
    "peer_url": "https://valleymill.com",
    "sync_types": ["substance.product", "observe.certification"],
    "sync_direction": "pull",
    "sync_interval_minutes": 60,
    "max_blocks_per_sync": 1000
  },
  "refs": { "author": "server_operator_hash" }
}
```

### 8.4 Sync Protocol

```
Server A (bakery)                    Server B (mill)

1. GET /.well-known/foodblock  →
                               ←     { version, types, count, peers }

2. GET /blocks?type=substance.product
      &created_after=<last_sync>
      &limit=1000               →
                               ←     [ block1, block2, ... ]

3. For each block:
   - Compute hash, verify it matches
   - Verify signature against author's public key
   - If hash exists locally, skip (dedup)
   - If hash is new, INSERT (standard trigger handles head resolution)

4. Store last_sync timestamp for this peer
```

### 8.5 Signature Verification for Federated Blocks

A block received from a peer may be signed by an actor unknown to the receiving server. The receiver must verify the signature, which requires the author's public key.

**Resolution order:**
1. Check local `foodblocks` table for the author's actor block (which contains `public_key_sign`)
2. If not found, request the author's actor block from the peer: `GET /blocks/<author_hash>`
3. If the peer doesn't have it, follow the author's actor hash to its origin server (if known)
4. If the public key cannot be resolved, store the block as unverified (`signature_verified = false`)

Unverified blocks are excluded from trust computation but remain in the graph for provenance traversal. They become verified when the author's public key is eventually resolved.

### 8.6 Malicious Server Protection

A malicious peer could serve blocks with forged signatures or fabricated actors. Protection:

1. **Signature verification** is mandatory for federated blocks. A block with an invalid signature is rejected.
2. **Actor verification** requires that the author's actor block is reachable and its public key matches the signature. Unknown authors are flagged.
3. **Trust-weighted peering**: blocks from actors with low trust scores are accepted but downweighted in queries and feeds.
4. **Rate limiting per peer**: a peer that sends an unusual volume of blocks is throttled.
5. **Manual peer approval**: servers only sync from explicitly approved peers (opt-in, not automatic).

## 9. Multi-Device Sync

### 9.1 The Problem

A user (seller or buyer) may use the FoodX app on multiple devices: phone at the market, tablet at the shop, laptop at home. These devices need a consistent view of their blocks.

### 9.2 Server as Sync Hub

All devices write blocks to the same server. The server is the source of truth. Device sync is achieved through the server, not peer-to-peer between devices.

```
Phone  ──write──→ Server ←──write── Tablet
  │                  │                 │
  └──subscribe───→ SSE/WS ←──subscribe─┘
```

Each device subscribes to the real-time event stream filtered by the user's actor hash. When one device creates a block, the other devices receive it via SSE/WebSocket within milliseconds.

### 9.3 Offline Device Sync

When a device comes back online after being offline:

1. Device sends its offline queue to the server via `/blocks/batch`
2. Device queries for blocks created since its last seen timestamp: `GET /blocks?refs.author=<my_hash>&created_after=<last_sync>`
3. Device reconciles its local cache with the server state

The content-addressable model makes reconciliation trivial: if the device has a block with hash X and the server has the same hash X, they are identical. No merge logic needed.

### 9.4 Conflict Between Devices

Two devices may create conflicting updates (e.g., both change the product price). The protocol's author-scoped update model handles this:

- Both updates have the same author (same user, different devices)
- Both reference the same predecessor via `refs.updates`
- The first to reach the server becomes the chain update
- The second arrives and, since the predecessor is no longer head, it forks

The server's event listener detects the fork and notifies the user: "You updated the sourdough price to £5.50 on your phone and £5.00 on your tablet. Which should we keep?" The user resolves it, creating a merge block.

For practical purposes, this is rare. Most users don't update the same field simultaneously on two devices.

## 10. Agent Routing Across Servers

### 10.1 The Problem

Agent-to-agent commerce (Section 11 of the technical whitepaper) assumes agents can discover each other. When agents are on different servers, the preference blocks that enable discovery are in separate databases.

### 10.2 Intent Broadcasting

When a buyer agent broadcasts an `observe.intent`, the server forwards it to peered servers:

```
Buyer agent creates observe.intent on Server A
    │
    ▼
Server A's event handler sees the intent
    │
    ├──→ Check local mv_agent_discovery for matches
    │
    └──→ POST /blocks to each peered server
         (forward the intent block)
```

Peered servers receive the intent, run their local sourcing-match handler, and create `observe.offer` blocks that reference the intent. These offers are synced back to Server A via the normal federation pull.

### 10.3 Latency Implications

Cross-server agent negotiation adds network latency at each step:

| Step | Intra-server | Cross-server |
|------|-------------|-------------|
| Intent → Match | ~100ms | ~500ms (forward intent + peer processes) |
| Match → Offer | ~100ms | ~500ms (offer syncs back) |
| Offer → Counter | ~100ms | ~500ms |
| Counter → Accept | ~100ms | ~500ms |

A full negotiation that takes ~400ms within a server takes ~2s across servers. This is acceptable for B2B procurement (where decisions take hours) but too slow for real-time consumer interactions.

**Implication:** Consumer-facing commerce (coffee shop, farmer's market) should happen within a single server. Cross-server agent commerce is for supply chain (bakery ↔ mill ↔ farm), where latency is acceptable.

### 10.4 Global Intent Index (Future)

For true global agent discovery, a shared intent index could aggregate `observe.intent` and `observe.preference` blocks from all participating servers. This is architecturally equivalent to a search engine crawling the federated network:

```
Server A ──publishes intents──→ Global Index ←──publishes offers── Server B
                                     │
                                     └──→ Creates observe.match blocks
                                           pushed to both servers
```

This introduces a centralised component, which contradicts the federation model. The resolution is to make the global index itself federated: multiple competing indexes, each crawling the network independently. Producers choose which indexes to register with. This mirrors how web search engines work — no single index owns the web.

This is a Phase 2 concern. Phase 1 operates within single servers and direct peering.

## 11. Performance at Scale

### 11.1 Block Ingestion Rate

Target: 1,000 blocks per second sustained (sufficient for a platform serving 10,000 active sellers).

**Bottleneck analysis:**

| Operation | Cost | Mitigation |
|-----------|------|------------|
| SHA-256 hash computation | ~1μs | Not a bottleneck |
| Canonical JSON serialization | ~10μs | Not a bottleneck |
| PostgreSQL INSERT + trigger | ~2ms | Connection pooling, prepared statements |
| GIN index update on refs | ~5ms | Partial indexes, deferred index updates |
| pg_notify | ~0.1ms | Not a bottleneck |
| Event handler dispatch | ~10ms | Async, non-blocking |
| MV refresh | ~500ms | Incremental, not per-block |

The critical path is the PostgreSQL INSERT with trigger. At 2ms per insert with connection pooling, a single database handles ~500 inserts/second. Scaling options:

1. **Write batching**: group blocks into batches of 10-50 and insert in a single transaction. Reduces per-block overhead.
2. **Partitioning**: partition the `foodblocks` table by type (or by time range). Each partition has smaller indexes.
3. **Read replicas**: route queries to read replicas. Writes go to primary.
4. **Sharding by actor**: for multi-tenant deployments, shard by `author_hash`. Each shard handles a subset of actors.

### 11.2 Materialized View Strategy

Full MV refresh is expensive. Replace with incremental updates:

**Trigger-based incremental MV:**

```sql
CREATE OR REPLACE FUNCTION update_mv_inventory() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'transfer.order' AND NEW.state->>'draft' IS NULL THEN
        -- Decrement inventory for each item in the order
        -- Update only the affected rows in the MV
    ELSIF NEW.type = 'transfer.restock' THEN
        -- Increment inventory for the restocked product
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This replaces `REFRESH MATERIALIZED VIEW CONCURRENTLY` (which rebuilds the entire view) with targeted row updates. The MV is always current, not eventually consistent.

For MVs that are too complex for trigger-based updates (e.g., `mv_feed` with engagement joins), use a hybrid approach:
- Trigger-based updates for the primary data
- Periodic refresh (every 60 seconds) for aggregated counts

### 11.3 Query Performance

**Common query patterns and their index strategies:**

| Query | Index | Expected Performance |
|-------|-------|---------------------|
| Get block by hash | PRIMARY KEY (hash) | O(1), <1ms |
| Get blocks by type | idx_fb_type_head WHERE is_head = TRUE | B-tree scan, <5ms for 100 results |
| Get blocks by author | idx_fb_author | B-tree scan, <5ms |
| Get blocks by ref | idx_fb_refs GIN | GIN scan, <10ms |
| Full-text search | idx_fb_search_vector GIN | GIN scan, <20ms |
| Spatial query (nearby) | idx_fb_geo GIST | GIST scan, <10ms |
| Provenance chain | Recursive CTE on refs->>'updates' | Depth * 1ms |
| Provenance tree | Recursive CTE on all refs | Branching factor * depth * 1ms |

For provenance trees deeper than 20 levels, implement a depth limit and paginate. Most food supply chains are 5-8 levels deep (farm → processor → distributor → retailer → consumer).

### 11.4 Storage Growth

**Estimated block sizes:**

| Block Type | Average State Size | With Indexes | Per Day (active seller) |
|-----------|-------------------|-------------|----------------------|
| transfer.order | 200 bytes | 400 bytes | 20-50 orders |
| substance.product | 300 bytes | 500 bytes | 1-5 updates |
| observe.review | 250 bytes | 450 bytes | 5-20 reviews received |
| observe.reading (IoT) | 100 bytes | 250 bytes | 1000+ per sensor |

**Growth estimate for 10,000 sellers:**

- ~100,000 blocks per day (orders, products, reviews)
- ~50MB per day (with indexes)
- ~18GB per year
- With IoT sensors: 10x higher

PostgreSQL handles this comfortably. The snapshot mechanism (technical whitepaper Section 28) enables archival of old blocks to cold storage when the active dataset exceeds target size.

## 12. Security Considerations

### 12.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Block forgery | Ed25519 signatures; any party can verify authorship |
| Block tampering | Content-addressable identity; any modification changes the hash |
| Replay attacks | `instance_id` (UUID v4) ensures unique blocks for events |
| Sybil attacks (fake actors) | Economic proof (verified orders), graph independence analysis |
| Key compromise | Key rotation protocol (Section 2.5); compromised keys are revocable |
| Data exfiltration | Field-level encryption; encrypted fields are opaque without the key |
| Denial of service | Rate limiting per IP, per actor, per agent |
| Man-in-the-middle | TLS for all server communication; signatures verify authorship independently of transport |
| Malicious federation peer | Signature verification, trust-weighted acceptance, manual peer approval |

### 12.2 Private Key Protection

**Server-side (agent keys):**
- Agent private keys are encrypted with AES-256-GCM using a key derived from the server's master secret
- The master secret is stored in a secrets manager (AWS Secrets Manager, Doppler, HashiCorp Vault), never in code or environment variables
- Keys are decrypted in memory only when signing, then cleared

**Client-side (user keys):**
- Private keys are encrypted at rest using a key derived from the user's authentication credential (Section 2.3)
- On iOS: Keychain with biometric protection
- On Android: Android Keystore with StrongBox (hardware-backed when available)
- On web: encrypted IndexedDB, key derived from password via PBKDF2

### 12.3 Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Per IP (unauthenticated) | 60 requests | 1 minute |
| Per actor (authenticated) | 300 requests | 1 minute |
| Per agent | Declared in agent's `rate_limit_per_hour` | 1 hour |
| Block creation per actor | 100 blocks | 1 minute |
| Batch sync | 1000 blocks per request | Per request |
| Federation sync per peer | 10,000 blocks | 1 hour |

## 13. Implementation Phases

### Phase 1: Single Server (Now)

- One server, one database
- Consumer identity with custodial keys
- Payment via Stripe Connect (settlement chain)
- Real-time via SSE/WebSocket
- QR codes resolving to provenance pages
- Trust bootstrapping with genesis trust + vouching
- Inventory via event-sourced projection

### Phase 2: Multi-Tenant (3-6 months)

- Multiple sellers on one server
- Agent-to-agent commerce within the server
- Tab model for walk-in commerce
- NFC stickers for venues
- Mobile app (iOS + Android)
- Incremental MV updates

### Phase 3: Federation (6-12 months)

- Pull-based selective sync between servers
- Cross-server agent intent broadcasting
- Federated block resolution (`fb.link`)
- Per-device key management
- Snapshot archival for storage management

### Phase 4: Global Network (12+ months)

- Global intent index (federated search)
- IoT sensor integration (cold chain, smart fridges)
- Zero-knowledge compliance proofs
- Plugin marketplace for extensions
- Regional server deployments

## 14. Open Questions

The following questions are identified but not resolved in this paper:

1. **Regulatory classification**: Is a tab pre-authorization a financial service requiring PSD2 / e-money licensing?
2. **Liability for agent actions**: When an agent auto-approves an order that the operator didn't want, who is liable?
3. **Cross-border payments**: The settlement chain assumes a single payment processor. Multi-currency, multi-processor settlement needs design.
4. **Offline payment**: The tab model requires a pre-authorization, which requires connectivity. True offline payment (no network at all) may require a different model.
5. **Block size limits**: Should the protocol enforce a maximum state size? Large blocks (images, documents) could bloat storage.
6. **Hash algorithm migration**: If SHA-256 is ever compromised, migrating content-addressed identity is a protocol-breaking change. The version migration strategy (technical whitepaper Section 15.4) applies but the practical cost is enormous.

---

*This implementation paper is a living document. It will be updated as design decisions are validated through deployment.*

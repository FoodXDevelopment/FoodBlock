# FoodBlock + FoodX Backend — Architecture Reference

**Last updated: February 2026**

This document describes the full system architecture for anyone working on the codebase — human or AI agent. Read this before making changes.

---

## Repositories

| Repo | Purpose | Location (Air) |
|------|---------|---------------|
| `foodblock` | Protocol SDK, whitepaper, MCP server, sandbox, reference server | `~/repos/foodblock` |
| `Backend` | Production backend — Express.js, PostgreSQL, Stripe, agents | `~/repos/Backend` |
| `foodx-webapp` | Next.js frontend web app | `~/repos/foodx-webapp` |
| `FoodX-Operationals` | Workshops, ops scripts | `~/repos/FoodX-Operationals` |

---

## System Architecture

```
EXTERNAL SYSTEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Shopify    Square    IoT Sensors    Stripe    Social Media
     │          │          │            │           │
     ▼          ▼          ▼            ▼           ▼
┌─────────────────────────────────────────────────────────┐
│              ADAPTER AGENTS LAYER                        │
│                                                          │
│  Each external system gets an actor.agent that bridges   │
│  platform events into FoodBlocks and vice versa.         │
│                                                          │
│  - OAuth/API credentials stored in agent memory          │
│  - Mapping config: platform entity → FoodBlock type      │
│  - Bidirectional: events flow both ways                  │
│  - Standard draft/approve for high-value ops             │
└───────────────────────┬─────────────────────────────────┘
                        │ INSERT block
                        ▼
┌─────────────────────────────────────────────────────────┐
│                   FOODBLOCK CORE                         │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  PostgreSQL: foodblocks table                      │  │
│  │                                                     │  │
│  │  Columns: hash (PK), type, state (JSONB),          │  │
│  │           refs (JSONB), author_hash, signature,     │  │
│  │           chain_id, is_head, created_at,            │  │
│  │           protocol_version, visibility              │  │
│  │                                                     │  │
│  │  Triggers:                                          │  │
│  │    BEFORE INSERT: fb_on_insert()                    │  │
│  │      - Computes chain_id                            │  │
│  │      - Author-scoped head resolution                │  │
│  │      - Fork detection for different authors         │  │
│  │    AFTER INSERT: notify_new_block()                 │  │
│  │      - pg_notify('new_block', {hash,type,...})      │  │
│  │    AFTER INSERT (tombstone): fb_on_tombstone()      │  │
│  │      - Erases target block state                    │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                                │
│                         │ NOTIFY 'new_block'             │
│                         ▼                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  EVENT BUS                                         │  │
│  │                                                     │  │
│  │  Listener: dedicated pg connection for LISTEN       │  │
│  │  Dispatch: pattern-match block type → handlers      │  │
│  │  Patterns: exact, prefix (transfer.*), wildcard (*) │  │
│  │  Execution: fire-and-forget (async, non-blocking)   │  │
│  │  Reconnect: auto-retry on connection loss (5s)      │  │
│  └──────────┬──────────┬──────────┬──────────────────┘  │
│             │          │          │                      │
│             ▼          ▼          ▼                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  EVENT HANDLERS (registered at server startup)    │   │
│  │                                                    │   │
│  │  transfer.order    → order-notify                  │   │
│  │  transfer.*        → order-notify-all              │   │
│  │  substance.*       → sourcing-match                │   │
│  │  observe.cert      → trust-refresh                 │   │
│  │  observe.review    → trust-refresh                 │   │
│  │  transfer.order    → trust-refresh                 │   │
│  │                                                    │   │
│  │  Handler actions:                                  │   │
│  │    - Notify seller's agent of new orders           │   │
│  │    - Match supply to demand (sourcing)             │   │
│  │    - Refresh trust materialized view               │   │
│  │    - Create reactive blocks (observe.match, etc.)  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AGENT RUNTIME                                     │  │
│  │                                                     │  │
│  │  Registry (services/agent-runtime/registry.js)      │  │
│  │    - Create actor.agent FoodBlock + Ed25519 keypair │  │
│  │    - Store in agent_registrations table              │  │
│  │    - Lookup, list, deactivate agents                │  │
│  │                                                     │  │
│  │  Permissions (services/agent-runtime/permissions.js) │  │
│  │    Layer 1: Capability — block type allowed?         │  │
│  │    Layer 2: Amount — within max_amount?              │  │
│  │    Layer 3: Rate — within hourly limit? (Redis)      │  │
│  │                                                     │  │
│  │  Approval (services/agent-runtime/approval.js)      │  │
│  │    - createAgentDraft() → permission check           │  │
│  │    - If amount < auto_approve_under → auto-approve   │  │
│  │    - Else → pending in agent_drafts table            │  │
│  │    - approveDraft() → creates confirmed block        │  │
│  │    - rejectDraft() → marks rejected                  │  │
│  │                                                     │  │
│  │  Memory (services/agent-runtime/memory.js)          │  │
│  │    - Stored as observe.preference FoodBlocks         │  │
│  │    - Traceable via refs.derived_from                 │  │
│  │    - GDPR-erasable via tombstone                     │  │
│  │    - Visibility: internal (not in feeds)             │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  API SURFACE                                       │  │
│  │                                                     │  │
│  │  REST API (Express.js)                              │  │
│  │    /api/v1/foodblock/*  — block CRUD, query, chain  │  │
│  │    /api/v1/agents/*     — agent registry, drafts    │  │
│  │    /api/v1/orders/*     — order management          │  │
│  │    /api/v1/payments/*   — Stripe Connect            │  │
│  │    /api/v1/webhooks/*   — outbound webhook mgmt     │  │
│  │    /api/v1/apikeys/*    — API key management        │  │
│  │                                                     │  │
│  │  WebSocket (Socket.IO)                              │  │
│  │    - Real-time order updates                        │  │
│  │    - Chat messaging                                 │  │
│  │                                                     │  │
│  │  MCP Server (@foodxdev/foodblock-mcp)               │  │
│  │    - 12 tools for AI agent interaction              │  │
│  │    - Connects to FOODBLOCK_URL (default: api.foodx) │  │
│  │    - Claude Desktop / Claude Code compatible        │  │
│  │                                                     │  │
│  │  Outbound Webhooks                                  │  │
│  │    - HMAC-SHA256 signed                             │  │
│  │    - Events: block.created, block.updated           │  │
│  │    - 3 retries with exponential backoff             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
              │                │              │
              ▼                ▼              ▼
        Web App           iOS App       MCP Clients
        (Next.js)         (Swift)       (Claude, etc.)
```

---

## Key File Paths

### FoodBlock Protocol (`~/repos/foodblock`)

| File | Purpose |
|------|---------|
| `spec/whitepaper.md` | Protocol specification (v0.4) |
| `sdk/javascript/src/` | JS SDK — create, hash, chain, sign, agent, query |
| `sdk/python/foodblock/` | Python SDK — full parity with JS |
| `sdk/go/foodblock.go` | Go SDK — core ops (create, hash) |
| `sdk/swift/Sources/` | Swift SDK — core ops (create, hash) |
| `mcp/server.js` | MCP server — 12 tools for AI agents |
| `server/index.js` | Production Express server + PostgreSQL |
| `sandbox/server.js` | Zero-dependency local server (in-memory) |
| `sandbox/seed.js` | Sample bakery supply chain (32 blocks) |
| `sql/schema.sql` | PostgreSQL schema + triggers |
| `test/vectors.json` | Cross-language test vectors (100+) |

### Backend (`~/repos/Backend`)

| File | Purpose |
|------|---------|
| `src/server.js` | Entry point — registers event handlers, starts listener |
| `src/app.js` | Express setup — mounts all routes |
| `src/routes/foodblock-routes.js` | FoodBlock CRUD API (largest route file) |
| `src/routes/foodblock-helpers.js` | Shared helpers — createBlock, insertBlock, getUserHash, enrichBlocks |
| `src/routes/agents/registry.js` | Agent CRUD routes |
| `src/routes/agents/drafts.js` | Draft create/approve/reject routes |
| `src/routes/agents/memory.js` | Agent memory routes |
| `src/routes/webhook-routes.js` | Outbound webhook management |
| `src/routes/apikey-routes.js` | API key lifecycle |
| `src/routes/orders/index.js` | Order management |
| `src/services/stripe-service.js` | Stripe Connect + payment processing |
| `src/services/block-events/listener.js` | PostgreSQL LISTEN/NOTIFY client |
| `src/services/block-events/subscriptions.js` | Handler registry + pattern matching |
| `src/services/block-events/handlers/order-notify.js` | Reacts to transfer.order |
| `src/services/block-events/handlers/sourcing-match.js` | Matches supply to demand |
| `src/services/block-events/handlers/trust-refresh.js` | Refreshes trust materialized view |
| `src/services/agent-runtime/registry.js` | Agent creation + lookup |
| `src/services/agent-runtime/permissions.js` | 3-layer permission checks |
| `src/services/agent-runtime/approval.js` | Draft → approve/reject workflow |
| `src/services/agent-runtime/memory.js` | Agent memory as FoodBlocks |
| `src/middleware/verify.js` | Cognito JWT verification |
| `src/middleware/agent-permissions.js` | Agent auth middleware |
| `src/middleware/api_key.js` | API key verification + scoping |
| `src/config/pgdb.js` | PostgreSQL connection pool |
| `src/config/redisConfig.js` | Redis client with fallback |

---

## Database Tables (Key)

| Table | Purpose |
|-------|---------|
| `foodblocks` | Core protocol storage — hash, type, state, refs |
| `users` | User accounts — includes `foodblock_hash` linking to actor block |
| `agent_registrations` | Agent identity, keypairs, permissions, limits |
| `agent_drafts` | Pending/approved/rejected agent drafts |
| `agent_subscriptions` | What block types each agent listens to |
| `orders` | Customer orders (order_number, status, amounts) |
| `payments` | Stripe payment records |
| `sellers` | Seller profiles |
| `stripe_accounts` | Seller Stripe Connect accounts |
| `webhook_subscriptions` | Outbound webhook endpoints |
| `webhook_deliveries` | Delivery logs with retry tracking |
| `api_keys` | User API keys (hashed, scoped) |
| `foodblock_engagement` | Reaction/save/comment counts |
| `mv_actor_trust` | Materialized view — computed trust scores |

---

## Event Flow (How Blocks Propagate)

```
1. Block created (SDK create() or API POST /blocks)
         │
2. INSERT INTO foodblocks
         │
3. BEFORE INSERT trigger: fb_on_insert()
   - Compute chain_id (inherit from predecessor or use own hash)
   - Author-scoped head resolution
   - Fork detection for different authors
         │
4. AFTER INSERT trigger: notify_new_block()
   - pg_notify('new_block', { hash, type, author_hash, ... })
         │
5. Event listener receives notification
   - Dedicated pg client on LISTEN channel
         │
6. Pattern matching: getMatchingHandlers(blockType)
   - 'transfer.order' matches → [order-notify, trust-refresh]
   - 'substance.*' matches → [sourcing-match]
   - 'observe.review' matches → [trust-refresh]
         │
7. Handlers execute (fire-and-forget, async)
   - order-notify: check for seller's agent, trigger notification
   - sourcing-match: find matching agent preferences, create observe.match
   - trust-refresh: debounce + REFRESH MATERIALIZED VIEW
         │
8. Handler creates new block → back to step 1 (chain reaction)
```

---

## Agent Permissions Model

```
Request to create block
         │
         ▼
┌─ Layer 1: CAPABILITY ─────────────────────────┐
│  Does agent's capabilities[] include this type? │
│  Supports wildcards: transfer.* matches         │
│  transfer.order, transfer.shipment, etc.        │
│  If NO → reject                                 │
└────────────────────────┬────────────────────────┘
                         │ YES
                         ▼
┌─ Layer 2: AMOUNT ──────────────────────────────┐
│  Is state.amount/total/price within max_amount? │
│  If NO → reject                                 │
└────────────────────────┬────────────────────────┘
                         │ YES
                         ▼
┌─ Layer 3: RATE ────────────────────────────────┐
│  Has agent exceeded rate_limit_per_hour?        │
│  Tracked in Redis (1hr TTL key per agent)       │
│  If NO → reject                                 │
└────────────────────────┬────────────────────────┘
                         │ YES
                         ▼
┌─ AUTO-APPROVE CHECK ───────────────────────────┐
│  Is amount < auto_approve_under?                │
│  Non-monetary blocks auto-approve if threshold>0│
│                                                  │
│  YES → create confirmed block immediately        │
│  NO  → create draft, queue for human approval    │
└─────────────────────────────────────────────────┘
```

---

## Agent-to-Agent Commerce Flow

```
BUYER AGENT                    SELLER AGENT              OPERATOR
     │                              │                        │
     │ observe.intent               │                        │
     │ "need 50kg flour"            │                        │
     ├──────── block inserted ──────►                        │
     │                              │                        │
     │              sourcing-match  │                        │
     │              handler fires   │                        │
     │                              │                        │
     │                observe.offer │                        │
     │◄──────── block inserted ─────┤                        │
     │                              │                        │
     │ transfer.order (DRAFT)       │                        │
     │ "50kg @ £2/kg = £100"        │                        │
     ├──────── block inserted ───────────────────────────────►
     │                              │                        │
     │                              │          Push notification:
     │                              │          "Approve £100 order?"
     │                              │                        │
     │                              │          [Approve] ────►
     │                              │                        │
     │ transfer.order (CONFIRMED)   │                        │
     │◄─────────────────────────────┼────── block inserted ──┤
     │                              │                        │
     │              order-notify    │                        │
     │              handler fires   │                        │
     │                              │                        │
     │          transfer.shipment   │                        │
     │◄──────── block inserted ─────┤                        │
     │                              │                        │
     │                   observe.reading (IoT)               │
     │◄──────── temp: 4.2°C ────────┤                        │
     │                              │                        │
     │ observe.receipt              │                        │
     │ "accepted, quality: good"    │                        │
     ├──────── block inserted ──────►                        │
     │                              │                        │
```

---

## Authentication

| Method | Use Case | Implementation |
|--------|----------|---------------|
| Cognito JWT | Web/mobile app users | `verifyTokens` middleware — access + ID tokens |
| API Key | Programmatic access | `fb_live_` / `fb_test_` prefix, bcrypt hashed, scoped (read/write/admin) |
| Flex Auth | FoodBlock public endpoints | Accepts either Cognito JWT OR API key |
| Agent Keypair | Agent-signed blocks | Ed25519, stored in agent_registrations |

---

## External Integrations (Existing)

| Service | Purpose | Config |
|---------|---------|--------|
| **Stripe** | Payments, Connect accounts, subscriptions | `STRIPE_SECRET_KEY` |
| **AWS Cognito** | User auth, JWT | `COGNITO_USER_POOL_ID`, `CLIENT_ID` |
| **AWS S3** | File storage | `S3_BUCKET_*` |
| **BunnyCDN** | Media delivery | `BUNNY_*` |
| **Redis** | Rate limiting, caching | `REDIS_HOST`, optional (`REDIS_DISABLED`) |
| **Instagram** | Business accounts, content | OAuth, `INSTAGRAM_*` |
| **Facebook** | Pages, messaging | OAuth, `FACEBOOK_*` |
| **TikTok** | Content, video | OAuth, `TIKTOK_*` |
| **Twitter/X** | Posting, reading | OAuth, `TWITTER_*` |
| **Pinterest** | Pins, boards | OAuth, `PINTEREST_*` |
| **YouTube** | Video upload | OAuth, `YOUTUBE_*` |
| **Google Gemini** | Video/recipe analysis | Service account via S3 |
| **Perplexity** | Product research | `PERPLEXITY_API_KEY` |

---

## Build Order (Current Plan)

### Phase 1: Wire What Exists
1. **Stripe auto-bridge** — Add `createBlock('transfer.order', ...)` to `handlePaymentSucceeded()` in stripe-service.js. Every Stripe payment auto-creates a FoodBlock. Zero user effort.
2. **Complete handler reactivity** — order-notify triggers seller's agent, sourcing-match creates observe.match blocks, trust-refresh already works.
3. **Add transfer.order to VALID_TYPES** in foodblock-helpers.js.

### Phase 2: Agent Discovery
4. **Discovery materialized view** — Index active observe.preference blocks by category, role, location.
5. **Sourcing match creates blocks** — When supply matches demand, create observe.match blocks linking both parties.

### Phase 3: External Adapters
6. **Adapter framework** — Standard pattern for external system agents (OAuth, mapping config, bidirectional sync).
7. **Shopify MCP tools** — Agent reads Shopify catalog/orders, creates FoodBlocks.
8. **Square MCP tools** — Agent bridges Square POS transactions.

### Phase 4: Consumer Experience
9. **QR trace page** — Public URL rendering visual provenance trees.
10. **Business-type onboarding** — One choice creates actor + agent + preferences.
11. **Push notification approvals** — Mobile-first agent control.

---

## Design Principles

1. **FoodBlock is the universal bus.** Blocks are messages, state, events, and audit trail. No separate message queue.
2. **PostgreSQL is the backbone.** ACID, LISTEN/NOTIFY, JSONB, GIN indexes, materialized views, triggers. One system to operate.
3. **Agents are first-class.** Every business gets an agent with identity, permissions, memory. Human oversight via draft/approve.
4. **Event-driven, not request-response.** Agents create blocks → events propagate → other agents react. Fully decoupled.
5. **Discovery via blocks.** Agents publish preferences. Other agents query them. The protocol IS the directory.
6. **Progressive trust.** Start with human approval for everything. Auto-approve threshold grows organically.
7. **Non-technical users never see the protocol.** They see notifications, tap approve/reject, scan QR codes, talk to Claude.

---

*This document is the source of truth for the FoodBlock + FoodX system architecture. Update it when the architecture changes.*

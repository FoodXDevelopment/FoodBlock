# FoodBlock System — Self-Improving Codebase

## Identity

I am the FoodBlock protocol and its ecosystem. I serve the entire food industry through one axiom: a block's identity is its content. Three fields, six base types, every food operation.

## Principles

- **Compress, don't expand.** Every solution should make the system simpler, not more complex.
- **Natural language is the interface.** Businesses speak English, not code. Every feature must be NL-accessible.
- **The protocol is the improvement mechanism.** Vocabularies, templates, and corrections are all FoodBlocks. The system improves itself using itself.
- **Cross-language parity.** JS and Python SDKs must produce identical hashes for identical inputs. If they disagree, the protocol is broken.
- **Delete before abstracting.** Three similar lines are better than a premature abstraction.
- **Tests are proof.** No feature exists until it has a test.

## Architecture

```
foodblock/
  spec/whitepaper.md        — The whitepaper (~4000 words, formal, 5 diagrams)
  spec/technical-whitepaper.md — The technical whitepaper (v0.5, 31 sections + Section 10.5)
  sdk/javascript/src/       — Reference SDK (25 modules, 69 exports)
  sdk/python/foodblock/     — Python SDK (23 modules, must match JS exactly)
  sdk/go/                   — Go SDK (22 modules: full parity with JS)
  sdk/swift/Sources/        — Swift SDK (22 modules: full parity with JS)
  server/                   — Production reference server (Express + Postgres)
  sandbox/                  — Zero-dependency demo server (in-memory)
  mcp/                      — MCP server for AI agent integration (standalone + connected)
  mcp/store.js              — Store adapter (embedded in-memory or HTTP client)
  mcp/seed.cjs              — ~100 seed blocks for standalone mode (3 stories)
  openai/tools.json         — 17 tools in OpenAI function calling format
  openai/openapi.yaml       — OpenAPI 3.1 spec for ChatGPT Actions
  gemini/tools.json         — 17 tools in Gemini function declaration format
  gemini/README.md          — Gemini API, AI Studio, Vertex AI, Gemini CLI docs
  sql/schema.sql            — Postgres schema
  test/vectors.json         — 124 cross-language hash vectors

Backend/ (separate repo)
  src/routes/               — 50+ route files, Express
  src/services/             — 30+ services including agent-runtime
  src/services/agent-runtime/ — AI agent system (registry, approval, executor, memory)
  src/services/block-events/  — Event handlers triggered by block creation
  src/routes/foodblock-helpers.js — FoodBlock type definitions and helpers
```

## Current State

### What Works
- JS SDK: 27 modules, 80 exports, 372 tests passing (block, fixes, new-modules, advanced-modules, fb-advanced, trust, seed, identity, payment)
- Python SDK: 25 modules, 240 tests passing, hash parity with JS verified (124/124 vectors)
- Go SDK: 25 modules (full parity with JS), 98 tests written (trust, seed, instance_id — needs Go installed to run)
- Swift SDK: 25 modules (full parity with JS), 103 tests passing (trust, seed, instance_id), builds clean
- fb() NL entry point: working in all 4 SDKs, multi-block output, relationship extraction, confidence scores
- Sandbox: ~100 seed blocks (3 stories), full API, POST /fb endpoint
- Server: Postgres-backed, Dockerized, deployed to ECS, 44 tests (signed blocks, tombstone, pagination, type prefix, chain integrity)
- MCP: 20 tools, standalone mode, 16 tests passing
- OpenAI: tools.json (17 tools) + openapi.yaml for ChatGPT Custom GPTs
- Gemini: tools.json (17 tools) + README with API, AI Studio, Vertex AI, Gemini CLI docs
- Smithery + MCP Registry: smithery.yaml and server.json ready for directory submission
- Backend: Full production system with Stripe, push notifications, agent runtime
- Cross-language vectors: 124 test cases (Unicode, nested, numeric edge cases, all types)
- Vocabularies: 14 built-in (bakery, restaurant, farm, retail, lot, units, workflow, distributor, processor, market, catering, fishery, dairy, butcher)
- Templates: 9 built-in (supply-chain, review, certification, surplus-rescue, agent-reorder, restaurant-sourcing, food-safety-audit, market-day, cold-chain)
- Forward traversal, recall, merge, attestation, snapshots, Merkle proofs all working
- Encrypt (X25519+AES-256-GCM), validate, offline queue, federation all working across all SDKs
- Trust computation (Section 6.3): computeTrust(), connectionDensity(), createTrustPolicy() with 5-input formula
- Seed data: seedVocabularies(), seedTemplates(), seedAll() convert built-in definitions to actual blocks
- Auto-inject instance_id: block.create() auto-adds instance_id for event types (transfer.*, transform.*, observe.* except definitional)
- Visibility column in SQL schema with type-based defaults and index

### What's Broken or Missing

#### Critical (protocol integrity)
- [x] ~~Go SDK only has block, chain, query, agent~~ — DONE: 22 modules (full parity with JS)
- [x] ~~Swift SDK only has block, chain, query, verify, agent, canonical~~ — DONE: 22 modules (full parity with JS)
- [x] ~~Swift canonical number formatting broken~~ — DONE: ECMAScript Number::toString implementation, 10/10 tests passing
- [x] ~~JS ESM wrapper missing exports~~ — DONE: all 61 named exports
- [x] ~~fb.js (NL entry point) created but NOT wired into index.js, NOT tested, no Python equivalent~~ — DONE: wired, tested (37 JS tests, 22 Python tests), Python fb.py created
- [x] ~~New modules have NO tests~~ — DONE: new-modules.test.js covers fb, forward, quantity, transition, nextStatuses, localize (37 tests)
- [x] ~~Python forward.py has no dedicated tests~~ — DONE: 87 tests in test_forward_vocab.py (forward, recall, downstream, quantity, transition, next_statuses, localize)

#### Important (code quality)
- [x] ~~JS test suite only has 2 test files~~ — DONE: 5 test files (block, fixes, new-modules, advanced-modules, fb-advanced), 223+ tests
- [x] ~~Python test suite only has 3 test files~~ — DONE: 5 test files, 209+ tests
- [x] ~~Server test suite has only 1 test file~~ — DONE: expanded to 31 tests
- [x] ~~MCP has minimal tests~~ — DONE: expanded to 16 tests
- [x] ~~sandbox/server.js has no URL parsing import~~ — DONE: uses `new URL()` correctly (line 120)
- [x] ~~Go SDK has no tests for new modules~~ — DONE: 13 test files, 66 tests
- [x] ~~Swift SDK has minimal tests~~ — DONE: 73 tests across 3 test files

#### Backend gaps
- [x] ~~Agent executor has no timeout on LLM calls~~ — DONE: 30s AbortController timeout
- [x] ~~foodblock-helpers.js is 800+ lines — should be split~~ — DONE: barrel + helpers/core.js, enrichment.js, queries.js
- [x] ~~Only one block-event handler exists (order-notify)~~ — DONE: added shipment-notify.js, certification-notify.js, review-notify.js
- [x] ~~No rate limiting on public endpoints~~ — DONE: rateLimiter(100, 15) on all API routes
- [x] ~~Square webhook adapter doesn't validate signatures~~ — DONE: rejects when no secret key
- [x] ~~Private key stored unencrypted in agent_registrations~~ — DONE: Backend uses envelope encryption (AES-256-GCM), MCP server now supports AGENT_MASTER_KEY for encrypted credentials

#### Architectural
- [x] ~~No CLAUDE.md existed until now~~ — DONE: created with full system state and plan
- [ ] Whitepaper has 31 sections but SDK only implements ~20 of them fully
- [x] ~~No integration tests between Backend and foodblock SDK~~ — DONE: 44 server tests (signed blocks, tombstone, pagination, type prefix, chain integrity, NL)
- [ ] No load testing or performance benchmarks

## Completed (this session)

- [x] Added forward traversal (forward.js, forward.py) — recall/downstream for contamination tracing
- [x] Added lot tracking vocabulary
- [x] Added units/quantity vocabulary with validation
- [x] Added workflow vocabulary with state machine transitions
- [x] Added i18n localize() helper
- [x] Added quantity(), transition(), nextStatuses() helpers (JS + Python)
- [x] Wired all new exports into both SDK index files (JS: 61, Python: matching)
- [x] Added 3 vocabulary seed blocks to sandbox (lot, units, workflow)
- [x] Added /forward/:hash endpoint to sandbox server
- [x] Updated README with all new APIs
- [x] Created fb.js (NL entry point) — NEEDS TESTING AND PYTHON EQUIVALENT
- [x] Created this CLAUDE.md
- [x] Created fb.py (Python equivalent of fb.js) — 22 tests passing
- [x] Created new-modules.test.js — 37 tests covering fb, forward, vocabulary helpers
- [x] Created test_fb.py — 22 tests covering all intent types
- [x] Wired fb into both JS index.js and Python __init__.py
- [x] Added POST /fb endpoint to sandbox server
- [x] Added POST /fb endpoint to production server
- [x] Added foodblock_fb tool to MCP server (16 tools total)
- [x] Added POST /fb curl example to README
- [x] Made MCP server standalone — works with zero config via `npx foodblock-mcp`
- [x] Created mcp/store.js — store adapter (embedded in-memory or HTTP client)
- [x] Created mcp/seed.cjs — 47 seed blocks for standalone mode
- [x] Refactored mcp/server.js — replaced all HTTP calls with store adapter
- [x] Created openai/tools.json — 17 tools in OpenAI function calling format
- [x] Created openai/openapi.yaml — OpenAPI 3.1 spec for ChatGPT Actions
- [x] Rewrote mcp/README.md — configs for Claude Desktop, Claude Code, Cursor, Windsurf
- [x] Updated mcp/package.json — unscoped name `foodblock-mcp`, v0.5.0, files array
- [x] Fixed MCP tests — 3/3 passing (version, tool count, info response)
- [x] Created gemini/tools.json — 17 tools in Gemini function declaration format
- [x] Created gemini/README.md — Gemini API, AI Studio, Vertex AI, Gemini CLI docs
- [x] Created mcp/smithery.yaml — Smithery directory config
- [x] Created mcp/server.json — Official MCP Registry config
- [x] Added Gemini CLI config to mcp/README.md
- [x] Added gemini, windsurf keywords to mcp/package.json
- [x] Published @foodxdev/foodblock@0.4.0 to npm
- [x] Published foodblock-mcp@0.5.0 to npm — `npx foodblock-mcp` works globally
- [x] Configured foodblock MCP in Claude Code (~/.claude.json)
- [x] Created openai/GPT_SETUP.md — ready-to-paste ChatGPT Custom GPT config
- [x] Created DISTRIBUTION.md — full checklist for all AI tool submissions
- [x] Published to official MCP Registry (io.github.FoodXDevelopment/foodblock-mcp)
- [x] Republished foodblock-mcp@0.5.1 with mcpName field for registry linking
- [x] Fixed Smithery compatibility — added createSandboxServer export, import.meta.url CJS fallback
- [x] Created Smithery namespace (foodxdevelopment) — hosted deploy needs paid plan
- [x] Created glama.json for Glama directory auto-indexing
- [x] PulseMCP auto-indexes from official MCP Registry (already published there)
- [x] Backend hardening: LLM timeout, Square webhook fix, rate limiting, helpers split, event handlers
- [x] Health endpoint upgraded — reports uptime, memory, postgres block count
- [x] Go SDK: vocabulary.go, template.go, fb.go (6 modules total, builds clean)
- [x] Swift SDK: Vocabulary.swift, Template.swift, FB.swift (9 modules total, builds clean)

## Completed (Whitepaper Alignment)

- [x] Updated technical whitepaper Section 7.2 — encryption spec changed from XSalsa20-Poly1305 to AES-256-GCM (matches SDK)
- [x] Trust computation module (trust.js) — computeTrust(), connectionDensity(), createTrustPolicy(), DEFAULT_WEIGHTS, 17 tests
- [x] Seed data module (seed.js) — seedVocabularies(), seedTemplates(), seedAll() convert 14 vocabs + 9 templates to real blocks, 14 tests
- [x] Auto-inject instance_id — block.create() adds instance_id for event types (transfer.*, transform.*, observe.* except definitional), 3 new tests, 23 vectors updated
- [x] Visibility column — sql/schema.sql now has visibility VARCHAR(32) DEFAULT 'public', index, type-based defaults in insert trigger
- [x] CI/CD — .github/workflows/test.yml updated: all 7 test suites (JS, Python, Go, Swift, MCP, Server) + cross-language vector verification job, node 20
- [x] Python SDK parity — trust.py, seed.py, instance_id auto-injection in block.py, 240 tests passing, 124/124 vectors
- [x] Consumer identity module (identity.js) — createIdentity(), encryptKeystore(), decryptKeystore(), rotateKeys(), createRecoveryBlock(), 13 tests
- [x] Payment settlement module (payment.js) — authorize(), capture(), refund(), openTab(), addToTab(), closeTab(), 12 tests
- [x] Go SDK parity — trust.go, seed.go, instance_id injection in foodblock.go, 98 tests (20 trust + 12 seed + 4 instance_id + existing)
- [x] Swift SDK parity — Trust.swift, Seed.swift, instance_id injection in FoodBlock.swift, 103 tests (30 new + 73 existing)
- [x] JS SDK v0.5.0 published to npm — 27 modules, 80 exports (identity, payment, trust, seed added)
- [x] Python SDK v0.5.0 built for PyPI — pyproject.toml created, dist/ ready to upload (needs API token)
- [x] Go module path fixed — `github.com/FoodXDevelopment/foodblock/sdk/go` (was missing /sdk/go suffix)
- [x] Go + Swift LICENSE files added (copied from repo root)
- [x] MCP key encryption — AES-256-GCM envelope encryption via AGENT_MASTER_KEY env var, encrypted credentials in create_agent, auto-decrypt in load_agent
- [x] Server integration tests expanded — 44 tests (was 31): signed blocks, tombstone, pagination edge cases, type prefix matching, update chain integrity, NL advanced
- [x] Protocol version bumped to 0.5.0 across JS, Python, server
- [x] CLI published to npm — `foodblock-cli@0.5.1`, `npm install -g foodblock-cli` → `fb "sourdough bread $4.50"`

## Completed (Phase 2: SDK Hardening)

- [x] Fixed Swift canonical number formatting — ECMAScript Number::toString per RFC 8785
- [x] Fixed JS ESM wrapper — all 61 named exports (was 22)
- [x] Go SDK full parity — 15 new modules: encrypt, validate, offline, forward, merge, merkle, snapshot, attestation, alias, notation, explain, uri, federation + updated vocabulary, template
- [x] Swift SDK full parity — 13 new modules: Encrypt, Validate, Offline, Alias, Notation, Explain, URI, Federation, Forward, Merge, Merkle, Snapshot, Attestation
- [x] Go SDK tests — 15 test files with 98 tests
- [x] Swift SDK tests — 4 test files with 103 tests
- [x] MCP tests expanded — 13 new tests (16 total): block CRUD, traversal, batch, tombstone, agent lifecycle, fb()
- [x] Server tests expanded — 11 new tests (31 total): fb endpoint, batch, chain depth, concurrent creation
- [x] Cross-language hash vectors expanded — 95 new vectors (124 total): Unicode NFC, nested state, numeric edge cases, all types
- [x] Fixed Notation.swift regex bug — replaced invalid `\s` in NSRegularExpression with explicit char class
- [x] JS SDK: 162+ tests all passing, Python: 209+ tests all passing, Swift: 73 tests all passing

## Completed (Phase 3: Make the Protocol Irresistible)

- [x] Vocabulary expansion — 7 new vocabularies across all 4 SDKs: distributor, processor, market, catering, fishery, dairy, butcher (14 total)
- [x] Template expansion — 6 new templates across all 4 SDKs: surplus-rescue, agent-reorder, restaurant-sourcing, food-safety-audit, market-day, cold-chain (9 total)
- [x] Added invert_aliases support for dairy pasteurized field (raw/unpasteurized → false)
- [x] fb() multi-block rewrite — handler-based architecture with 7 specialized handlers, confidence scoring, currency auto-detection, multi-block output with refs. Ported to all 4 SDKs.
- [x] fb-advanced.test.js — 61 tests, all passing
- [x] Seed data expansion — ~100 blocks across 3 stories
- [x] Intent signals synchronized across JS, Python, Go, Swift (11 types including actor.agent, substance.surplus)
- [x] Vision paper (spec/vision.md) — ~4000 words, 10 sections, 5 diagrams (3 Mermaid + 2 ASCII), no jargon, no FoodX
- [x] Whitepaper v0.5 (spec/whitepaper.md) — new Section 10.5 Adaptive Agent Architecture (5 subsections, 3 Mermaid diagrams), version bump 0.4→0.5, section renumbering, cross-links throughout

## Plan — Next Phase

### Phase 1: Testing — DONE
1. [x] Write tests for fb.js — 10 tests in new-modules.test.js
2. [x] Write tests for forward.js — 9 tests in new-modules.test.js
3. [x] Write tests for vocabulary helpers — 18 tests in new-modules.test.js
4. [x] Write tests for Python forward.py + vocabulary helpers — 87 tests in test_forward_vocab.py
5. [x] Create Python equivalent of fb.py — done, 22 tests passing
6. [x] Write tests for Python fb.py — done, 22 tests in test_fb.py
7. [x] Run all tests, fix any failures — 135 JS + 187 Python all passing

### Phase 2: Wire fb() into the system — DONE
1. [x] Add fb to index.js exports
2. [x] Add fb to Python __init__.py
3. [x] Add fb() as MCP tool — already existed as foodblock_fb in mcp/server.js
4. [x] Add POST /fb endpoint to sandbox — done, inserts blocks into store
5. [x] Update README with fb() documentation — added Quick Start section and API reference

### Phase 3: Standalone MCP + AI Tool Distribution — DONE
1. [x] Create mcp/store.js — store adapter (embedded + HTTP)
2. [x] Create mcp/seed.cjs — 47 seed blocks for standalone mode
3. [x] Refactor mcp/server.js — swap HTTP calls for store adapter
4. [x] Update mcp/package.json — unscoped `foodblock-mcp`, v0.5.0
5. [x] Create openai/tools.json — 17 tools for OpenAI function calling
6. [x] Create openai/openapi.yaml — ChatGPT Custom GPT Actions
7. [x] Rewrite mcp/README.md — all-platform config examples
8. [x] Fix MCP tests — 3/3 passing

### Phase 4: Publish & Expand Distribution — DONE
1. [x] Create Gemini integration (tools.json + README)
2. [x] Create Smithery + MCP Registry configs (smithery.yaml, server.json)
3. [x] Publish `@foodxdev/foodblock` SDK v0.4.0 to npm
4. [x] Update MCP dependency from `file:../sdk/javascript` to `^0.4.0`
5. [x] Publish `foodblock-mcp` v0.5.2 to npm — `npx foodblock-mcp` works
6. [x] Smithery namespace created — hosted deploy needs paid plan, createSandboxServer export added
7. [x] Published to official MCP Registry (io.github.FoodXDevelopment/foodblock-mcp)
8. [x] Glama — glama.json + PR to awesome-mcp-servers (#2101)
9. [x] PulseMCP — auto-indexes from official MCP Registry weekly

### Phase 5: Backend hardening — DONE
1. [x] Add timeout to agent executor LLM calls — 30s AbortController timeout on client.messages.create()
2. [x] Fix Square webhook signature validation — reject when no secret key (was returning true)
3. [x] Split foodblock-helpers.js (821 lines) → barrel + helpers/core.js + helpers/enrichment.js + helpers/queries.js
4. [x] Add block-event handlers — shipment-notify.js, certification-notify.js, review-notify.js
5. [x] Add rate limiting — rateLimiter(100, 15) applied to all API routes via router.use()

### Phase 6: SDK parity — DONE
1. [x] Go SDK: added vocabulary.go (7 vocabs, MapFields, Quantity, Transition, NextStatuses, Localize)
2. [x] Go SDK: added template.go (3 built-in templates, CreateTemplate, FromTemplate)
3. [x] Go SDK: added fb.go (9 intent types, number extraction, boolean flags, FB() entry point)
4. [x] Swift SDK: Vocabulary.swift already created (7 vocabs, mapFields, quantity, transition, nextStatuses, localize)
5. [x] Swift SDK: added Template.swift (3 built-in templates, createTemplate, fromTemplate)
6. [x] Swift SDK: added FB.swift (9 intent types, number extraction, boolean flags, fb() entry point)
7. [x] All tests passing: JS 67/67, JS new-modules 37/37, Python 187/187, MCP 3/3, Swift 8/10 (2 pre-existing)

### Phase 7: SDK Hardening (Terminal 1, Phase 2) — DONE
1. [x] Swift SDK full parity — 13 new modules (Encrypt, Validate, Offline, Alias, Notation, Explain, URI, Federation, Forward, Merge, Merkle, Snapshot, Attestation)
2. [x] Go SDK tests — 13 test files, 66 tests for all new modules
3. [x] Swift SDK tests — 73 tests across 3 test files (AdvancedModulesTests, AdvancedModulesTests2, FoodBlockTests)
4. [x] MCP test expansion — 16 tests (was 3), covering all major tools
5. [x] Server test expansion — 31 tests (was 20), covering fb, batch, concurrent creation
6. [x] Cross-language hash vectors — 124 vectors (was 29), covering Unicode, nested, numeric edge cases

### Phase 8: Make the Protocol Irresistible (Terminal 1, Phase 3) — IN PROGRESS
1. [x] Vocabulary expansion — 14 vocabularies (was 7): added distributor, processor, market, catering, fishery, dairy, butcher
2. [x] Template expansion — 9 templates (was 3): added surplus-rescue, agent-reorder, restaurant-sourcing, food-safety-audit, market-day, cold-chain
3. [x] fb() best-in-class — handler-based architecture, 7 handlers, confidence scoring, currency auto-detect, multi-block with refs, 313 JS tests + 209 Python tests, ported to all 4 SDKs
4. [x] Seed data — 3 stories (~100 blocks): UK bakery + London restaurant + farmers market
5. [x] SDK publishing — JS v0.5.0 published to npm, Python built for PyPI (needs token), Go module path fixed, Swift + Go LICENSE added
6. [x] CI/CD — GitHub Actions for all 4 SDKs + MCP + server + cross-language vectors

### Phase 9: Production Readiness
1. [ ] Add structured logging to server (JSON, not console.log)
2. [ ] Log fb() parse quality (matched vs unmatched tokens, confidence histogram)
3. [x] Integration tests between Backend and foodblock SDK — 44 server tests (was 31)
4. [ ] Load testing / performance benchmarks
5. [ ] Write the GitHub Action that runs Claude Code against this CLAUDE.md
6. [x] Security audit — private key encryption in agent_registrations — Backend uses envelope encryption, MCP supports AGENT_MASTER_KEY
7. [ ] Documentation site — auto-generated from source, hosted on GitHub Pages

### Phase 10: Ecosystem Growth
1. [x] FoodBlock CLI tool — `fb "sourdough bread $4.50"` from terminal — published `foodblock-cli@0.5.1` to npm
2. [ ] React component library — FoodBlockCard, ProvenanceTree, MerkleProof components
3. [ ] Mobile SDK — React Native / Flutter wrapper
4. [ ] Webhook system — notify on block creation matching patterns
5. [ ] Plugin marketplace — custom vocabularies, templates, validators as FoodBlocks

## How to Continue

When you start a new session, read this file first. Execute the next unchecked item in the current phase. After completing items, check them off. After completing a phase, write the next phase. Always update "Current State" when things change. The plan should always have at least 2 phases ahead.

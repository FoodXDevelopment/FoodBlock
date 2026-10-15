# To do

Open work, with enough context to pick up.

- **Sealed blocks on push belong in the SDK.** `sync.accept` takes public blocks. A sealed copy arrives as its
  signed public header, and the node checks that header itself (`acceptSealed` in `server/node.js`: signed by a
  live key of its author, prev held, no second block for one seq). That check should be an SDK function every node
  shares.
- **Waiting blocks are asked for only from whoever pushed them** (spec §10). A push carries no identity, so the
  node cannot tell who pushed; it retries waiting blocks on every push and drops them after `WAIT_TTL`.
- **Local discovery.** The node builds its local announcement but runs no mDNS / DNS-SD responder or short-range
  link; a transport that carries it is still to be added.
- **The admission rule's schema.** The spec says a node admits by a published block, but not that block's shape. The
  node reads `parties` and `per_stranger` from an `observe` of kind admission whose schema declares them. When the
  base schemas are published (spec §3), the admission schema should be one of them.
- **A node that holds many blocks.** A pull reads every block since `since` before filtering, which is fine for one
  person's node; an index needs the filter and `heads` in SQL.
- **Publishing 1.6.** See `DISTRIBUTION.md`.
- Write the eight 1.6 vectors the EPCIS + FSMA 204 profile lists (spec/profiles/foodblock-profile-epcis.md, v0.2).

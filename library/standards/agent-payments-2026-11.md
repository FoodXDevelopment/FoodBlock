# Agent payment standards, read against FoodBlock (November 2026)

Dated 2026-11-16. This page is a reading. It is not part of the rules. It binds no one, and no code should decide anything from it. A model or a person reads it to see where a block fits when another standard is in the room.

These standards rename themselves often. x402 went from version 1 to 2 in a year and renamed its headers. AP2 renamed all three mandates between 0.1 and 0.2. ACP replaced `refunds[]` with `adjustments[]`. Expect every message name below to be stale within months.

**How the names were checked.** Every message name below comes from copies of each standard's own files, read on 2026-11-11 and cited in the reports `research/2026-11-11-foodblock-1.9/05-agent-commerce-standards.md` and `round3/10-mapping.md`. Nothing was fetched live for this page. So "checked" means checked against that dated copy. Anything marked **unchecked** was not verified even there. The copy may already be out of date.

## The one shape used in every table

When her node takes in bytes from another standard, it signs one thing: "I held these bytes, from this address, at this time." The state holds the SHA-256 of the exact bytes, where they came from and their media type. The bytes are kept beside the block, not in it. It is sealed to her.

That block says only that her node held the bytes. It does not say anyone agreed to anything. It does not bind the sender. It does not bind her. Call it a **held-bytes reading**. (There is no named kind for it yet. It needs a schema, which is a pattern, not a rule. Unchecked.)

Words used here, once. A **facilitator** checks a payment and puts it on a chain for a seller. A **mandate** is a signed permission slip for an agent, in another standard's format. A **chargeback** is the card system taking money back from a seller. In x402, **verify** means "this would go through" and **settle** means "it was sent".

---

## x402 (payment inside a web request)

Story: Sam's mill answers a stranger's agent with a price. The agent pays in stablecoin.

| x402 message | In FoodBlock | Who signs | What is lost |
|---|---|---|---|
| `PaymentRequired` (402, `accepts[]`: scheme, network, asset, `payTo`, amount) | Held-bytes reading. On top, a reading: "this server asks this much, to this address." | Her AI | Nothing. The seller signs nothing in base x402. |
| Signed offer (extension) | Held bytes, kept whole. Not Sam's promise. | Her AI | The offer's own text says its signature does not prove the key was authorised for the service. |
| `PaymentPayload` (EIP-3009 authorisation: from, to, value, window, nonce) | Where a deal binds her: her tool's `transfer` under her grant, with the payload's digest in `marks`. Where no deal binds her: held bytes only. | Her AI, under her grant | The chain shows payer, payee and amount to everyone. |
| Facilitator `/verify` answer | Held bytes. Never "it came". Verify means funds move only after. | The seller's adapter | |
| `SettlementResponse` (transaction id) | Held bytes. The transaction id goes in `marks`. `settlement_pending` is not "it came". | Whoever saw it | A facilitator signs nothing a buyer can keep. |
| Signed receipt (extension) | Held bytes. It omits the transaction by default, so it is weak proof. | Her AI | It is not the payee's own word. |
| "It came" | A `received` observation by the payee, or by a signer her account word names in `state.by`. | The payee, or her named signer | |
| `auth-capture` hold, `capture`, `refund`, `reclaim` | A hold is not money moved. `capture` is the event a `received` may speak of. `refund` is the seller's own new transfer, never an undo. `reclaim` is the buyer's own way out. | | A walked-away hold can leave her limit used while her money is back. Pattern text asks for an `expires` on the transfer. Whether the rules free the limit on it is unchecked. |
| `batch-settlement`, credit-backed | A lender underwrites the buyer. On the record he exists only if he signed a promise to pay. | | If the seller shows "paid" when he holds an unsigned lender's claim, a claim is shown as the thing. |

Checked against the dated copy: the message names and the verify/settle order. Unchecked: whether every facilitator accepts a chosen nonce; whether EIP-3009 lets a payer cancel before settle; the `auth-capture` operator model (who may refund besides the seller).

## UCP (Universal Commerce Protocol)

Story: Harry the miller has a hosted web shop that speaks only UCP. Harry has no key in this protocol.

| UCP message | In FoodBlock | Who signs | What is lost |
|---|---|---|---|
| `/.well-known/ucp` profile (services, capabilities, keys) | Held bytes, plus a reading: "this site says it sells this way." | Her AI | The keys in it belong to the domain. For a hosted shop that is the host, not Harry. |
| Catalogue rows | Held bytes, one reading per item. | Her AI | A row binds no one. |
| A capability under the seller's own reverse domain that carries a block id | A pointer. Her AI fetches the block and then holds the seller's own signed word. | The seller signed the block | Nothing. This is the only row where a deal can start. |
| Checkout session (`incomplete` to `completed`) | Held bytes at each step. No block of the seller's. | Her AI | The whole seller's side, unless the seller also signs a block. |
| `ap2.merchant_authorization` (a JWS over the checkout) | Held bytes. Good evidence of what the domain's key agreed. Not a promise here. | Her AI | |
| Identity linking (OAuth token) | Nothing on the record. A token is a secret, not a word. | No one | The platform presents the token for the user. That is a middle signing as her, and it is never read as her yes. |
| Order webhook (`adjustments`: refund, dispute) | Held bytes. A `dispute` row is a fact someone reports, never a ruling. | The node that got it | |

Checked against the dated copy: the table rows. Unchecked: whether Google's or OpenAI's surfaces admit a seller with only a self-hosted profile.

## ACP (Agentic Commerce Protocol)

| ACP message | In FoodBlock | Who signs | What is lost |
|---|---|---|---|
| Checkout session (create, update, complete) | Held bytes. | Her AI or the platform's adapter | Request signatures are only recommended. |
| Delegated vault token with `allowance` (max amount, currency, session, merchant, expiry) | The outside ceiling. Not a grant. On the record: held bytes of what was asked for. | The payment processor mints it | It holds a ceiling and a shop, and no promise to keep to. |
| Order webhook (HMAC) | Held bytes. A shared secret proves nothing to a third reader, so it is worth only its receiver's word. | The receiver's node | |
| `adjustments[]`, type `dispute` ("Dispute or chargeback") | Held bytes. | | Refunds are out of scope in the delegate spec. |

Checked against the dated copy. Unchecked: chargeback windows on card rails.

## AP2 mandates (version 0.2)

Story: Leila gives her AI a weekly shop of milk, bread and eggs, 40 pounds. The card world asks for a mandate.

| AP2 object | In FoodBlock | Who signs it outside | What is lost |
|---|---|---|---|
| Open mandate (constraints, agent key in `cnf`, expiry) | Coming in: held bytes. Going out: a rendering of her grant, naming the grant's id, no wider than it. | Her key inside an issuer's credential, or the agent's maker | Her promise. AP2's constraints are a fixed list, and "keeps to her promise" is not on it. A grant that does not fit gets cut down to a budget, and then the mandate is wider than the grant. |
| Closed checkout mandate (hash of the merchant's checkout JWT) | Held bytes. Beside it, if the seller signs a block, her tool's accept. | The agent's key, with no person present | |
| Payment mandate | Held bytes. Its digest may ride in `marks`. | The agent's key | |
| Receipts (signed, success or error) | Held bytes. A signed "no" is good evidence a payment did not go. | Each verifier | |
| Budget | Nothing. The spec names no one to track the total spent. | | The line and meter of a grant have no twin outside. |

Checked against the dated copy: the object names and the three constraint types (`payment.budget`, `payment.allowed_payees`, `payment.reference`). Unchecked: who may sign a per-deal mandate with no person present.

## Others the reports cover

- **A2A agent card.** Held bytes. It says what an agent is, never whom it acts for.
- **MCP.** A transport. An x402 payment rides in a tool call's `_meta`; map it as x402.
- **Visa Trusted Agent Protocol, Web Bot Auth, ERC-8004.** Each is someone else vouching for an agent. Held bytes.
- **Lightning.** The invoice's description hash can commit to the request. That is how a payment can name its deal. Checked only in the report's reading of the scheme file.
- **Interledger, one-way channels, prepaid credit control.** Covered in report 11 for pennies-sized deals. Not mapped here. Unchecked.

---

## Rules that hold at the edge

These come from the reports. They add nothing to the rules. They say what the rules already force.

1. **An outside payment is the payee's own word that it came, naming her account place.** Mama Achieng sells eggs. She signs a word that says where she takes money. A payment counts toward her price only when she signs "it came", or when a signer her account word names signs it. Nobody else's "it came" counts.
2. **Whether money came is never read from the payer's label.** A green tick on a card, a "paid" on a payer's screen, a facilitator's "valid" and a receipt the payer holds are all held bytes. Say which event is meant: sent, held, captured, final. The payee decides which event is enough for her.
3. **A foreign mandate is never her signed word in the record.** Leila may really have tapped it. In the world it may bind her, and a judge both sides chose may weigh it. In the record it is held bytes. A mandate the agent's maker signed for her is the maker's word and no one else's.
4. **Her outside permission must be no wider than her grant, or she sees both ceilings before she signs.** Amara's grant says 25 kg of flour a week, at most 70 pence a kilo. A card token or a funded wallet is a second fence, on money. If the second is wider, her money can move for something her grant never covered, and her record shows nothing of hers bound. Make the outside permission from the grant: same ceiling, same seller, the deal's id where the rail has a slot. If it cannot be made that narrow, show her both ceilings side by side.
5. **A payment that can be reversed outside is never read as moved inside.** A card capture can be taken back for months. A stablecoin can be frozen. A hold can be reclaimed. What moves inside is Sam's flour, on Sam's own signal. A chargeback is a fact for the judge the sides chose. It does not undo a block.

Other holds, in short:

- **A seller who signs nothing means no deal in her record.** If Harry's shop speaks only UCP, Amara's AI has no promise to answer, and her grant gives her tool no power to pay. Her ways out: she signs the order herself; a reseller who signs sells to her in his own name; or she gives her tool a stated share outside, and her record holds her tool's readings of what it did.
- **A foreign identity is a handle, never a key.** A chain address, a web domain's key and an issuer's credential bind no one here.
- **No outside middle becomes a middle here unless a person names it.** The host, the platform and the card network do not fill in a name on her behalf.
- **Bind the payment to the deal on the rail, privately.** Use a digest of the deal's id, the occurrence and a secret the two sides share. Do not put the bare deal id in a public nonce.
- **One outside payment counts for one deal.** Two transfers sharing one transaction id must not make two "it came" words.
- **The price and the rail use the same kind.** A price in pounds is not paid by a tool in USDC unless a rate is signed.

## How a large payments firm can plug in

It needs no one's leave and no seat.

1. **One key.** It makes its own key and its own genesis.
2. **A signed `received` per payment.** For each payment it signs one observation: this much reached this payee, with the rail's reference in `marks`. It counts only where that payee's account word names the firm in `state.by`. Mama Achieng picks it, or she does not.
3. **If it wants to be believed,** one open promise: if a `received` of mine is ruled false by the judge named here, this sum of mine becomes yours, with the backing stated. That is its own money on its own word.
4. **Never signing as her.** It may sign "grant G was shown to her as mandate M". That is its word and binds its name. It never signs her accept, her transfer or her grant.

What it gives up is the habit of being the judge by position. It cannot be a default, a root every payee must sit under, a name filled into anyone's `by`, or a key that speaks for a person.

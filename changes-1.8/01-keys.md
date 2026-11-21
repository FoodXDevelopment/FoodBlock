# FoodBlock 1.8, stage 1: keys

Built on `00-shared.md` (its words, its rules 1, 2 and 13, its section 4) and decision 6. Depends on stage 0 (`refs.act` and the act templates are gone; `scope.acts` is `scope.types`). This page is the instruction a builder follows; where it quotes 00-shared, the quote is the text.

---

## 1. What this stage does

1. **One signature, once.** A person's first key is made in a thing she holds, at her first yes that binds her. It signs her genesis. No host or door makes, sees or holds a person's key. Keys a host made are retired, and what they signed is the host's word.
2. **Her voices.** Who may speak as her is one ranked list she signs: her keys, keys named only by their hash, and counts of other people. The genesis is a list of one voice. A voice changes only what is below it. The first voice is always a key of her own.
3. **Two numbers, both waits, never undos.** `wait`: how long a voice's key grants (and every word that lets another act for her) wait before they stand. `reach`: how long a voice's promises, transfers and grants wait before they stand. Both are read on a clock she names (`keepers`). With no clock, nothing waits and nothing she signed is ever set aside by a later key grant.
4. **Sign twice** (rule 13). A word that gives another key or person the power to act or spend for her stands only when the same key signs it again after its wait, or a voice above signs it.
5. **Two kinds of key, no third.** A **voice** speaks as her, whole, bounded by time. A **tool** is an actor of its own that acts under her grant, bounded by amount and terms. A **key under a voice** (a tablet, a key for one counterparty) speaks while its voice does.
6. **`refs.key`.** Every block not signed by the genesis key names the key grant that brought its key in.
7. **`blocks.md` gains Time, A named clock, The cut and Finality**, from 00-shared, so every later stage reads them.
8. **Deleted:** the recovery key, the will and its four kinds, device claims, rotation's three "who may", Conflict and frozen keys, void spreading, the reach view and arrivals, `custodian`, `assisted_by`, the successor's trigger and its view.

**Mama Achieng** has a basic phone, a SIM and two cards. At Otieno's kiosk card A makes a key and signs her genesis; card B makes a second key whose hash card A writes above itself, then card B goes in a drawer. Her SIM key is a tool under card A's grant, up to 500 a deal. She trades by three digits or her SIM's PIN. If card A is stolen, she shows card B once and puts a new card in A's place. Nobody else is above her.

**Maria** has a phone, a tablet and relatives. Her list: a key on a card in a drawer (by hash); her mum and brother, both, waiting seven days; her phone, waiting thirty days, reaching one day. Her clock: the shop, her host, her aunt, any two. Her tablet is a key under her phone. Her AI is a tool under her grant. If her phone is lost, her mum and brother put a new phone key in its place in a week. If it is stolen, what the thief signed waits a day and never stands once they cut the phone.

---

## 2. Spec edits, file by file

### 2.1 `spec/modules/identity.md`: replace the whole file (lines 1 to 63)

Delete every line (the recovery key, A will and its seven bullets, Keys, Rotation and its sub-bullets, Void spreads, A pair, Conflict, `scope.until` on a key grant, Recovery reach, Autonomous systems and machines, A key per counterparty, Contacts, A two-key link, Held keys, Profile facts, invariants 8 and 19). Write in their place:

```markdown
# Identity

Voices, keys, tools and contacts. The genesis is in core.md.

An **identity** is an `actor`; its id is its genesis hash. Who may speak as her is her own signed word, her **list of voices**, and nothing else. Nothing in this protocol names a voice, a count, a wait, a reach or a keeper for her; a list with a number missing is no list.

**One signature, once.** A person binds herself only by a block a key of hers signed. Her first key is made in a thing she holds (a phone, a card, a SIM, a passkey), at her first yes that binds her, and it signs her genesis. No host, door or helper makes, sees or holds a person's key. A key someone else made or can use is that someone's key, whatever it is called, and what it signs is that someone's word. Ground: only a signed word binds, and only its signer; nobody signs as anyone else (Rothbard; Kinsella).

**Her voices.** The genesis is a list of one voice: its own key, `state.public_key_sign` (and `state.suite`). A key grant (a `grant` of kind `key`, `refs.subject` her id) that states `state.voices` states her whole list again, the highest voice first, and names in `refs.updates` the list it replaces (the genesis, or a key grant that states `voices`). A voice is one of:
- `{ key, suite }`: a signing key of hers (`suite` left out is `std`).
- `{ key_hash, suite }`: a key not yet shown, named by its suite's hash of its SPKI hex as UTF-8 text. It speaks by showing itself: a key grant it signs states the key in `state.shown_key`, and names in `refs.key` the list that holds the hash. Until shown it is only a hash.
- `{ names, needed }`: other people, by id, counted (folds.md, Counts). It speaks when one of them signs a key grant for her list in their own name, `refs.subject` her id, and `needed` of them, that one included, have signed it or named it in `refs.confirms`.

A voice may state `wait`, a duration. A `key` voice may state `reach`, a duration; the genesis states its own voice's reach in `state.reach`. A list that states a wait above zero, or any reach, states `state.keepers` (blocks.md, A named clock); one that does not is no list (`shape`).

**The first voice** is a `key` or `key_hash` of hers, never other people: consent to another acting for her can always be taken back, and only title is handed on for good. It asks nothing of the clock: no voice is above it to say no, so its wait is zero whatever it states.

**A voice is her, whole.** A block signed by a key of a standing voice speaks for her. The only bounds on a voice are time: its `wait` and its `reach`.

**A voice changes only what is below it.** A key grant by a voice restates every voice above its signer's place as it was, and its own place's `wait` and `reach` as they were; one that does not is no key grant. It may put a new key in its own place and change, add or remove any voice below. The `wait` and `reach` of a place are changed only by a voice above it. Only the first voice changes `keepers`.

**When a key grant stands.** A key grant that brings a key in is a word that lets another act for her (blocks.md, Finality). It stands when its signer's voice has signed it again after that voice's `wait` has run from her keepers' receipt of the first signing (blocks.md, A named clock), or when a voice above has signed it. Signing again is a later counted block of the same key that names the key grant in `refs.confirms`; for a voice of named people, `needed` of them each confirming again. A wait of zero has run at once and asks nothing of the clock. A wait above zero runs only on her clock: with no keepers it never runs. A voice that states no `wait` brings in no key by itself; a voice above may.
- **Saying no is signing.** A voice says no by its own key grant for the same list, which may restate the list unchanged. A key grant stands only where no voice above its signer said no first: one keeper's line holding the no's receipt before her cutoff that closes the wait is enough (blocks.md, A named clock, One to narrow); with no clock, the no is in the confirming block's causal past.
- **Two by one voice.** Two key grants of one voice, neither in the other's causal past, are a pair of that voice: neither stands, and the voice brings in nothing more, until one block of that voice has both in its causal past. No hash picks one.
- **One list at a time.** A key grant counts only for the list that stands where `needed` keepers received it, or, with no clock, in its own causal past. One that names in `refs.updates` a list already replaced is no key grant.
- **While it waits.** A key grant that is waiting speaks for no one: its key signs nothing that counts, a stop included. During a wait she has only the keys she already had.
- **Taking oneself out.** A key grant that adds no key and only takes its signer's own place out lets no one act: it stands when signed, whatever crosses it, and though its key has a pair. A list with no voice left closes her identity: nothing signed after it in any block's causal past counts for her.

**Reach: a wait before her word stands.** A `promise`, `transfer` or `grant` signed by a key whose voice states a `reach` (zero included) is waiting until her clock has held it for the reach: `needed` keepers each hold a receipt of it and a cutoff through that receipt plus the reach, and no key grant that leaves the key out is received before those cutoffs on any one of those lines (blocks.md, Finality). It also stands once a voice above that key names it in `refs.confirms` of a counted block. Her readings (`observe`), and a key grant she signs in another's list, wait on nothing of hers: each is read in its own causal past. A voice that states no reach is not read on her clock: its blocks stand when signed, and an end reaches them only by the cut. A reach never un-counts: what stood stays.

**Ending a key.** A standing key grant that leaves a key out is an end of that key (blocks.md, The cut); the key names a clock there exactly when its voice states a reach. A key grant by a voice above the key may name in `state.counted_to` the last block of that key that is hers. The **counted line** (that block and its `prev`-ancestry through the key's blocks) is inside the cut, and a waiting block on it stands. `counted_to` sets aside no block that stood. A key's own key grant names no `counted_to`: a seller cannot un-sign her sale.

**A key under a voice.** A key grant that states one `public_key_sign` and no `voices` adds that key under its signer's voice. It is no part of the list, and no later list restates it. It speaks while that voice speaks, is bounded as that voice is (its wait and reach), signs no key grant, and stands as a key grant of that voice does. Its signer, or a voice above, ends it by a stop of the key grant that added it. When the key of its voice is ended it ends too, unless the block that added it is inside that cut; it is then under the key put in that place. It may be sealed (privacy.md): a key for one counterparty is one.

**A voice or a tool.** A **tool** is an actor of its own that she operates (Autonomous systems and machines). It speaks for her only under her grant, bounded by amount and by terms (authority.md). There is no third kind: a grant to one of her own voices fences nothing.

**`refs.key`.** A block signed by a key other than its author's genesis key names, in `refs.key`, the key grant that brought that key in: a key grant (`refs.subject` the block's author, whoever signed it) that states it as a `key` voice of its list, adds it under a voice, or shows it. A key named by hash speaks first in the key grant that shows it, whose `refs.key` names the list that holds the hash; its later blocks name that showing key grant. One id. A block of the genesis key names none.

**A suite move.** A key grant that puts a key of another suite in a place cuts by causal order alone: a block of the old key counts only when that key grant has it in its causal past. No clock and no reach is read, and what another built on is not kept: a forger can make a relier. A block that does not count for its author forms no pair. A `key_hash` voice is only a hash until shown, so a key of a sound suite named by hash survives a break of the suite her shown keys use; a person with no voice in a sound suite has no move.

**Encryption keys.** A key grant that states only `public_key_encrypt` brings in no voice, lets no one act and waits on nothing. The newest such key grant of hers in a sealer's causal past is the key a sealer uses.

**Autonomous systems and machines.** An autonomous system or machine is an actor with its own genesis and voices; kind `agent` or `machine` is a label that consent reads (consent.md), never validity or the identity fold. Any actor may have an operator, who answers for it: the author of a grant of kind `operator` naming it in `refs.to`. The operator is a voice above the machine's whole list, with a wait of zero: its key grant for the machine, naming the operator grant in `refs.under`, stands when the operator's key confirms it (blocks.md, Finality). **The machine consents:** the operator grant counts only for blocks with, in their causal past, the machine's own `grant` that `answers` it `accepted`, signed by a key of the machine's own list (read without its operators, so it never loops). A stranger's operator grant answers for no one and brings in no key. It stands while neither side has ended it (authority.md, Ending) and its author is not dead (profiles/successor.md). A key grant the operator signs under it counts only if every stop or decline of the operator grant has the key grant in its causal past. That grant is the only place the operator is named. A machine acts only within the grants it holds, and each block it signs for someone names the grant in `refs.under`.

**A person with no key** has signed nothing. A host that hears her signs a witness in its own name (authority.md, A witness): it is the host's word. She becomes a signer by her own genesis, and from then her grant may back a host's witness. A host's block acting on its own judgement speaks for the host alone, unless a grant names it.

**A key a host made.** A key a host or door made for a person is the host's key, and every block it signed is the host's own word. The host says so by a two-key link (below) between that identity and its own; a key grant of that key taking its only voice out closes the identity. What that identity owns or is owed reaches the person only by its transfer or hand-over to her own id and her accept.

**One person, many keys.** She may use a different key with each counterparty and prove links only to whom she chooses (`same_as`, sealed to an audience). An issuer she freely chose may sign "this key is one person, not yet used with you"; the reader trusts it or not. There is no required registry: a registry would be a middle everyone must go through. Free keys let one person look like many (THREAT-MODEL.md).

**Contacts.** A `contact` actor is someone with no keys, written by anyone. It may carry `state.marks` such as a phone number (profiles/addressing.md). Anyone may claim it `same_as` a genesis; each reader decides.

**A two-key link.** A `same_as` that carries weight is signed by both keys: one key writes an `observe` of kind `link` (schema `link`) with `same_as` the other, and the other counter-signs with its own `link` naming the first in `refs.confirms`. With both, a reader may treat the two keys as one hand. One signature is only its author's word, and so is any third party's `same_as`. A link may be sealed to one reader (privacy.md, Audiences).

**Profile facts** (a name, a timezone) are the person's own `observe` of kind `profile`, not identity.

## Invariants

8. A key speaks for her only while it is the key of a voice of the list that stands in the block's own causal past, or a key under such a voice, and no end of it has reached the block (blocks.md, The cut). A promise, transfer or grant of a key whose voice states a reach waits until her clock has held it that long. Her list changes only by a key grant one of its voices signed, changing nothing above its signer, that stands (blocks.md, Finality). Nothing names a voice, a count, a wait, a reach or a keeper for her.
19. Nobody signs as someone else. A key someone else made or holds is that someone's key; a block about a person's words is its signer's own, and binds her only under her own signed grant.
```

### 2.2 `spec/modules/blocks.md`

- **Line 17, change** "so a rotation sees the chain it cuts" **to** "so a key grant sees the line it cuts".
- **Line 19, delete** the whole paragraph "**No clock.** A micro with no clock … (authority.md)." **Line 21, delete** the whole paragraph "**A named clock.** A block's own `at` dates nothing … and an event `repeat` (Terms)." **Write in their place, in this order**, the four sections below.
- **Line 27** (Micro safety) and **line 29** (Refusals) are stage 2's (02-store.md, B1, B2).

```markdown
**Time.** A block's `at` is read only against its signer. A time is read against anyone else only from a clock named, in the word the time is about, by the one it is read against (A named clock). A block's date on a line is the latest `at` from it back to the start of the line the question reads, read whole; on a line not read whole it has no date for that question. A block with no `at` is past every end. A signer with no clock leaves out `at` where its type allows (core.md, section 5); on a block that requires it, it writes the time its edge gives it at that moment, which is its own word as every `at` is.

**A named clock.** A **clock** is `keepers: { names, needed }` in the word whose time or order it reads. Each name is a block id and names a **line**: that block's key's blocks after it; a person's id names her genesis key's line. `needed` follows Counts (folds.md): a set of one needs none. A clock is written by whoever signs the word; whoever accepts the word or acts on it has read it. Nobody need name one, and none is ever filled in.
- A **keeper** is whoever keeps a line a clock names: a person at a phone shop, a node, a till. Her reading for a word starts at her receipt of the word.
- A **receipt** is a keeper's counted `observe` of kind `receipt`, `refs.derives_from` the blocks it names, one or more: when she signed it she held them. A receipt that names several blocks gives them no order, and no rule that needs an order reads them from it.
- A **cutoff** is a keeper's counted `observe` of kind `cutoff`: `state.when` an instant T, `refs.subject` the word. It closes over its own line: every receipt of hers before it on her line, dated at or before T, of a block the word's rule reads, was received by T, named or not. `refs.derives_from` lists them for a reader who does not hold the line. A cutoff that leaves out such a receipt is shown false by that receipt, and closes nothing.
- **The four readings, and no others.** *By T*: `needed` lines each hold a receipt of the block dated no later than T. *Not by T; a wait has run*: `needed` lines each hold a cutoff through T (for a wait: through the keeper's receipt of its start plus the wait) that leaves no such receipt before it; until then it is pending, and no reader's clock closes it. *Which came first*: read from a line's order, never from dates. *How much, and which of many*: read along one line only; a word that asks either names one.
- **Two powers, kept apart.** A clock **dates** when it only says when. It **gates** when the word says a block made on it counts only once the clock holds a receipt of it. A gate is never the only way: a gated block also counts once the word's signer names it in a later counted block of her own.
- **One to narrow, the stated number to widen.** That an end, a stop or a "no" came first: one keeper's line is enough. That a block came in time, that a wait has run, that a key grant has closed: `needed` lines.
- **A side's clock counts only against that side.** A keeper who is a side of the word, or whom a side operates, binds that side by every receipt another holds in his block's causal past, and by nothing of hers does another lose what his block already holds. Her order is never read against the other side.
- **What a keeper signed and another built on stands against those who named her.** A clock is read in the causal past of the block that relies on it. One who relies on a clock he did not name is safe when his block has the keeper's block in its past, and bound by nothing of hers that it has not.
- **Silence.** When a named clock is silent, what waits on it waits; nothing fills its silence. A clock that cannot close leaves its question open, for the judge the sides chose.
- **Changing a clock.** A clock is changed by those who named it: a counted block by each, `refs.subject` the word, stating new `keepers` and, for each old line, the last receipt that counts. What was read on the old clock and built on stands. A keeper's own key replacement continues her line (folds.md, A line).

The sides named the clock, so its word binds them, and no one else. Ground: a date binds only the one who wrote it, or the one she named to write it (Mises: only persons act; a stranger's clock is no one's word).

**The cut.** A standing word (a grant, an offer, a request, a transfer to a named receiver, a key, a member grant, an account word, a claim, a named signer's word) is ended by an **end**: its signer's counted stop, a key grant that leaves the key out, a removal, a newer word of hers that takes its place, a time it states (`until`, `expires`), and for a named signer's word a pair on her key or her own `defeats`. A block made on such a word (a block under it, an answer to it, a block of the key, a payment to it) that has seen an end counts for nothing. Any other passes the word's ends when: an end has it in its causal past (it is inside that end's cut); or, where the word names a clock, `needed` lines received it before any line received an end; or, where the word names none, a relier's counted block uses it, or the word's signer names it in a later counted block of her own. Until it passes, it is waiting, whether or not any end exists yet: with no clock, a stop can always still come. Where several ends reach one word, a block that is inside one end's cut must still pass each other end.
- **Seen.** A block has seen an end, for a reader, by exactly two facts: the end is in the block's causal past as that reader reads it (bodies only: a header shows nothing seen; a receipt the block's author signed of the end is this fact, because the receipt derives from the end); or the word names a clock and one keeper's line holds her receipt of the end before her receipt of the block. Nothing else is seen. When an end reached a node, and a date on the end, show nothing.
- **Relier.** One who used a word without having seen its end: the author of a counted block that answers the word, accepts or names a block made under it, or acts on it, who is not the word's signer, not an actor she operates, and not acting under a grant she gave or one passed on from it, and whose block has not seen the end.

**Who bears the gap.** Her word says which. If it names a clock (her own node will do), her stop counts from the moment that clock has it, and the clock's order decides. If it names none, she bears what was done under it until the relier has seen the stop, and her claim is on whoever went on using it. The protocol fills in neither. Ground: title moves by its owner's shown consent; toward one her end has reached, her consent is gone, and toward one it has not, the word she signed is the only showing there is (Rothbard, *The Ethics of Liberty*, ch. 19; Kinsella).

**Finality.** A word stands when nothing its signer stated before it can still set it aside. A word **stands** when every block it names for its meaning stands; it has passed every end that could reach it (The cut); if its key's voice states a `reach`, her clock is closed through her keepers' receipt of it plus the reach with no end of the key among the receipts the closing names, or a voice above that key has confirmed it (identity.md, Reach: a reach reaches only her promises, transfers and grants); and its own condition has held where it stands.
- **Waiting.** A word that does not yet stand is waiting. It moves nothing to anyone and binds no one else; a draw that is waiting still holds its amount against its own owner. A fold that meets it lists it in `waiting: [{ block, on }]`, `on` what it waits for.
- **Signed twice.** A word that gives another key or person the power to act or spend for her (a key grant that brings a key in, a grant, an account word, a hand-over of a claim) stands only when the same key has signed it again after that key's wait has run, or a voice above that key has signed it (identity.md, When a key grant stands, which says what signing again and that key's wait are). Until then it is waiting. A word that only narrows (a key grant that only takes its signer's own key out, a stop) is not under this rule, nor is a key grant that adds only an encryption key: neither gives power to act or spend. So a thief who held a key briefly leaves none of these words standing.
- **What stands stays.** No later block changes what a standing word moved or bound, bar the new owner's own word, and, for a deal's stage only, the bench.

Once it stands, no later block moves back what it moved: a wrong found after that is a sum owed or a claim before a judge, never a reversal. Ground: what can still move back has not moved yet; a title given on a condition its giver stated before anyone relied is pure title transfer (Rothbard, ch. 19).
```

### 2.3 `spec/core.md` (sections 2, 4, 5, and the pointers in 7, 9, 10, 11 into what this stage deletes)

- **Line 61 (section 2, Which suite), change** only the last sentence, "Moving suite is a key grant that replaces a key and names the new suite (identity.md).", **to** "Moving suite is a key grant that puts a key of another suite in a place (identity.md, A suite move)." The sentence on how a reader learns the suite is stage 2's (02-store.md, C4).
- **Line 82, change** `(suite, public_key_encrypt, custodian: optional; the recovery key's hash and `recovery_reach`: both together or neither)` **to** `(suite, public_key_encrypt, reach, keepers: optional; keepers required with reach)`.
- **Line 88, change** "That is the whole ceremony: one key. An encryption key or more devices come later, each by a key grant (identity.md). A recovery key is named in the genesis or never (identity.md, The recovery key); a new identity states a will instead (identity.md, A will)." **to** "That is the whole ceremony: one key, made in a thing she holds at her first yes that binds her. It is her first voice, and her genesis is a list of one voice (identity.md, Her voices). An encryption key, more devices and more voices come later, each by a key grant."
- **Section 5, after the bullet ending "(invariant 3)." (line 94), add:** "- `refs.key` names the key grant that brought in the key that signed the block, on every block not signed by its author's genesis key (identity.md, `refs.key`)."
- **Line 120 (section 7), change** "A key, its suite and its custodian (`public_key_sign`, `suite`, `custodian`, and on a grant `public_key_encrypt`)" **to** "A key, its suite and her voices (`public_key_sign`, `suite`, `reach`, `voices`, `keepers`, `shown_key`, and on a grant `public_key_encrypt`)".
- **Line 145 (invariant 3)** is stage 2's (02-store.md, C10), which also drops the recovery key from it.
- **Line 170, delete** "**Any phone.** Holding keys is better, never required (identity.md, Held keys)." **Write:** "**One signature.** A person binds herself only by a block a key of hers signed; the least she signs is a genesis. Where her key lives is hers to choose: a phone, a card, a SIM, a passkey. Any phone can carry her yes (profiles/short-form.md). Until she has signed, what anyone writes about her words is that writer's word; she is bound by nothing, and others' signed words to her bind them all the same."
- **Line 176, delete** "(`recovery_reach` adds the reader's arrivals to `signed_by_author`)".
- **Not here:** check 6 (line 131) names the recovery key, `not_own_rotation` and `recovery_scope`. Stage 2 rewrites it whole, without them, and reads the key from `refs.key`.

### 2.4 `spec/profiles/custody.md`: replace the whole file (lines 1 to 13)

```markdown
# Profile: custody (what a witnessing host promises)

Optional. Rules for a host that hears people on a basic phone. Nobody signs as her (identity.md, One signature, once). Each line binds only a host that publishes it, as its own word (nodes.md, A node's promise).

**Adds:** the observe kind `custody_policy`, and the lines below.

- **With no key.** A witness of a person who has signed nothing is the host's word. The host says so in every such block by naming no grant, and tells whoever relies on it. She may still be named as a side in another's promise, which binds its signer; be paid; deliver; say STOP, which binds the side that recorded it (consent.md); and be stood behind by a vouch anyone signs in their own name (profiles/vouches.md).
- **The first yes.** Her key is made inside a thing she holds and keeps: a SIM, a card, her phone. The host's device, or a helper's, lends only a screen, a reader, a time and a link. It never makes, sees or stores her key or her PIN where the thing has its own keys to type on. Her genesis, her list and her first grant are shown or spoken to her whole before her key signs each, and each grant is signed twice (blocks.md, Finality).
- **Her grant to the host** names the host, her handle, `observe.witness`, the parties, an `each` or a `limit`, and an `until`. The host drafts none without all of them, and witnesses nothing past them.
- **The policy.** An `observe` of kind `custody_policy`: `quiet` (a duration), `quiet_under` (an amount), `step_up` (an amount), `proofs` (the second proofs it takes), `assisted` (true if autonomous systems help). Readers weigh a host by it; no fold ranks hosts.
- **A SIM change.** Once it learns the SIM behind a handle changed, the host witnesses nothing for that handle above `quiet_under` for `quiet`, and nothing at all once her own key says the handle is no longer hers.
- **A second proof above `step_up`.** A thing only she holds: her key's short reply (profiles/short-form.md), a code from a list whose commitments her grant carries, opened in `state.opening`, or a helper's own witness. The block names which in `state.proof`.
- **A shared handle.** A handle more than one person answers is no one's handle. The host that knows it is shared witnesses nothing for it under a grant without a second proof.
- **A helper.** One who reads or types for her signs his own `observe` of kind `witness` (`channel: meeting`, `said`, `readback`) in his own name, about what he showed or spoke and what she said. Her block, or the host's witness, names it in `refs.confirms`. He never holds her card or her PIN and signs nothing as her. He is not a side of the deal.
- **Speaking only for its own client.** It speaks only in her name, to people already in that conversation, never first to a stranger nobody chose and never after her STOP.
- **Handing back.** When her own key takes over, the host signs nothing more under her grant after her stop. A key the host once made for her is the host's (identity.md, A key a host made).
```

### 2.5 `spec/profiles/short-form.md`: replace the whole file (lines 1 to 26)

```markdown
# Profile: the short form (SMS, USSD, voice)

Optional. For a person whose link is too small for a block. It says how her yes is carried. Every step is the adopting host's own promise (nodes.md, A node's promise).

**Adds:** the short code, the read-back, the short reply, the parts, the observe kind `readback`, and the label list `state.proof`.

**Three ways a yes arrives.** The carrier says which in `state.proof`, an open list.
1. **Her key signs it** (`key`). Her SIM, card or phone signs her own answer. The host carries it and signs nothing. The block is hers.
2. **Her grant backs the host's witness** (`digits`, `session`, `voice`, and any second proof). She signed one grant to this host for this handle, twice (blocks.md, Finality). The host signs an accepting witness under it (authority.md, A witness), inside what her grant covers.
3. **She has no key.** The host signs a witness under no grant. It is the host's word and binds nothing of hers (profiles/custody.md, With no key).

**The read-back.** Before a yes counts, the host sends the exact terms of the signed block once, in her language, ending in two or three digits it drew fresh for this read-back. `readback` is the SHA-256 of that text as sent, digits included. Before it sends, the host signs an `observe` of kind `readback` carrying that digest, `for` the block. In ways 2 and 3 her reply is those digits: any other reply, the digits of another read-back, or a reply from another handle signs nothing and ends that read-back. In way 1 her key's signature is the reply. In a USSD session the session is the tie and its last screen is the read-back. A spoken read-back is the recording played, kept by its hash; a transcript is a reading (things.md, Truth).

**The short code.** The first 5 bytes of a block's id (the digest bytes), in Crockford Base32, as `XXXX-XXXX`; typed in any case, with or without the hyphen, `O` as 0, `I` and `L` as 1. It is a lookup key, never an id or an authority. Where two blocks a receiver holds share it, the receiver asks for more characters of the id, five bits at a time. A first ask to someone off the network carries the short code of the signed ask; the receiver finds the ask among those addressed to that handle, its own or at the asker's node named in the words.

**The short reply (way 1).** Her key signs her answer as any key signs a block (core.md, section 2). Only what the receiver cannot rebuild travels: the text `FB1`, a space, and base64url with no padding of these bytes in order: the signature (64); the first 5 bytes of the id of the block answered; the answer, one byte (`01` accepted, `02` declined); `at`, 6 bytes, milliseconds since 1970, big-endian (all zero when a decline carries none); `seq`, the rest, big-endian, no leading zero. The receiver takes each held block with that code, fills the answer template with the signer's id, the signer's head it holds, `refs.key` from her list it holds (none for her genesis key) and these values, and checks it. The block whose signature opens is the block; if none opens, nothing was said, and the receiver asks for the whole block (Parts). The template of an accept is a `promise` with `state: { at, audience: "public", seq, status: "accepted" }` and `refs: { answers, author, derives_from, for, key, prev }`, where `derives_from` is the `readback`; of a decline, an `observe` with `status: "declined"` and no `derives_from`. A key that is a tool of hers (identity.md, A voice or a tool) replies as its own actor, its block naming her grant in `refs.under`. It changes no signed byte and no id.

**Parts.** A whole public block in its compact form (encoding.md) may travel as text parts. A part is `FB0`, a space, a tag (the first four Crockford characters of the SHA-256 of the whole CBOR message), a space, `k/n`, a space, and base64url with no padding, at most 153 characters in all. A receiver joins the parts of one tag in order of `k`, refuses a set with a missing or repeated `k`, checks the tag, then decodes and checks the block as usual.

**What the short form never does.** It never makes a grant or a key grant. Her grant to a host is a block her key signed, twice; no read-back and no reply stands in for it.
```

### 2.6 `spec/profiles/rekeys.md`

- **Line 8, after** "the new private key sealed to each member in `state.keys`." **add** "It states only `public_key_encrypt`: it brings in no voice and waits on nothing (identity.md, Encryption keys)."

### 2.7 `spec/profiles/successor.md`: replace the whole file (lines 1 to 26)

```markdown
# Profile: successor

Optional. A person names who records her death and who acts for her after it. A peer without this profile ends nothing at a close.

**Adds:** the grant kind `successor`, the observe kind `close` (with `state.continues`).

- **The witnesses are a voice.** The people who may record her death are a `{ names, needed }` voice in her list, with a `wait`, placed where she chose and never first (identity.md, Her voices). They record the death by a key grant that leaves no voice at their place or below. It stands as any key grant of theirs does (identity.md, When a key grant stands): a voice above them can say no in the wait; a voice below cannot.
- **The grant.** A `grant` of kind `successor`, `refs.to` the successor, signed twice (blocks.md, Finality). `state.keys`: her decryption keys sealed to the successor (an envelope, privacy.md; its plaintext is unchecked), never signing keys. The successor is never one of the witnesses (`shape`).
- **No power before the death.** A block under the grant other than the successor's close speaks for no one (authority.md, Who a block speaks for) unless a counted close of her under that grant is in its causal past.
- **When a close counts.** The successor records the death by an `observe` of kind `close`, `refs.subject` her, `refs.under` the grant. It counts when: its author is the grant's `refs.to` and not her; the grant stands and no stop of it, nor the successor's decline or leaving, is in the close's causal past; no counted close of the successor is in its causal past; and the witnesses' key grant stands in its causal past. After a counted close no key grant of hers counts.
- **What a close ends.** A death ends authority, never a promise. A counted close ends, for blocks that have it in their causal past, every grant she gave in her own name except the successor grant, and her membership of every circle (circles.md), bar what `state.continues` lists (grants, a circle or a member grant the successor carries on). What was owed is still owed. The successor settles, answers or stops it as she could, from her property, and is never bound in his own body or property unless he signs a promise of his own (promises.md, Death).
- **What stands stays.** A close that counted in a block's causal past stays counted for that block (blocks.md, Finality). A transfer she signs after her death was recorded is a word of a closed identity and moves nothing.

**Heirs.** An heir holds what the dead person was owed, or her claim of harm, by the successor she named: once a close counts, the successor signs a transfer that names the deal (or the claim) in `refs.what`, `to_owner` the heir, `under` the successor grant, and the heir accepts. The grant's `scope.types` and `scope.parties` must name the transfer and the heir. Before a close the same transfer speaks for no one. It moves what is owed, never anything she did not hold; the heir takes every condition of the deal (promises.md, Owed).
```

### 2.8 `spec/THREAT-MODEL.md`

- **Line 29, replace the row** "The holder of an old key …" **with:** `| **The holder of an ended key** (a thief, an ex-employee) | keep signing with it; inside a stated reach, have those blocks wait | have any block count that has seen the key grant that ended it, or that her clock received after it; reach anything above its own place; loosen its own place's wait or reach |`
- **Line 30, replace the row** "A thief of one device key …" **with:** `| **A thief of one voice, for ten minutes** | sign as that voice; with no reach, words a relier uses unseen | make a key grant, grant, account word or hand-over stand (each needs the same key again after its wait, or a voice above: blocks.md, Finality); change anything above that voice |`
- **Line 31 (successor), change** "act once a counted death record is in a block's past" **to** "act once a counted close, resting on the witnesses' standing key grant, is in a block's past"; **and** "keep a death record the person stopped (D)" **to** "record a death a voice above the witnesses said no to (D)".
- **Line 35 (node operator), change** the "Cannot" cell **to** "forge a person's signature; hold her key (no host makes one: identity.md, One signature, once); close a wait or a reach alone where she named two keepers or more".
- **Line 44, row C, replace** both cells **with:** `| C | The first key grant to name a recovery key won; a planted key was permanent | A voice changes only what is below it; a word that lets another act stands only when signed twice |`
- **Line 56, row P, change** "A key's own rotation closes only its future; a crossing, a removal, a close and a voided close never erase what an outsider built on unseen" **to** "A key's own key grant names no `counted_to`; a reach is a wait, never an undo; a close and a removal never erase what stood".
- **Lines 63 to 67, replace** the first three bullets **with:**
  - "**Her first voice stolen.** Whoever holds it is her, for good. She may say `not_me` beside each block (promises.md, The signer's word). Every system checked ends here; a first voice named by hash and never on a device is the only help."
  - "**A thief with a key copy.** He signs twice; the wait does not stop him. Her own next block on that key makes a pair, which only a holder of both branches sees."
  - "**One keeper named alone** can end every wait, pass every reach and order every end for those who named her. Two of three, of two firms, is the cure, and it is hers to choose."
  - "**A word with no reach**, signed by a thief, binds her where a relier used it unseen; her claim is on the thief (blocks.md, Who bears the gap)."
- **Lines 74 to 88, delete** the four bullets "A thief's blocks signed with a key you rotate yourself", "An old key crossing the owner's rotation, later", "The recovery reach is per reader", "The recovery reach can be claimed by a Sybil". **Add:** "**A free key as the relier.** On a word with no clock, a thief's act past her stop stands where a second free key of his answers it unseen. Naming a clock closes it."
- **Lines 96 to 99, choice 1, replace** with: "1. **Keys on the person's own device.** Decided (decision 6): no door makes or holds a person's key; the local door signs by her passkey, the CLI by the system keychain (changes-1.8/01-keys.md, section 7)."
- **Line 104 to 106, choice 4, delete.**

### 2.9 `spec/modules/folds.md`, Counts (rule 7 of 00-shared)

- **Line 42, change** "over a set of voices: `needed` different voices (holders of a power, named witnesses, referees, signers) must each sign" **to** "over a set of ids: `needed` different ids (holders of a power, named witnesses, referees, signers, keepers, the people of a voice) must each sign"; **and change** "A voice counts once, and only if it counts at all." **to** "**A count counts ids:** an id counts once, by any key that stands for it where the block stands, and only if it counts at all."
- **Line 44, change** "A set of one voice needs no `needed`. Each reader of a threshold says only what its voices are" **to** "A set of one id needs no `needed`. Each reader of a threshold says only what its ids are". (A voice is a place in her list: identity.md.)

---

## 3. `protocol.json` edits

Paths are from the root object. Added (A), changed (C), removed (R).

**Genesis and key fields**
- R `genesis.recovery`, R `genesis.recovery_about`.
- C `genesis.optional_about`: "Besides `required`, a genesis may carry suite, public_key_encrypt, reach and keepers (key_fields, all but roles, voices and shown_key), keepers being required with reach, and, when its audience is a list, its nonce (private); never roles, name or marks (bad_genesis)."
- C `key_fields.fields`: `["public_key_sign", "public_key_encrypt", "suite", "roles", "voices", "keepers", "reach", "shown_key"]` (R `custodian`).
- C `key_fields.about`: "Defined once. A genesis carries public_key_sign, public_key_encrypt, suite, reach and keepers; a key grant carries public_key_sign, public_key_encrypt, suite, voices, keepers and shown_key; a member grant and a circle's actor carry roles (identity.md)."
- C `fields.grant`: `["scope", "depth", "counted_to", "to_role", "fence"]` (R `replaces`, R `recovery_key`).

**Voices** (A)
- A `shapes.voice`: `{ "key": ["key", "suite", "wait", "reach"], "key_hash": ["key_hash", "suite", "wait"], "names": ["names", "needed", "wait"], "about": "One voice of a list, exactly one of these key sets (identity.md, Her voices): key a signing key in its suite's grammar; key_hash a hash; names a non-empty sorted list of ids with needed by Counts (folds.md). wait and reach are durations. A list is a non-empty array of voices, the first a key or key_hash, each key, key_hash and id once in all." }`.
- A `field_shape.reach`: `"duration"`. R `field_shape.recovery_reach`, R `field_shape.device_wait`.
- A `kind_fields.grant.key`: `["shown_key:text", "counted_to:id"]`. `voices` and `keepers` are not kind fields (their shapes are objects, which `kind_fields` cannot type): A `field_shape.voices`: `"shape"` read as a list of `shapes.voice`, and `field_shape.keepers`: `"shape"` read as `shapes.keepers`, both checked by check 2 of `valid` (core.md, section 8) with the codes `shape` and `grammar`.

**Clock**
- C `shapes.keepers_about`: "A named clock (blocks.md, A named clock): `names` a non-empty sorted list of block ids, each naming a line (that block's key's blocks after it; a person's id names her genesis key's line); `needed` by Counts (folds.md): a set of one needs none, a larger set states it. It sits in the word whose time or order it reads: a condition `within` or `without`, a promise's terms, a transfer, a grant, a list of voices." (`circle#role` leaves.)
- A `kind_fields.observe.receipt`: `[]` with the note in `kind_fields.about`: "receipt: refs.derives_from the blocks it names, one or more, no state field asked for." (Stage 2 adds `dropped` beside it.)
- A `kind_fields.observe.cutoff`: `["when:time!"]` (and `refs.subject` the word, read by blocks.md).

**`refs.key`**
- A `"key"` to `refs.what_and_which`; A `"key"` to `refs_single` (one id). C `refs.about`: add "refs.key names the key grant that brought in the key that signed the block (identity.md, refs.key)."
- `header_optional` gains `"key"` in stage 2 (02-store.md, section 3), with the header's text in privacy.md.
- `needs` is not touched here: stage 2 rebuilds it as "names for its meaning" and the pieces.

**Refusals**
- R `refusals.codes.block.not_own_rotation`, R `refusals.codes.block.recovery_scope`. `refusals.checks` is stage 2's, and lists neither (02-store.md, section 3).
- C `refusals.codes.block.bad_genesis`: "a genesis with author, prev, after or seq, missing a genesis field, with reach and no keepers, or not signed by its own key".
- A `refusals.codes.fold.waiting`: "a word that does not yet stand (blocks.md, Finality); listed in `waiting` with what it waits on, never refused".

**Folds and views**
- C `folds.identity.ops`: `["identity_state", "key_timeline", "stands"]`; C `folds.identity.words`: `["signed_by_author", "keys"]` (R `frozen`); C `folds.identity.output`: `{ "signed_by_author": "{ hash: true when a key of the block's author spoke for her there: a key of a voice of her list standing in the block's causal past, or a key under one, not ended for that block (identity.md) }", "voices": "the list standing in the reader's held blocks: [{ key | key_hash | names, needed, suite, wait, reach }], highest first", "keepers": "the list's clock, or null", "keys": "the keys of standing voices and keys under them that no end has reached, sorted", "waiting": "[{ block, on }]: key grants and words of hers that do not yet stand (blocks.md, Finality)", "operators": "authors of live operator grants naming it, sorted" }`.
- R `views.recovery_reach`, R `views.recovery_shown`.
- C `views.promise_view.input`: "a first promise, the blocks held, the reader's clock". C `views.ownership_view.input`: "an instance, the blocks held, the reader's clock"; C `views.ownership_view.output`: "the ownership fold's answer; a transfer that carries a condition counts once the condition holds at the clock given (none given: only a condition that needs no clock)". R `views.ownership_view.clock`'s arrivals: C to "the reader's own".
- C `door.conventions.id`: delete the sentences on `arrivals` and `unknown_arrival`.

**Profiles**
- C `optional_profiles.successor`: `{ "file": "profiles/successor.md", "fields": { "grant": ["keys"] }, "close_rule": "A close counts when its author is the successor grant's refs.to and not the person, the grant stands and no stop of it nor the successor's decline or leaving is in the close's causal past, no counted close of its author is in its causal past, and the witnesses' key grant (identity.md) stands in its causal past. It ends authority, never a promise, for blocks that have it in their causal past, bar what state.continues names." }` (R `fields.grant` `witnesses`, `needed`, `wait`; R `views.successor_view`).
- C `optional_profiles.custody`: `{ "file": "profiles/custody.md", "kinds": { "observe": ["custody_policy"] } }` (R `fields.every` `proof`, `assisted_by`). `custody_policy` gets no `kind_fields` line: it is a host's own word, and no fold reads it.
- C `optional_profiles.short-form`: `{ "file": "profiles/short-form.md", "fields": { "every": ["proof"] }, "grammar": "short_code", "short_code": { "bits": 40, "alphabet": "crockford-base32", "group": "XXXX-XXXX" }, "short_reply": { "prefix": "FB1 ", "bytes": ["signature:64", "answered:5", "answer:1", "at:6", "seq:rest"], "answers": { "01": "accepted", "02": "declined" } }, "parts": { "prefix": "FB0 ", "tag_chars": 4, "max_chars": 153 } }` (R `receipt_code`, R `receipt_code_long`). A `kind_fields.observe.readback`: `["readback:hash!"]`. C `grammar.receipt_code` renamed `grammar.short_code` (same pattern); R `grammar.receipt_code_long`.
- C `optional_profiles.rekeys` unchanged (its key grant is encryption-only).

**Door ops** (see section 4): R `door.ops.recovery_shown`, `recovery_reach`, `recovery_key_hash`, `successor_view`; A `key_hash`, `stands`; C `key_timeline`, `live_keys`, `signed_by_author`, `ownership_view`, `promise_view`, `receipt_code` (renamed `short_code`).

**CBOR key table** (`cbor.keys`): names removed `recovery_key_hash`, `recovery_reach`, `custodian`, `replaces`, `recovery_key`, `recovery_suite`; names added `key_hash`, `reach`, `voices`, `key`, `shown_key`, `keepers`. No position is renumbered here: stage 7 issues the table once, whole, with no holes (00-shared, row 40). C `cbor.bytes.hash`: replace `state.custodian`, `state.recovery_key_hash`, `state.assisted_by` with `state.voices[].key_hash`, `state.keepers.names[]`; C `cbor.bytes.sign_key`: replace `state.replaces`, `state.recovery_key` with `state.voices[].key`, `state.shown_key`.

**Deleted, counted.** 32 entries: 3 genesis recovery fields and its about (4); `custodian`, `replaces`, `recovery_key` as fields (3); `recovery_reach`, `device_wait` shapes (2); 2 refusal codes (2; their check entries go with stage 2's `refusals.checks`); `frozen` word and output (2); 2 views (2); `unknown_arrival` and arrivals in 3 view inputs, 1 view output and the conventions (5); successor `witnesses`, `needed`, `wait`, `successor_view` (4); custody `assisted_by`, `proof` (moved) (2); `receipt_code_long` grammar and profile entry (2); 4 door ops (4). The will's four kinds (`will`, `recovery_claim`, `recovery_agree`, `device_claim`) are named nowhere in `protocol.json`; they leave the code (section 7).

---

## 4. Door ops

| Op | Was | Now |
|---|---|---|
| `recovery_shown` | `(id, held, now?, arrivals?)` → `{ subject, will, conflict, pending_wills, claims, keys }` | **removed** |
| `recovery_reach` | `(rotation, held, arrivals, unknown_arrival)` → voided blocks restored | **removed** |
| `recovery_key_hash` | `(recovery_public_key, suite?)` | **removed**; replaced by `key_hash` |
| `successor_view` | `(grant, held, now, arrivals)` → `{ events, cancelled, since, fires, fired }` | **removed** |
| `key_hash` | | **added** `(public_key, suite?)` → the suite's hash of the key's SPKI hex as UTF-8 text (identity.md, Her voices) |
| `stands` | | **added** `(block: full_block, held)` → `{ stands: true or false, waiting: [{ block, on }] }`: blocks.md, Finality, read on `held` with no clock and no arrival. `on` is one of `wait` (a wait not yet run), `reach`, `confirm` (the second signature), `end` (an end not yet passed), `named` (a block it names for its meaning that does not stand), `condition` |
| `identity_state` (fold op) | `{ signed_by_author, keys, frozen, operators }` | `{ signed_by_author, voices, keepers, keys, waiting, operators }` (section 3) |
| `key_timeline` | `(id, held, arrivals?, unknown_arrival)` → `[{ key, by, signer, frozen, suite }]` | `(id, held)` → `[{ key, by, voice, under, suite, ended }]`: every key a list or a key grant of hers brought in, in the order of the blocks that brought them in; `by` that block; `voice` its place (0 is first) or null for a key under a voice; `under` the key of its voice, or null; `ended` the key grant that ended it, or null |
| `live_keys` | not void, not frozen, not rotated out | `(id, held)` → the keys of standing voices and keys under them that no standing key grant has ended, sorted (nodes.md, Messages) |
| `signed_by_author` | `(block, held, arrivals?, unknown_arrival?)` | `(block, held)` → true when a key of the author spoke for her there (identity.md, invariant 8); a waiting block is true here and listed by `stands` |
| `ownership_view` | `(instance, held, arrivals, unknown_arrival, now?)` | `(instance, held, now?)` |
| `promise_view` | `(first, held, { now, arrivals? })` | `(first, held, { now })` |
| `receipt_code` | the short code | renamed `short_code`, same args and result |

---

## 5. The cases, walked under the new text

Maria's list throughout: card in a drawer by hash (first); mum and brother, `needed` 2, `wait` P7D; phone, `wait` P30D, `reach` P1D. Keepers: shop, host, aunt; `needed` 2. Tablet: a key under the phone. Her AI: a tool, under her grant with a limit.

**A lost phone.** Mum signs a key grant: the list restated, a new phone key in the phone's place (they are above it, so they may), `counted_to` her last phone block. Brother confirms. Two keepers receipt it. After seven days their cutoffs close the wait with no "no" from the card; mum and brother confirm again; it stands. Her old phone blocks stand (each passed the reach before, or is on the counted line). The tablet's adding block is inside the cut, so the tablet goes on, now under the new phone key. During the week she has the keys she had: her tablet, and her AI under its limit. **Who wins:** Maria, by her relatives' word she signed would stand after seven quiet days.

**A stolen phone.** The thief sells Sam her oven at nine. It is a transfer of a reach key: it waits until two keepers each hold a receipt and a cutoff a day on. Sam's screen says "waiting, one day". At noon mum and brother sign the key grant leaving the phone out; one keeper receipts it before her cutoff: the sale never stands (one keeper is enough to narrow). The thief's own key grant (adding his key) waits thirty days, and the relatives' no is received first: it never stands. **Who wins:** Maria. Sam loses only if he shipped on a waiting word; his claim is on the thief. With a phone that states **no reach**, the sale stands when signed and Sam, a relier unseen, keeps it; Maria bears it (blocks.md, Who bears the gap) and claims on the thief.

**A thief with ten minutes.** Leila borrows the phone and signs (1) a key grant putting her key in the phone's place with `wait` and `reach` zero, (2) a grant to her own key, (3) a new account word, (4) a sale of the van. (1) restates the phone's own wait and reach as they were or is no key grant (only a voice above changes them). (1), (2) and (3) each stand only when the phone confirms them after its thirty-day wait; Leila has handed the phone back, so they never stand. This is **the planted grant**, closed. (4) waits a day; if Maria is not told, it stands after the day and the van is the buyer's; she bears it as her own key's word. **Who wins:** Maria for everything that lets Leila act; the buyer for the van if a day passes unseen. Not mended: a thief who copied the key can confirm in thirty days himself; her next phone block then makes a pair, seen only by one who holds both.

**A malicious host.** The host holds no key of hers (decision 6). As one keeper of three it can date nothing alone: two are needed to close a wait or a reach, one honest keeper's receipt of a "no" narrows. If she named it her only keeper, it can stall every wait (silence) or backdate a cutoff to close a wait early, and with a stolen phone it could then take the phone's place. It can never reach above that place. Her first voice asks nothing of the clock: she shows the card once, puts a new phone key in place and names new keepers. **Who wins:** Maria, by a voice she kept above every clock.

**Quarrelling relatives.** Mum and brother sign for one key; sister and mum (two of three) for another. Both are key grants of one voice that do not see each other: a pair of that voice; neither stands. A third, by any two, that has both in its causal past, stands after its wait. If they turn on her, her phone cannot stop them (it is below them), but her card can: it is above them, and its "no" in their wait wins. **Who wins:** whoever she ranked higher. She could never put them first (row 13).

**Death.** Harry's list: card (first); the doctor and his sister, `needed` 2, `wait` P14D; his phone. They sign a key grant that leaves no voice at their place or below. His nephew holds the phone and signs "no": the phone is below them, so it cannot. Fourteen days on, with no "no" from the card, they confirm again and it stands. His successor's close, with that key grant in its causal past, counts; after it no key grant of Harry's counts. Had Harry wanted any device of his to say "I am alive", he would have ranked the witnesses below it. **Who wins:** the witnesses he named, under the order he set.

**A person with one basic phone and a card.** Mama Achieng: `voices: [{ key_hash: card B }, { key: card A, wait: "PT0S" }]`, no keepers, no reach. Card A signs her grant to her SIM tool (up to 500 a deal) and her grant to Soko, each twice at the kiosk (two PIN entries; a wait of zero has run at once). Daily she replies three digits (way 2) or signs by her SIM (way 1 as her tool, or as her key for a bigger sale if her SIM key is a voice). **SIM swap:** the thief gets her number and no key; Soko's quiet line and her `each` bound him; card A stops the grant. **Card A stolen with its PIN:** the thief signs as her, at once, and twice (zero wait). She shows card B at the kiosk: a key grant putting a new card in A's place, which card B signs twice (its wait is zero, as the first voice's always is); with no clock it stands for every block that has its second signature in its causal past. What the thief signed that a relier used unseen binds her (no clock, no reach); her claim is on him. **Who wins:** Mama Achieng for her name; strangers who relied unseen for their deals. She needs no smartphone, no keeper and no other person above her.

**A person with one voice and no clock.** Her genesis only. Everything she signs stands when signed; her grants stand at her second signature, which a thief can also make. Ten minutes with her key and the name is his. A lost key: nothing more can be signed as her; her record stays true; she starts a new identity. A clock would not help her: a wait means something only where a voice above can say no. **What she lacks is a second voice.** Said once, plainly, by whatever makes her key.

**A broken suite.** Every shown `std` key can be forged. Harry's first voice is the hash of a key in a sound suite, never shown. The forger signs as his phone and a key grant; Harry shows the card's key once, puts sound-suite keys in every place and names a new hash. That key grant cuts by causal order alone: only what it has in its causal past counts of the old keys. His keepers' receipts are forgeable too, so no clock is read. What Harry signed and did not cite he signs again. **Who wins:** Harry. With a shown first voice in the broken suite, he and the forger cross with nothing to order them: two key grants of his first voice, a pair, neither stands, and the name is closed.

**Not mended.** A stolen **first voice**: the thief is her, for good. A key **copied**, not taken: he signs twice. A keeper who **leaves out** a "no" from a cutoff: shown false only by the receipt, which a judge reads. A **weak hidden key** (a remembered phrase): its hash is public and can be guessed offline.

---

## 6. What changes for existing blocks and vectors

**How old identities read, exactly.** 1.7 is not locked (core.md, section 11: the law binds from the lock, which never happened), so strict holds: a block is read only in 1.8's shapes, and signed content is never repaired.
- **A 1.7 genesis with only** `kind`, `at`, `audience`, `public_key_sign` (and `suite`, `public_key_encrypt`, `nonce`) **is a 1.8 genesis, unchanged:** a list of one voice, its own key, with no wait, no reach and no keepers. Its own key's blocks stand when signed; its grants stand at its second signature.
- **A 1.7 genesis carrying** `custodian`, `recovery_key_hash`, `recovery_reach` or `recovery_suite` is `bad_genesis`. Every such genesis was made by a door, a host or `fb init`, which held the key in a file or a store: retired (section 7).
- **A 1.7 key grant**, and every block signed by a key it brought in, lacks `refs.key` and was never signed twice: no such key speaks. Each person signs again: a list or a key under a voice, confirmed, then new blocks.
- **The will's four kinds** are open `observe`s; they stay valid and are read by no fold.

**Vector sections that go** (in `spec/vectors.json`):
- `door` cases of `recovery_shown` (24), `recovery_reach` (10), `successor_view` (12), `recovery_key_hash` (2): 48 cases. The 37 named `will:` are among `recovery_shown` and its makers.
- `identities`: "two rotations of one key that name one prev freeze only the keys they bring in"; "held keys: a custodial genesis …"; "two key grants naming one prev freeze the keys they bring in …"; "a rotation by another of the id's keys is refused (not_own_rotation) …"; "after: recovery reach is causal and read from arrival …". Five of nine.
- `folds.successors` (2): rewritten under the new profile.
- `refusals` and `valid` cases whose expected code is `not_own_rotation` or `recovery_scope`.

**Vectors that change answer.** `key_timeline` (30): new result shape; `frozen` gone. `signed_by_author` (45): every case that read recovery, freezing or arrivals; cases with arrivals lose that argument. `live_keys` (1). `ownership_view` (5) and `promise_view` (54): the cases given arrivals (5) go; the rest keep their answers. `identities` "two blocks of one key that name one prev …" and "a person has no operator who may rotate their key" keep their stories in the new shapes.

**Vectors re-signed with the same answer.** 488 of 3,183 door cases carry a genesis with `custodian` or the recovery pair, or a key grant with `replaces`, in their fixtures. Their makers drop those fields and add `refs.key` and the second signature; ids change, answers do not. Every maker in `sdk/javascript/test/make-vectors-*.cjs` is re-run. Cases no maker makes gain `refs.key` by steps 1 to 3 of `tools/resign-vectors.cjs` (02-store.md, section 5), run in this stage; stage 2 runs its later steps (signing over the header).

**New vectors** (a maker `make-vectors-voices.cjs`; each a story and its expected answer):
1. A genesis is a list of one voice: `identity_state.voices` is `[{ key }]`, `keepers` null.
2. A list with a reach and no keepers: `shape`.
3. A list whose first voice is `{ names, needed }`: `shape`.
4. The phone's key grant adding a key, confirmed before its wait ran: `stands` false, `on: wait`.
5. The same, confirmed after two keepers' cutoffs through receipt plus the wait: `stands` true.
6. The same, with one keeper's receipt of the card's "no" before her cutoff: `stands` false for good.
7. A key grant of a voice with no `wait`: never stands by itself; true once the voice above confirms it.
8. The planted grant: the phone signs a grant to Leila's key and never confirms: `stands` false, `on: confirm`; a block under it backs nobody.
9. The phone restates its own place with `wait` zero: no key grant.
10. Two key grants of the relatives' voice that do not see each other: both false; a third that sees both, after its wait: true.
11. A key grant that only takes its signer out: true when signed, with a pair on its key.
12. The first voice's key grant: true at its confirm, with no keepers.
13. A `key_hash` voice shows itself: its first block states `shown_key`, `refs.key` the list; `signed_by_author` true.
14. A key under a voice: speaks while its voice speaks; ended with its voice when the adding block is outside the cut; goes on when inside.
15. A stop by a voice above of a key-under-a-voice grant: the key's later blocks count for nothing.
16. A reach key's transfer: `waiting` (`reach`) until cutoffs through receipt plus reach; then true.
17. The same, with a key grant leaving the key out received first on one keeper's line: never stands.
18. The same, confirmed by a voice above: true at once.
19. A no-reach key's sale relied on unseen, then the key cut: the sale stands.
20. `counted_to` on a no-reach key: a block off the line that a relier used unseen still stands; one nobody used counts for nothing.
21. A suite move: an old-key block not in the move's causal past counts for nothing and forms no pair.
22. A key grant naming in `refs.updates` a list already replaced: no key grant.
23. A block of a key whose key grant is waiting, a stop: counts for nothing.
24. Death: witnesses' key grant, nephew's phone "no" ignored, close counts after the wait; a later key grant of Harry's counts for nothing.
25. A card's P-256 genesis, its two grants each confirmed, Soko's accepting witness under one, her stop.
26. A short reply rebuilt with `refs.key` from her list: valid and `accepted`; moved to another offer of the same price: `bad_signature`.
27. A host-made identity: a two-key link to the host, a key grant taking its only voice out; a later block counts for nothing; a transfer to her new id lands on her accept.
28. A cutoff that leaves out an earlier receipt of its own line: closes nothing.

---

## 7. Build notes

**Order.** (1) `spec/protocol.json`, then `node test/sync-spec.cjs`. (2) The spec text (section 2). (3) The oracle. (4) The Rust core. (5) The vectors. (6) The SDKs. (7) `mcp/` and `cli/`. Stage 2 rewrites `valid` (check 6) after this; until then `valid` resolves the key by `refs.key` through the function in step 4 and keeps its other checks.

**The oracle, `spec/oracle/fb.cjs`.**
1. Delete `recoveryShown` (4366), `recoveryReachView` (1746), `reachArrivals` (5184), `successorView` (4434), `withClaims` (1517), `recoveryDefeatsOk` (1505), `recoveryKeyHash`'s recovery use (57; keep it as `keyHash`), and the trigger reading in `yieldsToSuccessor` (4022).
2. Rewrite `broughtKey` (1407), `signerFrom` (1421), `signerStep` (1443), `signerKeyOf` (1983) and `keyOfEntry` (2120) as one function: the key is the genesis key, or the key the block in `refs.key` names (a `key` voice, a shown `key_hash`, or a key under a voice).
3. Rewrite `identityFold`, `identityFoldBase`, `plainIdentityFold`, `computeIdentity` (1511 to 1745) as one pass in causal order: for each block, the list standing in its causal past; whether its key is a voice or under one; whether an end has reached it (The cut); whether it waits (`reach`). Output per section 3. `voided` (2032) reads `signed_by_author`.
4. Add `stands(block, pool)` (blocks.md, Finality): pieces stand; ends passed (The cut, with Seen); reach closed; rule 13 for key grants, grants, account words and hand-overs; condition held. One helper; later stages call it.
5. Add the clock readings once: `receivedBy(T)`, `waitRun(start, wait)`, `firstOnLine(a, b)`, `cutoffCloses(cutoff, pool)`.

**The Rust core.**
1. `sdk/rust/src/identity.rs`: delete `Reach`/`ArrivedAt`'s reach paths (28 to 44), `recovery_key_hash_in` and `recovery_key_hash` (174 to 180; add `key_hash`), `take_keys` (494), `recovery_signer_of` (1600), `recovery_defeats_ok` (797), `claim_key_of` (1503, 1507), `built_on_frozen` (1371), `beyond_reach` (1386). Rewrite `genesis` (221, `GenesisOptions` loses `custodian`, `recovery_key`, `reach` as undo; gains `reach`, `keepers`), `key_grant` and `key_grant_with` (454, 509: `voices` or one `public_key_sign`; `refs.updates`; `counted_to`; `shown_key`), `brought_key` (326) and `signer_in`/`signer_step` (374, 407) by `refs.key`, and `read_keys`, `line_of`, `speaks` (943 to 1350) as the one causal pass. `identity_state` (1558) returns the new output; `key_timeline_in` (1396) and `live_keys` (1416) the new shapes.
2. `sdk/rust/src/fold/will.rs`: delete. `fold/mod.rs`: drop it. `fold/successor.rs`: the close rule of section 2.7. `views.rs`: drop the reach view and arrivals from `ownership_view` and `promise_view`.
3. `check/actor.rs` and `check/keys.rs`: the genesis fields, `voices` as `shapes.voice`, `keepers` with `reach`, the first voice a key or hash.
4. `write.rs`: the writer puts `refs.key` on every block not signed by the genesis key, and lets a forked key write a key grant that takes itself out.
5. `door.rs`: the ops of section 4. `valid.rs`: stage 2's.
6. Rebuild WebAssembly, the Python library and the XCFramework; every SDK's tests.

**The SDKs.** `sdk/javascript/src/identity.cjs`: `genesis` loses `recoveryKey`, `reach` (as undo), `recoverySuite`, `custodian`, gains `reach`, `keepers`; `keyGrant` takes `{ voices | key, updates, countedTo, shownKey }`; add `confirm(word, signer)` (the second signature) and `stands`; delete `takeKeys`, `recoveryKeyHash` (add `keyHash`), and the `arrivedAt`/`unknownArrival` options on `identityOf`, `keyTimeline`, `keysOf`, `signedByAuthor`, `identityState`. The same in Python, Go, Swift and Kotlin door tables.

**`mcp/` and `cli/`: no door makes or holds a person's key** (b3/19 F1).
- `mcp/door.js:48-54` `newPerson`: delete from the door. It makes the person's signing, encryption and recovery keys inside the door, and names a `custodian`. Test fixtures that need fictional people make them in `mcp/test/` only.
- `mcp/door.js:150`: the assistant's keys are made by the assistant's own program; `connect` is given the assistant's public key and genesis, never makes them. `connect` refuses a type the door cannot write.
- `mcp/server.js:100-115`: delete reading her keys from `FOODBLOCK_IDENTITY`, writing `<file>.recovery.json` (`:105`) and `<file>.approval` (`:114`), and printing the approval file's path (`:231`, `:238`). Delete `FOODBLOCK_REACH` (`:10`).
- **Where her key lives:** a **passkey**. The core already speaks it (`passkey_challenge`, `passkey_signature`; encoding.md, Passkeys; suite `p256`). Her genesis key, or a key under her voice, is a passkey on her own device. The approval page shows the exact draft and asks her browser to sign its challenge; the door receives the assertion and the public key only, and the tap is a platform prompt no assistant can press. No new protocol. The approval code goes: the passkey is the yes.
- `mcp/store.js`: drop `identities`, `accounts`, `operator`, and `sealer`'s use for people.
- `cli/bin/fb.js:51-58`: `fb init` keeps the signing key in the **system keychain** (macOS Keychain, Secret Service, Windows Credential Manager), never in a file; it writes no `<file>.recovery.json`; `--reach` goes (a list states it, by `fb voices`). The identity file keeps only public blocks. One writer per identity file: re-read and lock before each signature, rename into place (b3/19 F6).
- Retire `takeKeys` everywhere: it moved a host's key out by rotation, which would make a host's past words hers.

**Retiring host-made keys, as blocks.** For each identity whose key a host or door made, the host signs, with keys it already holds and nothing new:
1. a two-key link: the held identity's key writes an `observe` of kind `link`, `same_as` the host's identity, and the host's own key counter-signs with a `link` naming it in `refs.confirms`; so every block the held key signed reads as the host's word;
2. with the held key, a key grant that takes its only voice out: the identity is closed, and nothing signed after it counts;
3. for each thing or claim the held identity holds that is the person's, a transfer or hand-over to her own id, made after her own genesis; it lands on her accept, signed by her own key.
Nothing is rewritten. Her new identity begins at her first yes, owing nothing the host signed.

---

## 8. What this stage deliberately leaves

- **`valid` and `read`** (stage 2): check 6's rewrite (the key by `refs.key`; no recovery key; no `not_own_rotation`, `recovery_scope`); the pieces and `needs`; the header text with `key`; the pair by `prev` or `seq`; "a block that does not count for its author forms no pair" written into folds.md, A fork is a burden.
- **`folds.md`, A line** (stage 2): "Read whole", `not_shown`, `lacks`.
- **A grant's line** (stage 4): the meter, `scope.on`, `scope.keepers` on a grant, and what a tool may do; "a line ends when its key is ended in its holder's list" (b3/06 F); `scope.until` on a key grant (1.7 had it; it is gone here, and a key's time bound is its voice's wait and reach).
- **authority.md pointers** (stages 4, 6): `authority.md:13` and `:53` (Held keys, Rotation), `folds.md:30`, `:60`, `:68`, `nodes.md:32`, `consent.md:9`, `transport.md:25` point into sections this stage deletes. Each later stage that owns the file repoints it; until then they read "identity.md".
- **The node's arrivals** as a sealed chain of receipts (stage 2).
- **Who learns her list**: a `names` voice shows who her recoverers are; sealed lists are stage 7's.
- **A keeper's own promise** (what stands behind a named signer: stage 5).
- **Open** (00-shared, Open, for the stage that meets them): whether a passkey voice may state a wait (b2/06 q5: a page can make a passkey sign bytes she never saw); how a voice of several people signs again (When a key grant stands drafts "`needed` of them each confirming again").

---

## 9. Asks of the shared ground

Asks settled in 00-shared.md on 2026-11-11.

---

## 10. Settled in the third step (2026-11-11): where the two builds differed, the words now say

Two builders worked from sections 2 to 4 apart: the Rust core and the oracle. Every place they read the text two ways is settled below, in the spec itself; both engines follow it, and `node test/audit/run.cjs` asks both every question of the Rust builder's worlds (`test/audit/k1-keys.cjs`), the oracle builder's stories (`test/audit/k1-stories/`) and the shape cases (`test/audit/k1-shapes.cjs`). The choices another stage could trip on are rows 53 to 64 of `00-shared.md`, section 4. Sections 2 to 4 above read with these changes:

- **identity.md, Her voices:** a key grant never states `reach` (`undeclared_field`); it states `voices` or one `public_key_sign`, never both, and `keepers` only with `voices` (`shape`); one that states `voices` names the list it replaces (`required`); `voices: []` only in a key grant that leaves no voice, which ends her identity.
- **identity.md, When a key grant stands:** signing again has in its causal past the cutoffs that closed the wait; a voice of named people: `needed` of them each sign it again so, each having signed it or confirmed it before. A no is a counted key grant stating a list for the same list, standing or not; it is first when one keeper's line holds it before her closing cutoff, or when it is in a second signing's causal past. Two by one voice: neither ever stands. One list at a time: read in the key grant's own causal past; of two standing key grants that replace one list, the higher voice's is the list, of one place neither. New bullet **Narrowing**: a key grant that adds and shows no key and only leaves voices out is not signed twice; it waits on reach and the cut. Taking oneself out: no wait, reach or cut holds it.
- **identity.md, Reach:** her key grants of her own list are among the words a reach holds; a key grant is never its own end; a wait or a reach reads the word and every key grant of hers; "its blocks stand when signed" is replaced by "no reach delays its blocks. Whether a block of any key has passed that key's ends is the cut's question alone."
- **blocks.md, A named clock:** a name's line: a person's id, her genesis key's line; a key grant that adds one key under a voice, that key's line; any other block, its key's blocks after it. A cutoff is shown false by a receipt of hers after it on her line, dated at or before T, of a block the word's rule reads.
- **blocks.md, The cut:** the signer's own later counted block naming the block passes its ends with a clock or without; to name or use a block is to name it in any ref but `prev` and `after`, or in `state.counted_to`. Seen: whether the end stands is read on all the reader holds; a block that names the end in `refs.confirms` has not seen it. Relier: "or one passed on from it" (00-shared).
- **blocks.md, Finality:** `waiting` lists one entry for each thing (`wait`, `reach`, `confirm`, `end`, `named`, `condition`); a word that can never stand is listed nowhere. Signed twice names its words: a grant that is not a stop, an answer or a machine lock; an `account` word; a hand-over of a claim, a transfer that names in `refs.what` a deal or a claim of invasion.
- **profiles/successor.md:** the grant stands in the close's causal past and covers it where it states `scope.types`; the witnesses' key grant counts only by a voice that does not name the successor (the `shape` check is gone: it needs her list).
- **profiles/short-form.md:** the template's `for` is the block answered and its `derives_from` a list of one id, a `readback` `for` it; `prev` is her head of that key held, or the block that brought it in; `refs.key` the key grant that brought it in.
- **folds.md:** `successor_view` leaves the profiles' list; a crossing transfer yields to her successor's once a counted close of her under the grant is in its causal past (the trigger is gone).
- **protocol.json:** `field_shape.reach` goes (the duration rule is `shapes.voice`'s and the genesis's; a machine lock's text `reach` waits for the lock mend: 00-shared, Open); `shapes.voice.about` names the one empty list; `door.ops.stands` names the order and meaning of `on`; `short_code` loses `long?` and `code_matches` its "ten the long one" (more characters are more of the id); `key_timeline` orders the keys of one block by place; the successor `close_rule` and `folds.identity.output.waiting` as above. The core's own `short_reply(answer)` and `short_reply_open(text, signer, held)` (sdk/door.table) are the oracle's too.

Left open for the owner: whether a passkey voice may state a `wait` (00-shared, Open). Left open for later: a key under a voice when a voice above it is added or removed (its place's index moves).

**Pointers, added later the same day.** The passkey question is settled: a synced passkey may be a voice and may state a wait (00-shared, row 70). A voice may state a cap (`each`, `limit`, `every`) in this stage's files (identity.md, blocks.md Finality, `shapes.voice`, `stands`); it is built in stage 4 (04-grants.md, section 11; 00-shared, row 65).

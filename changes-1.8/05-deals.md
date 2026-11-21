# FoodBlock 1.8, stage 5: deals

Uses the words of `00-shared.md` with its meanings (a line, its start, read whole, `not_shown`, `lacks`, a measure, a draw, holds, lands, freed, the six reasons, an amount, `uncovered`, `unanswered`, stands, waiting, signed twice, an end, the cut, a relier, seen, a pair, a fork, a named clock, a keeper, a receipt, a cutoff, a tool, a named signer, Keeps to, `refs.meter`, `terms.deadline`) and defines none of them again. Written as if stages 0 to 4 have landed: `scope.types`, no act templates (stage 0); `refs.key`, `blocks.md` Time, A named clock, The cut (with Seen, Relier, Who bears the gap) and Finality (stage 1); `folds.md` A line, `valid` and `read` (stage 2); `folds.md` What is left, things.md Transfers, the counting sentences of A promise's stage and `uncovered` (stage 3); authority.md Blocks that bind, Keeps to, the meter, Her deadline, rule 10 (stage 4). P8's Named readings paragraph names stage 7's `state.rule_set` and `reading_not_run`. Line numbers are the files as they stood on 2026-11-11; every passage is also named by its first and last words, because the files move under the builders. Stage 3's word swaps in `promises.md` and in five profiles change no line count and are kept as made.

---

## 1. What this stage does

1. **A deal is a machine that only moves forward.** An offer, a request and a transfer to a named receiver are standing words. An answer binds when it stands, which closes three open points: *when* (did it come in time?), *which* (which taker does an open offer reach?), *whose* (is it truly the signer's word yet?). After that no block of a side, and no stranger's, makes it bind less. Only the judge both chose (the bench) can lower a stage, and even she moves no thing.
2. **Nine special cases go:** the late decline and its three exceptions, the late decline of a transfer, "one binds on accept, the other by allocation" as two rules, `{ accepted }` as a gate, a seller's own delivery to an "open receiver", the crossing rule that picked by hash or freed the liar, "the latest `covers`", `forfeit` kept whoever stops, and the backup referee who could be blocked or overruled.
3. **Five sentences** take the place of about forty profile rules. Ten profiles become patterns: worked examples over the core, with a schema, adding no rule.
4. **One section says what stands behind a named signer:** her name, and whatever she promised. Nothing else.

**Amara's flour.** Sam offers 50 kg of flour at £60, `expires` Friday, on the market keeper's clock. Amara accepts on Tuesday; the keeper receipts it; the accept stands: `accepted`. Sam's account word names PayLink as a signer who may say money reached him. Amara pays over PayLink; PayLink signs that it came; Sam relies on it and delivers; Amara accepts the sack: `done`. She orders 20 kg back out of it to Leila: Leila signs first ("this 20 kg, £26"), Amara's transfer says "had: £26", and it is Leila's when signed. A week later PayLink takes its word back (a chargeback). Nothing moves back. The 20 kg is Leila's, the 30 kg Amara's, the stage `done`. If Amara never truly paid, she owes Sam £60, before the judge they named; PayLink owes Sam only what PayLink promised him.

---

## 2. The title theory, as the spec will state it

This goes into `promises.md` as its opening section (P1 below). It is short on purpose: every later rule points here.

> **What a promise is.** A promise is a transfer of title on a condition: *if this happens, this of mine becomes yours, and this person settles it.* Three signed words make title wait on a condition, and no others: a **promise** (it names a kind, a quantity, a price and terms, and moves nothing until a transfer names a thing); a **transfer with `state.condition`** (it names one thing or one amount and moves it when the condition has held, with no further word of the giver); and a **transfer to a named receiver** (its one condition is her yes). Every other block (an answer, a receipt, a signal, a stop, a ruling) says whether a condition was met; none states one.
>
> **When title passes.** A thing or an amount passes when its owner's transfer stands, the receiver's yes is in its causal past or answers it, and its condition has held where it lands (folds.md, What is left, Lands). Not at the accept of the deal: an accept fixes the terms by which later transfers are read.
>
> **What binds means, when no body is bound.** A deal binds when an answer to a standing word stands (Who may bind). It gives no one a right to an act of another. It does three things, all about title: it fixes the terms by which the blocks made `for` it count; it is the condition on which anything handed over `for` it is held, so what was paid for a deal that never came is still the payer's (`uncovered`); and it makes true the conditions others hang on it.
>
> **A breach** is two facts and never a verdict. A **broken word**: the deal bound and a side stopped or did not perform; shown, never a debt. **Property held on a failed condition**: `uncovered` above nothing; owed as the owner's own title, never as damages. A refrain's `breached` is the bench's finding that the condition on which its stake moves has been met.
>
> **A deposit, a bond and a forfeit.** Money handed over `for` a deal is the receiver's title on the deal's condition. `forfeit` is a second condition the payer signed on part of it: *this much stays yours if I am the one who ends it.* A **bond** is a transfer conditioned on an event read on a clock both named (a no-show is a bond: things.md, The caterer's bond). A thing to be kept apart is a thing handed `to_holder` (things.md, Transfers, Handed over or held).
>
> **A ruling** changes what is owed, never who owns. The bench's word changes which blocks of the deal count toward its stage and what each side owes; it reaches a draw only where it stands in that draw's causal past, so a thing that landed and stood stays where it is, and the ruling is a sum owed. **A sale that states no taking back is final:** a taking back is a new promise of the one who takes.
>
> Ground: title moves only by its owner's word, on the condition she stated before anyone relied on it; a body was never acquired, so no word hands it on, and a wrong found later is a debt or a claim before a judge both chose, never a reversal (Rothbard, *The Ethics of Liberty*, ch. 19; Kinsella, revising Rothbard; Evers).

---

## 3. Spec edits, file by file

### 3.1 `spec/modules/promises.md`

**P1. Line 5, "What a promise binds"** ("**What a promise binds.** Every promise has one shape: ..." to "...(Title-transfer theory of contract: Rothbard, *The Ethics of Liberty*, ch. 19.)"). Replace whole with section 2's text, then this paragraph kept from the old one: "A promise binds its signer's name and what she pledged, never her body: a side may always stop onward (Answers). A signed word never gives anyone a right to use force on the signer's body; only her own attack, never her word, costs her that. Trade, loan, wage, deposit, warranty, stake and guarantee are all this shape."

**P2. Line 12, Where to pay me** ("**Where to pay me.** A person's own signed word ..." to "...or null."). Keep the paragraph; after "a payment made to an older pair stays what it was." add:

> It may name `state.by`: a sorted list of ids, the signers whose word that a payment reached this destination counts as her accept of it. Such a signer says so by an `observe` of kind `received` (the one word for "this much came": things.md, Transfers; a receiver with nothing to answer signs one herself), `refs.subject` the transfer, `state.amount` what came (no more than the transfer states), `state.marks` the rail's reference. It counts as the payee's accepted answer to that transfer for that amount, once it stands (blocks.md, Finality: a named signer's word passes its ends when a block of the payee's side made `for` the deal has it in its causal past, or the account word's own `keepers` received it before any end). It is her word, so it fills no silence; one who names no `by` is the only one who can say money reached her, and a payer's screen can show that. **Off-record money counts only on the payee's accept, or the signal of a signer her account word names** (things.md, Transfers).

And at the end of the paragraph: "The door's `account_of` gives `by` beside `destination`."

**P3. Lines 18, The deal.** After "...so no other taker's payment counts toward it." add: "A buyer's order that names an instance is a first promise like any other, and the seller's transfer `for` it is his yes (things.md, A spot exchange)."

**P4. Terms, line 20.** Add `waits_on` to the list (after `notice, deadline, fallback`). After the `pay_by` bullet (line 27) add:

> - `waits_on`: `goods` (the price is due only once the receiver's `accepted` answer to the delivery stands) or `price` (what moves is due only once the payee's signal stands). Left out, nothing is filled in: due is read from the deal's other terms alone.
> - **The payee's signal.** A counted `observe` of kind `paid` that speaks for the payee, `refs.subject` the deal, with `state.line` or `state.occurrence` where it is for one line or one occurrence: her word that the price of that deal (or line, or occurrence) is paid. It is her word against herself: it releases what she was to be paid and makes due whatever waited on that price. Her tool gives it only where the payments she or it has accepted come to the price (authority.md, Blocks that bind, way 4). It is not `received`, which says only that an amount came, and not the reading `{ paid }`, which is a sum (Conditions, Named readings). As a condition it is `{ signal: "paid", by: [payee], subject: deal }`.
> - **Due.** What a deal owes is due by its own terms and at no other time: where the block that performs it has in its causal past the deal's binding accept, standing; the deal's `terms.condition`, held for that block (Conditions, What a condition moved stays moved); and what `waits_on` names, standing: with `price`, the payee's signal; with `goods`, the receiver's `accepted` answer to the delivery; with neither stated, nothing waits. Due is read from these signed words only: no node adds up payments to answer it. An occurrence of a standing promise is due from its start, an event's from its clock's receipt plus `wait` (Relative time). `pay_by` and `deliver_by` are latest times, never earliest: they make nothing due, and are read only on the deal's clock, for lateness (blocks.md, Time). Due is a fact for the one who performs and for authority.md, rule 10; a payment before it is due still counts toward the price where the payee accepts it.

**P5. Line 32, `forfeit`** ("- `forfeit` is money: the part of what the payer paid ..." to "...(Settling)."). Replace with:

> - `forfeit` is an amount of the price's kind: the part of what the payer paid that she signed over on her own stop. It stays with the payee when an onward stop that speaks for the paying side is among the first onward stops of the deal and none that speaks for the payee is. In every other ending it is the payer's still. It covers her own stop only: a payer who never comes signs nothing, so money against a no-show is a bond, a transfer conditioned `without` her arrival signal on a clock both named (things.md, The caterer's bond).

**P6. Line 36, `notice`.** Replace "and leaving inside the notice costs the `forfeit` she signed beside it and nothing more (a notice with no `forfeit` costs nothing)" with "and leaving inside the notice costs only a stake she put up herself: her transfer conditioned on `{ stopped: <the deal>, side: <her side> }` (Conditions). A notice with no stake costs nothing." (The worker is the payee; a `forfeit` beside her notice named money that was not hers.)

**P7. Line 43, Refrain** ("**Refrain.** `terms.refrain: true` is the one shape ..." to "...only what the agent signed is read."). Replace whole with:

> **Refrain.** `terms.refrain: true` is a promise not to do something: *if I do this before `until`, this of mine becomes yours.* It binds what the signer pledged, never what she will do. It carries `terms.until` (`required`). It moves nothing, so it is never **done**. **On a refrain, as on every promise, `terms.condition` is the gate:** until it holds the refrain binds no one (a refusal binds no one until enough have signed). That the thing was done is said only by the bench: a refrain is **breached** by as many of its bench as `needed` signing a counted `defeats` of the deal's head (its first promise, or the offer the binding accept answers) saying it happened no later than `until` (its `state.when`, an instant or a range's `from`, else its `at`), not taken back by the same name; a breach found after the term still counts. A side's word that it was broken only disputes. **It is kept only by the bench's word too:** it is settled once its clock (`terms.keepers`) is closed through `until` and, after that cutoff, as many of its bench as `needed` have confirmed its head (`{ settled }`, a named reading: Conditions). **A stake on a refrain is written on the bench's own word,** which every node reads: `{ signal: "breached" }` or `{ signal: "kept" }`, `by` its bench, `signers` its `needed`, `subject` its head. **A refrain with no bench is never settled and never breached;** its stake moves only by a bench name's word after its clock closes, and its read-back says so. Past `until` with no breach the view says **elapsed**: a fact of its term, never that it was kept. *Example:* an employee, a buyer or the operator of an autonomous system signs the schema `loyalty` (patterns/vouches.md): *I take nothing from anyone else about what I do for you*, with money behind it. The payer is never marked: only what the agent signed is read.

**P8. Conditions, lines 45 to 54.**
- Line 45, its first two sentences ("A condition holds or not on the blocks a reader holds and the reader's clock: a view (folds.md, Views). It holds, does not hold, or is **not read**.") become: "A condition holds or not on the blocks a reader holds, read in the causal past of the block it is read for (P9), and a time in it only on the clock its signers named (blocks.md, Time). It holds, does not hold, or is **not read**." In its third sentence, "The protocol reads these shapes" becomes "The shapes are" (Named readings, below, says which seven the protocol reads).
- `{ settled }` (line 46): replace "or it is a refrain whose view is elapsed with its price, if any, paid in full" with "or it is a refrain the bench has confirmed after its clock closed through `until` (Refrain), with its price, if any, paid in full".
- `{ accepted }` (line 47): replace "A promise so conditioned binds only once that deal binds: an accept of it binds nothing before, and binds as soon as it does." with "A promise so conditioned binds on its own accept and owes nothing until that deal binds (Due)."
- After `{ paid }` (line 49) add: "- `{ stopped: <first promise>, side: \"from\" | \"to\" }` (`side`, not `by`: in a condition `by` names signers): that deal is stopped onward and a stop that speaks for that side is among its first onward stops, and none that speaks for the other side is. Read from its promise fold, with no clock. (A stake behind a worker's notice.)"
- After the list of shapes (the signal bullet, line 54), before P9's paragraphs, add:

> **Named readings.** The protocol reads seven of these: each is true by blocks that are held and count, and `within` or `without` by the clock the signers named. `settled`, `paid`, `ruled` and `reading` are **named readings**: a reading a block may name by hash (the rule set that holds it, `state.rule_set`; a deal is read under the rule set its first promise states). A reader that runs it computes it; any other holds the block not read (`reading_not_run`), never guesses and never counts it. The payee's signal (Terms; as a condition `{ signal: "paid", by: [payee], subject: deal }`) needs no reading and is read on every node. So title until paid and the pawn (things.md, Transfers), on a node that does not run the sum, are read only when written on the payee's signal: the café's mixer `to_owner` on `{ signal: "paid", by: [Femi], subject: sale }`; Wanjiru's bracelet to the lender `without` `{ signal: "paid", by: [lender], subject: loan }` by T, on a named clock. Her payments count only on the lender's word, or a signer his account word names, either way; written on his signal, his silence by T moves the bracelet, the term she signed. **The sum of accepted payments** (`paid`, `uncovered`) is a reading a node may run to show a person where a deal stands; a node that does not run it says so. It decides nothing that binds: Due never reads it (Terms, Due).

**P9. After P8's Named readings** add two paragraphs (sentences 1 and 3):

> **A sum is a signal.** No fold adds across deals. Where a promise turns on a sum over many deals or many signers (pledges reached, quotes taken, strikes, a pot short), its condition is a `signal` by the counter its signer names, with `op` and `value`. The counter's `observe` carries the sum in `amount` and names what it counted in `derives_from`, so anyone redoes the sum. A sum that must *not* be reached is written `without` the `ge` signal by a deadline on a named clock, never a bare `lt`: a running count is below every threshold on its first block. A later sum by the same counter is a newer word of hers (blocks.md, The cut): it ends the earlier only for blocks that had not used it.
>
> **What a condition moved stays moved.** A condition is read where the next taking stands: it has held for a block when the blocks that decide it (By a time) are in that block's causal past and stand there, and no end of them has been seen by it (blocks.md, The cut, Seen). A draw that carries a condition lands where it has held (folds.md, What is left, Lands); once landed and standing, it stays: a signal taken back, a payment reversed or a ruling changed after that is a new fact, a sum owed by the one who received to the one who gave, never a reversal. An end that comes before any block relied on the deciding blocks stops the condition: nothing was built on it. What a named signer's word moves, it moves by the word of the one who named her (What stands behind a named signer). Ground: title moves by its owner's word when the condition she stated came true, and never moves back by a stranger's.

**P10. Answers, lines 68 to 70.**
- Line 69, `accepted`, is stage 4's (its P4) and stays.
- Line 70, `declined`: after "...and names the deal in `for`)." add "**A decline ends a standing word for its signer:** no later yes of hers to it counts (an accept or allocation that has her own side's decline of that word in its causal past binds nothing). It reaches nothing that already binds."

**P11. Line 76** ("How a promise is ended ..." to "...what it leaves out is not in the deal."). Replace "A new promise that `answers` one with no status is a **counter-offer** (the one answer without a status, core.md, section 7)." with "A new promise that `answers` one with no status is a **counter-offer** (core.md, section 7). A counter replaces only the offer it answers; every other live offer stays live." Add at the end: "A stop of an offer that no accept binds is a withdrawal, whichever word it carries. An onward stop ends what is still to be done; blocks made `for` the deal after it still count (what moves, what is paid back)."

**P12. Lines 78 to 86, Who may bind.** Delete the whole section, from "**Who may bind.**" to "...so naming one binds no principal." (stage 4 already rewrote line 86 as "A tool's ask speaks for the tool"; keep that bullet, moved to the end of the new section). Write in its place:

> **Who may bind.** An offer, a request (an accept or a counter by a taker, or any answer that waits on the other side's yes) and a transfer to a named receiver are **standing words**: each says *if you answer, I am in*, and each has ends (blocks.md, The cut: its signer's stop or withdrawal, a newer word of hers, its `expires`). An answer **binds** the live offer it answers when it **stands** (blocks.md, Finality) and, on an offer that leaves a side open, when the offerer's yes to it stands. Until then it is a **request**: it binds neither side, and its signer withdraws it as an author withdraws an offer. Three points may be open, and each closes one way:
> - **When**, if the offer carries `expires`: the accept passes that end as the cut says. With a clock (`terms.keepers`), when `needed` lines received the accept by `expires`, and no line received a withdrawal first. With none, an accept whose own `at` is at or after `expires`, or that states no `at`, is late by its own signer's word and binds nothing (blocks.md, Time: a block with no `at` is past every end); any other passes as the cut says, by the offerer's yes or by a relier's counted block that uses it (the accepter's own next block for the deal will do), and the offerer, who named no clock, bears that gap (blocks.md, Who bears the gap). A receipt or a date the offerer's side signed is his word, read against him alone: it never binds the accepter late.
> - **Which**, if the offer leaves a side open: only by the offerer's yes, the **allocation** (an `accepted` answer of her side to the request; her tool's under her grant, authority.md, Blocks that bind, way 2). No keeper's receipt orders takers: a side's clock counts only against that side, so every receipt her own till signs binds her and orders no one.
> - **Whose**, if the answer or the offer is waiting (a key with a `reach`, a grant whose end has not been passed, a word not yet signed twice, a circle's move whose hands are not yet gathered): when it stands, by her clock, by her own later word, or by a relier's counted block that uses it unseen (blocks.md, Finality, The cut). A circle's move is signed by all its hands together, so no one hand's later word passes it (circles.md, Rules).
>
> **The offerer's yes** is a counted block of the offerer's side that has the request in its causal past and answers it `accepted`, or is her own settling block made `for` the deal, or her `accepted` answer to one. By the cut, her yes passes every end of her own offer (its signer named it in a later block of her own); it passes the request's ends only as the cut says (the requester's withdrawal, unseen, is passed by her yes where the request names no clock: the requester bears the gap, and one who wants an end writes `expires` on her accept).
>
> - **An accept keeps to the offer** (invariant 15): where the offer's quantity is a range, the accept names a quantity in its unit from `min` to `max`; else none, or the same. One that does not keep to it binds nothing.
> - **An allocation is a draw on the offer's quantity** (folds.md, What is left). It binds a taker to no more than she asked for. Every allocation the offerer signed binds her; one that does not take is shown `over_allocated` at once, and is her broken word only when the taker is due and is neither served nor paid the bump she signed beforehand: a promise about a future good is kept or broken when due, not when made. **One request is allocated once:** a yes to a request that has an earlier yes to it in its causal past binds nothing; two that do not see each other are a word given twice (folds.md, A fork is a burden): each binds her, listed in `forks`. An onward stop of an allocation by either side frees its draw and ends that deal alone. An open offer with `lines` offers each line once, whole.
> - **A counter to an open offer** is signed by a taker, keeps the offerer's side as named and names the taker on the open side. The two may counter on, each answering the one before it and signed by the side that did not sign that one; a counter that names other sides, or comes from anyone else, counts for nothing (`not_live`). The offerer's yes to a counter is an allocation on the counter's own terms, whole, its quantity drawn on the open offer's. Each allocation is a deal of its own: its sides are the offerer and the taker. The open offer is settled by no one.
> - **A counter ends nothing that binds:** one that has an accept of its offer in its causal past counts for nothing. Only the author ends an open offer.
> - **Accepts that cross.** Of binding accepts in one deal that see one another, the earliest binds. Two that do not see each other **cross**, and are listed in `crossed`. Each binds: both sides signed each set of terms. The deal is read once under each accept (`per_accept`); its stage is the furthest of them, and money is reported per accept. A side ends the one it does not want by an onward stop that answers that accept. Two of one key are a pair as well (`forks`); a pair never frees its signer.
> - **Binding only grows.** No block of a side, and no stranger's, makes an answer that stands bind nothing or a counted block count for nothing. Only the bench does (Disputes).
> - **An offer that states no end has none.** One with no `expires` and no clock cannot be withdrawn from one who accepts it unseen; who wants an end writes one. (No protocol without a shared clock can order a withdrawal against an unseen accept; the read-back says so.)
> - **A tool's ask speaks for the tool** (stage 4's bullet, as written there).
>
> Ground: each side's word binds only as she wrote it; a time she wrote binds her and no one else; the one who chooses among takers is the one who offered, by her own signed yes (Rothbard, *The Ethics of Liberty*, ch. 19; Mises: only persons act).

**P13. Line 88, Settling** ("**Settling.** A promise settles ..." to "...A return in goods is a second promise `for` the first."), as stage 3 left it. Change:
- "to a named receiver, once the receiver answers it `accepted` (things.md, Transfers); to an open receiver (an allocation's deal), on the orderer's signature. On a deal with a named receiver the giver's word alone settles nothing." becomes "once the receiver answers it `accepted`, or her tool does inside a deal that binds her (authority.md, Blocks that bind, way 4), or her order named that instance (things.md, A spot exchange). In an allocation's deal the receiver is the taker. The giver's word alone settles nothing."
- "or one a confirmer the schema's grounds name confirms (an id, or `circle#role` ... The cut)" becomes "or one the bench confirms (Disputes: as many names as `needed`)".
- "Of several such answers by the payee, the latest in causal order counts; answers that do not see each other count as no `covers`." becomes "Of several such answers by the payee, the one that says most counts: each is her word against herself, and she cannot take one back."

**P14. Line 108, Paid for, never delivered.** Replace "When the deal is stopped onward, breached or over-allocated, the money that is not covered ..." to "...never a verdict." with "Money that what moved does not cover is still the payer's, owed back, at every stage, bound or not, unless the terms say it is kept (`forfeit`). The stage shows it as `uncovered` on each side (folds.md, What each fold returns): a claim shown as a fact, never a verdict." Keep the rest of the paragraph.

**P15. Line 112, Disputes.**
- After "**A side alone never judges its own deal** (invariant 13): ... the binding accept had not seen." add sentence 2: "**Who says a thing happened never rules.** A signer a condition names in `by`, or an account word names in `state.by`, makes that condition hold, and nothing else: her `confirms` or `defeats` of a block of the deal is only her own reading. Only a name in the grounds, or a judge both sides named later, changes what counts. One who is to do both is named in both places (a grader who rules on a lot sits on the bench; one who only signs that it arrived is named in `by`)."
- Replace from "**A backup referee:** with `grounds.wait`" to "With no receipt the wait has not begun and only the names before rule." with:

> **A backup referee:** with `grounds.wait` (a duration), the names are a chain, each the backup of the one before. A later name's turn begins when the wait has run from the earlier name's own receipt of a side's dispute of the block (her counted `observe` of kind `receipt` of it, on her own line), or, where the grounds name a clock (`grounds.keepers`) that no side keeps or operates, from that clock's receipt of the dispute: `needed` lines each hold a cutoff through that receipt plus the wait with no word of the earlier name received before it (blocks.md, A named clock). A side's own clock starts no turn against the other side. The later name's word counts when it has that turn's start in its causal past and no word of an earlier name on the block. Once it counts, an earlier name's word that it had not seen counts for nothing. With neither a receipt nor a clock, the wait has not begun: nothing fills the earlier name's silence, and who wants a backup that cannot be stalled names a clock.
- After "**A referee both sides signed for counts even when tied to a side** ..." keep. At the end of the paragraph add: "**A ruling moves no thing.** A bench name's word changes which blocks of the deal count toward its stage and what is owed; it reaches a draw only where it stands in that draw's causal past (What a condition moved stays moved)."

**P16. Line 114, Who pays a confirmer** ("**Who pays a confirmer.** ..." to "...Neither is ever a default."). Replace whole with (the three fields kept):

> **What stands behind a named signer.** A keeper, a meter, a counter, a reader, a payment confirmer, a grader, a referee and a voice are each named by another's word to say a thing. **A condition names a signature, never a fact:** what her word moves, it moves by the word of the one who named her, and he bears her. Her block is a reading: it binds her name to its truth and nothing of hers. If she promised nothing, a mistake binds her to nothing. She answers only for a promise she signed, or if she lied on purpose to help take someone's goods, which is taking part in a theft and goes to the victim's judge (A claim of invasion). The deal's bench rules between the sides and may count her word for nothing between them; what her word gave a third person who relied on it stays his (What a condition moved stays moved), and the bench's ruling says nothing against her.
>
> **Her own promise is the only thing that adds to that.** It is an ordinary open offer of hers with `terms.backing`: *if the judge I name here signs that a word of mine under this promise was false, late or missing, up to this much of mine becomes yours*, its condition a `signal` by that judge with this promise as `subject` (`ruled` is a named reading: Conditions), its schema stating which kinds she signs, for whose words, and how soon (`grace`, a duration). A side of a word that names her takes it by a request that names his word in `refs.for`, and her allocation (or her tool's, under her grant) binds it: that is how the two of them choose the judge. One who names her and holds no promise of hers has her name and nothing more, and his read-back says so. Her backing is her promise to pay, never money set aside, unless a thing was handed `to_holder` and the holder named.
>
> **Three facts anyone can show that judge, each from her own blocks:** a **pair** on her key; **a word that cannot be redone** (a receipt of hers after her own cutoff, dated at or before its time, which shows the cutoff false; a sum that is not the sum of what it names; a figure that is not its recipe over the openings it carries); **silence** (a block of hers dated at or after T plus her `grace` with no receipt she promised in its causal past, where T is the `at` of another keeper's receipt of the block; the complainer's own date is never T; a clock of one whose keeper signs nothing more has no proof of silence). These are readings for the judge; no fold moves anything on them. **A named signer's word should carry what lets a stranger redo it** (a count names what it counted; a figure carries its openings).
>
> **Who pays her.** Any named signer may state `paid_by` (an id), `funded_by` (a pledge that covers her fee) and `pay_depends_on_result` (true or false), one optional block of terms read the same everywhere; a false statement is her broken word. *A judge's own cap* is that promise with her fee as backing: "if a judge we both name finds my ruling wrong, I return my fee and owe nothing more". It never shields whoever acts by force on a wrong ruling.
>
> Ground: only a signed word binds, and only its signer; one who made another's signature the test of his own title chose to bear it; a lie crosses no property, but a lie told to help take goods is part of the taking (Rothbard, *The Ethics of Liberty*, chs. 12, 19; Kinsella).

**P17. Line 112, the referee's last word.** In "An accept the referee defeats binds nothing; nor does an allocation ..." keep the sentence; it is the bench's one power to lower a stage.

**P18. Lines 135 to 250, the worked examples.** Each falls into one of four bins. "Stays" means kept word for word, bar stage 3's swaps.

| Bin | Examples (by first words) |
|---|---|
| **Stays, an example** | A knowledge sale; A paper note; An honest-producer bond; A penalty paid to someone else; A cover that names a judge; A slice of each payment; The tab triangle; An early-payment discount; A carrier keeps the advance; Recourse when selling a claim; Roll the short part forward; A normal-error band; A gift; A reading over her own figures; A sole right; A loan repaid by delivering goods; A co-op's flat delivery price; Advances before the price is known; Payment follows a checker's certificate; Held while a signal stands; A pitch that returns; Selling a market pitch; A priced duty to tell; A perishable dispute; Two named judges; A bond graded; A state court; A referee's standing offer; A commitment over a list; A road pact; A deal that binds only once a named witness; A veto window; A toss; An open "take up to N"; "No claim"; A lease that says who owns the trees; Selling an unpaid wage claim; A recruitment-fee loan; Door rules; An owner's refrain; A helper's adoption promise; Staged lending; Wages paid off a ruling; A pre-signed late fee; A lender's question; An open vouch paying a referee's fee; A baseline soil reading; A day pass; What I see in your kitchen; An exclusive pouring right; Gleaning; Restitution; A permit note; A refrain with a priced exit; Overbooking honestly; All or nothing; A revolving line; A watched loan; A loan the lender re-signs; Past due is not breached; A top-up; A sea loan; A "shall" binds nobody; No credit-limit field; A rebate; An officer's bond; A finder's reward; The accused speaks first; A perishable-evidence panel; A lease's last round; Notice then proceed; "Paid" sent to the same audience; A remedy chosen at signing; A pitch or route share; A grader picking a line; A rent-to-own barrow; A livestock lease; The village cow; Wages owed only if the quarter shows a surplus |
| **Moves to a pattern** | A group buy (to `patterns/pledges.md`); *A lot of pies, vouched* (line 189, to `patterns/vouches.md`); Pools priced by class and A pool pays the lender (to `patterns/pools.md`); A bag is a bag she defines (to `patterns/rulebooks.md`) |
| **Deleted: says again what a rule says** | A soft term with a judge (A soft term never stands alone); The estate (Death); Terms I give you today (`profiles/attestations.md` line 25); A voucher's watch window (`vouches` says it); A vouch for a new member (`vouches` says it); Two buyers of a lorry (Two people on one side); An option (Paid for, never delivered: a premium) |
| **Holds a rule, rewritten** | the nine below |

The nine that state behaviour found nowhere else, or that a rule of 1.8 now contradicts:
1. *A sale's finality is a signed term* (line 229). Its first sentence is a rule found nowhere else: it is now stated once in section 2 ("A sale that states no taking back is final"). The example keeps only its second and third sentences.
2. *Checks answered* (line 191), first sentence, "A note for ten loaves is one instance ... so it is not split": now false. Becomes "A note for ten loaves is an instance with `pack` ten loaves; it is passed whole or in parts like any thing (things.md, Parts)."
3. *Paying in another money* (line 149): "With no signed rate it counts for nothing toward the price (Settling)" becomes "With no signed rate it counts only for what the payee's accepted answer says it covers (Settling)."
4. *A credit sale paid in part, then the buyer vanishes* (line 147): "If they signed nothing the reader shows 'not said what for' ... still" becomes "If they signed nothing, the paid part less what moved is `uncovered`, the payer's still (Paid for, never delivered)." (The payment named the deal; "not said what for" is for a payment that names none.)
5. *A price made under a decree* (line 198): "names it in `refs.under` (blocks.md already carries ...)" becomes "names the rule in `refs.derives_from`" (`refs.under` names a grant and nothing else: authority.md).
6. *A swap of records* (line 176): from "and the first's `scope.condition` says" to the end becomes "and each stops her grant when the other's ends; 'while the other's grant is live' is a line her own node keeps in her product's field, which no fold reads (authority.md, Every reader reads every field)."
7. *A drought clause* (line 213): "a conditioned let-go (A release)" becomes "the lender's conditioned hand-over of 10,000 of what is owed to her to the borrower, which is paid (Owed: a part of the price handed to the one who owes it is paid)". An `observe` carries no condition, so a release cannot be conditioned.
8. *A crop pledged twice* (line 230): "The earlier conditioned transfer wins, sealed or not: nobody passes on more than they had." becomes "The earlier conditioned transfer holds its amount from where it is signed (folds.md, What is left): a later draw on the same line takes nothing (`past`), and one from another key of hers takes nothing either (`not_on_line`); a key writes sealed blocks or public ones, never both, so sealing changes neither."
9. *Paying a lender through a third party* (line 232), *Goods on trust through a grant* (line 159), *A pre-signed duress cap* (line 170): each restated in stage 4's shapes. Line 232: "speaks for the debtor (authority.md)" becomes "binds the debtor where her grant covers `transfer`, the deal binds her and it is due (authority.md, Blocks that bind, rule 10)". Line 159: "a grant naming the lot, the sale's type (`transfer`), the buyers as parties, a limit" becomes "a grant naming the lot in `refs.what` and her open offer for it in `on`, `transfer` in `types`, a `limit`". Line 170: "A grant to the driver with a visible cap (up to 1,500 in all, to the officer named)" becomes "The boss's promise to pay the officer named up to 1,500, named in a grant to the driver with `limit` 1,500".

Also, in four examples, "held" for money handed to a third party becomes "kept by" (lines 166, 171, 203, 240) and "as earnest" in line 194 becomes "handed `to_holder` the landlord, an envelope": "held" now means a draw that holds (folds.md). The two headers "(no new rule ...)" stay; "Addition 21's" in line 153 is deleted.

**P19. Line 258**, Taking a block as yours afterwards: stage 4's P8 already changed it. Nothing more.

**P20. Invariants.**
- 11 becomes: "11. An allocation is a draw on its offer's quantity: one that does not take still binds the offerer, is shown `over_allocated` at once, and is her broken word only when the taker is due and neither served nor paid the bump she signed. A taker who paid is owed back what he paid for what never moved (`uncovered`)."
- 13: "only a referee named in advance, or named by both sides after, changes the stage" becomes "only the bench changes the stage, and it moves no thing".
- Add: "40. **Binding only grows:** adding a block that is not a bench name's never lowers a deal's stage." "41. **The receiver's word:** no line is covered and no price paid except by the word of the one who received it (her answer, her tool's inside a binding deal, her order of that instance, or a signer her account word names), or the bench's `confirms`." "42. **What stood stays:** no fold moves back a draw that landed and stood; a later wrong is a sum owed."

### 3.2 `spec/modules/folds.md`, A promise's stage (lines 70 to 93), bar stage 3's counting sentences

Replace lines 72 to 82 and 85 to 93 (stage 3's sentences in stages 1 and 2, lines 83 and 84, stay as stage 3 wrote them, with the one change asked in section 11). The section now reads, in this order:

> ## A promise's stage
>
> **Input.** The **deal's blocks** of a first promise P (or of an allocation) are the smallest set that holds: P; every block that names a block of the set in `for`, `answers`, `updates`, `confirms`, `defeats`, `derives_from` (receipts, signals), `subject` (referee grants, releases, `not_free`, a named signer's `received`) or `what` (where it names P: a hand-over of what is owed), bar a first promise that names P in `for` (a new deal it serves); for an allocation's deal, the open offer and its deal's blocks; the consent blocks between the two named sides; the payee's account words; and the lines the stage reads: each draw's line back to its owner's start (What is left), the offerer's line for allocations, and a clock's lines where a term names one. A stage read from fewer of the deal's blocks is the stage of fewer blocks: behind, never wrong, bar a ruling it has not seen. A block held and not read counts in no fold (`read` gives its codes); a stage asked of a first promise not read has no answer. Where a line it reads is not read whole, the answer is `{ not_shown: true, lacks }` (A line). **No word of the stage needs the sum of payments:** what waits on the price is read from the payee's signal (promises.md, Terms, Due). `paid` and `uncovered` are readings over the same blocks; a node that does not run them shows the stage's words, the payee's signal where one stands, and in their place that it has not read them (`reading_not_run`).
>
> **Who counts.** Only blocks that speak for a side, and that stand; one that is waiting is listed in `waiting` and counts nowhere yet. An `updates` of a promise is its author's stop. A side that names a thing is the thing's owner where each block stands (promises.md, Bearer). An open side is filled by the taker whose allocation binds.
>
> **The parts.** Each part has its own small machine, and each moves only forward.
>
> | Part | States | Moves forward by | Moves back by |
> |---|---|---|---|
> | An offer | live → replaced (for the one countered) or ended (for blocks that passed its end, blocks.md, The cut) | a counter by the other side; its author's withdrawal or stop; its `expires` | never |
> | An answer | request → binding | it stands and, on an open offer, the offerer's yes stands (promises.md, Who may bind) | the bench's `defeats` only |
> | A settling block (a delivery, a payment, work) | handed → counted | the receiver's word (promises.md, Settling), or the bench's `confirms` | the bench's `defeats` only |
> | What a payment covers | what came → more | the payee's `covers`; of several, the one that says most | never |
> | A stop | none → stopped (by `from`, `to`, `both`) | a side's onward stop | never |
> | A bench name's word on a block | none → true or false | her `confirms` or `defeats`; she changes it by a later word of her own | her own later word |
>
> **The live offers.** P is live. A counter to a live offer (a promise that answers it, no status), between the same two sides and signed by the side that did not sign the offer, replaces that offer, and only that one, and is live in its place. An open offer is live alone: a counter to it ends nothing.
>
> **The binding answer** is the earliest answer that binds (promises.md, Who may bind) among those that see one another. Answers that do not see each other cross (`crossed`); each binds, and the deal is read under each accept (`per_accept`); the stage is the furthest of them. The order of stages, lowest first: `offered` or `asked`, `declined`, `stopped` (before), `accepted`, `underway`, `stopped` (onward), `done` (for a refrain, `breached`), `reversed`.
>
> **Defeated blocks.** (Lines 80 kept, with three changes.) "The bench is the confirmers ..." stays. "With `grounds.wait` the names are a chain ... listing the defeats as taken)." is replaced by "With `grounds.wait` the names are a chain, and a name's turn is promises.md, Disputes, A backup referee." After "one it makes true counts whatever a side says." add: "A ruling changes what counts toward the stage and what is owed; it reaches a draw only where it stands in that draw's causal past (What is left: what landed stays landed)."
>
> **The stage is the first of these that holds, from the furthest along back to the start:**
> 1. **reversed:** (stage 3's text, kept).
> 2. **done:** (stage 3's text, kept).
> 3. **breached:** the promise is a refrain and its bench found it broken (promises.md, Refrain). `from` is the hash of that `defeats` (of several, the lowest hash: it only names one). A side's `defeats` of the head is a dispute and breaks nothing. A refrain not breached, with something paid and counted transfers back covering all that was paid, is **reversed** here.
> 4. **stopped** (onward): an onward stop by either side of a deal that binds. `from` is the earliest onward stop in causal order (of several that do not see each other, the lowest hash names one); `by` is `from`, `to`, or `both` (the other side `confirms` it, or the first onward stops speak for both).
> 5. **underway:** a binding answer exists and a counted block `for` it exists.
> 6. **accepted:** a binding answer exists.
> 7. **stopped** (before): every live offer was withdrawn (or stopped, whichever word: promises.md, Answers) and no answer binds.
> 8. **declined:** the other side declined every live offer, or, on a promise with two named sides, holds a live STOP naming its author (consent.md). Her own binding answer (stages 5 and 6) still wins: a decline ends the word only for blocks that have it in their causal past.
> 9. **offered** (signed by `from`) or **asked** (signed by `to`).
>
> **Moves, and the blocks that cause them.**
>
> | From | To | The block | Signed by |
> |---|---|---|---|
> | nothing | `offered` / `asked` | a first promise | a side |
> | `offered` | `offered`, new live offer | a counter | the side that did not sign the offer it answers |
> | `offered` | `offered`, with a request | an answer with an open point | the other side, or a taker |
> | request | `accepted` | its last open point closed: a keeper's receipt by `expires`; the offerer's yes (an allocation); the answer standing (her clock's cutoff, her own later word, a relier's block) | a keeper; the offerer's side; the signer, her keepers or the relier |
> | `offered` | `accepted` | an answer that stands to a firm offer, or a spot exchange's transfer (things.md) | the other side; the seller |
> | `offered` | `declined` | a decline of every live offer | the other side |
> | `offered` | `stopped` (before) | a withdrawal of every live offer | its author |
> | `accepted` | `underway` | the first settling block that counts | the giver, then the receiver's word |
> | `accepted`, `underway` | `stopped` (onward) | an onward stop | either side |
> | `underway`, `stopped` | `done` | the last word that covers both halves | the receiver of that half |
> | `done` | `reversed` | a transfer back covering what was paid, and its answer | the `from` side, then the payer |
> | refrain bound | `breached` | the bench's `defeats` of the head | the bench |
> | any bound stage | a lower one | a `defeats` of an answer, a delivery, a payment or an answer to one | a bench name in turn, and no one else |
>
> **Binding only grows.** Let S be a set of blocks closed under causal past and b a block whose past is in S. If b is not a bench name's word, the stage of the deal in S with b is not lower than in S. Every test the stage makes either reads the causal past of a block already held, which a new block does not change, or asks whether a block exists, which a new block can only make true; waiting is not binding, and what stands stays (blocks.md, Finality). Money figures (`paid`, `uncovered`) are facts, not stages, and move either way.
>
> **An allocation's deal** (line 93, as stage 3 left it, with "If O's stage does not list the allocation among its `takers` (it allocates a request already allocated, a withdrawn one, or more than the taker asked for), it has no stage (null)." replaced by "If the allocation binds nothing (promises.md, Who may bind: a request already allocated, a withdrawn one, more than the taker asked for), it has no stage (null); one that does not take as a draw still has its stage, shown `over_allocated`."). Delivery in an allocation's deal goes to the taker and counts on her word, never on the offerer's signature.

**F2. Line 112, `bids_shown`.** Delete the paragraph (with stage 3's word swaps in it): the sealed price is now a pattern over a price fixed later (section 4). This is asked in section 11, because stage 3 touched the paragraph.

**F3. What each fold returns.**
- Line 126, `by`: unchanged.
- Line 136, `forks`: "or accepts of live offers that do not see each other" becomes "or blocks of a pair in the deal (one key, one `prev` or one `seq`)". Add: "`crossed` lists answers of one deal that bind and do not see each other, sorted; `per_accept` is `[{ accept, stage, paid, uncovered, lines }]`, one per crossed answer, sorted by accept, empty when none cross. `requests` is `[{ block, open }]`: answers that do not yet bind, `open` a sorted list of `when`, `which`, `whose`. `waiting` is blocks.md's list."
- Add a bullet: "`bench` is `{ names, needed, wait, keepers }` read from the deal's schema's grounds and the referee grants both sides signed, or `none`; the same answer `gives` gives (promises.md, What becomes whose)."

**F4. Line 116, `promise_view`.** Add after "...never **done**, which would say it was kept.": "A refrain with no bench is shown with `bench: none` beside `elapsed`: it can be neither settled nor breached." Replace "the condition `settled` reads a refrain elapsed with its price paid in full as settled" with "the condition `settled` reads a refrain as settled only once its bench confirmed it (promises.md, Refrain)".

**F5. Invariant 4** (stage 3 wrote it) stays. Add invariant 43: "A deal's stage falls only by the bench's word, and no stage moves a thing."

### 3.3 `spec/modules/things.md`, A spot exchange

**T1.** After line 68 ("**A transfer to a named receiver is read like an offer.** ...", with stage 3's added sentence), add a new bullet:

> - **A spot exchange.** The buyer signs first: a promise that names the instance in `refs.what` and its price, `refs.to` herself, `refs.from` the seller (an order). The seller's transfer `for` it, `to_owner` her, of that instance, is his yes and his delivery in one block: the deal binds there, and the draw lands when signed, because her order is her yes and is in its causal past (folds.md, What is left, Lands). It states `state.covers` (`required`, read's code): what the seller says he has had of the price, `{ value: "0", ... }` if nothing. His `covers` is the payee's word, and counts toward the price as an accepted answer's does. A missing `covers` is never read as credit, and the buyer's silence never turns his receipt into a debt. Two blocks, each said by the one it costs: she binds herself to the price, he says the thing is hers and what came. On credit it is the same two blocks with `covers` `0`, and the price is owed. A buyer with no key: the seller's own `observe`, as for any word of someone who cannot sign. A till under the seller's grant signs the transfer as an allocation and a delivery in one block, where the order keeps to his open offer named in `on`: it binds him as an allocation (authority.md, Blocks that bind, way 2) and moves as a delivery due at once, for the deal it makes binds there (way 5).

### 3.4 `spec/modules/authority.md`

**A1. Line 48** ("- **A decline reaches back only as far as its signer's stated window.** ..." to "...(promises.md, Answers; things.md, Transfers)."). Replace with: "- **A decline ends a standing word for its signer** (promises.md, Answers). It reaches nothing that already binds; a late answer is read by the cut (blocks.md, The cut), never by a later decline."

### 3.5 The five sentences, and where each now lives

| # | Sentence | Home | Written by |
|---|---|---|---|
| 1 | A sum is a signal | promises.md, Conditions (P9) | this stage |
| 2 | Who says a thing happened never rules | promises.md, Disputes (P15) | this stage |
| 3 | What a condition moved stays moved, read where the next taking stands | promises.md, Conditions (P9); folds.md, What is left, Lands, reads it | this stage (the Lands sentence is stage 3's) |
| 4 | Handed over or handed to hold, no third kind | things.md, Transfers | stage 3, kept |
| 5 | On a refrain the condition is the gate | promises.md, Refrain (P7) | this stage |

### 3.6 Profiles: edits to the pages that stay (see section 4 for which)

- `attestations.md` line 17: "(blocks.md, No clock)" becomes "(blocks.md, A named clock)". Line 23: "(promises.md, Who pays a confirmer)" becomes "(promises.md, What stands behind a named signer)". Line 33: "`bond` (money; an observe has no terms): \"if a referee finds my rejection wrong, up to £N of mine becomes the seller's\", signed before she inspects" becomes "a promise of her own behind her grade (promises.md, What stands behind a named signer), signed before she inspects".
- `tasks.md` line 5: "blocks that cannot be undone, in authority.md (Blocks that can be undone)" becomes "what a block under a grant binds, in authority.md (Blocks that bind)".
- `tax-recall.md`: title "Profile: sealed reports and pull grants". Line 5: "`tax_report` and `recall` are labels" becomes "`tax_report` and `pull` are labels". Line 8: "**A recall grant**" becomes "**A pull grant**"; delete "and `scope.notice`" (stage 4 removed it). Line 7: "`state.gross` and `state.fees` (money)" becomes "(amounts)". "Recall" then has one meaning: the pattern in section 4.10.

---

## 4. The profiles

`spec/patterns/` is new. A **pattern** is a base schema and a worked example over the core: it adds no rule, no fold, no door op and no `protocol.json` entry, and a reader who never saw it reads its blocks by the modules alone. Each pattern file opens with "Not normative." A `spec/patterns/README.md` says that in two lines and lists them. (`protocol.md`'s sentence telling a profile from a pattern is stage 7's.)

| Page | Becomes | Rules it loses, and where a needed rule now lives |
|---|---|---|
| `pledges` | pattern | the close and its drop-and-repeat sum (now the counter's published recipe: sentence 1); `{ pledged }` (cut); the close's own `at` as its date (a named clock); "several closes, owed once"; `pledge_close` |
| `vouches` | pattern | the voucher as "orderer" (stage 3: a draw on the pot); "naming it is her accept of the open offer" (cut: a stranger's request binds by the voucher's allocation, or her tool's under her grant); `cap: all` stays as `pot`'s reading (folds.md, A pot) |
| `pools` | pattern (stage 3's text, moved) | the pre-signed payout as title that moves (cut: a payout is the holder's transfer when the signal is in; stage 3); `pay_in` (stage 3); the susu, equb and iddir move to `savings-group` |
| `savings-group` | new pattern (from `pools.md` lines 23, 26, 27) | the `draw` kind fields in `protocol.json` (they become the `draw` schema's terms); "collector holds as a pot holder" (stage 3's sentence, moved) |
| `bids` | pattern, renamed `sealed-price` | the `bid` observe, the fold `bids_shown` and its op, "else no bid counts", openings "to its own node" (all cut: a price fixed later by a reader both named) |
| `payment-proof` | pattern (stage 3's text, moved) | "the payment provider is the named confirmer" (lines 5 and 8, cut by sentence 2: the provider is a signer the payee's account word names in `state.by`, promises.md, Where to pay me) |
| `refusals` | pattern | "counts distinct signing keys" (cut: a signer is whom the block speaks for); the threshold as the refrain's breach (sentence 5); "without that receipt the refusal counts for no signer" (the circle's bench reads it; no fold does) |
| `keeping` | pattern (stage 3's text, moved) | "I restore its value" becomes "the same kind and amount, or the per-unit sum this promise states"; no fold rule lost |
| `rulebooks` | pattern | none (every line is a term both sides sign by naming the schema); line 11's grader is on the bench by the rulebook's own choice (sentence 2's last clause) |
| `earnest` | pattern | the admission field becomes a field of the node's own promise, declared by the `earnest` schema; `optional_profiles.earnest`, `earnest_shape_ok`, `earnest_paid` leave `protocol.json` |
| `successor`, `custody`, `short-form`, `rekeys` | profile (stage 1's) | none here |
| `ballots`, `tasks`, `attestations`, `addressing`, `adapters`, `erasure`, `residency`, `foodblock-profile-epcis`, `tax-recall` | profile | pointer fixes only (3.6) |

Each pattern below gives its blocks, short. "→" is "answers".

### 4.1 `patterns/pledges.md`
*If pledges for the plan reach £500 by 1 March, £20 of mine becomes the organiser's.*
```
promise  Maria (an ask)   refs { to: Maria, from: organiser, what: plan, schema: pledge }
         terms { price: { "20", GBP }, condition: { within: { signal: "pledged", by: [Leila], signers: 1,
                 subject: plan, op: "ge", value: { "500", GBP } }, deadline: 1 March, keepers: { names: [shop] } } }
promise  organiser, accepted → Maria's ask            (she accepts each pledge as it comes)
observe  Leila (the counter) kind pledged, amount { "520", GBP }, refs { subject: plan, derives_from: [pledges counted] }
observe  shop (keeper) kind receipt, derives_from Leila's count
transfer Maria { "20", GBP } to_owner organiser, for her pledge; organiser accepted →
```
The counter's recipe (drop any pledge whose threshold the rest do not reach; repeat) is published by hash in the `pledge` schema; anyone re-runs it over `derives_from`. A false count is Leila's word, for a judge only by her own promise (promises.md, What stands behind a named signer). "Not reached" is a `without`. A sealed assurance, a walkway with two thresholds, recurring pledges, a group buy with a floor: the same, with `repeat` or two schemas.

### 4.2 `patterns/vouches.md`
*If the referee I name signs that Jide failed that deal, up to £400 of mine becomes the co-op's.*
```
promise  Mo (voucher)  refs { from: Mo, to: co-op, subject: Jide, schema: vouch }
         terms { backing: { "400", GBP }, until, condition: { signal: "failed", by: [referee], subject: deal } }
promise  co-op, accepted → Mo's vouch           (an open vouch: each stranger's request, then Mo's allocation)
observe  referee kind failed, refs { subject: deal }
transfer Mo { "150", GBP } to_owner co-op, for the vouch, derives_from the referee's signal; co-op accepted →
```
Each payment is a draw on the pot (folds.md, A pot); past `left` it takes nothing. `refs.to` a thing: whoever owns it, or a thing made from it, where the payout stands (*A lot of pies*). Pay-back, share-back, loyalty, an introduction, a layer behind a pool, the operator's open bond: each a promise like any other.

### 4.3 `patterns/pools.md` (stage 3's text, moved; savings forms out)
*If the vet we named signs that your cow died, £800 of mine becomes yours, never past the pot.*
```
promise  holder (the head)  refs { from: holder, schema: pool (grounds: the vet) }  terms { backing?, until, ceiling, if_short }
transfer member { "50", GBP } to_owner holder, for head; holder accepted →        (a premium: hers now)
observe  vet kind died, refs { subject: cow }
transfer holder { "800", GBP } to_owner member, for head, derives_from vet's signal; member accepted →
```
A payout is a draw on the pot from where it is signed; two deaths and a short pot: the second reads `past` until more dues come and the holder signs again, unless `if_short`, which she keeps by signing in it. *A pool pays the lender if the borrower dies; pools priced by class* (moved from promises.md).

### 4.4 `patterns/savings-group.md` (new, from `pools.md`)
**A susu, lent.** Each day: Mama's transfer `{ "50", KES }` `to_owner` the collector, `for` the collector's standing promise (`from` the collector, `to` Mama, price `{ "1450", KES }` at day 30, `repeat` daily): hers to use; the promise is her debt. **Kept apart:** the day's takings in a marked tin, a thing, handed `to_holder` the collector: Mama's throughout. **An equb:** each member's standing promise to the pot; the turn order a draw anyone checks, its terms (`reveal_by`, `recipe`, `wins`) the `draw` schema's own; a swap of turns signed by the two who swap and each whose turn moves. **An iddir:** each member's standing promise, *when a member dies, as the named checkers confirm, X of mine becomes the family's*, an event repeat whose `by` names the checkers. No fold reads the draw; a reader re-runs the recipe.

### 4.5 `patterns/sealed-price.md` (was `bids.md`)
*We settle at the middle of our two secret numbers, read by Ruth.*
```
promise  Maria (owed; an offer)  state { what: "settle the bread quarrel", commitment }  refs { from: Maria, to: Harry, for: quarrel, schema: sealed-price }
         terms { price: { figure: "middle", by: [Ruth], signers: 1, deadline, keepers } }
promise  Harry, counter → Maria's   (same sides and terms, his own commitment)
promise  Maria, accepted → Harry's counter             (both bound to Ruth's figure)
(each opening sealed to Ruth alone, after the accept)
observe  Ruth kind figure, amount { "650", GBP }, state.openings [both], for the deal; keeper's receipt
```
A copied commitment cannot be opened, so no figure and nothing owed. No overlap: no figure, and each learns only that. A later figure by Ruth ends the earlier only for blocks that had not used it.

### 4.6 `patterns/payment-proof.md` (stage 3's text, moved; lines 5 and 8 replaced)
A payment is a transfer that names no instance, `state.marks` the rail's reference. It counts on the payee's accept, her tool's "it came" inside the deal, or the `received` observe of a signer her account word names in `state.by` (promises.md, Where to pay me). The provider never sits on the bench: her word counts the payment and nothing else. That the price is paid is the payee's signal, never the provider's (promises.md, Terms, The payee's signal): signed by the payee, or by her tool once the payments counted come to the price. Title that waits for the price is written on that signal, read on every node (promises.md, Conditions, Named readings). An unsigned callback: the adapter's operator signs, in its own name. A reversal after the payment stood moves nothing back: a sum owed (stage 3's sentence).

### 4.7 `patterns/refusals.md`
*I do not deal with X until it ends; if I do, my £50 becomes the circle's.*
```
promise  B1 refs { from: B1, to: circle, subject: X, schema: refusal (grounds: the circle's referee) }
         terms { refrain: true, until, price: { "50", GBP },
                 condition: { signal: "refuse", by: ["circle#member"], signers: 2, subject: X } }
```
The condition is the gate: below two signers it binds no one; at two, it binds each who signed. Broken only by the referee's `defeats` of the head. The cause (a deal and a notice with a receipt) is in `derives_from`, for the referee.

### 4.8 `patterns/keeping.md` (stage 3's text, moved)
A `to_holder` transfer of the lot, and the holder's promise under `keeping`: *if a thing in my keeping is lost beyond `loss_band`, the same kind and amount, or the per-unit sum stated here, becomes yours*, its price a figure fixed later by the reader both named (the countersigned tally), `within` `loss_within` on a named clock.

### 4.9 `patterns/rulebooks.md` and `patterns/earnest.md`
Rulebooks: unchanged text bar "A bag is a bag she defines" moved in. Earnest: *the asker's transfer `for` the ask, `to_owner` the holder both named; what comes back is only the holder's own accepted promise.* The node states `earnest: { amount, holder }` in its own promise under the `earnest` schema (nodes.md, A node's promise).

### 4.10 New: `patterns/open-payment-rail.md`, Paying over an open payment rail
No new rule: the off-record money rule (promises.md, Where to pay me) and decision 2.
```
observe  Sam kind account  state { destination: "lnurl:sam@node.example", by: [Settle] }       (Sam's word, once)
promise  Amara's order, or her accept of Sam's offer                                          (the deal)
(the web: Sam's page answers 402 with an invoice; Amara's wallet pays it over Lightning)
transfer Amara  state { amount: { "0.0006", BTC }, marks: [{ scheme: "ln_hash", value }] }  refs { to_owner: Sam, for: deal }
observe  Settle kind received  state { amount: { "0.0006", BTC }, marks }  refs { subject: Amara's transfer }
observe  Sam's till kind paid  refs { subject: deal }                                         (the payee's signal, under Sam's grant)
transfer Sam's till  the flour  refs { to_owner: Amara, for: deal }                           (due: the signal is in its past)
```
Settle's `received` counts as Sam's accept once it stands (a block of Sam's side for the deal has it in its past, or his account word's clock received it first). It says the amount came, and nothing more. **What makes the price paid** is Sam's signal, never Settle's (promises.md, Terms, The payee's signal; decision 2: Settle's word moves only what Sam named it to say, that money came): Sam signs it, or his till does once the payments counted, Settle's among them, come to the price (authority.md, Blocks that bind, way 4). With `waits_on: price`, the flour is due on that signal and on nothing Settle signs. Settle is no judge and holds nothing; what stands behind it is its own promise to Sam, if it signed one. Had Settle lied on purpose to help Amara take the flour, that is taking part in a theft, for Sam's judge.
**The difference in title.** Paid in **bitcoin**, Sam has the good itself: once the rail settles, the coin is his, and no one's word is behind it but the rail's. Paid in a **stablecoin**, Sam has a claim on its issuer: a promise to redeem, worth her word, and an issuer who can freeze it. The record shows both alike, an amount of a good it does not hold; a payee who wants the claim said writes `of` the issuer's kind (a thing the issuer signed), and the issuer's promise to redeem, where it is signed on the record, is a deal (promises.md, An IOU). Whether "USDC" is a claim is left open on purpose by the decided list: the unit word does not say. A freeze or a reversal after the payment stood moves nothing back: it is a sum owed.

### 4.11 New: `patterns/recall.md`, A recall
No block type. A schema anyone publishes, `recall`, declares: `refs.subject` the instances recalled (ids), `state.marks` `[{ scheme, value, maker }]` where an instance has no id, `state.bound` (things.md's polygon) where a place matters, `state.text` the words. Its signer withdraws it by an `updates` with `status: stopped`; she corrects it by an `updates` with a new list.
```
observe  Harry  kind recall, refs { schema: recall, subject: [L7] }, state { text: "sesame not on label" }
observe  Amara  kind recall, refs { schema: recall, subject: [batch B1, B2], derives_from: [Harry's recall] }, audience [Leila, Ravi]
observe  Amara  state { status: stopped, stop: onward }, refs { what: L7 }          (her stop of one thing: her till and her AI move no L7)
observe  Leila  state { status: stopped, stop: onward }, refs { what: B1 }          (Leila's node answers Amara's recall the same way)
observe  Amara  state { status: resumed }, refs { updates: her stop of L7 }         (the lift, signed twice, once L7 is cleared)
```
**The one rule** (decided; things.md, Parts, stage 3): a recall reaches only what passed through its signer's own hands, by the amounts his own draws handed on, and what was made from that (folds.md, `made_from`). Harry made L7, so his word reaches all of L7 and the three batches Amara baked from her 500 kg of it. A rival who sold Amara 1 kg of L7 reaches that 1 kg alone. Amara's own recall reaches the loaves she sold, to the buyers her record names; walk-ins with no key are reached by a sign on the door. A recall obliges no one: each holder's own node may answer it with her own stop of that thing (authority.md, A stop of one thing), which binds her own tools and no one else; her own key still sells, by her choice. A carrier holding a pallet is found by who holds it, a reading (folds.md, Where a thing is now). A warning about a place is the same schema with `state.bound` and no instance, or a schema of a product's own: both are schemas, named by hash, never protocol.

---

## 5. `protocol.json` edits

Added (A), changed (C), removed (R).

**Terms and conditions**
- C `terms`: add `"waits_on"`. A top-level `"waits_on": ["goods", "price"]`, with `"waits_on_about"`: "terms.waits_on: which half waits for the other (promises.md, Terms, Due). Left out, nothing is filled in: due is read from the deal's other terms alone."
- C `terms_about`: the refrain sentence becomes "refrain: true makes a promise not to do something: it carries terms.until, moves nothing, its condition is the gate, and it is breached only by its bench's counted defeats of its head; with no bench it is never settled and never breached (promises.md, Refrain)." The condition sentence's "binds only once that deal binds (decision H17)" becomes "binds on its own accept and owes nothing until that deal binds". The `keepers` sentence's "an accept needed keepers received by expires is timely" stays. Add: "forfeit: kept only on the payer's own stop (promises.md, Terms)."
- C `condition_shapes`: add `"stopped"` (11 shapes).
- C `condition_shapes_about`: settled "(that promise is done, or a refrain its bench confirmed after its clock closed through until)"; accepted "(that deal binds; a promise so conditioned binds on its own accept)"; add "stopped ({ stopped: deal, side: from | to }: that deal is stopped onward and a stop of that side is among its first onward stops and none of the other's)"; add at the end "A condition is read where the next taking stands (promises.md, What a condition moved stays moved). settled, paid, ruled and reading are named readings (promises.md, Conditions, Named readings)." (`condition_shapes_class` and `reading_not_run` are stage 7's: 07-last.md, C5.)
- C `statuses`, `stop`: unchanged.

**Fields**
- C `fields.transfer`: unchanged (`covers` is there). C `refusals.codes.block.required`: add "a transfer for an order (a promise signed by its to side that names that instance in refs.what) with no state.covers (read, check 7; things.md, A spot exchange)".
- A `kind_fields.observe.account`: `["destination:text"]`; A `field_shape.by`: "a non-empty sorted list of ids (the shape of keepers.names), on an account word: who may say a payment reached it".
- C the `kind_fields.about` note on `received` (stage 3's, for a receiver's own word): add "or, signed by a signer her account word names, refs.subject the transfer and state.amount no more than it states (promises.md, Where to pay me)". One kind for "this much came"; no kind `payment`.
- A `kind_fields.observe.paid`: `["line", "occurrence"]`, and a `kind_fields.about` note: "paid: the payee's signal, refs.subject the deal; her word that its price (or a line's, or an occurrence's) is paid; what waits_on: price waits on (promises.md, Terms, The payee's signal)". Existing fields only.
- R `kind_fields.promise.draw` (three lines): the `draw` schema's own terms (patterns/savings-group.md).
- A `field_shape.grace`: "duration" (a named signer's promise, read by its schema only, so not in `terms`; listed so check 2 reads its shape).

**Folds and outputs**
- C `folds.promise_stage.input`: "the deal's blocks of a first promise or an allocation (folds.md, A promise's stage, Input), and the lines it reads; no clock. A first promise that speaks for no side, or an allocation that binds nothing, has no stage (null); one not read, no answer; a line not read whole gives { not_shown, lacks }".
- C `folds.promise_stage.words`: add `"crossed"`, `"requests"`.
- C `folds.promise_stage.output`: `stage` text adds "the order: offered/asked < declined < stopped before < accepted < underway < stopped onward < done or breached < reversed; only the bench lowers it"; `forks` "blocks of a pair in the deal: proof of a lie, sorted; a pair never frees its signer"; A `crossed` "answers that bind and do not see each other, sorted"; A `per_accept` "[{ accept, stage, paid, uncovered, lines }], one per crossed answer"; A `requests` "[{ block, open }]: answers that do not yet bind, open ⊆ [when, which, whose]"; A `waiting` "[{ block, on }] (blocks.md, Finality)"; A `bench` "{ names, needed, wait, keepers } or none"; `uncovered` (stage 3's) gains "less terms.forfeit only where kept (promises.md, Terms)"; A `not_shown`, `lacks` "when a line it reads is not read whole; then nothing else".
- C `views.promise_view.output`: add "a refrain with no bench shows bench none beside elapsed; settled reads a refrain only once its bench confirmed it".
- R `folds.bids_shown` (whole entry).

**Profiles**
- R `optional_profiles.earnest`, R `optional_profiles.payment-proof`. C `optional_profiles.about`: add "Patterns (spec/patterns/) are not listed here: they add no rule."
- C `optional_profiles.tax-recall`: unchanged key; its file's labels change (3.6).

**Refusal and fold codes**
- C `refusals.codes.fold.quote_only`: stage 4's text, unchanged. C `...not_live`: add "a counter that names other sides, or one with an accept of its offer in its causal past".
- No new fold code: a request is not a refusal; it is listed in `requests`.

**Door ops** (section 6): R `bids_shown`, `earnest_shape_ok`, `earnest_paid`; C `promise_stage`, `promise_view`, `promise_views`, `gives`, `account_of`, `condition_holds`.

**CBOR names** (stage 7 issues the table): added `waits_on`, `grace`, `by`, `side` (where not already there); removed none (`reveal_by`, `recipe`, `wins` stay as schema terms in signed blocks).

**Deleted, counted: 13.** `folds.bids_shown` (1); three door ops (3); `optional_profiles.earnest` and `payment-proof` (2), with `earnest`'s `admission_fields` and `shapes.earnest` (2); `kind_fields.promise.draw` (1); the `{ accepted }` gate sentence and the late-decline sentence in `terms_about` (2); the `forks` clause "of crossing accepts the same terms bind, else the one the other side's block names" (1); `views.promise_view`'s "elapsed with its price paid in full as settled" (1). **Added:** one term and its closed list (2), one condition shape (1), two field shapes and two kind lines (4), six output names (`crossed`, `per_accept`, `requests`, `waiting`, `bench`, and `not_shown` with `lacks`).

---

## 6. Door ops

| Op | Change | Args | Result |
|---|---|---|---|
| `promise_stage` | changed (result) | unchanged | as `folds.promise_stage.output` (section 5), or `{ not_shown: true, lacks }` |
| `promise_view`, `promise_views` | changed (result) | stage 1's | the stage with the view's clock words; `bench: none` beside `elapsed` |
| `gives` | changed | unchanged | adds `bench`: `{ names, needed, wait, keepers }` read from the block's deal's schema grounds and the referee grants both sides signed, or `none`, read from typed fields only; a line is stage 3's |
| `account_of` | changed | unchanged | `{ who, destination, by, hash, at }`; `by` the sorted ids, `[]` when none |
| `condition_holds` | changed | `condition`, `blocks`, `now`, `at?`: the block the condition is read for | reads `stopped`; with `at`, reads the condition in that block's causal past (promises.md, What a condition moved stays moved); without, on all `blocks` as before |
| `uncovered` | no op | | it is `promise_stage`'s output (stage 3's), with `forfeit` kept only on the payer's own stop |
| `pot`, `ruling_releases`, `fee_back`, `clearing_applied`, `owed_back` | unchanged | | stage 3's |
| `bids_shown` | **removed** | | the sealed price is a price fixed later |
| `earnest_shape_ok`, `earnest_paid` | **removed** | | the node's own promise; library code may keep them |

---

## 7. The break cases, walked under the new text

Stage after each step in brackets.

1. **The seller's own transfer (06-F1).** Maria allocates 2 boxes to Amara [accepted]; Amara pays, Maria accepts [underway]; Maria signs the boxes to Amara, who says nothing [underway]: the giver's word settles nothing. Amara accepts, or her tool says it came [done]. Unserved, `uncovered.to` £10 at once.
2. **A late decline (06-F2).** Harry's offer `expires` Friday, no clock. Maria accepts Tuesday, `at` Tuesday: a request, `open: [when]` [offered]. Harry delivers for the deal, naming her accept: his yes [accepted, then underway]. (Her own payment naming her accept would close `when` too: a relier's block, the cut's no-clock way, and Harry, who named no clock, bears it.) On Thursday he signs `declined` on her accept: it reaches nothing that binds [underway]. Had he never said yes, her request stays open: she sees on Tuesday she holds nothing yet. With a keeper named, the keeper's receipt by Friday closes `when` [accepted] and nothing later lowers it.
3. **An accept after her own decline (06-F7).** Maria declines [declined], then accepts with her decline in its causal past: binds nothing [declined].
4. **Crossed accepts (06-F8).** Maria accepts Amara's 80p counter [accepted]; Amara's other device accepts Maria's £1 offer, unseen: both bind, `crossed` [accepted]; Maria delivers and Amara pays 80p: the 80p reading is `done`, the £1 reading `underway` [done, the furthest]. Maria ends the £1 reading by an onward stop answering that accept. Nothing falls. One key, one `prev` or one `seq`: a pair, also in `forks`; still neither is freed.
5. **`{ accepted: X }` after payment (06-F9).** Y is conditioned on X binding; Y's accept binds Y [accepted]; Amara pays £90 [underway]. X's offerer signs a late decline: X still binds (case 2), Y unchanged [underway]. Only X's bench could un-count X's accept; Y's stage still does not fall, for Y binds on its own accept; what Y owes is due only while X binds (Due).
6. **A backup referee blocked (06-F5).** Bench Ade then Leila, `wait` 7 days, `grounds.keepers` the market office. Sam disputes; the office receipts it 1 November; by 8 November its cutoff shows no word of Ade: Leila's turn. Leila rules [accepted, the delivery defeated]. Ade's confirms in June: Leila's word had not seen it, so it counts for nothing [accepted]. With no clock and no receipt by Ade, Leila never gets a turn: Ade's silence holds, by the sides' own choice of bench.
7. **A withdrawn firm offer (13-F5).** No `expires`, no clock. Harry withdraws in April; Amara accepts in October, unseen: her accept is waiting until a relier's counted block uses it (her payment naming it will do), and then it has passed the end [accepted]. Left open on purpose; the read-back says "this offer has no end". With `expires` 30 April, her October accept is late by its own `at` [stopped before]. With a clock, the keeper's line orders withdrawal before accept [stopped before].
8. **Two takers of the last tray.** Ben's open offer of 30 trays; his till allocates under his grant (way 2). The 30th allocation takes; the 31st is `past`, binds Ben, shown `over_allocated` [each its own deal, accepted]. If the 31st taker paid and is not served when due, `uncovered.to` is his and the broken word Ben's. No receipt order chooses anyone.
9. **A short delivery (b3/08 C14).** 100 kg sent, 80 on the pallet. Amara's accepted answer states `amount` 80: 80 lands, 20 freed; per-unit price: `moved` 80 [underway]; the price of 80 is what she owes. Her answer is true; nothing is filled in.
10. **A no-show (b3/20 2e).** Leila books with `forfeit` £20 and never comes; she signs nothing. The café stops [stopped onward, by from]: its stop is first, so the forfeit is not kept: `uncovered.to` £20, Leila's. A café that wants the empty chair paid writes a bond: Leila's £20 conditioned `without` her `arrived` signal by 19:45 on the host's door keeper, a clock both named. The keeper's cutoff with no arrival: the £20 lands with the café.
11. **A deposit when the payee cancels (19-F2).** £20 paid, `forfeit` £20; the restaurant overbooks and stops [stopped onward, by from]: not kept, `uncovered.to` £20. A hidden stop by the restaurant that crosses Leila's later tidy-up stop: one by the payee is among the first: not kept (b3/08 C13a).
12. **A pool payout signed ahead (18-F2).** £1,000 pot; payout of £800 to Achieng conditioned on the vet's signal: holds £800 from where it is signed. A second £800 to Leila: `past` from the first minute. The vet signs for Achieng: hers lands on her accept and stays. More dues: the holder signs Leila a fresh payout; it takes. Nothing flips.
13. **A provider's signal taken back after a resale (b2/15 2.1, b3/12 F1).** Sam's sack to Amara conditioned on `{ paid }`, PayLink in Sam's `by`. PayLink signs; Sam's next block for the deal has it in its past: it stands [done]; the draw lands on Amara's accept; she sells 20 kg to Leila (a spot exchange). PayLink `defeats` its signal: an end only for blocks that had not used it. Leila's 20 kg and Amara's 30 kg stay; the stage stays [done]. Had PayLink taken it back before Sam or Amara used it: the payment never counted [accepted], and the sack never moved. All this is on a node that runs `paid`. On one that does not, Sam's transfer is not read (`reading_not_run`): it counts in no fold there [underway], which lists it `unread` and shows neither Amara's title nor Leila's. Written `{ signal: "paid", by: [Sam], subject: deal }`, the sack lands on Sam's own signal on every node, and PayLink's take-back cannot reach it. PayLink's `received` says only that the money came; that the price is paid is Sam's signal, or his tool's once what came comes to the price (authority.md, Blocks that bind, way 4).
14. **A counter who signs two sums (b3/12 F7).** Leila the counter signs "pledged 520", then "120". Maria's pledge (`ge 500`) used the 520 where her organiser's accept of it stood in its past: bound. The 120 is a newer word: it ends the 520 only for blocks that had not used it. A refund promise "if not reached" is a `without` on the clock, never a bare `lt`: it does not fire. Two sums on one `prev`: a pair, an end of her word for every block that had not used it; Leila's lie is for the judge her own promise names, if any.
15. **A keeper whose cutoff a later receipt shows false (b3/12 F3).** Joe's £200: to Amara `without` his `arrived` by 09:00, Gita the keeper. Gita signs a cutoff through 09:00, then, after it on her line, a receipt of his arrival dated 08:51: the later receipt shows the cutoff false, and it closes nothing (00-shared row 57); the `without` stays pending; the bond lands nowhere. The two blocks are Gita's proven lie, for the judge her promise names. (Had her receipt of 08:51 come before the cutoff on her line, named or not, the cutoff closes over it: he arrived in time, and the `without` fails honestly.)
16. **A ruling after a resale (b3/03 F6).** Sam delivers; Maria accepts and pays [done]; she resells to Leila. The bench defeats the delivery a year later [accepted]. Leila's title is untouched: the ruling reaches no draw that stood before it. What it changes is owed: Sam owes Maria the price back, or Maria owes Sam, as the ruling says.
17. **Paid for and never delivered (06-F6).** Amara pays £300 in full; nothing comes [underway; `uncovered.to` £300 at once, not only after a stop]. Sam stops onward [stopped onward, by from], `uncovered.to` £300, his broken word shown.
18. **A refrain with no bench (b3/08 C6).** Ben's refrain to the café, `until` 30 June, stake £500 kept by Aunt Gita: to the café on breach, back to Ben once kept. No bench: never breached, never settled, and no one to sign either signal; the £500 stays with Gita, still Ben's [accepted, then elapsed with `bench: none`]. Its read-back said so before Amara accepted. With a bench, the stake is written on its signals (Refrain): the £500 goes back on `needed` bench names' `kept`, on every node; a breach found on 10 July still counts for the stage, and what moved stays moved. Written `{ settled }` instead, the return is read only by a node that runs it; any other holds it not read (`reading_not_run`).

---

## 8. What changes for existing blocks and vectors

**Old blocks.** Year zero, nothing locked. A transfer with a `price` and money and goods in one block (the 1.7 one-block sale) is read as a transfer that names an instance and no order: it waits for the receiver's accept, and its money moves nothing on the record. A transfer for an order of that instance with no `covers` is not read (`required`). A pool payout pre-signed with a condition is a draw that holds. A refrain whose `condition` was its breach now reads that condition as its gate.

**Vector sections that change** (`spec/vectors.json`):
- `promise_stage` and `promise_view`: the late-decline set (`D12` and every story named "late decline", "decline reaches back"), the `firm:` set (answers stay), crossing and fork-of-accepts stories (now `crossed`, `per_accept`), allocations in a hash order, the open-receiver delivery in an allocation's deal (now `underway` until the taker's word), `covers` latest (now most), `forfeit` by the payee (now `uncovered`), the backup referee `E1` set (one flips: "the first referee spoke" after the backup ruled), the three "batch 2 P4" refrain stories (the condition is the gate; the lab moves to the bench), `{ accepted }` gates (Y binds on its own accept). Every output gains `crossed`, `per_accept`, `requests`, `waiting`, `bench`.
- `bids_shown` (11) and `earnest_*` (4): deleted. Their stories are re-made as `sealed-price` and `earnest` pattern vectors under the stage and the pot.
- Stage 3's new vector 26 ("Femi's conditioned mixer, resold, then the payment defeated: `uncovered.from` the mixer") changes: where Femi accepted the payment himself, the provider's `defeats` changes nothing (sentence 2), so `uncovered` is null; where only the provider's signal counted it and Femi had built on it, the same; where nothing had used it, the payment never counted and the mixer never moved.

**New vectors** (a maker `make-vectors-deals.cjs`; each a story and its answer):
1. Firm offer, accept: `accepted`. 2. Offer `expires` Friday, no clock, accept dated Tuesday: `offered`, `requests [{ open: [when] }]`; the offerer's delivery naming it: `underway`. 3. Same, accept dated Saturday: `offered`, request never closes. 4. Offer with a clock, keeper receipts the accept by Friday: `accepted`; a later decline: still `accepted`. 5. Offerer's own node receipt dated Tuesday signed Monday, no clock named: request still open. 6. Transfer to Maria, accepted; giver's later decline: owner Maria. 7. Her decline, then her accept with it in its past: `declined`. 8. Onward stop of an unbound offer, then an accept citing it: `stopped` before. 9. Two counters C1, C2; Maria counters C1: C2 still live. 10. Crossed accepts, 80p and £1: `crossed` 2, two in `per_accept`, stage the furthest; an onward stop answering the £1 accept ends that reading. 11. Two allocations of one request on one `prev`: both bind, `forks`. 12. Allocation past the offer: `past`, `over_allocated`, binds. 13. Seller's transfer in an allocation's deal, no taker word: `underway`; taker's accept: `done`. 14. Two `covers` answers, £300 then none: paid £300. 15. `forfeit`: payer stops first: kept; payee stops first: `uncovered.to` 20; crossing stops one by each: not kept. 16. `{ stopped: deal, side: to }`: holds only on the worker's own first stop. 17. Spot exchange, buyer first, `covers` 100: `done` at the second block; owner the buyer. 18. Same with `covers` 0: `accepted`, price owed. 19. Same with no `covers`: transfer not read (`required`). 20. Seller-first one-block sale: stays `offered` until the receiver accepts; no money counted. 21. Account word `by: [PayLink]`; PayLink's `received` used by the payee's delivery: paid; PayLink's later `defeats`: still paid, owner unchanged. 22. PayLink's `defeats` before any use: payment not counted, listed `waiting` then dropped. 23. Off-record transfer, nobody accepted: `unanswered`, not in `uncovered`. 24. Provider in `by` signs `defeats` of a delivery: changes nothing. 25. Backup referee with a clock no side keeps: turn after the cutoff; earlier name's late confirms: nothing. 26. Same with the clock a side's own host: no turn starts against the other side. 27. Refrain with `condition` a signal of two: below two `accepted` and binds no one; at two binds; never `breached` by the signal. 28. Refrain with no bench, clock closed through `until`: `{ settled }` false, `elapsed`, `bench: none`. 29. Refrain with bench, confirmed after the cutoff: `{ settled }` true; a stake on the bench's `kept` signal lands on `needed` signals; breach found after `until`: `breached`. 30. Ruling defeats a delivery after a resale: stage falls, owner Leila unchanged. 31. Counter signs 520 then 120: the pledge that used 520 stays bound; a `without` refund does not fire. 32. Pot: payout signed ahead holds; second `past`; a fresh payout after dues takes. 33. A tool's payment under `waits_on: goods` before the receiver's `accepted` answer to the delivery stands: `not_due` (stage 4's code); with it in the payment's past: inside. 34. A till's spot transfer under a grant whose `on` names the open offer: binds as an allocation, `done` with `covers`. 35. Short delivery accepted at 80 of 100: `moved` 80. 36. The binding-only-grows walk: the 21-block universe of `b2/11-scratch/model.cjs`, compiled to signed blocks, every set: no fall by a non-bench block. 37. `waits_on: price`, the whole price accepted: a tool's delivery with no payee's signal in its past: `not_due`; with the payee's signal (hers, or her tool's with the accepted payments at the price): inside; a node that runs no `paid` reading answers both alike. 38. Account word `by: [Settle]`; Settle's `received` for the whole price, no payee's signal: a delivery waiting on the price is `not_due`; the payee's till's signal after it: due. Every case here on `settled`, `paid`, `ruled` or `reading` is read by a reader that runs it; the case of one that does not (`reading_not_run`) is stage 7's (its section 4, case 10).

---

## 9. Build notes

**The oracle, `spec/oracle/fb.cjs`.** In order, after stages 1 to 4 are in:
1. `livesIn` (about 3030 to 3045): a counter replaces only the offer it answers (the loop in `b3/16-scratch/mend.diff`, "MEND 11-S5", is the shape).
2. A new `answerBinds(a, deal, pool)` in place of the binding test (about 3186 to 3224): live where it stands; keeps to the offer; no own-side decline in its past; `stands(a)` and `stands(offer)` (stage 1), which read `expires` as an end through the cut; on an open offer, a standing yes of the offerer's side. Returns `{ binds, open }` for `requests`. Delete the late decline, its three exceptions and the node-receipt closer.
3. Crossing: replace "the one the other side's block names, else neither" and the lowest hash with `crossed` and one `stageOf(reading)` per crossed answer; the stage is the furthest.
4. Allocations (stage 3 made them draws): one request allocated once by causal past; two unseen are a pair.
5. Settling: the giver's open-receiver branch (about 3500) goes; `covers` most (about 3524); the account word's `by` via `accountOf`; `spotStage` for an order and its transfer (the `b3/16` patch has a seller-first `spotStage`: turn it round, buyer first, `covers` required).
6. `forfeit` (about 3650) by first stops of the payer only; the `stopped` condition.
7. Refrain: condition as gate; `breached` by bench only; `settled` by bench after the clock.
8. The turn rule (about 3151): the backup's turn by receipt or by a clock no side keeps.
9. `conditionHolds(c, pool, now, at)`: read in `at`'s causal past; `answerStands` (about 3924) calls `stands`.
10. `givesIn`: `bench`. Delete `bidsShown`, `earnestShapeOk`, `earnestPaid`. Door table.

**The Rust core, `sdk/rust/src/`.** Same order:
1. `fold/deal.rs`: live offers, `answer_binds`, `requests`, crossed accepts read one by one, allocations (with stage 3's `draws_on`).
2. `fold/promise.rs`: the stage order and the table; outputs `crossed`, `per_accept`, `requests`, `waiting`, `bench`; `not_shown`.
3. `fold/settle.rs`: the receiver's word (her answer, her tool's, her order, a `by` signer), `covers` most, the spot exchange, `forfeit`, Due (`waits_on`: the payee's signal or the receiver's accept of the delivery; no sum) for stage 4's `not_due`.
4. `fold/condition.rs` (or wherever `condition_holds` lives): `stopped`, the `at` reading, the refrain gate, `settled` of a refrain.
5. `fold/bench.rs` (split out of `promise.rs`): who is on the bench, turns, rulings that reach no draw.
6. `check/read.rs`: `covers` required on a transfer for an order of that instance. `fold/gives.rs`: `bench`. `fold/market.rs`: `bids_shown` out. `profiles.rs`: earnest out.
7. `door.rs`, `spec.rs`; rebuild WebAssembly, the Python library, the XCFramework; every SDK's tests.

**Identical before and after**, on both builds: every deal where no decline came late, no accepts crossed, no `covers` fell, no payee stopped a forfeit deal, no backup ruled, and no refrain read its condition as breach; every ownership answer that stage 3 fixed; every `under_ok`.

**The model, `tools/tla/`.** Add two parts to `check.py`, emitted into `FoodBlock.tla` as the others are, each with a `.cfg`:
1. **`deal`**: one deal's universe in three offer kinds (firm, `expires`, a clock): an offer, a counter, three accepts, a crossing accept, a withdrawal, two declines, the offerer's yes, a yes after her own no, a keeper's receipt and cutoff, a short payment with two answers, a delivery with its answer and a late decline, an onward stop by each side, a `forfeit`, a bench name's `defeats`; and, for title, an onward transfer by the receiver and a named signer's signal with its take-back.
2. **`open`**: an open offer of quantity 2, three requests, allocations on one line, one withdrawn request, two allocations of one request on one `prev`.
**Invariants.** `BindingOnlyGrows` (an action property: `[][Rank(stage') >= Rank(stage) \/ BenchPushed]_vars`); `StaysMoved` (no owner regained by a block the new owner did not sign); `ReceiverSigned` (`done` implies, for each half, the receiver's word or the bench's `confirms`); `NoSideRules` (no block that speaks for a side changes what counts); `ForfeitOwnStop`; `QuantityHeld` (allocations that take never pass the quantity on one line); `Converge` (as now). Mend the allocation part: a second allocation of one request binds nothing (check.py line 76's "binds all the same" is wrong against the text).
**Mutations that must be caught**, each a real 1.7 fault: `late_decline`, `late_decline_transfer`, `giver_settles`, `latest_covers`, `crossing_frees`, `hash_picks_allocation`, `backup_overruled`, `backup_blocked_by_side_clock`, `forfeit_any_stop`, `condition_unmoves`, `refrain_condition_breaches`, `seller_first_cash`, `keeper_orders_takers`.
**Tie the model to the builds**: compile each universe to real signed blocks and run the oracle and the core over every set (about 31,000 sets: seconds). A model not run against the code checks only itself.

---

## 10. What this stage leaves, and what it needs

**Leaves to stage 6 (circles):** a circle's allocation and spot exchange by a member under its rows; a circle's refusal threshold by its rows; `circle#role` in a signal's `by`; `circles.md`'s pointer to `profiles/vouches.md` (admission by vouch).
**Leaves to stage 7:** `state.rule_set`, `reading_not_run` and `condition_shapes_class` in `protocol.json` (P8's Named readings paragraph is written here); `protocol.md` (the profile and pattern sentence, the glossary's "orderer", "request", "bench", the table of profiles); `THREAT-MODEL.md` (the firm offer with no end; a clock of one has no proof of silence; a count of names is a count of keys; a payee who signs nothing keeps off-record money); `NECESSITY.md`; the CBOR names; whether `pot` is a view to cut.
**Needs from stage 1:** `stands`, `waiting`, The cut with `expires` as an end, Seen, Relier, a named clock's four readings, cutoffs, Who bears the gap. **From stage 2:** A line, read whole, `not_shown`, `lacks`, `read` and its `required`, the pair by `prev` or `seq`. **From stage 3:** What is left (holds, lands with its condition, freed, the reasons), the accepted answer's `amount`, `uncovered` per side, `unanswered`, the counting sentences of stages 1 and 2, `made_from`, things.md Parts and Handed over or held. **From stage 4:** Blocks that bind (ways 2, 4, 5), rule 10, `not_due`, Keeps to (a till's spot transfer), stage 4's P4, P5, P8.

---

## 11. Settled (2026-11-11)

**What this stage asked of the protocol** (from the recall and warning example), settled by the owner (00-shared, rows 66 and 67):
1. *A hold* is now **a stop of one thing**, her own narrowing that names one instance across all her grants (authority.md, written by stage 4: 04-grants.md, section 12); the recall pattern (4.11) shows its blocks. "Hold" stays a draw's amount.
2. and 3. *A closed kind, or a schema; one kind or two*: a recall and a warning are **schemas** a product publishes, named by hash, not protocol (stage 7's test).
4. *Who holds a thing now* is **a reading**, written once in stage 3's folds.md, Where a thing is now.

**Its asks of the shared ground**, all accepted: `covers` the most (row 72; P13 here, F7 in stage 3); things.md lines 62 and 68 (stage 3's T14 and T15 now write them); `pools`, `payment-proof` and `keeping` move here (stage map); `bids_shown` is deleted here (stage 3 leaves it); a till's spot sale is ways 2 and 5 in one block (stage 4's Blocks that bind, way 5); pointer renames from `profiles/` to `patterns/` change no other stage's passage (stage map); request, bench, due, `crossed`, pattern (00-shared, Deals); `terms.waits_on` (row 73). Also settled there: stage 3's vector 26 changes (row 74); a basic phone's "received" is the receiver's own `observe` of kind `received`, one kind with a `by` signer's word, so `payment` is no kind (row 75); the `stopped` condition names its side by `side`, since in a condition `by` names signers (row 78); with no clock, an accept passes `expires` as the cut says, by the offerer's yes or a relier's block (row 79).

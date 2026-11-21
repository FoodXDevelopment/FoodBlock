# FoodBlock 1.8: proposed changes

**Status: decided on 2026-11-11 (see the next section); being built in stages. The numbered changes below were proposals written before the review.** This page is the list of what 1.8 would change and why, so it can be read, argued with and decided before any spec text is written. It was started on 2026-11-10, from FoodX's review of how a person's node checks who signed a block (`~/foodx/docs/attention/L1-who-signed.md`, and the list of asks in `~/foodx/docs/attention/asks.md`).

Each change says: the gap, the change, where the spec would move, whether any existing block changes meaning, and what is still unsure. The spec was read in parts for this page, not in full; "to check" lists what must be read before writing.

---

## Decided 2026-11-11, after the review of 1.7

On 2026-11-11 FoodBlock 1.7 was reviewed in three rounds: twenty reviewers found the faults, twenty checked them by running them and designed a mend for each, and seventeen tried to fit the mends together and break them. The reports are in `~/foodx/research/2026-11-11-foodblock-1.7-review/` (`batch1/`, `batch2/`, `batch3/`). Of 31 serious faults built as signed stories and run on both the core and the oracle, 29 were confirmed and 2 confirmed in part; the two builds never disagreed, so the faults are in the spec's rules, built faithfully twice.

This section is what Patrick decided from that review. **It governs the rest of this page:** where a numbered change below disagrees with it, this section wins, and the numbered change is to be folded in or dropped (the review's ask-by-ask table is `batch2/19-change-and-1.8-queue.md`). The exact spec text for each stage is in `changes-1.8/`.

### The centre: six sentences

1. **`valid` means only: who said these bytes.** Where a block sits in a chain, and whether this reader can read it, are separate questions. A block a reader cannot read is kept as "not read", never refused.
2. **What is left.** An owner's own signed words take from a stated amount, in order, and nothing counts past what is left. Goods, money, a pot, an open offer and a grant's limit are all counted this one way. A payment is not a taking: it is a plain sum toward what is owed.
3. **A date binds only the one who wrote it, or the one she named to write it.**
4. **Under a grant, an act binds the giver only if it matches a promise she signed.**
5. **Answer only from a line read whole.** Otherwise say what is missing; never guess from part of a line.
6. **What can still move back has not moved yet.** Once a word stands, a wrong is a debt or a claim, never a reversal.

### Patrick's seven decisions

1. **A stop, and who bears the gap.** Her grant says which. If the grant names a clock (her own node will do), her stop counts from the moment that clock has it, and the clock's order decides. If it names none, she bears what was done under it until the one who relied has seen the stop. The protocol fills in neither.
2. **Someone trusted to say what happened** (a clock, a payment confirmer, a counter). A condition names a signature, never a fact. If she promised nothing, a mistake binds her to nothing; she answers only for a promise she signed, or if she lied on purpose to help take someone's goods, which is taking part in a theft.
3. **How much.** All of it, in stages, in the order that causes least rework: keys, the store, amounts, grants, deals, circles. Nothing is locked until it is all in.
4. **A circle.** The record shows who owns it, in parts that move like any other thing. Who may sign for it is separate: roles and rules. A circle's promise binds the circle's things only. A circle may leave its owners unsaid.
5. **Acts.** A name is a reading. `refs.act`, `act_check` and the act templates leave the protocol; the library stays as an open list of names anyone may copy and add to. Words: a *type* is what a grant covers; an *act* is the name a person gives to what they are doing; a *move* is one signed step; a *deed* is something done in the world.
6. **Keys.** One signature, once: a person's key is made in a thing she holds, at her first yes that binds her. No host or door makes or holds a person's key. Keys a host has already made for people are retired, and what they signed is the host's own word.
7. **The final yes under a grant.** Her tool may accept any signed offer that matches her promise, up to a deadline she signed. At the deadline, if it has not chosen, the lowest signed offer is taken. Her tool cannot move the deadline. (The deadline and the fallback are terms of her own promise; the product draws them.)

### Settled with them (the reviewers agreed, and the premise decides)

- A waiting window on a key is a wait before a word counts, never an undo afterwards.
- A hidden limit binds nobody. Only a limit the other side can read counts.
- One keeper hearing a stop is enough to stop; it takes the stated number to widen.
- A side's own clock counts only against that side.
- When a named clock is silent, what waits on it waits. Nothing fills its silence.
- No keeper's silence is ever the only thing between a person and her own word: the signer's own later yes also counts.
- Two devices selling from one stock each hold a stated share of it.
- One who signs the same thing to two people owns none of it and may not choose between them.
- A reversed payment never takes goods from a later buyer.
- A deposit is lost only by the one who cancels.
- A recall reaches only what passed through that seller's own hands.
- No Unicode table, no time zone database, no currency list.
- One key writes public blocks or sealed blocks, never both.
- A tool may say "it came" inside a deal that already binds its principal. It may pay only where her grant covers it: what a deal that already binds her owes, no more, and not before it is due. (Corrected the same day: "it may not pay" would have ruled out machines that buy unattended.)

### Left open on purpose

- A thief who takes her top voice. Every system checked has this.
- A firm offer with no end and no clock cannot be withdrawn from one who has not seen the withdrawal. No protocol without a shared clock can order those two blocks.
- A carrier knows who deals with whom; only its own signed promise covers that.
- Money paid as a plain unit word ("KES") does not say whether it is a claim on someone.

### Decided later the same day

- **Sign twice** (the planted grant): a word that lets another act or spend for her stands only when the same key signs it again after its wait, or a voice above signs it.
- **A tool may pay** where her grant covers it: what a deal that already binds her owes, no more, and not before it is due.
- **What her own tool makes is hers from that block**, and a tool may always hand back to her what it holds for her.
- **Her tap key is her lowest voice, with a cap.** A word of it within the cap stands as her word; over the cap, a voice above confirms it.
- **One key signs public or sealed, never both.** Already settled; confirmed for devices and for her AI: each that writes both holds two keys.
- **A stop that names one thing.** Her own stop of one instance keeps every tool under her grants from moving it until she lifts it. A recall and a warning are schemas, not protocol.
- **A synced passkey may be a voice**, ranked below a key that never leaves one device, and it may state a wait.
- **Strict keeps-to.** Under a grant, the other side's free words never ride in a block that binds her; she may always accept anything herself.
- **`terms.waits_on`**: `goods` or `price`, which half of a deal waits on the other. Left out, nothing is filled in.

### Decided 2026-11-11, late: restate before building on

After ten attack reports on the 1.8 texts and thirty research reports on 1.9 (in `foodx/research/2026-11-11-foodblock-1.8-attack/` and `foodx/research/2026-11-11-foodblock-1.9/`), the owner decided four things.

- **Restate 1.8 around one centre before building stages 4 to 7.** The centre is the premise in property words: "A record holds only words that people signed: no fact, no silence, and no ruling is in it. A word acts only on what is its signer's own; whatever of another's it touches waits for that other's own word naming it." Every special rule's cases are run through it; a rule that passes is deleted, a rule that does not is kept and named. Delete and re-run, never rewrite from scratch. One restatement, one check by four seats, then build. Stages 4 to 7 are on hold until then. The design is being written in `foodx/research/2026-11-11-foodblock-1.8-restatement/`.
- **The machine body goes into 1.8, not 1.9.** A machine names the thing that is its body, and only that thing's owners are above its keys. A maker or past owner is not, after the sale. Reason: 1.8 is not locked, a maker above a sold machine's keys breaks the premise, and adding it later would make old readers wrong. (replaced the same night: see below)
- **Two earlier decisions are reworded as what her own word did, never a duty laid on her.** The outcomes stay. (a) The stolen tablet (decision 1): no text says "she bears it"; the record holds no ruling. (b) Sign twice: it is her own choice, stated in her list of voices, not a form the protocol imposes.
- **A SIM key is never her first voice.** An operator can reprogramme a SIM. Mama Achieng's SIM key is a capped lowest voice. "A thing she holds" becomes "a thing only she can make act".

**Provisional, awaiting the owner:** in the stage 3 compare step, "lands" was ruled so that an owner's move of her own thing lands when signed if the receiver's own yes is already in its past; otherwise it waits for that yes. (confirmed the same night: see below)

**Where 1.9 stands (research suggestion; not decided):** no new primitive beyond one field (a total stated for one deal counts as her largest such total), plus a shelf of worked patterns, a mapping to the agent-payment standards, and a conformance kit. "A line signs where it stands" and "lines that see each other" wait.

### Decided 2026-11-11, late night: the restated centre and fifteen answers

The restated centre was written in `foodx/research/2026-11-11-foodblock-1.8-restatement/` (`CENTRE.md`). The owner then answered the open questions in `OPEN.md`. Fifteen were answered; two were not asked (8 and 15).

**The centre, five questions.**

1. **Who said it.** `valid` answers only: which key said these bytes. Where the block sits on its key's line, and whether this reader can read it, are other questions.
2. **Whose it is.** A record holds only words that people signed: no fact, no silence and no ruling is in it. A word acts only on what is its signer's own; whatever of another's it touches waits for that other's own word naming it.
3. **How much.** An owner's signed words take from a stated amount, in order along one line, and nothing counts past what is left. The amount stays its owner's on whatever line it is counted, and leaves that line only as her word says.
4. **From what a reader answers.** A reader answers only from words she holds, on a line read whole back to its start; otherwise she says what she lacks. Nothing orders two lines but a ref, and what cannot be ordered is not ordered.
5. **From when it stands.** A word stands when every condition its signer stated before it has held: its own, and those of each word it is made on. Until then it moves nothing. What stands stays: no fold moves it back.

**The answers** (numbers are the questions in `OPEN.md`; the full table is `DECIDED.md`).

- **1. The machine: no machine rule.** Harry sells his mill to Sam. An actor has its own list of voices and nothing else; nobody stands over anybody's keys. A machine speaks only for whoever granted to it. Whoever has the metal can wipe it and start a new key. A deal names people, never a machine. The operator grant is deleted. **This REPLACES the earlier "the machine body goes into 1.8".** The reason stays (a maker or past owner is not above a sold machine's keys). The body rule does not.
- **2. A cash sale with no clock is done at the seller's block.** Mama signs "they are yours, 100 came" and Leila's order is already in its past. Whoever wants a gap states a wait. This changes built stage 1. **It confirms the provisional "lands" ruling above.**
- **3. A weekly budget on her own key stays,** read on the clock her list names, by the same rule as a grant. If her clock is silent the key stops and her higher key still signs. (Amara's tap key: £50 a go, £200 a week.)
- **4. All owners together may act.** What the owners of every part sign together is theirs to do, whatever the table lists. (Amara owns 100 of 100 parts and can pay herself.)
- **5. An order may say "cash".** `waits_on: price`: the seller can finish it only by signing the price is paid. Without it, it is a credit order and her read-back says so. (Mama hands Ben 400 in notes.)
- **6. The unweighed heap takes two blocks.** Her order counts as "I got it". The product may offer the three-block form. (changed 2026-11-13: see below)
- **7. Her AI and the deadline: never both.** With "take the lowest" stated, nothing is accepted before the deadline. With a deadline and no such word, her AI picks. The two fields move from her promise to her grant.
- **8. Who signs after a death: not asked.** Not needed before stage 7. Carry the suggestion (what Harry had passes to the successor by Harry's own transfer, on the condition of his close) to stage 7 as open. (changed 2026-11-13: see below)
- **9. "Pay by Friday."** A ninth thing may differ in Keeps to: a pay-by date the seller offers, where she is the one who pays and stated none. It gives her time and moves nothing. (changed 2026-11-13: see below)
- **10. A whole line is read narrow.** "A line is read whole for a question when each block on it is held and valid, and each block that names the thing asked about is read. A block I hold and cannot read hides what it names, never its line. A later rule counts only in a block that names it." Wanjiru need not hold all two hundred of Harry's sales. Changes built stages 2 and 3.
- **11. A bounded key in front of a stranger: "a deal" only, unless she has a clock.** With a clock, a total is read from one receipt stating the running sum. (Mama Achieng's SIM key, KSh 3,000 a deal.)
- **12. A deal that stops short: on the seller's word.** The rest comes back when the payee says the deal is done, or where his own offer said ahead "a stop ends what has not come". Her own stop alone frees nothing. (Leila's £2 set aside for oil; the pump stops at 40.) (changed 2026-11-13: see below)
- **13. A price that drops: the owner's own idea, not one of the options offered.** Dynamic pricing lives in her own tool, inside her signed range. She signs a floor and a ceiling. Her tool quotes any figure inside, by any formula or her AI. The buyer's yes names the figure. Stage 4 gains one sentence: a tool's offer may state a price inside the range her promise states. No formula in the protocol. A recipe named by hash stays possible as a pattern; it was not chosen as the rule. (changed 2026-11-13: see below)
- **14. The man at the kiosk: a second read-back by someone with a different owner.** Pattern and product default; nothing in the protocol. (changed 2026-11-13: see below)
- **15. Split the history out of the shared ground: not asked** (housekeeping). Done as suggested: the choices table and the stage map go to their own files.
- **16. A side's clock never pays the side the bond would go to.** The held-table pattern is shown first (Leila buys the hold; the café's promise takes £20 off the bill if she sits). The protocol must not refuse a term she signed. Derive it: a side's clock counts only against that side already gives the outcome (the café's own receipt is the café's word and binds nothing of Leila's). No bare ban.
- **17. How many clocks stop a thief: correct it.** It takes `names` less `needed`, plus one. One is enough only where every clock is needed. (Maria's three clocks, any two.)

**Words.** In anything a person reads, a "clock" is a person or service she picked to say when things happened, who signs "I held this then". "Keeper" and "clock" are not both used for one thing.

The design is in `foodx/research/2026-11-11-foodblock-1.8-restatement/`, and nothing in it has been run on either engine yet.

### Decided 2026-11-12 and 13: 1.8 does not lock; the 1.9 plan

After about 260 review reports (depth, contrarian, security, a fifty-seat stress test that ran both engines, and ten planners; all in `foodx/research/2026-11-12-foodblock-*/`, the plan summary at `foodx/research/2026-11-12-foodblock-1.9-plan/PLAN-1.9.md`), the owner decided on 2026-11-12 that 1.8 will not lock. Everything learnt goes into 1.9, built from the built stages 0 to 3. On 2026-11-13 he answered the plan's main open questions as below. Every rule is either the premise applied once, or a value she signs once in her own block. There is no third layer.

- **1. A chosen rule lives in her own word.** It is a value she signs in the block it binds. No rule sets as swappable code, and there is no routing. (Maria writes "£3 at least" in her offer.)
- **2. The centre keeps the five questions, three sentences sharpened.** (1) *Who said it:* which key said these bytes. (2) *Whose it is:* a word acts only on what is its signer's own; a word on what is wholly hers needs no other's word. (3) *How much:* a word asking for more than is left takes nothing; a word naming no lot takes from none. (4) *From what a reader answers:* only from what she holds; where the record does not order two words, neither came first; never "nobody" where a signed word names someone. (5) *From when it stands:* when every condition its signer stated has held; what stands stays, except where one key signed twice in one place.
- **3. Pay-by.** Her standing want carries her own range ("pay no sooner than three days"). A seller never writes a date into her silence. (Replaces decision 9 of 2026-11-11.)
- **4. The unweighed heap.** Her order counts as "it came" only where her order says so. Her tool writes that at the basin, with the goods in her hand. An order from home does not, so a short weight still shows. (Narrows decision 6.)
- **5. A deal that stops short.** Her held room comes back when the rest can no longer fall due: the seller's "done", a stop term his offer stated, his delivery date passing on a clock both named, or a judge both named. Her tool only takes offers that carry one of these. Her stop alone frees nothing. (Widens decision 12.)
- **6. The price range.** A figure binds a range's owner only by her own side's word. Two ranges meet in their overlap. ("The side that is paid names the figure" is refused: it shut out a basic phone.) This is how decision 13 reads.
- **7. Two yeses to one gift.** Her list of voices names which of her voices receives; her first voice by default. (Reverses the earlier rows that made two accepts apart a fork.)
- **8. Kin on her list may put her new card back on top.** After a wait above zero, unless a voice above them says no, only if her first voice placed them, and only where her list says so. An old list keeps meaning what it meant.
- **9. A will.** It is her own transfers, signed in life, on the condition that her list closes. It holds nothing while she lives. An heir's early yes is only a request. There is no "everything else" rule. The successor grant goes. (Replaces the open item on who signs after a death.)
- **10. The kiosk.** One protocol sentence: a passkey signature counts only when the card says the user was verified. The second reader is one she picks, with a different owner and different software; it reads her cards and never her PIN. A card with its own keypad is the real cure and is worth building (FoodWare). (Narrows decision 14.)
- **11. A stolen key.** A key passes title only where her voice says "what it signs passes". If she says nothing, nothing passes that she did not sign with her own hand. Buyers see which keys carry it. "Standing" goes.
- **12. On screen.** Show only what someone else set aside for her and who holds it ("kept for you, in Harry's hands"). A deal on her word shows nothing extra. "Owed" is renamed "to come" everywhere, engines included. "Missed" stays.
- **13. A worker's hours.** The job states who counts them. Where it names nobody, Amara's yes counts. FoodX drafts every job as "counted on Ben's word, disputed before the judge both named", shown to Ben before he signs.
- **14. The lost deposit (forfeit) stays inside one deal.** The "held table" (decision 16) stays as a pattern a café may use.
- **15. The byte field "keepers" is renamed "clocks"** before anything locks: one word, one meaning.
- **Also.** A new phone's mail key waits her one-day reach, not thirty days. One member one vote in a co-op is a row that counts the holders of a named grant (no separate roles). A batched receipt holding her stop and another's accept: neither came first, and her stop wins at the next receipt.
- **Named only.** The machines FoodX builds are branded FoodWare (recorded in `docs/PRODUCT.md` and `docs/DECISIONS.md` on 2026-11-13).

**Decided 2026-11-16.** Answers to the questions left by the 1.9 text (`changes-1.9/SILENT.md`):

- **1. Question 5 has two exceptions.** Besides one key signing twice in one place, her own higher voice may cut off what a lower key of hers said ("nothing from that key after this point counts"); it takes back nothing for anyone who already built on it.
- **2. Kin she placed may also close her list,** on the same terms as putting her card back on top: after a wait above zero, unless a voice above them says no, only if her first voice placed them, only where her list says so.
- **3. The receiving voice (decision 7): the protocol default stays her first voice.** FoodX drafts "my daily key receives" into her list at set-up, and her read-back says so in one line (product, not protocol).

---

## 1. Her first block is also a grant to its own key

### The gap, with an example

Maria makes her identity. Her first block (the genesis) says, in effect, "I am this key". That is a statement of fact.

A thief copies her key and signs "I will hand over 40 kg of flour". Today that block counts against Maria, unless a recovery key or a will reaches back and voids it.

Why should it count? The spec gives two reasons for a signature binding someone, and neither covers this:

- "A signer cannot deny her own signed act" (`core.md`, section 10). True, but the thief's block is not her act.
- "No implied duties: no spec text assumes a duty nobody signed" (same section). By that rule, "you answer for whatever your key signs" is a duty Maria never signed.

Every other key already has a signed word behind it. A key brought in later has a key grant, signed by its owner. A machine's key has an operator grant, which names who answers for it. Only the first key has nothing.

### The change

**The genesis is read as a grant to its own key:** what this key signs is its maker's word.

Then one rule covers every key: *a key speaks for a person only by a grant that person signed.* The first key under the genesis, later keys under key grants, machines under operator grants. "Authority only narrows" gets a root.

Three things come with it.

**a. It ends by notice.** She answers for a replaced key only until the other side has seen the replacement.

- Today a key's own rotation "closes only its future": it voids the old key's blocks that have the rotation in their own past (`modules/identity.md`, Rotation). A thief simply leaves the rotation out of his block's past, so his blocks keep counting for ever.
- Proposed: a block of a rotated-out key does not count for a block of **another** author that has the rotation in **its** causal past. In plain words: if you had already seen that Maria replaced her key, you cannot build a deal on something the old key signed afterwards.
- This needs no clock and no third party. It reads only causal pasts, so every node holding the same blocks gives the same answer.
- The idea is already in the spec for other cuts: "an outsider who had seen the cut is not protected" (`modules/folds.md`, Built-on stands). This extends it to a key's own rotation.

**b. She can limit her own key.** A grant can carry limits, so the grant to her own key can too: for example "above this amount, two of my devices, or a wait". A stolen key is then bounded by a limit she chose. How this is written is not decided (see Unsure).

**c. She is told once, in plain words.** This is for whatever app makes her key, not for the spec: "Anything signed with this device counts as you saying it. If you lose it, replace it at once." Without this, the grant is buried, and it turns back into a duty she never knowingly signed.

### The ground

A signature is evidence of her consent, never the consent itself (Rothbard and Kinsella: title passes by the owner's shown consent). A key is a secret, and a secret is information, which is not property. So "it is her key" cannot by itself reach her property. Her own signed grant can. The grant is to a key and she can end it at any moment by replacing the key, so her will is never signed away.

### Where the spec would move

- `core.md`, section 2 (the three ways a word binds) and section 4 (the genesis): say that a genesis is its maker's grant to its own key.
- `modules/identity.md`, Rotation: the notice rule.
- `modules/folds.md`, Built-on stands: name the new case.
- `spec/THREAT-MODEL.md`: the stolen-key entry.
- New vectors for the notice rule.

### Does any existing block change meaning?

- **The reading of the genesis: no.** Every existing genesis reads as before; the spec only says what it was already relying on.
- **The notice rule: yes, in one narrow case.** A block that built on a rotated-out key's later block, after its own author had seen the rotation, counts today and would not count under 1.8. Nothing honest relies on that case.

### Unsure

- **How she states a limit on her own key.** Fields on the genesis? A separate grant naming her own key? A genesis is fixed for ever, and she will want to change a limit. Not designed.
- **Who may widen that limit later.** If the key itself may, a thief may. This probably needs the same care as recovery.
- **How the notice rule meets** crossing rotations (Conflict), recovery reach, frozen keys and pairs. Not checked.

### To check before writing

`core.md` sections 2, 4, 10 and 11; `modules/identity.md` in full; `modules/folds.md` (A fork is a burden, Built-on stands); `modules/authority.md` (The cut); `spec/THREAT-MODEL.md`.

---

## 2. A block travels with its pieces

### The gap, with an example

A child taps a lunch band on a canteen till. The till has no signal. The band presents a block signed under the parent's grant.

A block does not carry its signer's key. The key is "read from what the block rests on alone" (`core.md`, section 8, check 6). And a node judges a push "with all it rests on ... to the end" (`modules/nodes.md`, Push), which means the signer's whole chain.

The till holds none of that. So it can say only "well formed", never "signed". The same is true of a phone checking one offer before its owner says yes, a fridge tag receiving a command, a farm cut off for weeks, and any node meeting a stranger's first block.

### The change

**Name the smallest set of blocks that lets anyone check who signed a block, and say that whoever presents a block carries it.** Call the set the block's **pieces**:

- the signer's genesis;
- any key grants on the way from the genesis to the key that signed;
- when the block was signed under a grant: that grant and each grant above it.

And one new reading (a door op, name not decided): given a block and its pieces, **which identity's key opens it?**

### What it shows, and what it does not

- **It shows:** a key of this identity signed these bytes, and (where it applies) under this grant chain.
- **It does not show:** that the key still speaks (it may have been replaced), that the block is not one of a pair, or that no later block was held back. Those need the signer's chain and are a node's to judge. This reading is weaker than `valid`, and must never be reported as `valid`.

So a small device can honestly say "signed by Maria's key, under this grant; I have not judged the chain".

### What it fixes

- A phone checking, before its owner's key signs, every block her yes rests on (so a host cannot show her a made-up offer).
- A micro that acts, checking a command from a key it was not paired with.
- An offline till, locker or machine meeting a stranger.
- A stranger's first block at a node: the signature can be checked at once, while the whole chain is still fetched and judged.

### Where the spec would move

- `core.md`, section 8: the new reading beside `valid` and `check`, and its codes.
- `modules/nodes.md`, Push, and `transport.md`: a presenter carries the pieces.
- `protocol.md`: the micro and edge profiles.
- `protocol.json`: the op and its answer.
- New vectors.

### Does any existing block change meaning?

No. Nothing about a block changes. It adds a way to read one and a habit of sending.

### Unsure

- **The name.** "Proof" is taken (a proof she chooses to share). "Pieces" is the working word.
- **How big the set can get.** A helper under an agent under a person is a chain of three grants. A key rotated many times is a long line of key grants. A cap may be needed.
- **Sealed blocks.** A piece may be held only by its header. Not checked against `privacy.md`.
- **Whether a micro can afford it.** Each piece is a signature to check.

### To check before writing

`core.md` section 8 in full; `modules/nodes.md` (Push, Rounds); `modules/authority.md` (Backed by a person); `privacy.md`; `encoding.md` (the compact form); `protocol.md` (profiles).

---

## 3. Wording: who holds a node

Already listed in `TODOS.md` (decided by FoodX on 2026-11-02). `protocol.md` says "Only people and machines hold nodes." Say instead that a node is held by a person; a machine runs one only as its owner's agent, under her grant, and its words bind her only as far as that grant, because only people act. No change to blocks or vectors.

---

## 4. A grant that can cover a stranger

*Added 2026-11-10, from FoodX's review of its step L2 (`~/foodx/docs/attention/L2-her-record.md`). Three of that review's reports found it independently.*

### The gap, with an example

A café puts its menu out as an open offer: "flat white, £3". A customer it has never met scans a code and orders one.

- His order is only a **request**. An open offer "binds only through an allocation" signed by the offerer (`modules/promises.md`, around line 80). So someone on the café's side must answer it.
- The café wants its AI, or its till, to do that. An accept or allocation under a rule needs the other side in the grant's `scope.parties` (`modules/promises.md`, around line 69).
- But a grant that states no `parties` "names no one ... never with everyone" (`modules/authority.md`, line 7).

So no 1.7 grant can let a machine allocate to someone its owner has not named in advance. Every first order from a new customer needs the owner's own signature: a tap per coffee. That is true of every shop, kiosk, vending machine, market stall and unattended store.

### The change

Let a grant say, in a typed and bounded way, that it covers requests on **her own named offers**, from anyone. Not "act with everyone": only "allocate requests on this offer (or these offers) of mine". The other side is then whoever made a well-formed request on that offer, and the offer's own terms are the terms.

Bounds that must be in the grant, so authority still only narrows:

- which offers (by hash, or a kind she names);
- a cap per request and a cap per period;
- stock: allocations are counted against the offer's quantity, so the grant cannot over-allocate;
- "paid first", where she wants it: allocate only when the payment has counted.

### The ground

Her offer is her word, and it already invites anyone. What is missing is only her consent for a tool to give the answer she would give. A grant is exactly that consent, within limits she set. Nothing here lets a tool deal with a stranger on terms she did not state.

### Where the spec would move

- `modules/authority.md`: the reading of `scope.parties`, and `under_ok`.
- `modules/promises.md`: Who may bind; the allocation of an open offer; `over_allocated`.
- `protocol.json`: the grant's fields.
- New vectors.

### Does any existing block change meaning?

No. Today's grants read as before. This adds a new, narrower way to state parties.

### Unsure

- **The shape.** A new value for `parties`, a new field naming offers, or a new kind of grant.
- **Free requests.** A request costs a free key nothing. The caps and "paid first" bound the harm; they do not stop a flood of requests reaching the node. That is the node's admission rule and earnest money (`profiles/earnest.md`).
- **How this meets** a menu written as many lines (each line is offered once, whole) against one per-unit price with a range.
- This was read from the lines cited, not from the whole of `promises.md` and `folds.md`.

---

## 5. Keeping a living thing: what goes in should link to what comes out

### The gap, with an example

Bad feed is delivered to a farm. The cow eats it. The farm sells the milk.

In the spec, eating is a make with no output, which ends the input. Milk and calves are produce of a keep, and a keep "consumes nothing" (`modules/things.md`, around lines 34 to 36). So nothing signed links the feed to the milk. The same is true of spray onto a crop and of water into a fish pond.

A recall on the feed therefore reaches the farmer and stops at the animal's mouth. Whoever bought the milk is not reached by any link.

### The change

Let a keep name what was given to the thing kept (feed, water, a treatment, a spray), so that produce of the keep can be traced to it. Not decided how: a ref on the keep, or a ref on the produce.

### Unsure

- Whether this belongs in `modules/things.md` or in a profile.
- Mixing: a herd's bulk tank, a silo that is never emptied. A link with no measure makes one recall touch everything; the stated shares would have to travel with it.
- Read from the lines cited only.

---

## 6. A recall should name the maker beside the mark

### The gap

A recall "matches marks exactly", on a scheme and a value (`modules/things.md`, line 8). Lot codes repeat across makers and across years, a barcode names a kind held by millions, and tags are reused and cloned. A match on the mark alone ties a recall to things it is not about, and lets anyone who can read a pack name what a person holds.

### The change

A recall's match carries the maker (or the kind) as well as the mark, so a reader can tell "the mark I hold, from this maker" from "the same digits from someone else".

### Unsure

Whether the maker is always known to the holder. Read from the line cited only.

---

## 7. An operator never makes anyone "dealt with"

### The gap

As FoodX's reviewers read `modules/consent.md` (lines 5 and 21), a sender is named by itself, its operators and whom its block speaks for, and a person is no stranger to anyone whose operator she has dealt with. One firm may sign the operator grant of every agent it hosts. If her agreement with that firm counts as a deal, every agent it hosts is "dealt with" for every one of its users. The same would hold for any large host or fleet maker.

### The change

Say plainly that dealing with an operator does not make its other agents, or the people they act for, anyone she has dealt with. Her STOP should still reach an operator's agents; her having dealt with the operator should not lift them.

### Unsure

Whether the spec already means this and only the reading is loose. `consent.md` must be read in full.

---

## 8. A warning shape

*Added 2026-11-10, from FoodX's review of its step L3 by twelve reviewers. Every line below was checked against the spec on that day; file and line are given.*

*Later the same day FoodX decided that a rule of hers that only holds may fire on a typed warning from a signer in the chain of a thing she holds, tied to that thing by a signed link. That decision rests on this shape existing.*

### The gap, with an example

A dairy finds bad milk in one lot. It wants to tell everyone who holds that lot. FoodX's notes call this "a typed warning". The spec has no such block.

- `protocol.json` contains neither "safety" nor "warning" (searched 2026-11-10).
- "Recall" is only a profile's label. `profiles/tax-recall.md`, line 5: "`tax_report` and `recall` are labels a schema reads." There a **recall grant** (line 8) is something else again: a grant that lets a named reader pull records.
- What exists: "A recall matches marks exactly" (`modules/things.md`, line 8), with no block that does the recalling. And a hazard notice on a place: an `observe` of kind `hazard` that "names the place (a thing), the hazard and who was told ... It is evidence a judge reads and binds nobody" (`profiles/attestations.md`, line 27). Its fields are not typed: `kind_fields` types only `observe` of kind `witness` and `consent`, and `promise` of kind `draw` (`protocol.json`, line 470).
- The act library has a warning only as words inside a deal: a Note move "signed into the deal" ("a bill, a warning, a heads-up", `acts/form.json`, line 426), or "a post or a warning to everyone" (line 1637). Neither names the things it is about by id.

So a maker can warn today only in words. A reader can match those words to what she holds only by reading them, which a stranger can steer.

### The change

A block for a warning, with three properties:

- **It names the things it is about by id**, and by mark where it has no id.
- **It carries the maker beside the lot mark.** This is change 6 (a recall names the maker beside the mark), not a second ask: the warning is where that match would live.
- **It is withdrawn only by its own signer's update.** Another signer's "all clear" is that signer's own reading and withdraws nothing.

One possible home is an `observe` of a kind whose fields `kind_fields` types, as it already does for `witness`. Not decided.

### What it does not change

- **It obliges nobody.** Like the hazard notice, it binds its signer's name to its truth and no one else to anything (`core.md`, line 26: a reading "obliges no one to act").
- **A receiver's node decides what a warning may cause.** Whether it makes a row, sounds, or holds a lot is the receiver's own word, applied on her node. The protocol only gives a shape that plain code can match without reading words.

### The ground

A warning is speech. Speech binds only its speaker, and only to its truth. The protocol may give it a shape so others can read it alike; it may not give it force over anyone's property.

### Does any existing block change meaning?

No. It is a new kind.

### Unsure

- **The name.** "Recall" already means two things in the spec (a match on marks; a grant to pull records). A third meaning would make it worse.
- **How a receiver accepts a signer for warnings** has no shape in the spec (see "Noticed" below, from L2). This change does not need one: acceptance can stay her private word. *(Corrected 2026-11-11, from the review of L5: the spec does have a shape for this. An `observe` of kind `relies` names an issuer she relies on, `profiles/attestations.md`, line 24. The earlier reviews missed it. See "From FoodX's review of its step L5" below.)*

### Strengthened 2026-11-11: the recall

*From FoodX's review of its step L5, "may it interrupt her?" (twelve reviewers, then six attacking the fixes, twice; `~/foodx/docs/attention/L5-interrupt.md`). Every line cited was checked against the spec on 2026-11-11.*

**What was decided, and what was not.** On 2026-11-11 Patrick decided two things. In FoodX, a signed recall from someone she bought from is a ticked line on her first page: it sends a notification at once, on a signed fact, with no reading. And FoodBlock 1.8 gets the recall block. The shape below is still a proposal. Nothing here is spec text, and every point marked "open" is open.

**What the spec has today.** One sentence and no block.

- "A recall matches marks exactly" (`modules/things.md`, line 8). No block does the recalling.
- "Recall" elsewhere means a grant to pull records (`profiles/tax-recall.md`, lines 5 and 8). The EPCIS profile uses that grant for its 24-hour traceback (`profiles/foodblock-profile-epcis.md`, section 7).
- A hazard notice on a place is an untyped `observe` of kind `hazard` (`profiles/attestations.md`, line 27).
- No hold exists (asked from L4, below; searched again 2026-11-11).

**What FoodX's line needs from the block.** Plain code on her node must answer three questions from signed fields alone, without reading any words:

1. Is the signer the maker or the seller of a thing she bought?
2. Does the recall name that thing?
3. Has it been withdrawn or corrected since?

If any answer needs a model, the line cannot fire. The recall then waits in her list like any other words.

#### a. Who may sign, and how her node checks it

The maker or the seller of the thing. Nobody else's recall fires this line. Her node checks that from her own purchase, which is the same ground FoodX's hold-only rule uses ("a signer in the chain of a thing she holds ... read by plain code from blocks she holds", `~/foodx/docs/attention/L9-gate.md`, line 23).

- **Seller:** the signer of a transfer to her that she accepted. A transfer to a named receiver is read like an offer and waits for her accept (`modules/things.md`, line 66). Selling moves the owner (line 56). So her own signed `answers` names the transfer, and the transfer names the seller. Plain code can follow that.
- **Maker:** the author of the make the instance came from. A make's outputs name it in `derives_from` (`modules/things.md`, line 34), and a part names its parent lot in `derives_from` (line 10). Her node knows the maker only if it holds that make. Often it will not: a wholesaler may not show who he buys from. Then her seller is the only signer with standing for her, and that is enough (see d).
- **A business signs as a circle.** A maker is usually a circle. The recall is signed `as` the circle by someone who holds `sign` (`modules/circles.md`, line 10). Plain code reads that.
- **What never counts:** a key that only calls itself the maker, or a key named only in words read from a stranger's mail. A free key plus one fake invoice must not buy a notification. "Shows" means a block that key signed to her, or a purchase she signed that names it.

*Open:* whether a recall from her seller's seller counts when her node holds the whole chain, or only her direct seller's.

#### b. How it names what is recalled

Real recalls name a lot, a barcode, a pack size, a use-by range, or every lot of a product. Each must be a field plain code compares exactly with what is in her purchase:

- **By id**, where the thing has one: the instance's hash.
- **By mark:** `{ scheme, value }`, exactly as a thing carries it (`modules/things.md`, line 8). The recall puts the maker (or the kind) beside each mark. This is change 6.
- **By use-by range:** two dates, compared with the instance's `use_by`, which is already a `date` (`modules/things.md`, line 6; `protocol.json`, line 446).
- **By pack:** an amount, compared with the instance's `pack` (same line 6).
- **"All lots":** every instance of one kind (`refs.of`, line 6) that this signer made or sold. It must be limited to the signer's own goods. A kind has no owner (line 7), so a recall of "all eggs" by anyone would otherwise reach everyone's eggs.

*Open: the lot code has two homes.* A thing may carry its lot code as `state.lot` ("the lot code", the base schema `thing` in `spec/schemas/schemas.json`) or as a mark (`modules/things.md`, line 8; the EPCIS profile puts the lot code in a mark, line 18). A recall that matches marks would miss a lot written in `lot`. Which field does a recall match? The simplest answer would be marks only.

*What this does not cover:* her record of the purchase may be only a mailed receipt, read by her AI. Then nothing she signed names the lot. A match is then a reading, and FoodX's line does not fire on it. FoodX treats that case as a separate, slower kind of match (a row in her list, never a notification), and that kind needs nothing from FoodBlock.

#### c. A `bound`

May a recall carry a place, so that "sold in shops in Scotland", or a hazard at a market, can be matched without reading words? The spec already has `state.bound`, a polygon, and a rule for when two bounds overlap (`modules/things.md`, line 45). Reuse that exact field and its overlap rule; do not add a second word for a place. *Open:* whether a recall needs it at all, or whether naming things by id and mark is enough.

#### d. Withdrawn or corrected, and passed on hop by hop

- **Withdrawn only by its own signer.** An `updates` from the same signer, with `status: stopped`, as an attestation is withdrawn (`profiles/attestations.md`, line 8). Another signer's "all clear" is that signer's own reading and withdraws nothing (as proposed above).
- **Corrected by a new version.** A recall is a record, so its signer `updates` it with a new list (`modules/blocks.md`, line 23). Plain code compares the old set of things named with the new set. *Open:* should a correction that adds lots be told apart from one that only removes lots?
- **A withdrawal lifts nothing.** It never lifts a hold (FoodX: "it lifts only by her tap", `~/foodx/docs/attention/L9-gate.md`, line 21).
- **From her seller to her.** Her seller signs his own recall, naming the lots he sold her, with the maker's recall in `derives_from`. She then gets a recall from someone with standing for her (her seller), and the maker's original travels with it as evidence. *Open:* should a passed-on recall be required to name the one it came from in `derives_from`? That link is what lets a node see "this is the same recall" and send one notification, not two.
- **From her to her buyers.** The same shape, signed by her. In FoodX it is always her own drafted move, sent by her yes. It is never sent by a rule, never sent automatically, and never sent in FoodX's voice. The protocol only needs her recall to have the same shape as anyone else's.

#### e. A hold

FoodX's hold-only rule says what a hold is: "No advance word of hers covers that lot any more. It lifts only by her tap" (`~/foodx/docs/attention/L9-gate.md`, line 21). It cannot fire until a recall and a hold both have a shape (line 23). The question from L4 (below) asks what a hold is. Here are the choices L5 sees:

- **Her own private word, kept on her node.** This is enough if only her node acts on it.
- **A block.** This is needed if other keys must obey it: her circle's tills, or her AI acting under her grants, on other nodes. A hold narrows what her grants cover, so it would be a narrowing, like a stop that applies to one thing. It is not a machine lock (`modules/authority.md`, line 100), which aims at a machine.

*Open:* which of the two. And if it is a block: does a hold that names a thing make every grant of hers cover nothing for that thing, until she lifts it?

#### Does any existing block change meaning?

No. It is a new kind, or a new `kind_fields` entry (`protocol.json`, line 470).

#### Unsure

- **The name.** Patrick calls it the recall block. But "recall" already names a grant to pull records (`profiles/tax-recall.md`). One word, one meaning: either the pull grant is renamed, or the block gets another name.
- **Whether the warning and the recall are one shape.** A warning about a place (the hazard notice, `profiles/attestations.md`, line 27) names no lot. The recall names things. One kind with a `bound`, or two kinds.

#### What FoodX does until this exists

The first-page line does not fire. Its small print says exactly what it covers ("a recall signed by someone your record shows you bought from, naming something your purchase names"). The hold-only rule cannot fire either. Recalls posted on government websites are a separate "not yet" sentence on her page, and need nothing from this block.

### Related asks

From FoodX's safety research, same day; not yet reviewed. One line each, with what the spec already has (checked 2026-11-10).

- **A far machine lock obeyed only from a key the owner named, or with the placer's stake, and always to the owner's safe state.** The spec already has a machine lock with `how: far` (`modules/authority.md`, lines 98 to 112). Today anyone may place one (line 107) and the placer chooses `safe` (line 103). The ask changes who a far lock counts from and whose safe state it goes to.
- **Fence fields: a cut-off line that only narrows, a safe state per named harm, and a silence tolerance.** The spec's fence has `ranges`, `hours`, one `safe_state` and `work_alone` (`modules/authority.md`, lines 78 to 82), and every field narrows when passed on (lines 86 to 91). `work_alone` is how long a machine may go on after it last heard from its node (line 82); the product's "silent 10 minutes" from any named key is wider than that. There is no cut-off line, and one safe state, not one per harm.
- **One lifting rule.** The spec lets the owner lift with a stake at any time (`modules/authority.md`, line 109); FoodX's product notes say the owner lifts only if the placer is gone. The two should become one.
- **A holder fold.** Already noticed from L2 (below). A vouch "to whoever holds the lot" would read it.

---

## No change needed

**Unsigned mail.** The spec is already right (`transport.md`, Receiving): the receiver writes her own `observe` of kind `message` about a contact with no key, and keeps the hash of the raw email. A carrier's proof "shows which domain sent a message, not who said it", may be kept in the node's own log, and never becomes a field of a block. FoodX's older mail door did not follow this (it made a key for each sender's address); that is FoodX's to fix, not the protocol's.

**A reader's answers, and a capture of speech or a picture** (from FoodX's review of its step L3, 2026-11-10). Both can be ordinary `observe` blocks that point at the original by its fingerprint. `observe` is "a claim", a reading that obliges no one (`core.md`, line 26). `derives_from` is the verb for "what it came from" (`core.md`, line 39), and the spec already uses it this way three times: a receipt that `derives_from` the block received (`modules/blocks.md`, line 19), a witness that `derives_from` the raw message's hash (`modules/identity.md`, line 53), and the receiver's `observe` of kind `message` whose `derives_from` is the hash of the raw email (`transport.md`, line 16). Nothing new is needed.

**Her "same thing"** (from FoodX's review of its step L4, 2026-11-10). When she says two messages are the same matter, that is a private word of hers naming the blocks, kept on her node. It decides only what she is shown together and binds no one. It does not use `same_as`, which says "these two records are one" (`core.md`, line 40) and carries weight only when both keys sign (`modules/identity.md`, line 50). Nothing is asked of FoodBlock.

**A sale a machine signed before it saw a stop binds the grantor** (same review). FoodX had one product line saying such a sale was void; on 2026-11-10 it changed that line to agree with the spec: "a stop is in force for a block that has it in its past, and for no other. So an act signed while the rule was live counts even when it reaches P after she stopped it" (`modules/authority.md`, line 34), and "what its signer signed before seeing the stop stands, however late it reaches the grantor" (line 47). Nothing is asked of FoodBlock.

---

## Noticed during the review, not proposed

These came up while FoodX's check was being reviewed. None is decided, and each may be right as it stands.

- **A scheme a node does not know.** `unknown_suite` is a refusal, and a refusal is final for those bytes. After a software update the same bytes would be valid. Should it be "cannot check yet" instead of refused?
- **A block first seen after its scheme was broken.** The spec has a way to move a key to a new suite, signed by the old key. If the old scheme is broken, a thief can sign that move too.
- **A chain with a block truly lost.** A small device on a weak radio loses one block for good. Every later block names it as `prev` and waits. The spec covers a lost counter (a skip, or the operator giving a clean key); it is not clear it covers a lost block.
- **Waiting blocks from someone other than their author.** Already in `TODOS.md`: a waiting block is asked for only from whoever signed the push, so a block carried by hand with one piece missing is dropped.
- **Judging a fast signer's whole chain.** An agent that signs millions of blocks a day on one chain makes "waiting" the normal first answer for anyone new. The spec has no checkpoint.


From the review of FoodX's step L2 (2026-11-10):

- **No fold names the holder of a thing.** There is an ownership fold and `where_now`, and nothing that says who holds a thing now. A carrier holding a pallet and its owner each have half the picture.
- **How a person accepts a signer for safety** has no shape in the spec. FoodX keeps a list on her first read-back. *(Corrected 2026-11-11: it has one, `relies`, `profiles/attestations.md`, line 24. See the review of L5 below.)*
- **"Stranger" has more than one meaning.** `consent.md` defines one; the admission rule in `nodes.md` uses "not in `parties`"; FoodX's older engine used a looser one.
- **A vouch for a stranger.** `profiles/vouches.md` says a stranger naming the vouch "is her accept of the open offer"; `promises.md` says an open offer binds only through the offerer's allocation. The two should be read together.
- **Her everyday tap key.** FoodX signs a tap with a small key on her phone under a grant, so it has the same shape as a helper's block. Change 1b (she can limit her own key) would let it be a limited key of hers.
- **An agent joining a circle for its person.** A member grant counts on the member's own answer; the spec lists an agent's accept only for promises.
- **Her private lines are not blocks, and should stay so.** Which vouchers she counts and what may interrupt her are kept on her node on purpose (`nodes.md`: "private rules, rankings ... stay on their node"). FoodX should not call them protocol words.

From the review of FoodX's step L3 by twelve reviewers (2026-11-10):

- **A question: which fields are free text, and which kinds are closed?** FoodX's notes said "a typed FoodBlock skips the reading, because its fields already say what it is". Checked against the spec, that sentence lets a stranger's block call itself anything and skip the only reading:
  - Every arrival is a block with a type. Plain words arrive as the receiver's own `observe` of kind `message` (`transport.md`, line 14).
  - `state.kind` is "open words" the signer writes (`modules/blocks.md`, line 9; `core.md`, lines 114 and 117).
  - Open types are checked against nothing: "nothing is refused for them" (`protocol.json`, line 269; `core.md`, line 32: an open type "is checked only against this page").
  - Free-text fields that can carry words to a reader include: a promise's `state.what` (`core.md`, line 116; `modules/promises.md`, line 16: it "describes" time and a job); a payee's `state.destination`, "in the payee's words" (`modules/promises.md`, line 12); any act term of type `text` (`protocol.json`, line 2535); a glossary entry (`profiles/rulebooks.md`, lines 8 and 12); a template's `name`, `words` and `labels` (`modules/promises.md`, line 64). Also found: a witness's `said` (`protocol.json`, `kind_fields`, line 470), a ruling's `state.text` (`modules/promises.md`, line 98), and a machine lock's `reach` (`modules/authority.md`, line 104).
  - No field called "description" exists in `protocol.json` (searched 2026-11-10). FoodX's notes named one; that was wrong.

  FoodX can fix its own side without the spec: skip its reading only for kinds whose fields the protocol types, and always read every text field. What would help, from the spec, is a plain statement of which fields are free text and which kinds are closed, in one place. This is a question, not a demand.
- **Reading plain words against the act library's lists.** FoodX reviewed whether its reader should pick its answers from `acts/form.json`'s lists (the 20 moves, the 16 nouns, "which way", "who waits"), so a plain message is read as the block its sender would have signed. The file already says how an act is found: "The closed questions FoodOS asks, through Jev or the Decisions API, to find which act a moment is: one per fact, in her words, each answer one value ... Never a small model guessing the act from free text." (`acts/form.json`, line 2258). That forbids a model writing the act's name from free text; it allows a model to answer closed questions, one fact at a time, from a fixed list. FoodX decided on 2026-11-10 not to use the 20 moves as an answer list for plain words: its L3 uses its own short versioned lists, and the exact move is asked only against an open thing's live moves (`form.json` "live by stage"). Nothing is asked of FoodBlock.

From FoodX's review of its step L4, "the row" (2026-11-10; twelve reviewers, then six attacking the fixes; `~/foodx/docs/attention/L4-row.md`). Each was checked against the spec on that day; file and line are given. Each is a question.

- **Should her terms for what a rule waits for be sealable?** A rule of hers is a grant plus her own terms for what must be held before it applies ("Harry's bread order, at most 5 loaves"). The scope's `condition` is "the principal's fence, tested on the principal's node" (`modules/authority.md`, line 7), but it sits in the grant, which a counterparty holds to check an act under it (line 19, `under_ok`). Only `{ limit, every, each }` go into the sealed `limit_commitment` (line 117), and the spec seals them because "a counterparty who knew them would price against them" (line 116). So the rule's own terms are visible to the other side. Should those terms be sealable as the limit is?
- **A count per period for acts with no amount?** A limit is "money or an amount (`{ value, unit }`)" (`modules/authority.md`, line 70), and invariant 23 asks for a limit only of an act that "moves things or binds someone" (line 150). An act with no amount (a message passed on to her buyers) can carry no limit, so a re-signed warning could make her rule pass it on each time. Should a scope be able to cap how many acts per period?
- **What proves "paid first" before a deal exists?** Change 4 lists "paid first" as a bound. But "the blocks that settle" an allocation "name the allocation" (`modules/promises.md`, line 18; `modules/folds.md`, line 93), and the `paid` condition reads a deal that already binds (`modules/promises.md`, line 49). A payment made before the allocation has no deal to name. How is it tied?
- **A hold has no block shape.** FoodX's notes let a rule of hers "hold any lot a maker recalls". No type, kind or field in `protocol.json` is a hold (searched 2026-11-10). Is a hold her own `observe` about her thing, a lock, or something else?
- **Should a circle's total limit name one key as its meter?** The subset rule compares each child grant with its parent alone (`modules/authority.md`, lines 57 to 68; a child's sealed amount is checked only "on the principal's node", line 122), never the children's sum. So three child grants can each carry the whole limit. A circle is "never a node of its own" (`protocol.md`, line 63), so no node counts a circle's total. Should a circle's grant with a total limit name the one key that counts it?
- **A circle's grant to a member's named key does not end when she leaves.** The cut takes from a leaver what she signed as the circle, with `admit` or `remove`, a `confirms`, an act under a grant to a role, and a signal (`modules/circles.md`, line 13). A grant signed as the circle to her own AI's key is none of these: it ends only by a stop from its author or anyone who may sign for the circle (`modules/authority.md`, line 43). So her AI may go on accepting for the café after she has left. Is that meant? (FoodX will list such grants on a leaving card, "keep or end each".)
- **Should `work_alone` be readable by a fold?** `work_alone` is how long a machine may carry on unheard (`modules/authority.md`, line 82). The door's `fence_reading` reports it (`protocol.json`, line 2139), but the test every fold applies, `under_ok`, checks the signer, the scope, liveness and invariant 23 (`modules/authority.md`, line 19), and "the gate that cuts to it is the machine's kit, not the protocol" (line 96). So a sale a tampered kit signs past its window still counts. Should a fold read it?
- **Should the deal view say whose move is next?** The stage fold gives a stage (`modules/folds.md`, lines 82 to 91), and "`promise_stage` returns the stage alone" (line 146). Nothing says who may move next, so each engine works it out for itself, and two engines may disagree. Should the deal view say it, or is that left to each engine on purpose?
- **Is the mapping from the act library's stage words to the spec's stages written anywhere?** The spec's stages are reversed, done, breached, stopped (onward), underway, accepted, stopped (before), declined, offered or asked (`modules/folds.md`, lines 82 to 91), plus expired and elapsed in the view (line 116). The act library's "live by stage" (`acts/form.json`, line 1641) uses "paused" (line 1689), "ended" (line 1701), "withdrawn" (line 1706) and "stalled" (line 1722), none of them a spec stage (`acts/PATTERNS.md`, lines 185 to 187, lists them). No file maps one to the other (searched 2026-11-10). Could a second implementation find the mapping?

From FoodX's review of its step L5, "may it interrupt her?" (2026-11-11; twelve reviewers, then six attacking the fixes, twice; agreed by Patrick on 2026-11-11; `~/foodx/docs/attention/L5-interrupt.md`). The first ask, the recall block, is written above as a strengthened change 8. Below are the rest. Each is a question, not a proposal, and they are in order of how much each unlocks, most first. Each was checked against the spec on 2026-11-11, with file and line. For each: the question; what the spec says today; what in FoodX depends on it; what FoodX does meanwhile.

- **2. One typed reading for a device's own state, with a cause.** Can a device sign, in typed fields, "I went to safe state X", "fault code Y", or "I could not do act A", so that plain code can match them? Never as free text.
  - *Today:* the gate that cuts a machine to its safe state "is the machine's kit, not the protocol" (`modules/authority.md`, line 96; for a lock, line 112: "going to the `safe` state is the machine's kit"). The base schema `reading` measures with `amount`, `text`, `accuracy`, `coverage` and `method`; its other fields say who paid the reader (`spec/schemas/schemas.json`, schema `reading`). `text` is free words, which must not be matched. `progress` has only `phase` and `fraction` (`profiles/tasks.md`, line 13). There is nothing for leaving a safe state either.
  - *Depends on it:* two of the five trouble facts on each device's card: "the device signed that it went to its safe state" and "the device signed a fault, or that it could not do an act". These need no figure from her, so they are the largest single gain.
  - *Meanwhile:* the card lists only what can fire for that device, and these two are not on it. When the shape exists, she gets one row per kind of fact, covering all her devices, which she turns on with one tap. It never comes as a notification.
- **3. A stated reporting rate, and readings that stop arriving.** May a device, or its maker, state "reports at least every N", or put "next report by T" on a reading? And should `reading_condition` be able to require readings at least every N inside its window?
  - *Today:* a device's attestation says only how its key is held and the maker's serial or where it was set up (`scheme`, `value`; `profiles/attestations.md`, line 15), and nothing about how often it reports. The fence has `ranges`, `hours`, `safe_state` and `work_alone`, and nothing else (`modules/authority.md`, line 78). Progress is "a change of phase, not a heartbeat" (`profiles/tasks.md`, line 13). The window rule is: "The condition holds when the latest reading at or before the window's start is held and it, and every reading inside the window, keeps to the rule" (`profiles/tasks.md`, line 9). So one reading followed by silence "keeps to the rule" for the whole window. Example: a probe reads 7.9° at 02:00 and dies, and by 02:30 the fridge has "stayed in range for 30 minutes". The fence's own reading says the opposite: "silence never counts as inside" (`modules/authority.md`, line 94). FoodX's review also asks whether a reading may name the relay it travelled through.
  - *Depends on it:* the silence fact ("It reports every 5 minutes. FoodX tells you after 3 missed."). It also depends on the end of an out-of-range episode: each repeat is sent only while nothing signed since says the fridge is back in range.
  - *Meanwhile:* the rate is either FoodX's suggestion, labelled as one, or her node's own count of arrivals once it has a few days of them. Her node must not treat one reading followed by silence as back in range. That is a check her node makes itself, not the door op's answer.
- **4. A maker's signed description of a kind of device.** Where are a device kind's safe states, fault codes (with how serious the maker says each is) and reporting rate written down? Who signs it: the maker's key, or the device's own? And how does a fence's `safe_state` name one: by its text, or by the description's hash?
  - *Today:* the spec leans on it twice: "The maker's signed safe states give the name its meaning" (`modules/authority.md`, line 81), and the same for a lock's `safe` (line 103). Nothing defines it. None of the 53 base schemas in `spec/schemas/schemas.json` is a device description. The only block a maker signs about a device is the attestation that the key is the device's (`profiles/attestations.md`, line 15).
  - *Depends on it:* the source printed beside a figure on the device card ("signed by the device's maker"). Also which faults are worth a notification, without a list of fault names kept by FoodX. And FoodX's stop, which goes "to a safe state from the maker's signed list".
  - *Meanwhile:* figures come from the device itself, her node's own count, or FoodX's suggestion, each labelled as what it is. No figure is ever printed as the maker's word.
- **5. Keeping terms on a kind or a lot.** May a food's maker sign a range and a tolerated time (for example "keep at 0 to 5°, at most 2 hours outside"), in the fence's own `{ of, min, max }` shape (`modules/authority.md`, line 79)?
  - *Today:* an instance carries `lot`, `use_by` and `pack` (`modules/things.md`, line 6), and no keep-at range. The keeping profile covers only who bears a loss (`profiles/keeping.md`, line 7).
  - *Depends on it:* the figure for "outside her range" on a fridge card. With keeping terms, that figure would be the food maker's own word about his food.
  - *Meanwhile:* "FoodX's suggestion, from the label on the cream you bought Tuesday. It can be wrong." She signs it with the card.
- **6. A failed payment attempt, and a charge declined before any transfer existed.** Should a failed attempt have a named kind, with the deal it was for in `refs.for` and a stated signer, so that plain code can tie it to a deal?
  - *Today:* "A failed attempt (a declined card) is an `observe`, never a transfer" (`modules/things.md`, line 59), but no kind is given. "A failed or reversed payment is an `observe` that `defeats` the transfer" (`profiles/payment-proof.md`, line 12). That covers only a payment that existed as a transfer. The provider or the adapter signs (lines 8 and 9).
  - *Depends on it:* the line about answers and changes on a matter of hers fires once when her record shows a payment on it failed or was taken back, in either direction.
  - *Meanwhile:* a reversed transfer works today, because of the `defeats`. For a decline before any transfer, FoodX's own adapter writes the `observe` under a kind word of FoodX's choosing. That works only between FoodX's own pieces. A second implementation would not read it the same way.
- **7. May a deadline be a date as well as an instant?** Harry says "by Friday". Could `deliver_by` and `pay_by` hold a `date`, read in the deal's `terms.zone`? If so, the spec must say when that date has passed (for example, at the end of that day in the named zone). It must also say that a date with no zone is refused, as a calendar repeat with no zone is.
  - *Today:* `deliver_by` and `pay_by` are `time` (`protocol.json`, lines 444 and 445). A time is "a real instant" (`core.md`, line 68). `deliver_by`, `until` and `expires` are "plain signed times, read as written" (`modules/promises.md`, line 25), and `pay_by` is "when the price falls due" (line 27). The `date` shape exists (`core.md`, line 69) and is used for `use_by` (`protocol.json`, line 446). `terms.zone` is read only for a calendar repeat (`modules/promises.md`, line 38). `due` in the stage is `terms.pay_by` (`modules/folds.md`, line 127), so a date would change what "due" means there too.
  - *Depends on it:* "At once, if something promised to you is late." Today "by Friday" must be signed as some midnight, so the notification can come at an odd hour.
  - *Meanwhile:* every signed time is read as exactly what it says. FoodX does not guess that a midnight means a whole day (an earlier "date-only" split was dropped for that reason). The late-promise line does not ask to pass her phone's do-not-disturb, so a notification at midnight is kept silent by her phone if she has quiet on.
- **8. A claim's start, as her node sees it and as others see it.** Can a claim on her identity be dated by one named clock, so that the ready time she is shown is the one that counts everywhere? And is it meant that a key grant takes effect with no wait?
  - *Today:* "A start is the later of the block's signed `at` and its arrival on the reader's node" (`modules/identity.md`, line 12; device claims, line 14; a will update, line 10). So each reader has its own ready time. A thief who shows the claim to others first, and to her node last or never, can run the wait out where she cannot see it. The spec already has a named clock (`modules/blocks.md`, line 21), which a will could name. A key grant "takes effect when signed" (`modules/authority.md`, line 11) and has nothing to cancel. Change 1b (a limit on her own key, "or a wait") is where a wait on a key grant would live.
  - *Depends on it:* the line about her signature on anything she did not sign here. Its row says "Your node first saw this at 03:10. By its count it takes effect Friday 14:00. Others may have seen it sooner", and the notification carries [Cancel it].
  - *Meanwhile:* the row says exactly that. The wait she signed on her will is the guard, not the notification. A key grant made somewhere else sends her one notification and offers nothing to cancel.
- **9. When does the old owner's operator grant stop speaking at a sale?** Is it at the transfer, or when the new owner signs his own grant? And the owner is read in whose causal past?
  - *Today:* "A new owner's grants replace the old owner's; nothing needs revoking" (`profiles/attestations.md`, line 16). A sensor's operator grant "signed by anyone but the owner ... counts for nothing" (`modules/authority.md`, line 142), and a reading speaks for the sensor through that grant (line 20). The spec does not say whether the owner is read in each reading's own causal past. A device's readings usually do not have the sale in their past.
  - *Depends on it:* a device line fires only while an operator grant of hers for the device is live and no hire or loan of it by her stands.
  - *Meanwhile:* her node stops her lines at her own signed sale, hire or loan, which is a fact on her node. For the buyer, it is not settled whether the old owner's readings still count as grounds.
- **10. A shift word with a stated end, and what a job sheet is.** Are these protocol shapes, because several people's nodes must agree on who is on shift for a circle? Or are they FoodX's alone?
  - *Today:* neither word appears in any spec module, profile or `protocol.json` (searched 2026-11-11). "No spec or schema text assumes a duty nobody signed" (`core.md`, line 160). So a line on a worker's phone is never his promise.
  - *Depends on it:* a circle's member who does not hold `sign` gets notifications about the circle's things only by a line on his own copy of the hire, and only while his own signed shift word stands. He never gets them past the end that word states.
  - *Meanwhile:* the shift word is FoodX's own private word on each worker's node. Nodes outside FoodX cannot read it.
- **11. Conditions on a state that is not an amount, over a run, or over two readings, and a place in a fence.** Examples: a door ajar; flow while a valve is commanded shut; "the final rinse never reached 82° this cycle"; "fields 2 and 3 only".
  - *Today:* `reading_condition` reads one sensor, one amount and one duration (`profiles/tasks.md`, line 9). A fence's `ranges` are amounts (`modules/authority.md`, line 79), and the fence has four fields only (line 78).
  - *Depends on it:* this would widen "a device's signed reading outside her range" to the faults that most food machines actually have.
  - *Meanwhile:* FoodX does not offer these as lines. They are left open on purpose, bounded by the machine's own safe state where it has one, and by the card saying what FoodX cannot tell her.
- **12. Should `kind_fields` type an `observe` for a fetch?** That is: "I fetched this, from this address, at this time, and got these words", with the address, the time and the fingerprint of the bytes. Both a person's node and a shared watcher run by FoodX will sign these, and a rule may one day rest on one.
  - *Today:* `kind_fields` types only `observe` of kind `witness` and `consent`, and `promise` of kind `draw` (`protocol.json`, lines 470 to 491). The `witness` kind is for what a handle said, with a read-back (`modules/identity.md`, line 53), so it should not be reused for a fetch. The receiver's own `observe`, pointing at the raw bytes by `derives_from`, already covers a fetch (`transport.md`, lines 14 to 16; "No change needed" above). **No change is strictly needed.** Typing it would only let two signers write it alike.
  - *Depends on it:* recalls posted on government websites (a "not yet" sentence on her page today), and the counted line that says how many notices were read and when FoodX last looked.
  - *Meanwhile:* an `observe` with `derives_from`, under a kind word of the fetcher's own.
- **13. A refusal by a device, and "starting A, expected by T".** May a device sign "refused act A under grant G, and why"? And may it sign "starting A, confirmation expected by T"?
  - *Today:* no type, kind or field in `protocol.json` is a device's refusal. The base schema `refusal` is the boycott (`profiles/refusals.md`). `progress` has `phase` and `fraction` only (`profiles/tasks.md`, line 13). What does exist is the ask: "An ask names the act ... the principal answers it `accepted`" (`modules/authority.md`, line 138).
  - *Depends on it:* "could not do act A" (see 2). And whether an act not confirmed by a stated time can be late on a signed fact.
  - *Meanwhile:* a send-back fires on the signed ask of `modules/authority.md`, line 138, which exists today. Refusals with no ask are counts. An act with no stated time makes a row, never a notification.
- **Already there: `relies`.** A signer she relies on has a home: "An `observe` of kind `relies` (the base schema `reliance`) names an issuer in `refs.subject`, the kind of thing in `of` ... It is her own reading and binds only her ... not being on her list is silence, and silence is never a no. She withdraws an entry by a stop" (`profiles/attestations.md`, line 24). The reviews of L2 and L3 missed it. Two lines on this page said the spec has no such shape; both now carry a correction. Nothing new is needed. A public web page signs nothing, so it is not an issuer; for FoodX, the address of such a page is a term of her own line, not a `relies` entry. Nothing is asked.
- **Still true: her lines are not blocks.** After L5, each of her lines about notifying is a private signed word of hers, with one hash, never sent to anyone, and kept on her node. That agrees with the note from L2 above. Nothing is asked.

---

## How a change here becomes 1.8

Per this repository's own rules: spec text first (`spec/core.md` and `spec/modules/` are normative), each rule with its Austrian-branch ground; the rule once, in the Rust core; vectors; then `spec/NECESSITY.md` regenerated so every new part is shown to be needed; then `CHANGELOG.md`.

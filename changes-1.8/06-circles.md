# FoodBlock 1.8, stage 6: circles

Uses the words of `00-shared.md` with its meanings (a measure, a draw, holds, lands, freed, the draw reasons, a line, its start, read whole, `not_shown`, `lacks`, stands, waiting, an end, the cut, seen, a relier, a named clock, a keeper, a receipt, `refs.meter`, a meter she names, a tool, a move, a pair, No one is both sides, A count counts ids, and its Circles words: a circle's parts, unissued, a row and its `move`, a hand, what a hand holds for the circle, `not_voice`, `ways_in`) and defines none of them again. In prose a hand **counts** in a row; "voice" is only a key of a person's list. Written as if stages 0 to 5 have landed: `scope.types` (0); `refs.key`, signed twice, `blocks.md` Time, A named clock, The cut, Finality, and `folds.md` Counts (1); `folds.md` A line, `read`, `not_shown` (2); `folds.md` What is left, `pack`, an instance held in amounts (3); `scope.on`, `refs.meter`, A meter she names, No one is both sides, Blocks that bind, a voice's cap, a stop of one thing (4); the deal machine, the account word's `state.by`, `spec/patterns/` (5). Line numbers are the files as they stood on 2026-11-11 and are only a guide; every passage is also named by its first and last words.

---

## 1. What this stage does

1. **Owners are on the record.** A circle may state `pack`, its parts. The founder owns them first; they move like any amount of a thing, by a transfer the receiver accepts.
2. **Who signs is separate.** `rules` is one table of rows: "this move, of this, by so many holders of this role", or "by so many parts". No row, no move. No number is ever filled in, and every number is whole.
3. **A circle's word binds its things only.** Never an owner's house, a member's wage or anyone's body.
4. **A vote goes with what gives it.** A hand counts only while its signer still holds the role or the parts; a sale, a leaving or a removal ends her unfinished hands.
5. **No one is both sides.** A move that gives to the signer of one of its own hands holds only by the circle's `take` row, without her hand.
6. **Silence is kept.** A circle may leave its owners unsaid; with no row for changing rules, the rules never change.

**Amara's café.** Amara and Leila found the café: `pack` 100 parts, Amara's first; she transfers 50 to Leila, who accepts. Six staff (Joe the manager, Ade the chef, four on the floor) hold roles no `sign` row names; they act under grants to `café#manager` and `café#staff`, counted on the café's till. Leila quarrels with Amara and leaves: one block of hers. Her hands in role rows end; she still owns 50 parts, and they still count in parts rows. Before she goes she signs, `as` the café, a hand-over of three unpaid invoices to her new stall, a circle she owns: it gives to a circle in which she holds a part, so it holds only by the café's `take` row, without her hand, and Amara never signs it. Amara removes Joe (either owner seats or unseats the manager). His AI, holding a grant he signed `as` the café to it, keeps ordering milk from his cousin: that grant gave to an actor he operates, so it never bound the café, and his own role ended at the removal, read on the café's clock.

---

## 2. What a circle is

A circle is people who hold things together, and the rules by which some of them speak for it. **It never signs and holds no key.** Every block `as` a circle is signed by a person as her own word, and is the circle's only where a row of its rules holds for it. Only persons own and only persons act: a firm is a bundle of contracts between owners, never a person above them (Mises, *Human Action*: only individuals act; Rothbard, *Man, Economy, and State*, on the corporation as owners pooling what is theirs).

- **What is owned, and in what parts.** What the record shows as the circle's (made `as` it, or landed to it) belongs to the owners of its parts, by parts. A circle that states no `pack` leaves its owners unsaid: its things are held together under its rows, and the protocol names no shares.
- **What joining moves.** Nothing. A member grant gives a role, which is a May; it moves no title. Parts come only by an ordinary transfer she accepts, from an owner or from the circle's unissued parts.
- **What a circle's promise binds.** The circle's things, and nothing else of any owner or member. An owner's own property answers only by her own signed word. The other side read `as` on the block before relying.
- **What a stranger reads.** The circle's id (its founding block: a name is pencil), its owners and rows (`circle_state`), whether a row holds for this block and whose hands it counted (`row_holds`), and every way into each role (`ways_in`). The read-back of a café's order says: "binds the café's things (Amara 50, Leila 50); not their own".
- **Leaving, removal, death, dissolving.** They end roles and move no part. Her parts are hers to keep, sell or leave, like her other things. A circle is sold by selling its parts. No block dissolves a circle: once its hands have handed its things on, it holds nothing.

**The café as blocks** (the table is section 7's; `C` is the founding block's id):

| # | Block | Signer | What the fold says |
|---|---|---|---|
| 1 | `actor` kind `circle`: `pack` 100 part, `roles: ["owner"]`, `rules`, `keepers` the café node, `refs.meter` the till | Amara | owners Amara 100; Amara holds `owner` |
| 2 | member grant `as` C, `to` Leila, `roles: ["owner"]` | Amara | `admit` of `owner` by parts 51: Amara's 100 count; holds |
| 3 | Leila's `accepted` answer to 2 | Leila | Leila holds `owner` |
| 4 | transfer, `refs.what` C, `amount` 50 part, `to_owner` Leila | Amara | a draw on her line: held |
| 5 | Leila's `accepted` answer to 4 | Leila | lands: owners Amara 50, Leila 50 |
| 6 | grant `as` C to `café#staff`, `on` the menu offer, `each` £20, `refs.meter` the till | Amara | `sign` of `grant` by `owner`, 2: waiting `on: hands` |
| 7 | a block `refs.confirms` 6 | Leila | holds at 7; stands once signed twice (rule 13) |
| 8 | six member grants `as` C (`manager`, `staff`), and six accepts | Amara, Joe, staff | each `admit` row by `owner` (or `manager`) 1 holds |
| 9 | transfer `as` C of three open deals, `to_owner` Leila's stall | Leila | a `take` (her stall is a circle she owns): her hand `both_sides`; no hand left; `holds` false |
| 10 | Leila's stop of her member grant | Leila | she leaves; her hands in role rows end; her 50 parts still count in parts rows |
| 11 | stop `as` C of Joe's member grant | Amara | `remove` of `manager` by `owner` 1 holds; received at 10:02 on the café node |
| 12 | Joe's AI's order of milk, under a grant Joe signed `as` C to it at 9:00 | Joe's AI | the grant was a `take` that never held; the order speaks for its signer alone |
| 13 | Joe's own order `as` C at 10:05 | Joe | received after 11: his hand has seen an end; `no_role` |

---

## 3. Spec edits, file by file

### 3.1 `spec/modules/circles.md`: replace the whole file (lines 1 to 37)

From "# Circles" to "except what an outsider who had not seen the removal built on." Write:

```markdown
# Circles

A **circle** is people who hold things together, and the rules by which some of them speak for it: a business, a household, a savings group, a co-op. It is an `actor` of kind `circle`, written by its founder as an ordinary block; its id is that block's hash. **A circle never signs and holds no key.** Every block `as` it (`refs.as`) is signed by a person as her own word, and speaks for the circle only where a row of its rules holds for it (Rules); else it speaks for no one (`no_role`). Ground: only persons act and only persons own; a firm is a bundle of contracts between owners, never a person above them (Mises, *Human Action*; Rothbard, *Man, Economy, and State*).

## Owners

- **Parts.** The founding block may state `state.pack`, the circle's parts, counted in whole parts: an amount whose `unit` is `part`, whose `value` is a whole number of at least 1, and which has no `of` (`shape`), such as `{ "value": "100", "unit": "part" }`. The circle is then a measure (folds.md, What is left), and its parts follow that one rule and no rule of their own. Its founder owns all of it first, and the founding block is her start. Parts move as any amount of a thing moves: a transfer whose `refs.what` is the circle, signed for their owner, landing on the receiver's yes; held from where it is signed, freed by her no. A fraction of a part is another kind, so a draw of one takes nothing (`unit`). `pack` is read only from the founding block and never changes.
- **Whose the circle's things are.** What the record shows as the circle's (folds.md, Ownership) belongs to the owners of its parts, by parts. Each took her parts by her own accept, under the rows she could read, so the rows are words she took on.
- **Owners unsaid.** A circle that states no `pack` leaves its owners unsaid (`owners: { not_said: true }`). Its things are held together under its rows; no row of it counts parts (`shape`); the protocol names no shares and fills none in.
- **Unissued parts.** Parts of its `pack` the circle holds of itself (landed to it by a transfer its `sign` row accepted), so that no person yet owns them, are **unissued**: shown apart, counted in no row, and moved only by an `issue` move.
- **A circle as owner.** Parts of a circle held by another circle are that circle's, and count by a block `as` it for which its own `sign` row holds. Circles that own each other are neither refused nor named by any reason: `circle_state`'s owners and `ways_in` show, for such a circle, that its owners end in no person (`no_person`), and a stranger weighs that himself.
- **Joining, leaving, removal, death and dissolving move no title.** A member grant moves nothing. What she puts in moves by her own transfer; what she gets for it is what someone signs to her: parts from an owner or from the unissued, or the circle's promise. Leaving, removal and a close end her roles and move no part: her parts are hers to keep, sell or leave (profiles/successor.md, Heirs). A circle is sold by transferring its parts. No block dissolves a circle: when its hands have handed its things on, it holds nothing.

## What a circle's word binds

A block that speaks for a circle binds what the record shows as the circle's, and nothing else of any owner or member: no other thing of hers, no wage, never a body. An owner's own property answers only by her own promise (a vouch: patterns/vouches.md). The other side read `as` on the block before relying; one who wants a named thing behind the promise takes a share on it (things.md). Money owed to a circle is paid as its account word says (promises.md, Where to pay me: a hand the word names in `state.by`); paid to any other hand, it is paid to her alone. Ground: a signed word binds only what it names (Rothbard, *The Ethics of Liberty*, ch. 19).

## Rules

- **Rows.** `state.rules` is a list of rows, each `{ move, of, by, needed }` (that many different holders of the role `by`) or `{ move, of, parts }` (that many of the circle's parts, held by the signers of its hands between them). `needed` and `parts` are whole numbers of at least 1 (`shape`); never `all` and never a share, because a set its signer can leave out of her causal past is a number she can shrink. A row by `parts` on a circle with no `pack` is `shape`. A move holds when one row for it holds; with no row for a move, no one makes it.
- **Moves.** `move` is one of a closed list (`protocol.json`, `circle.moves`), because what each one is must be computed alike by every stranger. `rekey` is among them, read only by the rekeys convention (profiles/rekeys.md): no profile adds to a list that `valid` reads (00-shared, row 115). A block `as` the circle is exactly one of:
  - `sign`: any block `as` the circle that none of the others is. `of`: the types it covers, as `scope.types` names them (authority.md).
  - `take`: a block `as` the circle that gives to the signer of one of its own hands (No one is both sides, below). `of`: types, as for `sign`.
  - `issue`: a draw `as` the circle on its own unissued parts. `of`: the role its receiver must hold.
  - `admit`: a member grant, or a change of one, that gives the role `of`.
  - `remove`: a stop of a member grant, or a change of one, that takes the role `of` away; a stop of an unanswered invitation to it too.
  - `change`: a version of the circle that changes `of`, one of `rules`, `keepers`, `meter`, `name`, `marks`.
  A block that is two of these (a take that also issues) holds only where a row for each holds.
- **Hands.** A **hand** is a block made on its signer's role or her parts in the circle: the move itself, and each counted block that names it in `refs.confirms`. **A count counts ids** (folds.md, Counts). A hand counts in a role row when its signer holds the role `by` by a named member grant that stands in the hand's causal past; in a parts row, by the parts she owns of the circle on her line read whole from her hand back to her start, and it counts that many. An open joiner's hand, a hand on unissued parts, and the hand of the one a `remove` move removes count for nothing (`not_voice`). A move holds at a block, the move or a confirm of it, in whose causal past enough hands of one row count: counted in that one place. Each hand is its signer's word: it stands as her word would (her key's wait, reach and cap; signed twice where it lets another act or spend: blocks.md, Finality). Until the move holds and its hands stand, it is waiting (`on: hands`), and moves and binds nothing.
- **A hand lasts while its signer holds what the row counts.** Its ends (blocks.md, The cut) are, for a role row, every end of her member grant (her leaving, a removal, her close, its `until`) and a change that takes the role away; for a parts row, every draw of hers on the circle's parts, from where she signs it, landed or not, and her close. A move counts a hand only where the block that completes it has passed every end of that hand as The cut says; a hand whose end the completing block has seen adds nothing. For the cut, a move's signer is all its hands together: no hand's own later block passes an end of her hand, and no signer of one of its hands, no actor she operates and no one acting under a grant she gave is its relier. So, with no clock, a gathered move waits until an outside relier uses it, and the circle bears that gap (blocks.md, Who bears the gap). A vote goes with the part: what she sold or left before the move was finished, she no longer votes.
- **No one is both sides** (authority.md, Who a block speaks for). For a circle, a move gives to the signer of a hand when it is a draw or transfer to her, a promise of the circle with her as the other side, or a grant naming her in `refs.to`; and the same to an actor she operates or to a circle in which she holds a role or a part. Such a move is a `take`: it holds only by a `take` row whose count is met without the hand of anyone it gives to. A member grant is not a take: who may seat whom is the `admit` row's word.
- **Changing the rules.** A **version** is an `actor` of kind `circle` that `updates` the founding block or an earlier version and states its whole `state`; the circle's id stays the founding block's. It is a `change` move: for each of the fields it changes, a `change` row `of` that field must hold for it. Rows with move `change`, `pack` and the founder's `roles` are read only from the founding block: a version that states other `change` rows changes nothing by them, so no rule votes itself in. **With no `change` row for a field, that field never changes.** The rules as they stand for a block are those of the carried version in its causal past that every other carried version there is in the causal past of; where two carried versions are rivals, those of the latest carried version both have in their past; with none, the founding block's.
- **A circle's clock.** The founding block may state `state.keepers`, a named clock (blocks.md, A named clock). Every member grant, every hand and every block `as` the circle is read on it: its members accepted it by joining, and the owners by taking parts. With none, the circle bears what was done until the relier has seen the end (blocks.md, Who bears the gap). It changes only by a `change` row `of` `keepers`.
- **A circle's line.** The founding block may name `refs.meter`: the start of the one line on which every draw that speaks for the circle is counted, read as authority.md, A meter she names, with "a block `as` the circle for which a row holds, stating its draw" in place of "a block of the holder that names this grant". With none, each measure the circle owns is drawn on along the line of the key that signed the circle's start for it (folds.md, What is left). **What a hand holds for the circle.** What a hand starts or receives for the circle (a block that speaks for the circle by a row that holds) is held on that key's line as the circle's, never hers. It reaches another hand's line only by a **take-up**, which continues her line: from the block of her line it continues from, the amount is drawn along the line of the key that signed the take-up, read whole from a later draw back through the take-up and on back along her line to its start (folds.md, A line). While her seat stands, a `sign` move of the circle, signed by the key whose line holds the amount (any other key's draw on it is `not_on_line`), may hand it to another hand's line, by a draw `to_owner` the circle; the take-up is the accept `as` the circle of the key that takes it up, which continues her line from that draw (the block it answers) and lands it; this gives nothing away, so it is no `take` and No one is both sides does not reach it. At her seat's end (her leaving, her removal, the end of her member grant, her close), what is still held on her line as the circle's, and is in no draw that has landed or still holds for another, is freed to the circle, and the take-up is a later `sign` move that has that end in its causal past, read as the cut requires: it names in `state.counted_to` the block of her line it continues from (her own block that ended her seat, where she signed one; else her last block that speaks for the circle), as a key grant names an old key's last block. Until the end is seen as the cut requires (blocks.md, The cut), such a take-up is waiting (`on: end`). Her own key, once her seat has ended, draws nothing of the circle's (`not_owner`): she never owned it. **A take-up is a start** (folds.md, What is left, One start): two accepts of one hand-over apart, two take-ups apart, or a take-up and her own later block that still counts for the circle past the block it continues from, start no line, and no `pair` (two keys acted apart; no one lied); the amount is the circle's on no hand's line until a later take-up or accept whose `after` names both. It is the rule of what a tool holds for her (folds.md, What is left), read for a hand. A circle that names `refs.meter` is unaffected: its things were always counted on the meter's line, and nothing is taken up. Ground: a hand that holds the circle's goods is no owner of them; title stays with the owners of its parts, who took them by their own accept (Rothbard, *The Ethics of Liberty*, ch. 19).

## Members and roles

- **A role is a name**: any text with no `#`, unique in its list (`bad_roles`). The protocol reads no power into a name; only rows make a role count. The founding block's `state.roles` lists the founder's own roles: it is her member grant, accepted by writing it. `circle#role` (`grammar.role_ref`) names the role's holders by named grants, each an id; in an audience it names open joiners too.
- **Membership** is a `grant` of kind `member`: `refs.subject` and `refs.as` the circle (`required`), `refs.to` the member (left out, it is open: everyone who accepts joins by it), `state.roles` a list of names (`shape`). It is an `admit` move for each role it gives, and gives only the roles whose `admit` row holds for it; the rest stands. It counts once the member's own `answers` accepts it. **An open joiner holds the role's name and counts in no row**, and is no signer for any `circle#role` in a `by`.
- **Changing roles.** A change `updates` the member grant, or an earlier change, with the whole new `state.roles`, and takes the old one's place. Each role it adds needs its `admit` row and her answer; each role it drops needs its `remove` row. Of two changes neither of which has seen the other, she holds a role only where both give it.
- **Leaving.** She leaves by her own stop or decline of her member grant, or an `updates` of it with `stopped`. It needs no row and only narrows, so nothing sets it aside. A stop of an open grant by its `remove` row ends future joins only.
- **Removal** is a stop `as` the circle of her member grant, a `remove` move for each role it gives; her hand never counts in it. Rejoining needs a grant signed after the removal: her accept of a grant that does not have the removal in its causal past joins nothing.
- **A death.** A counted close of a member ends her member grants, bar those `state.continues` names (profiles/successor.md). It moves none of her parts: they pass as her things do.
- **Grants from a circle.** A grant `as` the circle is a `sign` move of type `grant`, or a `take` where it names the signer of one of its hands or an actor she operates. A grant to a role binds only through a meter the circle names and is never passed on (authority.md, To a role). A holder's own AI acts for the circle only under a grant the circle signs to it, which is a `take` where she signed one of its hands.

## Beside the rules

- **No group may make outside dealing costly.** No row binds a member's dealing with non-members except as her own signed promise. A fine, a boycott or an expulsion for dealing outside is a term she signed, with a stake, or it is nothing.
- **Leaders answer by their own word.** No liability falls on a hand by the office; each answers only for what she signed.
- **Shared records.** A pot, a vote or an auction is a record many write to, under a schema named in `refs.under` (patterns/pools.md, profiles/ballots.md). A count of such a record moves nothing; a circle's move holds only by its row's signed hands.

Ready-made tables, and the old bullets that were examples (a household herd, a standing referee, a price list for wrongs, rule changes within signed bounds, admission by vouch), are in patterns/circles.md.

## Invariants

27. A block `as` a circle speaks for it only where a row of the circle holds for it, counted in one place, every hand counting in that row and past each of its ends, and no hand of one the move gives to counting.
```

### 3.2 `spec/modules/folds.md`

**F1. Line 18**, the folds table row: "`circle_state`, `circle_versions`, `may_act_as`, `members_then`" becomes "`circle_state`, `circle_versions`, `row_holds`, `ways_in`, `members_then`".

**F2. Line 42, Counts** (stage 1's section; only its circle sentences change here). Delete from "**\"All current holders\"** is stated as the word `all`" to "(`shape` otherwise)." (the sentences on `all` and on `of_members`). Put in their place: "A count states a whole number, never `all` and never a share: a set a signer can leave out of her causal past is one she can shrink (circles.md, Rules)." In stage 1's list "(holders of a power, named witnesses, ...)", "holders of a power" becomes "the signers of a circle row's hands", since this stage deletes powers. Nothing else in Counts changes here (00-shared, row 83).

**F2a. `blocks.md`, Finality** (stage 1's section, with stage 4's cap clause). In the sentence "A word **stands** when ...", before "and its own condition has held where it stands", add: "for a move `as` a circle, a row of the circle holds for it, counted at one block, with hands that each stand and have passed every end of their hand (circles.md, Rules);". The reason it waits on is `hands` (section 4, `stands`). Nothing else in Finality changes here.

**F3. Line 44.** In "a circle's `removal.needed`, a schema's `grounds.needed`," replace "a circle's `removal.needed`" with "a circle's row (whose number is always stated: circles.md)".

**F4. Lines 118 to 120, the section "## Circle membership and roles"** (from "The fold reads the circle C (its founding block, the founder's first member grant)" to "A circle whose actor lists no roles is refused (`bad_roles`)."). Replace the body with:

> The circle fold reads the circle C (its founding block, and the version that stands for the block read: circles.md, Changing the rules), every grant of kind `member` with `refs.subject` C, every block that answers, updates or confirms one of them or C, every transfer whose `refs.what` is C, and each member's counted close, by the rules in circles.md. In the fold of a block's causal past, only what is in that past. No step reads arrival, a hash order or a date. A row by parts reads, for each hand, its signer's line read whole (folds.md, A line); where it is not, the answer is `{ not_shown: true, lacks }`. A circle's parts are a measure read as What is left; this fold adds only what each hand counts.

**F5. What each fold returns, line 138** (the `circle_state` bullet). Replace whole with:

> - `circle_state` of a circle not held or not read, or of a block that is not an actor of kind `circle`, is null; within a block whose causal past does not hold the circle, null too. Else `{ founder, pack, owners, unissued, rules, keepers, meter, members, removed }`: `pack` the founding block's or null; `owners` `[{ owner, amount, no_person }]` sorted by owner (`no_person` true where the owner is a circle whose owners, followed circle to circle, end in no person: a fact, refusing nothing), or `{ not_said: true }` with no `pack`; `unissued` the circle's own parts; `rules` the rows as they stand; `members` `{ id: { roles, grant, open } }`, `grant` the member grant now giving her roles (the founding block for the founder), `open` true when she joined by an open grant; `removed` `{ id: null }`.

**F6. Line 139** (the `members` bullet, "`members` maps each id to `{ roles, grant, counted_to }`" to "(a circle reads none: authority.md, The cut)."): delete; F5 says it.

**F7. Line 140** (the `circle_versions` bullet). Replace whole with:

> - `circle_versions` of a circle (null for any other block) returns `{ circle, versions, now }`: `versions` `[{ version, updates, author, changes, holds, hands }]` sorted by version, the founding block first with `updates` null; `changes` the sorted fields it changes; `holds` true when every `change` row it needs holds for it (`row_holds`); `now` the version whose rules stand with every block held.

**F8. Invariant 31** (line 155): "the circle it names in `as` if its author may sign for it" becomes "the circle it names in `as` where a row of the circle holds for it". (Stage 4 changed only the grantor phrase of this invariant.)

**F9. Line 28**: "Profiles add `circle_key` (rekeys.md)" stays.

### 3.3 `spec/modules/authority.md`

**A1. Line 5**, one sentence inside the role bullet: "Holders do not decline it: the circle's grantor stops it." becomes "Holders do not decline it: the circle stops it, by a `sign` move of type `grant` (circles.md, Rules)." Stage 4's sentences at the end of the bullet stay.

**A2. Line 9**, last sentence: "A grant to a circle is passed on by a child signed `as` that circle, no wider than given; whether its signer may sign for the circle is judged in the fold." becomes "A grant to a circle is passed on by a child signed `as` that circle, no wider than given, which holds where the circle's row for it holds (circles.md, Rules)."

**A3. Line 18**, the `as` bullet ("- A block naming a circle in `refs.as` speaks for the circle if its author holds `sign` ... Else it speaks for no one (`no_role`): kept, and counting for nothing."). Replace whole with:

> - A block naming a circle in `refs.as` speaks for the circle where a row of the circle holds for it (circles.md, Rules: its hands counted in one place, each counting in the row and past each of its ends), and it stands. Until then it is waiting (`on: hands`); where no row can hold it, it speaks for no one (`no_role`): kept, and counting for nothing. It binds the circle's things only (circles.md, What a circle's word binds). A move that gives to the signer of one of its own hands is the circle's `take` (No one is both sides of a word, below).

**A4. Line 29**, the second bullet of Backed by a person ("- **P is one of the hands of the circle it is signed as.** ... P agreed to that rule when she took her place."). Replace whole with:

> - **P signed a hand of the circle it is signed as.** It names the circle in `refs.as`, it speaks for the circle (Who a block speaks for), and a hand of P's is among those its row counted. It is the circle's word under rows P took on, and binds the circle's things, never P's own.

**A5. Line 43**, Ending, the two sentences "A thing signed `as` a circle is ended by its author or anyone who may sign for the circle; a stop `as` the circle by anyone else ends nothing. A grant signed `as` a circle by one who may not sign for it (no `sign`, or not the hands needed: circles.md, Many hands) is not live (`no_role`)." become: "A word signed `as` a circle is ended by a stop of its author while she still holds the role or parts her hand counted, or by a stop `as` the circle for which a row holds (circles.md, Rules); any other stop `as` the circle ends nothing. A grant `as` a circle for which no row holds speaks for no one (`no_role`)."

**A6. The cut** (stage 4 left the heading "so `circles.md`'s pointer resolves until stage 6"): circles.md now points to blocks.md, The cut. The heading and its one-line body may go; that is stage 7's to cut, as no file points to it after this stage.

### 3.4 Profiles and pointers

- **`profiles/rekeys.md`.** Line 5: "the circle power `rekey`" becomes "the circle move `rekey`". Line 8: "signed `as` the circle by a holder of `rekey`" becomes "signed `as` the circle, a `rekey` move", and "sealed to each member in `state.keys`" becomes "sealed to each id an audience naming the circle names (members and owners: circles.md) in `state.keys`". Line 9: "only if its signer holds `rekey` in the circle fold of its causal past (authority.md, Who a block speaks for)" becomes "only where the circle's `rekey` row holds for it (circles.md, Rules)". A `rekey` row is `{ move: "rekey", of: "key", ... }`. Stage 1's added sentence stays.
- **`profiles/ballots.md`.** After line 14 add: "A result moves nothing: a circle's move holds only by its row's signed hands, which may sign once the result is shown."
- **`profiles/rulebooks.md`**: no change (it names a circle only as a publisher of a schema).
- **Pointers only, no rule changed:** `promises.md` line 162 "(circles.md, A price list for wrongs shows the pattern)" becomes "(patterns/circles.md)"; line 168 "(circles.md, Membership)" becomes "(circles.md, Members and roles)". `privacy.md` line 11, "it may be a person, a circle, or `circle#role`": unchanged; who it names is `members_then` (section 5). `spec/schemas/schemas.json`: delete the base schema `share_vote` (a count by share is a row by parts).

### 3.5 New pattern page `spec/patterns/circles.md`

A pattern (00-shared, Deals): adds no rule, fold, op or list. Holds section 7's four tables as data, each with its sentences and its mistakes avoided, and the examples the old circles.md carried, each re-read under rows: the household herd (section 7, the family), a standing referee, a price list for wrongs, dues that change within a signed bound (`bounded_change`, patterns/pools.md), admission by vouch (patterns/vouches.md).

---

## 4. `protocol.json` edits

Added (A), changed (C), removed (R).

- R `powers` (top level), and the `bad_roles` reading of it.
- R in `circle`: `removal`, `removal_rule`, `roles_shape`, `change`, `change_rule`, `needed`, `needed_rule`. A in `circle`: `"moves": ["sign", "take", "issue", "admit", "remove", "change", "rekey"]`; `"of_fields": ["rules", "keepers", "meter", "name", "marks"]`; `"about"`: "A circle's founding block states `pack` (whole parts, the founder's first), `rules` (rows), `roles` (the founder's), `keepers` and `refs.meter`, each optional. A row is `{ move, of, by, needed }` or `{ move, of, parts }`: `of` the types a `sign` or `take` row covers, the role an `issue`, `admit` or `remove` row names, or the field a `change` row changes (of_fields); `needed` and `parts` whole numbers of at least 1. A move holds when one row for it holds; with no row, no one makes it (circles.md, Rules)."
- A `shapes.row`: `{ "role": ["move", "of", "by", "needed"], "parts": ["move", "of", "parts"], "about": "a row of a circle's rules: exactly one of these key sets" }`. C `shapes.places.lists`: add `"rules"`. A `field_shape.rules`: `"shape"`.
- C `fields.actor`: R `removal`, `needed`, `change`; A `rules`, `pack`, `keepers` (where not already listed). Declare `refs.meter` on an actor of kind `circle` beside stage 4's grant (`refs_single` already holds `meter`). `pack` on a circle's actor: `unit` `part`, a whole number of at least 1, no `of`. Declare `state.counted_to` (already in `needs`) on a block `as` a circle as well as on a key grant: a take-up's block of a departed hand's line (circles.md, A circle's line).
- C `key_fields.about`: "a member grant and a circle's actor carry roles" becomes "a member grant and a circle's founding block carry roles (names)".
- C `refusals.codes.block.shape`: "a needed or removal rule, a role list item" becomes "a circle row not in its shape (a move not in circle.moves, a needed or parts that is not a whole number of at least 1, a parts row on a circle with no pack, an of not as its move needs), a circle's pack that is not whole parts, a role list item".
- C `refusals.codes.block.bad_roles`: "a role list on a member grant or a circle's founding block that is not distinct names, each non-empty with no #".
- C `refusals.codes.fold.no_role`: "a block as a circle for which no row of the circle holds, read in one place (circles.md, Rules)". R `refusals.codes.fold.not_member` (a version is a `change` move: `no_role`). A `refusals.codes.fold.not_voice`: "a hand that counts for nothing in its row: no role by a named member grant in its causal past, no parts on a line read whole, an open joiner, unissued parts, or the one removed (circles.md, Rules)".
- C `door.ops.stands.result` (stage 1's, with stage 4's `confirm` text): `on` adds `hands`, after `named` and before `condition`: "(a move as a circle until a row holds for it with hands that each stand and have passed every end of their hand: circles.md, Rules)". The `on` order is `wait`, `reach`, `confirm`, `end`, `named`, `hands`, `condition`. `both_sides` (stage 4's) gains: "for a circle, a move that gives to the signer of one of its own hands, unless a take row holds without her hand".
- C `optional_profiles.rekeys`: R `powers` (its move is in `circle.moves`; stage 7 deletes `optional_profiles`); C `folds.circle_key.output` unchanged; door text below.
- C `folds.circle_state.output`: `{ founder, pack, owners, unissued, rules, keepers, meter, members, removed }` as folds.md F5. C `folds.circle_versions.output`: `{ circle, versions, now }` as F7. R `folds.may_act_as`; A `folds.row_holds` (`over: "as"`, `words: "all"`, output as section 5); A `folds.ways_in` (`over: "circle"`, `words: []`: a reading). C `folds.members_then.input`: "a block and a circle or circle#role".
- C `door.ops` per section 5. C `door.ops.count_of.args`: "needed: a stated whole number"; result: "the number, when it is a whole number from 1 to the size of the set; else null".
- C `price_figure_about`, `repeat.keys_about`: "(ids or circle#role)" stays; its meaning is circles.md's.
- **CBOR names** (`cbor.keys`, issued whole at stage 7): removed `removal`; added `rules`, `move`, `by`, `parts`, `needed`, each only where not already in the table (move names such as `issue` are values, not keys).

**Deleted, counted: 15.** `powers`; seven keys of `circle`; three actor fields; `not_member`; `may_act_as` as fold and door op (2); the rekeys profile's `powers` (its move is in `circle.moves`). Text also gone: the share and `all` readings of `count_of`, the filled-in "one holder", the `share_vote` base schema. **Added:** 3 keys in `circle`, 1 shape (`row`), 1 field shape, 1 fold code, 2 folds and 2 door ops (`row_holds`, `ways_in`; `ways_in` is a reading, which stage 7 moves to `readings.json`).

---

## 5. Door ops

| Op | Change | Args | Result |
|---|---|---|---|
| `circle_state` | changed | `circle id`, `held`, `within?` | `{ founder, pack, owners, unissued, rules, keepers, meter, members, removed }` (folds.md F5); `{ not_shown: true, lacks }` when an owner's line is not read whole |
| `circle_versions` | changed | `circle id`, `held` | `{ circle, versions, now }` (folds.md F7) |
| `row_holds` | **added** (replaces `may_act_as`) | `full_block`, `held` | `{ circle, move, holds, row, hands: [{ id, block, role, parts, counts, why }], waiting }` or `{ not_shown: true, lacks }`: `move` the block's move (two for a take that issues), `row` the row that holds or null, `role` the role it counts by or null, `parts` the parts it counts or null, `why` null or one of `not_voice`, `both_sides`, `waiting`, `pair`; `waiting` `[{ block, on }]`. False `holds` with an empty `hands` is `no_role` |
| `ways_in` | **added** | `circle id`, `held` | `{ rows: [{ row, least, path, no_person }] }`: for each row as it stands, `least` the fewest ids now in the circle (holders of roles, owners of parts) who, admitting and issuing as the rows let them, could come to make it hold; `path` the rows on that way, in order; `no_person` true where that way counts parts whose owners, followed circle to circle, end in no person. A reading: it binds no one |
| `members_then` | changed | `block`, `recipient`, `held` | for a circle: its members (open joiners too) and its owners of parts, in the fold of the block's causal past, sorted; for `circle#role`: holders of the role by named grants (with open joiners, where `recipient` is an audience) |
| `speaks_for`, `backed`, `backed_all` | changed (text) | unchanged | a block `as` a circle: the circle where `row_holds` holds and the block stands; else null, `waiting` listing `on: hands` |
| `count_of` | changed | `needed`, `members` | a whole number from 1 to the size of the set is itself; anything else null |
| `circle_key` | changed (text) | unchanged | "from the key grants signed as the circle by a `rekey` move whose row holds" |
| `may_act_as` | **removed** | | `row_holds`; its role variant is `members_then` with `circle#role` |

Each op above asked about a block or a circle that is not read gives no answer, null (folds.md, A fold reads only what is valid and read).

**Why not `reach`.** `reach` already means a voice's wait before its word stands (identity.md). The reading of every way into a role is named `ways_in`.

**How `least` is computed** (a fixpoint, whole numbers only). For a role row `by` R, `needed` n: the least of n and, for each `admit` row of R, its own `least` (once admitted, new holders are free ids). For a parts row of p: the fewest current owners whose parts reach p, or, where unissued parts reach p, the `least` of the `issue` row plus that of the `admit` row of the role it names. Start every row at the number of ids in the circle plus one, lower each by these rules until nothing changes; a row that cannot be met keeps no number (`least: null`).

---

## 6. The attacks, walked under the new text

The café of section 1 unless said; "clock" means the café names its node in `keepers`.

1. **Free keys join by an open grant and vote.** They hold the role's name and their hands count in no row (`not_voice`). Nothing they sign holds. **Stopped.**
2. **One named member with free keys.** His free keys are open joiners: they count for nothing. To make them count he needs the `admit` row of a role that counts; `ways_in` shows whether he alone can meet it. With the café's table (owners seated by 51 parts) he cannot. **Stopped** where the table seats those who count by parts; **visible** (`ways_in`) where it seats them by one hand.
3. **One hand of three signing alone by leaving the others out.** A row states a whole number: three ids must stand in the completing block's causal past. `all` is gone. **Stopped.**
4. **A founder alone passing a change.** `change` rows count whole parts; Amara's 50 never reach 100. There is no "everyone signed" way around the rows, and a version cannot change `change` rows. **Stopped.**
5. **Vote, then sell the parts.** Leila confirms an `admit` of Sam with her 50 parts, then transfers them to Maria; Sam completes. Her transfer is an end of her hand from where she signs it. With a clock: Sam's completing confirm, received after it, has seen it; Leila's hand adds nothing, and Maria votes now. With no clock: the move waits; Sam, who signed a hand of it, is no relier; it stands only if an outsider relies on it unseen (the café bears that gap, as it chose). **Stopped**, fully with a clock.
6. **Buy parts quietly, then vote.** Buying parts is buying property: no wrong. What her hand counts is what her line, read whole back through each giver's, shows. Sealed transfers leave a stranger `not_shown`, never a guessed count. **Visible.**
7. **A partner signs the roller to himself.** A transfer to the signer of its own hand: a `take`. The mill's `take` row (by `partner`, 1) needs another partner. **Stopped.**
8. **A treasurer lends herself the pot.** A promise `as` the group with her as the other side: a `take`, by parts 8 without her part. Seven others must sign. **Stopped.**
9. **A leaver hands unpaid invoices to her new stall.** A hand-over of deals `as` the café to a circle in which she holds a part: a `take`, and also signed twice (rule 13). Amara must sign. **Stopped.**
10. **A removed manager's AI still ordering.** Grants to `café#manager` are not passed on (stage 4), so his AI holds nothing from them. A grant he signed `as` the café to his AI gave to an actor he operates: a `take` that never held. His own blocks `as` the café after his removal: with a clock, received after the removal, they count for nothing; with none, they pass only where an unseen relier used them, and the café bears that. **Stopped** with a clock; **visible** without.
11. **Two circles that own each other.** A sole founder moves A's parts to B and B's to A. Each transfer is his own and takes; nothing is refused and no reason is given. Each circle's parts count by the other's own rows, which his hands meet. `owners` and `ways_in` show that the owners end in no person (`no_person`); a stranger weighs that himself. **Visible.**
12. **A father seats a second identity of his own in a role.** Under the family table, `admit` of `parent` needs both parents' parts (2): he has 1. **Stopped** by the table; under a table that seats parents by one parent, `ways_in` shows `least: 1`. **Visible** there.
13. **A sole owner who dies.** Her close ends her roles; her parts pass by her successor's transfer to her heir (profiles/successor.md, Heirs), who accepts. The heir's parts meet the `admit` row of `owner`; seating himself is no take. Nothing is stranded. With no successor named, her parts stay hers and count in no row (her close ended her hands), and rows by whole numbers that do not need them still hold. **Stopped** with a successor; **visible** without.
14. **A family that states no parts.** `owners: { not_said: true }`; its things are held together under its rows; if every hand is gone, nothing moves, and the card said so. **Visible**, by its own choice.
15. **A look-alike circle.** Same name, same rows, another id; `circle_state` shows another founder and other owners. Only the founder's own key can re-found her old circle (section 8). **Visible.**
16. **A co-op board issues unissued parts to itself.** An `issue` move only by the `issue` row (never `sign`). To a board member, or to a shell circle in which one holds a part: also a `take`, without their hands. To free keys: they must first hold the `member` role, seated by the members' own parts row. **Stopped** for itself; **visible** (`ways_in`) for free keys seated with members' help.
17. **The café's sacks on a leaver's phone.** A café that names no `refs.meter` (section 7's table without its meter line); Amara and Leila are owners, and Sam has since been seated as a third. (a) Leila signs, from her phone, a `thing` `as` the café, `pack` 100 sack; the `sign` row by `owner`, 1 holds: `ownership` shows the café owning 100, held on Leila's line as the café's (her line is its line for them). (b) Leila stops her member grant and leaves; nothing she held moves at that block. (c) Amara signs a transfer `as` the café of 20 sacks `to_owner` Bo, with Leila's stop in its causal past and `state.counted_to` naming it (Leila signed the stop, so her line is continued from it), and Sam confirms it: the row holds; the 100 were freed to the café at her seat's end, and this move takes them up: from Leila's stop on, they are drawn along Amara's line (the key that signs the move, whatever other hands it gathers), so the draw takes, held, and the other 80 sit on Amara's line as the café's. Bo holds no seat and needs none: he receives as anyone does, and his accept, his own start for the 20 (folds.md, What is left, One start), lands them as his, never the café's. Had the move not had the stop in its past, it would take nothing (`not_on_line`); with a clock that has not yet received the stop before it, it waits (`on: end`). (c2) Meanwhile Sam, on another phone and not seeing Amara's move, signs his own take-up: a transfer `as` the café of 30 sacks `to_owner` Femi, `state.counted_to` Leila's stop. Two starts of one amount, by two keys apart (One start): no `pair`, nothing later of Amara's or Sam's tainted; Bo's 20 and Femi's 30 each take nothing (`not_on_line`), and the café holds its 100 on no hand's line. A reader who holds only one of the two moves sees it take; once he holds both, it does not. (c3) Amara then signs a third take-up with both earlier moves in its causal past (its `after` names them), `state.counted_to` Leila's stop, again a transfer of 20 `to_owner` Bo: it is the one continuation, and its draw takes, held; Bo accepts: landed, the café 80, Bo 20. Femi, who never had the 30, holds Sam's word given `as` the café: a claim on the café, which it settles or a judge the sides chose hears; the two earlier draws never take later. Had the café named `refs.meter`, no take-up would have been needed; had it named a clock with one line, that line's order would have chosen. (d) Leila's own key then signs a transfer of 10 of the sacks to her stall: she never owned them, so it takes nothing (`not_owner`); signed `as` the café, no row counts her hand (`no_role`). **Moves**, where it was stuck: no key could draw on her line once she had gone.

**Of b3/11's eleven:** stopped are F1 (take), F2 (no unanimity escape), F3 (a hand lasts), F4 (stage 4: a role grant binds only through a meter), F5 (a hand's AI under its own grant is a take; a clock cuts), F7 (the account word's `by`), F8 (the `issue` row and take). Made visible: F6 (`ways_in`; default tables seat by parts), F9 (whole numbers, no `all`; an heir by a successor; an unspoken death's parts count for no one), F10 (`not_shown`; owners in a circle's audience), F11 (ids and owners; the re-founding window closed by authorship).

---

## 7. The default tables (`spec/patterns/circles.md`)

Ordinary people never write a row. A product offers one of these whole, reads each row back in a sentence and shows `ways_in`; she changes any row and signs once. Ids below are placeholders.

**A café, two owners, six staff.** Amara founds; she seats Leila as owner with her 100 parts, then transfers 50 to her.

```json
{ "kind": "circle", "name": "Amara's Café", "roles": ["owner"],
  "pack": { "value": "100", "unit": "part" },
  "keepers": { "names": ["<café node>"] }, "refs.meter": "<café till key grant>",
  "rules": [
    { "move": "sign", "of": ["promise", "transfer", "transform", "observe", "thing"], "by": "owner", "needed": 1 },
    { "move": "sign", "of": ["grant"], "by": "owner", "needed": 2 },
    { "move": "take", "of": ["promise", "transfer", "grant"], "by": "owner", "needed": 1 },
    { "move": "admit", "of": "owner", "parts": 51 }, { "move": "remove", "of": "owner", "parts": 51 },
    { "move": "admit", "of": "manager", "by": "owner", "needed": 1 }, { "move": "remove", "of": "manager", "by": "owner", "needed": 1 },
    { "move": "admit", "of": "staff", "by": "owner", "needed": 1 }, { "move": "admit", "of": "staff", "by": "manager", "needed": 1 },
    { "move": "remove", "of": "staff", "by": "owner", "needed": 1 }, { "move": "remove", "of": "staff", "by": "manager", "needed": 1 },
    { "move": "change", "of": "rules", "parts": 100 }, { "move": "change", "of": "keepers", "parts": 100 },
    { "move": "change", "of": "meter", "parts": 100 } ] }
```

In words: either owner deals for the café; both sign a grant; neither pays herself without the other; more than half the parts seat or unseat an owner; owners seat the manager, and either seats staff; both change the rules. Staff and the manager act only under grants both owners signed once, to `café#staff` (the menu offer in `on`, `each` per sale) and `café#manager` (the standing orders in `on`, `limit` a week, `until` year end), counted on the till. Each owner's part card asks who takes it if she dies. **Mistakes it avoids:** a `sign` row with no `take` row (an owner empties the café to herself); a manager who can seat owners (the weakest way in); `all` among owners (one death freezes the rules); no clock (a removed manager's blocks go on binding); no meter (two tills selling one stock twice).

**A savings group of twelve.** The founder transfers one part to each of the other eleven. One circle per cycle; a thirteenth waits for the next.

```json
{ "kind": "circle", "name": "Kibera Savers 2027", "roles": ["saver"],
  "pack": { "value": "12", "unit": "part" },
  "keepers": { "names": ["<phone shop node>"] }, "refs.meter": "<phone shop till>",
  "rules": [
    { "move": "sign", "of": ["promise", "transfer", "observe", "grant"], "by": "saver", "needed": 8 },
    { "move": "take", "of": ["promise", "transfer", "grant"], "parts": 8 },
    { "move": "admit", "of": "saver", "parts": 8 }, { "move": "remove", "of": "saver", "parts": 8 },
    { "move": "admit", "of": "treasurer", "parts": 8 }, { "move": "remove", "of": "treasurer", "parts": 8 },
    { "move": "change", "of": "rules", "parts": 9 } ] }
```

In words: eight of us for anything; the one paid is never one of the eight; nine of us change the rules. At the first meeting eight sign the account word naming the treasurer in `state.by` (her `received` counts each pay-in) and a grant to `group#treasurer` whose `on` is the round's promise. **Mistakes it avoids:** "all of us" (one saver signs alone by citing no one); a treasurer lending to herself; seating savers by one hand (free keys); a leaver losing her share (her part stays hers); a pay-in held by any member a payer names.

**A family.** The founder seats the second parent with her 2 parts, then transfers 1.

```json
{ "kind": "circle", "name": "Wanjiku family", "roles": ["parent"],
  "pack": { "value": "2", "unit": "part" },
  "keepers": { "names": ["<home node>"] }, "refs.meter": "<home node>",
  "rules": [
    { "move": "sign", "of": ["promise", "observe", "transform", "thing"], "by": "parent", "needed": 1 },
    { "move": "sign", "of": ["transfer", "grant"], "by": "parent", "needed": 2 },
    { "move": "take", "of": ["promise", "transfer", "grant"], "parts": 1 },
    { "move": "admit", "of": "parent", "parts": 2 }, { "move": "remove", "of": "parent", "parts": 2 },
    { "move": "admit", "of": "child", "by": "parent", "needed": 1 }, { "move": "remove", "of": "child", "by": "parent", "needed": 1 },
    { "move": "change", "of": "rules", "parts": 2 } ] }
```

In words: either parent day to day; both to give the herd away or to grant power; neither takes without the other; both, by what they own, to seat a parent; either seats a child. Small gifts (up to 3 head) by a grant both sign to `family#parent` with `each` 3 head. Each parent's part names the other, then a child, as successor. **Mistakes it avoids:** a second identity seated by one parent (F6); one parent selling the herd to himself; a child's role grant outliving both parents unbounded (it binds only through the home node's meter); owners left unsaid, so a double death strands the herd.

**A co-op of 400.** `pack` 1,000. The founder, holding all, seats two board members by parts, transfers 999 to the co-op (its two-board `sign` accept), and keeps 1. Each new member is seated by three members' parts and issued one part by two board members.

```json
{ "kind": "circle", "name": "Lake Maize Co-op", "roles": ["board", "member"],
  "pack": { "value": "1000", "unit": "part" },
  "keepers": { "names": ["<co-op node>", "<registrar node>", "<bank branch node>"], "needed": 2 }, "refs.meter": "<co-op node>",
  "rules": [
    { "move": "sign", "of": ["promise", "transfer", "transform", "observe", "thing"], "by": "board", "needed": 2 },
    { "move": "sign", "of": ["grant"], "by": "board", "needed": 3 },
    { "move": "take", "of": ["promise", "transfer", "grant"], "by": "board", "needed": 3 },
    { "move": "issue", "of": "member", "by": "board", "needed": 2 },
    { "move": "admit", "of": "member", "parts": 3 }, { "move": "remove", "of": "member", "by": "board", "needed": 3 },
    { "move": "admit", "of": "board", "parts": 201 }, { "move": "remove", "of": "board", "parts": 201 },
    { "move": "change", "of": "rules", "parts": 267 }, { "move": "change", "of": "keepers", "parts": 201 },
    { "move": "change", "of": "meter", "parts": 201 } ] }
```

In words: two board members deal; three grant power or pay one of their own; members seat members; the board gives each a part; 201 members seat or unseat the board; 267 change the rules; unissued parts vote for no one. As the co-op grows past 400, the members carry new numbers by the `change` row. **Mistakes it avoids:** the board moving the co-op's own parts by its `sign` row (F8); a board seating the voters alone (`ways_in` shows five ids); a share of a moving roll; one keeper who can order every removal; removal of a member taking her part.

---

## 8. What changes for existing blocks and vectors

**Old founding blocks.** A 1.7 founding block is not valid in 1.8 (every non-genesis block is signed over its header: stage 2), so none is read. The founder re-signs; her new block is a new id, and only her key can sign it as founder, so no insider can re-found her circle as his own. The map below gives her the rows her old block meant, which the product reads back before she signs. Every member grant, deal and audience naming the old id is re-signed against the new one.

**The map** (step 6a of `tools/resign-vectors.cjs`, after stage 4's 3b, before re-signing; also the product's re-founding card):
1. `state.roles: [{ name, powers }]` becomes `state.roles: [<first role's name>]` (the founder's), and the role names are kept.
2. For each role R holding `sign`: `{ move: sign, of: <the seven types>, by: R, needed: N }`, N the old `needed.sign` when it is a whole number, else 1 (1.7's own text read silence as one; the re-founded block states it, so nothing is filled in after this). No `take` row is written.
3. For each pair of roles X, Y where Y holds `admit` and every power X carries: `{ move: admit, of: X, by: Y, needed: 1 }`.
4. For each role X and each role Y holding `remove`: `{ move: remove, of: X, by: Y, needed: M }`, M the old `removal.needed` where X carries `admit` or `remove` (no row where none was stated), else 1.
5. A profile power (`rekey`) held by Y: `{ move: rekey, of: key, by: Y, needed: 1 }`.
6. No `pack`: owners unsaid.

**Cannot be mapped** (listed by the step, then re-made by hand): `needed.sign` of `all` (1 founding block) or `{ of_members }` (2); `needed.sign` above 1 with two or more roles holding `sign` (4), where 1.7 counted holders across roles; every `change` line (7), which counted members, a moving set: no `change` row is written, so those circles' rules never change until re-founded by hand; the 15 versions, re-made as `change` moves only in the stories that test them. Measured on 2026-11-11: 153 founding blocks, 168 circle actors, 1,194 `"powers"` lines, 566 `"removal"`, 18 `"of_members"`; door cases `circle_state` 103, `may_act_as` 62 (become `row_holds`, `holds` for true), `count_of` 14 (the 4 with `all` or a share become null), `circle_versions` 10 (new output), `members_then` 3, `circle_key` 1.

**Answers that change, and are meant to:** every block where a hand gives to herself, her actor or her circle `as` the circle (now `both_sides`); every count with `all` or a share; every hand whose role or parts ended before the move completed; every version (no per-member reading). **Must not change:** membership, leaving, removal and the crossing where no hand gives to herself and every number was whole; every `backed` for a person's own block.

**New vectors** (a maker `make-vectors-circles.cjs`; each a story and its answer):
1. Café founded, `pack` 100: `owners` Amara 100; she transfers 50 to Leila, unanswered: Amara 50, Leila none, 50 held; Leila accepts: 50 and 50.
2. A transfer of 2.5 parts: takes nothing (`unit`).
3. A founding block with a parts row and no `pack`: `shape`; with `needed: "all"`: `shape`; with `{ of_members: "2/3" }`: `shape`.
4. A move by a role with no row for it: `no_role`.
5. Seven open joiners sign a version: `not_voice` each; the version does not hold.
6. Three partners, `sign` by `partner`, 3; Harry signs a transfer naming no confirm in `after`: `holds` false, `waiting on: hands`; two confirms in a later block's past: holds there.
7. Harry signs the roller to himself `as` the mill, `sign` 1, no `take` row: `both_sides`, speaks for no one; with `take` by `partner`, 1 and Sam's confirm: holds.
8. A treasurer's promise `as` the group to herself with eight confirms including hers: her hand `both_sides`, seven count, `take` by parts 8 fails; an eighth other saver confirms: holds.
9. Leila hands three deals `as` the café to her stall: `take`; holds only with Amara's hand (and is waiting `confirm` until signed twice).
10. Vote then sell, with a clock: Leila's confirm, her transfer of 50 to Maria received, Sam's completing confirm received after: Leila's hand adds nothing, `holds` false; Maria confirms: holds.
11. Vote, pass, vote again: Leila confirms with 50, passes 50 to Sam, Sam confirms: Leila's hand has been seen ended; count 50, not 100.
12. Sell then vote from a thin past: Amara signs 50 parts to her son, then an `admit` citing nothing of his: her hand counts 50 (her draw holds from where signed).
13. With no clock, vote then sell: the move waits; an outsider's deal with the seated owner, not having seen the sale: holds there.
14. A founder alone signs a version changing `rules` with every owner left out of `after`: `change` by parts 100 not met: `holds` false.
15. A version that adds a `change` row: the row is not read.
16. Two carried rival versions: rules stand at the latest carried version both have in their past.
17. No `change` row: every version changes nothing.
18. A removed manager's block `as` the café, received on the café's clock after the removal: `no_role` (hand has seen an end); no clock, used by an unseen relier: holds.
19. The manager's grant `as` the café to his own AI: `both_sides`; the AI's order under it binds the AI's signer only.
20. A father seats a second id as `parent` under `admit` by `parent`, 1: holds; `ways_in` for `sign` of `transfer` by `parent`, 2: `least` 1. Under the family table: does not hold.
21. Sole owner dies; successor transfers her 100 parts to her son under the successor grant; he accepts and admits himself as `owner` by parts 51: holds (no take).
22. A family with no `pack`: `owners: { not_said: true }`.
23. A ring: A's parts to B, B's to A: both transfers take; `owners` `no_person` true; `ways_in` `no_person` true on A's parts rows; a block `as` B for which B's `sign` row holds counts B's parts in A's parts row.
24. Unissued: co-op transfers 999 to itself, accepted by its `sign` row: `unissued` 999, counted in no row; an `issue` by the `sign` row alone: `no_role`; by the `issue` row to a member: holds; to a board member who signed it: `both_sides`.
25. A parts row read with a giver's transfer held only as a header: `{ not_shown: true, lacks: [<that transfer's id>] }`.
26. Two keys of one person confirm: one id, one hand.
27. A hand on a capped tap key signing a £900 order `as` the café: her hand waiting `confirm`; the move does not stand until her higher voice signs.
28. `members_then` of a circle with a silent 50-part owner who holds no role: lists her.
29. `count_of` with 3 of 5: 3; with `all`: null.
30. The café's meter: two tills each sell the last loaf `as` the café; the meter's receipts with totals: the second `past`.
31. The stuck case now moves (no `refs.meter`): Leila signs 100 sacks `as` the café, then leaves; Amara's transfer `as` the café of 20 to Bo, Sam confirming, with the stop in its past and `state.counted_to` the stop: a take-up, takes on Amara's line; Bo accepts: the café 80, Bo 20. The same transfer without the stop in its past: `not_on_line`.
32. Her draw after leaving: Leila's own key signs a transfer of 10 of those sacks: `not_owner`; the same `as` the café: `no_role`.
33. A move between hands' lines while her seat stands: Leila signs `as` the café a draw `to_owner` the café of 50 sacks; Amara's key accepts `as` the café: lands, Amara's line holds 50 as the café's; `row_holds` lists no `both_sides` (no `take`); Amara's draw of 50 takes; Leila's later draw of 60 on her own line: `past`.
34. Two take-ups apart (no `refs.meter`, no clock): after Leila leaves, Amara's transfer `as` the café of 20 sacks to Bo and Sam's of 30 to Femi, each with `state.counted_to` Leila's stop, neither in the other's causal past: both draws `not_on_line`, `takes` false; the café owns 100, held on no hand's line; no `pair` is listed for Amara's or Sam's key, and their later blocks are read as before. With only Amara's move held: it takes.
35. A take-up naming both: after 34, Amara's third transfer `as` the café of 20 to Bo, `after` naming both earlier moves, `state.counted_to` Leila's stop: takes on Amara's line; Bo accepts: the café 80, Bo 20; the two earlier draws stay `not_on_line`.
36. Two accepts of one hand-over apart: while her seat stands, Leila signs `as` the café a draw `to_owner` the café of 50 sacks; Amara's key and Sam's key each accept it `as` the café, neither seeing the other: the 50 are the café's on no hand's line, a draw on either line `not_on_line`, no `pair`; a later accept by Amara's key, its `after` naming both, starts her line for them.
37. A take-up under a named meter is never needed: the café of section 7 (`refs.meter` the till); Leila signs 100 sacks `as` the café and leaves; Amara's and Sam's transfers `as` the café of 20 and 30, neither seeing the other, each with the till's receipt: both take on the meter's line (totals 20, 50); a `state.counted_to` on either is not read.

---

## 9. Build notes

**Order.** (1) `protocol.json`, then `node test/sync-spec.cjs`. (2) Spec text (section 3), the pattern page. (3) The oracle. (4) The Rust core. (5) The vectors (section 8). (6) The SDKs, `mcp/`. After 3 and 4: `node spec/oracle/run.cjs`, `node test/audit/run.cjs`.

**The oracle, `spec/oracle/fb.cjs`.**
1. Check 2 (in `valid`): a circle's founding block (`pack` whole, no `of`; `rules` each a `shapes.row`; parts rows only with `pack`; `roles` names) and a member grant's `roles`; drop the powers and `removal`/`needed`/`change` checks.
2. `circleFold` (2754), `circleRoot`, `circleFoldNow`, `circleWhole` (2952): membership by named and open grants, changes, leaving, removal, close, read in a block's causal past; delete the powers table, the open-grant power guard, the removal-like count and the crossing's special reading (the cut now does it).
3. A new `circleParts(circle, pool, at)`: calls stage 3's `drawsOn` for the circle's `pack`; owners, unissued, `no_person` by following circle owners (with a visited set), a fact shown that changes no count. Two take-ups or two accepts of one hand-over apart are read by One start, never as a pair: delete the `GUESS [S2-18]` note ("two continuations of one line are a pair"; `fb.cjs`, near 5884) and build no pair for them.
4. A new `rowHolds(block, pool)` replacing `mayActAsIn` (3017) and `mayActAs` (3043): the block's move; its rows; its hands; what each hand counts (role in its past by a named grant; parts on her line read whole); her ends, passed or not at each completing block, with the rule 1 routes of stage 1's `passes` and no self-naming; rule 6 for `take`; counts by id. Returns `row_holds`'s shape.
5. `versionsOf`, `versionsRead` (3075), `circleVersions` (3066): a version is a `change` move; rules as they stand by the carried chain; delete the per-member reading.
6. `membersThen` (3055): owners too; `circle#role` named holders. `circleKey` (3147): the `rekey` row. `countOf`: whole numbers only. Add `waysIn` (the fixpoint of section 5).
7. `speaksFor`, `backedIn`: the `as` bullet through `rowHolds`.

**The Rust core, `sdk/rust/src/`.**
1. `check/actor.rs`: the founding block's fields and rows; `check/grant.rs`: a member grant's roles.
2. `fold/circle.rs` (898 lines): delete `roles_table` (48), `holds_power` (64) and the `all`/`of_members` branch of `may_act_as_in` (790, lines 817 to 826); keep the membership machine (`roles_at`, `member_grants`, `circle_state_in`); add `rows`, `hands`, `row_holds_in` (replacing `may_act_as_in`, `may_act_as`, `is_hand_at`), `holders_of` reading named grants only; `members_then`, `holds_then` (883) with owners.
3. A new `fold/parts.rs`: the circle's measure through stage 3's `fold/draws.rs`; owners, unissued, rings.
4. `fold/versions.rs`: `rules_of` (13), `carried_rules` (41), `versions_in` (45) rewritten as `change` moves.
5. `fold/rekeys.rs`: the `rekey` row. `bound.rs` (48 to 60): `all` and `share_of_members` deleted. `fold/backed.rs`, `fold/mod.rs` (`speaks_for`): `as` through `row_holds_in`; rule 6's circle half reads `take`.
6. A new `fold/ways_in.rs`. `door.rs`, `spec.rs`: section 5. Rebuild WebAssembly, the Python library, the XCFramework; every SDK's tests.

**`write`.** Writes only rows; refuses to write a founding block with a `sign` row and no `take` row only as a warning the product shows (no rule: a founder may want none). **`mcp/`**: `connect` for a circle drafts from the four tables; the read-back says each row in words and gives `ways_in`.

**Identical before and after:** membership, leaving and removal where every number was whole and no hand gave to herself; every identity, consent and chain answer; every `under_ok` that names no circle.

---

## 10. What this stage leaves, and what it needs

**Leaves to stage 7:** `protocol.md` (the glossary: circle, part, row, move, hand, unissued; "power" gone); `THREAT-MODEL.md` (the ring, the father's second identity under a weak table, a death with no successor, a circle with no clock bearing its gaps, a row read only on lines read whole); `NECESSITY.md`; the CBOR names of section 4; moving the readings `ways_in` and `circle_key` (and ballots' `counted_in`) to `spec/readings/circles.md` (07, C2, C3); authority.md's empty heading "The cut".
**Needs from stage 1:** The cut (ends, seen, relier, its routes), Finality (stands, waiting, signed twice), a named clock, Counts, the close in successor.md. **From stage 2:** A line, read whole, `not_shown`, `lacks`, `read`. **From stage 3:** What is left (a measure, draws, holds, lands, freed, the reasons, `pack`, a part as the same instance), Ownership (a thing made `as` a circle is its). **From stage 4:** No one is both sides (rule 6), A meter she names, grants to a role and their meter, a voice's cap, a stop of one thing. **From stage 5:** the account word's `state.by`, `received`, `spec/patterns/`, patterns/vouches.md and pools.md.

---

## 11. Asks of the shared ground

Asks settled in 00-shared.md on 2026-11-11.

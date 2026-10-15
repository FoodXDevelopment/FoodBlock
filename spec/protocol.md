# FoodBlock protocol

Version 1.6 (2026-10-15).

This document is normative: where another document in this repository disagrees, this one governs.

Lineage: the whitepaper (v1.5, June 2026), the v3 RFC (July 2026), the spec labelled 1.0 (October 2026), then 1.6;
a block written under any of them stays readable.

## The idea

A **block** is a signed step by an actor, about things, in one of three moods, between parties named or open.

- **Is:** it happened, or it is so. `observe` (a claim that something is so), `transform` (a thing changes),
  `transfer` (a thing changes owner, holder or place).
- **Must:** `promise`, a commitment, offered or asked.
- **May:** `grant`, authority given to someone.

What exists is **actors** (`actor`: people, agents, circles, contacts) and **things** (`thing`: food, tools, places,
recipes, shares, rules). Everything else is a step about them. Seven types, seven verbs that link blocks, one chain
per signing key.

**The line.** The protocol carries only what strangers must agree on with no boss: who said it, under what authority,
to whom, with what consent, and how it settled. Everything else stays on each person's own **node** (the software
that holds their blocks and speaks for them): drafts, beliefs, goals, limits, budgets, rankings, learning. A node
decides freely; the protocol only makes its signed words checkable.

**As easy as a text message.** Anyone can take part with any phone: holding keys is better, never required. A person
may be named with no keys (a contact), or have keys a custodian holds for them (Who someone is); their word by SMS,
voice or a message is enough to act, and they can take their keys at any time.

**Strict writing, generous reading.** A node writes only the current shapes. It reads every earlier shape through
one alias table, `aliases.json`. A node never changes signed content: it refuses a block, and the author re-signs.

**Any peer.** A person's phone, a robot kitchen, a delivery vehicle, a drone, a smart fridge, a sensor: each is a
peer that speaks the protocol itself. The protocol is the interface; no app or server is required.

**One source for lists.** Every closed list and grammar in this document is in `protocol.json`, which code loads.
Where both state a list, they match exactly.

## Invariants

1. A block's identity is the hash of its canonical bytes; nothing else names it.
2. A block never changes; a change is a new block.
3. Within one signing key, each `seq` holds at most one block; two prove a lie: both are kept as proof, and neither
   binds anyone else.
4. A record's binding blocks come from its one sequencer and form one chain; two that do not see each other prove a lie.
5. An instance has at most one owner in any fold.
6. Nothing that gives, takes or orders authority reads another author's clock.
7. No tie on authority is broken by hash.
8. A key speaks only if every block that brought it in is valid and none crosses a rival the recovery key has not
   settled; a key is rotated only by itself or the recovery key, and a rotated key speaks no further after `last_good`.
9. A grant is live only while every ancestor grant is live.
10. A child grant's scope is a subset of its parent's on every field.
11. What is bound from an offer never exceeds what is offered.
12. A block counts in a deal only if a side, or its agent under a grant, signed it.
13. A promise is settled only by blocks the receiving side accepts or the grounds confirm.
14. An unanswered ask or claim binds no one.
15. `answers` is the only consent.
16. A 1.6 identity has no history; an older identity's history is closed by its first 1.6 block, and what is in it
    stands.
17. Nothing outside the audience can name a recipient.
18. Every node answer a reader relies on is signed by the node.
19. A key held by someone else always says so, and its holder signs only on the person's own word.

## 1. A block

A block is `{ type, state, refs }`, signed by its author's key on their own device. Its id is the SHA-256 of its
canonical form (Encoding). `state` holds data; `refs` holds links, each a hash or a set of hashes.

**Fields every block but a genesis carries:**
- `refs.author`: who said it.
- `state.seq` and `refs.prev`: its place in its signing key's own chain. A key's first block has `seq` 1, and its
  `prev` is the block that brought the key in (the genesis, or the key grant). Each block after adds one, and its
  `prev` is that key's block before.
- `state.at`: when it was said, on the author's clock. `state.when`: when it happened, if different (an instant, or
  `{ from, to }`).
- `state.audience`: `public`, or a sorted list of commitments, one per recipient (Privacy).

**Fields any block may carry:**
- `refs.subject`: who or what it is about (the café a review is about, the fridge a reading is of).
- `state.where` (a point `{lat, lon}`, WGS84 degrees as decimal strings, or an area: a point with `radius`, an
  amount in metres) or `refs.place` (a thing it is in or at: a fridge, a stall, a truck).
- `state.kind`: a label saying what kind of step or thing this is ("cook", "eggs", "circle"). Not to be confused
  with `refs.kind`, which names the thing this one is an instance of.
- `refs.as`: the circle the author signs for.
- `refs.under`: the grant, rule or law it acts under.
- `refs.schema`: the schema it follows.
- `state.nonce`: on a private block, so short content cannot be guessed from its hash.
- `state.confidence`: the author's stated probability.
- `state.sequencer`: on a record's first block, the signing key that orders it, when not the key that signed it.

**Causal metadata.** `prev` and `after` say what came before. `prev` is exact: the previous block of the same key.
`refs.after` is the set of other heads the author had seen (at most 16). A block's `at` may not be earlier than
anything it names in `after`. A block's **causal past** is every block reachable from it through its refs.

**The public header.** Every block has one: `{ author, seq, prev, hash }`. For a public block it is read from the
block. For a sealed block it travels beside the envelope, signed by the same key. So anyone can check a chain, its
gaps and its forks, and only the audience reads the bodies.

**Records.** A **record** is a block and every version after it: `updates` names the version it replaces, and a
record is named by its first version, so links to it survive every change.

**Shared ref keys.** The keys every type may use are in `protocol.json`: who and where (`author`, `from`, `to`,
`for_whom`, `as`, `to_owner`, `to_holder`, `to_place`, `subject`, `place`), what and which (`prev`, `after`, `kind`,
`schema`, `what`, `under`, `parent`), and the seven verbs. Any other ref key must be declared by the block's schema.

**Refusals.** A node refuses a block that: is not canonical or not signed by a live key of its author; names an
undeclared ref or field; holds a float or an integer out of bounds; exceeds the size limit; has a `seq` or `prev`
that does not fit its key's chain; or breaks a rule below. A refusal is final for those bytes.

A refusal is `{ hash, code, detail }`. `code` comes from the closed list in `protocol.json` (`refusals.codes`), one
code per rule; `detail` is free text for people, and no node reads it. A block that breaks several rules gets one
entry per rule the node found, in the list's order. The codes carry the meaning; the same code means the same rule on
every node. The list also names the reasons a fold counts a block for nothing (`refusals.codes.fold`) and a node
refuses a message (`refusals.codes.message`).

## 2. Who someone is

**A genesis** is the one block with no author: an `actor` with no `author`, `prev`, `after` or `seq`, public, signed
by its own key. Its hash is the id. Its state names `kind`, `at`, `audience`, `public_key_sign`,
`recovery_key_hash`, `recovery_reach`, and `public_key_encrypt` if the identity will receive sealed blocks (a micro
that only signs may leave it out and add one later by a key grant). A genesis with the recovery fields is a 1.6 genesis;
every genesis written now carries them.

**The recovery key** is an offline key that outranks the others. The genesis holds its hash
(`recovery_key_hash`) and how far back it may reach (`recovery_reach`, a duration). The recovery key is brought in
by the genesis: its first block has `seq` 1 and `prev` the genesis. It signs only key grants and `defeats` of a
successor's trigger.

**Keys.** Each device has its own signing key, so devices never fork one chain. A key comes in by a `grant` of kind
key: `refs.subject` the id, `state.public_key_sign` the new key. Any live key of the id may bring in a new key.
- **Rotation.** A key grant that also names `replaces` (the old key) and `last_good` (the old key's last good block)
  rotates that key: the old key's blocks after `last_good` are void. The rotation itself stands, even when it comes
  after `last_good` in the old key's chain. A key is rotated only by itself or by the recovery key; a rotation by
  the recovery key says so (`recovery_key`, its hex).
- **Void spreads.** A key brought in by a void block is void, and so is every key it brought in.
- **Conflict.** Two rotations of one key that do not see each other (crossing rotations: two at one `seq`, or on
  two branches) both stand as rotations. The key they replace speaks no further: its blocks after the lowest
  `last_good` either names are void. The keys they bring in are **frozen**: nothing they sign counts, and neither does
  any key they bring in, until a recovery rotation of the same key settles it. Then the keys brought in by a crossing
  rotation in the recovery rotation's causal past speak; the others stay frozen. Every other key of the id keeps
  speaking. Two recovery rotations that do not see each other end the identity: every block in the causal past of
  either rotation stands, and nothing after counts. A node keeps both and serves them as proof.
- **Two blocks at one `seq`.** Both verify, so a node keeps both and serves them together as proof of a lie
  (Equivocation); it refuses neither. Neither binds anyone else: in every fold but the identity fold, both count for
  nothing, and so does every later block of that key, until the recovery key rotates the key with a `last_good`
  before the pair (which voids both). In the identity fold both are the author's: if both are key grants, Conflict
  applies, whether or not they name `replaces` (the keys they bring in freeze; a pair that both rotate also ends the
  old key's speech after `last_good`).
- **An identity's keys** are every signing key brought in by a block that counts: the genesis key and each key granted
  by a key grant with `seq` that is not void. A rotated-out key stays in the list (its blocks up to `last_good` still
  speak), and so does a frozen key; a void key and the recovery key are left out. Which of them speaks for a given
  block is the rules above.
- **Recovery reach.** A recovery rotation voids only what it may reach. It cannot void a block that another identity
  built on (named in its causal past) when that later block arrived on the reader's node before the reach began
  (the recovery rotation's arrival, less `recovery_reach`). A block nobody used is void if it arrived on the reader's
  node within the reach. Months and years count as calendar months and years, in UTC. A node records each block's
  arrival when it takes it in; a block whose arrival it does not know is read as inside the reach.
- **Encryption keys.** A key grant that carries only `public_key_encrypt` changes the encryption key. It never voids
  or freezes anything.

**History is closed.** A 1.6 genesis has no history. An identity whose genesis is older, with no 1.6 block yet, has
open history until its first 1.6 block (its genesis key's block with `seq` 1: every other key comes in after it).
After it, a block without `seq` counts only if it is in the causal past of
that block, or listed in a manifest that block names (`state.manifest`, a set of hashes); every other block without
`seq` is refused. A block in the closed history counts in every fold under the rules it was written in, read
through aliases: an old membership or grant stands; an old membership still needs the member's join, read
through aliases (`confirms` reads as `answers`). A key grant without `seq` never brings in a key: a key's chain needs `seq`.
A node refuses a block without `seq` on push from an id that already has a 1.6 block unless it is in that closed
history. A reader holding neither an id's genesis nor any of its 1.6 blocks reads its history as open, and its
folds about that id as provisional until it does. An older genesis adds recovery once, by a key grant naming
`recovery_key_hash` and `recovery_reach`.

**Agents and machines.** A software agent or a machine (a robot, a vehicle, a fridge, a sensor) is an actor with its
own genesis and keys, like a person. Who answers for it is its operator: the author of its live grant of kind operator,
which names it in `refs.to`, checkable by any peer. That grant is the only place the operator is named. A machine acts only within the
grants it holds, and every block it signs for someone names the grant in `refs.under`.

**Contacts.** An actor of kind contact is someone with no keys (a cash buyer, an email sender), written by anyone as
an ordinary block. Anyone may later claim it is `same_as` a genesis; each reader decides.

**Held keys (custody).** A person who cannot or will not hold keys (a basic phone, no phone) may have an identity
whose keys a custodian they chose holds for them: a co-op, a village agent, an operator's edge, FoodOS. The genesis
or key grant names the custodian in `state.custodian`, so every reader sees the key is held by someone else and
weighs it so; a key the person holds counts for more.
- The custodian signs only on the person's own word, and names how it came in the block's grounds: `state.channel`
  (`sms`, `ussd`, `voice`, `message`, `in_person`) and `derives_from` the hash of the raw message.
- The person may take their keys at any time: a key grant to a key on their own device rotates the custodian's key
  out, and their record stays theirs.
- A custodian never acts for the person on its own judgement; that needs a grant like any agent's.

**Profile facts** (a name, a timezone) are the person's own `observe` of kind profile, not identity.

## 3. The seven types

| Mood | Type | Meaning |
|---|---|---|
| What exists | `actor` | A person, an agent, a circle, or a contact |
| | `thing` | Anything held, found or written: food, living things, tools, places, recipes, shares, vouchers, schemas |
| Is | `observe` | A claim that something is so |
| | `transform` | A thing changes: inputs become outputs, or a thing is kept and stays itself |
| | `transfer` | A thing changes owner, holder or place |
| Must | `promise` | A commitment, offered or asked |
| May | `grant` | Authority given to someone |

### Things
- **Kind and instance.** A thing is a kind (eggs, a recipe, a dish on a menu) or one of a kind (this tray), which
  names its kind with `refs.kind`. Offers and asks name kinds; transfers move instances. A thing may carry a `name`;
  an instance carries its `lot`, its `use_by` (a date) and its `pack` (an amount: "a tray of 30") as data.
- **Marks.** A thing carries its exact marks, `[{ scheme, value }]` (a barcode, a lot, an ear tag), and the words
  printed on it as read when first seen (`words`). A recall matches marks exactly.
- **Containment.** A thing can be in another (`refs.place`): eggs in a tray, the tray on a pallet, the pallet in a
  truck. What is inside moves with it until it is taken out. A thing's own `refs.place` is where it was made or
  first seen; where it is now is a fold (Folds).
- **Parts.** A transfer may move an amount of an instance (`state.amount`). The part keeps the instance's marks; the
  rest stays with the sender. A transfer with no `amount` moves the whole instance: toward a line, its `pack` in the
  line's unit, and an instance with no pack in that unit covers the line.
- **Shares.** A share (10% of a co-op's robot) is a thing, so it can be held and sold. Whole ownership is not a
  thing: it is who owns after a transfer.
- **Schemas.** A schema is a thing of kind schema. A law, a custom, a faith duty or a house rule is one too, so
  `under` can name it. Anyone may write one; equal schemas are linked with `same_as`. A schema states:
  - `target`: the type, or `type.kind`, it is for;
  - `fields`: each field's name and field type (the field types are in `protocol.json`);
  - `roles`: the ref keys it declares beyond the shared ones;
  - `grounds`: the real event without which a block of this kind is a lie (`event`), which types or roles
    confirm or defeat it (`confirms`, `defeats`), and who can confirm them (`confirmers`, a list of ids or
    `circle#role`). Readers do the weighing.

  Until the base schemas are published, the fields this document names are the base, listed per type in
  `protocol.json`.

### Transforms and keeps
- **A make** names its inputs in `refs.derives_from`, each with its share if it matters (`state.shares`:
  `[{ from, share }]`, eggs from two farms 60 / 40). Its outputs are things that name it in `derives_from`. A
  transform consumes its inputs. With no output, it ends them (eaten, thrown out).
- **A keep** (hold, freeze, cure, clean, repair, shear) names the thing in `refs.subject` and consumes nothing.
  Anyone holding a thing can write a keep about it. A thing's state is the fold of what is written about it.
- Inputs held by others count once each holder's own block `answers` the transform.
- First possession (wild food, a catch) is a transform with no inputs; its author is the first owner.
- **Work** done is the worker's own block, signed by them (`as` the business if for one): a `transform` if a thing
  changed, otherwise an `observe` of kind work. It stands without anyone else's signature; the other side's
  `confirms` adds weight, and its `defeats` opens a dispute.

### Transfers
- A transfer names what changed: `refs.to_owner`, `refs.to_holder`, `refs.to_place` (any subset), and `refs.what`.
  Selling moves the owner; lending moves the holder; moving stock moves the place.
- **Open receivers.** A transfer to someone unnamed (a langar, a cash stall) leaves `to_owner` out and says how many
  received (`state.count`).
- **Money** moves by transfer like anything else: `refs.to_owner`, `refs.for`, `state.money`, and `state.marks` (the
  payment rail's reference). A refund is the same, the other way. A payment `for` several promises says how much goes
  to each (`state.split`: `[{ for, line, money }]`). A failed attempt (a declined card) is an `observe`, never a
  transfer.

## 4. The seven verbs

How a block relates to others. A closed set.

| Verb | Meaning |
|---|---|
| `updates` | A new version of the author's own record (names the version it replaces). A circle's record is updated by a member holding the role, signing `as` the circle; anyone else's update starts a new record. |
| `answers` | Consent: an answer (accepted, declined, stopped) or a counter-offer, to a promise, a grant or a transfer. **The only consent verb.** |
| `confirms` | Says another block is true, with a confidence. **Only about truth.** It names one version, never a later one. |
| `defeats` | Says another block is false. **Only about truth.** Also one version. |
| `for` | What this serves, always a block: a payment for an order, the flour for the cake, a counter-offer for its deal. |
| `derives_from` | What this was made or worked out from. |
| `same_as` | A claim that two records are one, with a confidence. Each reader decides. |

`prev` and `after` are causal metadata, not verbs.

## 5. Truth

- An `observe` with no `derives_from` is direct sensing; with it, an interpretation.
- `confidence` is the author's stated probability. Whether an author is well calibrated is worked out by readers
  from confirms and defeats over time, never written.
- Large content (a raw sensor stream, an export file) is linked by its hash. A stream is linked by its Merkle root,
  so one reading can be proved without sending the rest.
- An `observe` says what is so in `state.text`, or in fields its schema declares. A reading carries its `amount`, and
  may add its `accuracy` and `coverage`.
- A reading names the sensor it came from, a thing, in `refs.from`. A physical act (a delivery, a cook, a
  door opened) carries its grounds: the readings, a camera frame's hash, the door sensor's observe, linked by hash,
  so a stranger can weigh a machine's claim.
- What counts as evidence for a kind of block is its schema's grounds. There is no global score; each reader weighs.

## 6. Promises

A promise moves a noun from one side to the other.

**Where fields live.** Sides and what moves are in `refs`; `terms`, `what` (a description) and `not` are in `state`.

**Sides.** `refs.from` gives; `refs.to` receives. Either may be left out, which leaves it open: an offer open to
anyone, or a want (an ask with `from` open, so offers can answer it). A promise signed by `from` is an offer; signed
by `to`, an ask. What comes back (money, goods or nothing) flows the other way and is read from the transfers.
- **Bearer.** `refs.to` may name a thing (a ticket, a voucher, a share): whoever owns it at settlement receives.
- **Who it is for.** `refs.for_whom`: a person, a circle, or open (paid-forward food), written as a commitment. It
  reaches the other side only when it changes their work, and only as much as they need (`terms.needs`).
- **To yourself.** A promise whose `refs.from` and `refs.to` both name its author is accepted when made.
- **Only a side signs.** A promise is signed only by its own side. What someone without a key said they would do is
  the receiver's own `observe` (kind message, then a reading of it), never a promise; "they promised me" is that
  observe.

**What moves** is `refs.what`: a thing (a kind in an offer or ask, an instance once known), a share, a record, or a
circle (a business sold with its followers). Time and a job are not things: `state.what` describes them under a
schema, and `terms.quantity` says how much.

**The deal** is named by its first promise. Every later block in it (counter-offers, answers, transfers, work) names
that first promise in `refs.for`, so two nodes never split one deal into two.

**Terms:** `{ price, quantity, lines, pay_by, deliver_by, until, repeat, condition, expires, if_wrong, settled_by,
needs, text }`.
- `price` is money, money per unit (`{ money, per }`, `per` an amount: "3 a dozen"), or a share of something measured
  (`{ share, of }`: `share` a decimal string, `of` a schema saying what is measured: "6% of takings"). Under a
  per-unit price, `quantity` may be a range `{ min, max }`, and the answer's `terms.quantity` names the quantity chosen.
  A per-unit total is `money.minor` times the quantity over `per`, rounded to the nearest minor unit, halves up.
- `lines`: one order with many lines, `[{ id, what, quantity, price }]`, accepted at once. Each line has an `id`,
  unique in the promise, and blocks for one line name it (`state.line`). `refs.what` equals the set of the lines'
  `what`. With `lines`, there is no top-level `price` or `quantity`.
- `until` is a return or end date; `expires` ends an unanswered offer or ask (every ask carries one).
- `repeat` is an RFC 5545 RRULE value (`FREQ=WEEKLY;BYDAY=FR`), counted from the start of `state.when`. An
  occurrence is named by its start time.
- `condition` and `if_wrong` are data under a schema: what must be true, and what settles if it goes wrong (a
  refund, a deposit kept). `settled_by` names who settles a dispute.
- `needs`: what the work must meet (an allergen, a temperature), from a schema, never a name.
- `text` names a plain-language terms document by its hash, so a court can read what both agreed.
- **Must-not.** `state.not: true` makes the promise a promise not to do the step (an exclusive territory).

**Answers.** The other side's own block `answers` a promise. An answer has the type of the block it answers, names
the deal in `for` when it is in one, and carries `state.status`; the type's other required fields do not apply to it. The status is
one of three:
- `accepted`: binds.
- `declined`: ends it.
- `stopped`, with `state.stop` saying how far: `before` (before acceptance: a withdrawal), `onward` (from this block
  on: leaving a job), or `{ occurrences: [start times] }` (named occurrences of a standing promise: a paused veg box).

A promise or grant itself carries no status: offered or asked is read from who signed it. The author stops their own
promise by an `updates` with `stopped`; the other side stops it by an `answers`. A new promise that `answers` one,
with no status, is a counter-offer.

**Who may bind.**
- A one-to-one offer binds on the other side's accept, with no allocation.
- An offer with an open side, limited in quantity or not, binds only through the offerer's allocation: its own
  `accepted` answer to an accept, signed by the deal's sequencer. An accept to such an offer is a request.
- The quantity accepted is named in the answer's `terms.quantity`; on an open offer, the offerer's allocation names
  what binds.
- A counter ends an offer only between those two. Only the author ends an open offer. Two counters that cross both
  stand.
- An accept beats a withdrawal unless the withdrawal is in the accept's causal past. An accept that reaches the
  offerer after `expires`, on the offerer's own clock, does not bind; the offerer answers it `declined`.

**Settling.** A promise settles by folding the counted blocks made `for` it: transfers, a transform (the dinners
cooked), or the worker's own work. A giver's transfer counts when it moves ownership (Folds, Sequencer): to a named
receiver, once the receiver answers it `accepted`; to an open receiver, on the sequencer's signature. Any other
counted block is one the receiver answers `accepted`, or one a confirmer the schema's grounds name confirms. A promise is never marked delivered by itself, so a
deed is said once. A return in goods is a second promise `for` the first.

**Claims.** A claim is an ask by the receiving side `for` a past block when nothing was promised first (a usage fee,
a tax). An unanswered claim or ask binds no one and is never a debt in any fold. An `under` naming a law counts only
for readers who trust that law's author.

**Disputes** end one of two ways: the sides counter until both accept, or the party named in `settled_by` signs a
ruling, and readers check the signer. Someone not named in advance can only propose.

**Many parties.** A promise is between two sides. A group buy is the circle's promise to the seller, plus each
member's promise to the circle.

## 7. Authority

A `grant` gives authority. Every reader can check it.
- `refs.to`: who receives it. Left out, it is open, like an open offer (a public licence).
- `state.scope`: `{ acts, parties, limit, per, until, notice, condition }`, data, never prose. `acts` lists the block
  types or `type.kind` names the grant covers. Names are matched, not checked: one that is neither covers nothing.
- `refs.under`: every block signed under a grant names it. A reader checks the signer, the scope, and that the grant
  is live, and only when the block binds them.
- `refs.parent`: the grant this one comes from. `state.depth`: how many more times it may be passed on. A
  grant with no `depth` cannot be passed on (`depth` 0).
- A grant others act under carries `scope.until`; key, member, successor and operator grants do not.
- A grant is live from when it is signed; it carries no status. The author ends it by an `updates` with `stopped`;
  the receiver may decline or leave by an `answers`.

**Scope subset rules.** A child's scope is a subset of its parent's on every field:
- `acts` and `parties`: sets; the child's is a subset. A missing field means "all", so a child may omit a field only
  if its parent does.
- `limit` and `per`: the child's limit is no larger, over a period no longer.
- `until`: no later. `depth`: smaller by at least one. `notice`: no shorter.
- Durations (`per`, `notice`) are compared by adding both to the same instant, the parent grant's `at`: arithmetic,
  never authority by clock.
- `condition`: the child keeps every condition of its parent and may add more.
- A grant is live only while every ancestor is live.

**The limit is the principal's fence.** The other side sees the visible scope: that the agent may bind you, with
them, until a time. The money limit stays on the principal's node, sealed to the agent. The visible scope binds the
other side; an act over the limit but inside the visible scope still binds the principal, as with a stolen card.

**Withdrawal.** A withdrawal binds a counterparty once it is in the causal past of the counterparty's block, or has
arrived on its node. A counterparty binding a large amount first asks for the grantor's heads and names them in
`after`, so what it had seen can be checked. `until` caps the damage while someone is offline.

**Machines deal with machines.** When both sides act under live grants whose scopes allow the deal, it binds and
settles with no person in the loop, by the same rules as any other.

**Stopping.** A grant's withdrawal and its `until` are how authority ends, for a machine as for anyone. Before a
physical act that cannot be undone (cutting, dispensing, driving off, releasing a load), a peer checks that every
grant it acts under is still live against the grantor's latest head it holds. A peer honours a stop the moment it arrives.

**Kinds the protocol reads:** `key`, `member`, `successor`, `operator` (the list is in `protocol.json`). Every other kind (follow,
holder, voice, body, licence, access) is data whose meaning is its scope.
- `key`: Who someone is.
- `member`: Circles.
- `operator`: who answers for an agent or a machine (Who someone is). `refs.to` is the agent.
- `successor`: who may act for a person after an event (death, incapacity, closure). `refs.to` is the successor.
  `state.witnesses` names who may record the event, `state.needed` how many must, `state.wait` how long the trigger
  waits (a duration), and `state.keys` holds the person's decryption keys sealed to the successor. Never signing
  keys. The trigger events are observes that name the successor grant in `refs.under`.
  The trigger waits `wait` after the needed witnesses' observes, measured by their arrival on the reader's own node; in
  that time any live key of the person, or the
  recovery key, stops it by `defeats` of an event observe. The successor then signs as themselves, `under` the grant, and reads only what the person could read
  and was free to pass on. The successor closes the person's chain with their own block: an `observe` of kind close,
  `refs.subject` the person.

## 8. Circles

A **circle** is an `actor` of kind circle, written by its founder as an ordinary block. Its id is that block's hash.
- **Membership** is a `grant` of kind member: `refs.subject` the circle, `refs.to` the member (or left out, for an
  open group anyone may join), `refs.as` the circle, `state.roles` the roles it gives. It is signed by an admin. It
  counts once the member's own `answers` accepts it.
- **Roles.** A role is a word. The protocol reads one: `admin`. The founder is the first admin. An admin gives roles by
  a member grant, and changes them by an `updates` of it: a role added counts once the member answers, a role taken
  away counts at once. `circle#role` (the circle's id, `#`, the role) names the role's holders.
- **Signing for a circle.** A member names the circle with `refs.as`, and must hold, in the circle's fold at that
  block, a role listed in the circle actor's `state.signers` (default `[admin]`).
- **Leaving and removal.** A member leaves by an `answers` with `stopped`. An admin removes a member by an `updates`
  of their grant with `stopped`, naming the member's last counted block (`last_counted`); the member's blocks after
  it carry no authority for the circle.
- **Removed.** A member is removed when a grant they had accepted has ended (their own `stopped` or `declined`
  answer, or an admin's `stopped` update) and no newer grant has brought them back in. The fold keeps the
  `last_counted` the stop named (null if none). An invitation stopped before it is answered removes no one.
- **Removing an admin** follows the circle's own rule, `state.removal: { needed: N }` on the circle actor: N other
  admins must agree (default 1). When two removals cross,
  the admin whose admin grant is earlier in the circle's causal order (in the other's causal past) wins; the founder
  above all. If neither is
  earlier, both removals stand.
- **The circle's key** is an encryption key in its actor (`state.public_key_encrypt`). It changes by epoch: an admin's
  key grant signed `as` the circle, with `state.epoch` one higher, holding the new private key sealed to each member in `state.keys`. Epoch n names
  epoch n−1 in `after`: a rekey of epoch n counts only if its signer holds `admin` in the fold of its causal past and
  its `after` names a counted rekey of epoch n−1 (epoch 0 is the circle actor itself). One
  rekey covers every leave since the last. Two rekeys in one epoch both open; the next settles. Sharing old history
  with newcomers is a separate decision.
- **Shared records.** A pot, a vote or an auction is a record many write to. It names its rule in `refs.under` (a
  schema). Blocks fold in causal order under the rule; the record's sequencer orders what the rule leaves tied.
- **A secret ballot.** A vote's rule may name a counter. Each vote is sealed to the counter alone and carries the
  choice as a commitment. The named counter signs the result, listing the commitments counted in `state.counted`, so
  each voter can check theirs was counted.

## 9. Privacy

**The commitment** is the one privacy primitive: a salted hash (SHA-256 of the salt's hex followed by the value, as
UTF-8). The salt, or the salt and the value, travels beside the block only to whoever it is for, in their own copy
(`reveals`). A salt is fresh per block per recipient, never reused. Every private value uses it:
- **Audience.** One commitment per recipient, sorted, so recipients do not see each other. A recipient finds itself
  by hashing its salt with its own id. A recipient may be a person, a circle, or `circle#role`. The audience is fixed
  when written: a circle means its members then (Folds). Anyone the block is about (`refs.subject`), and whoever did
  the work, is always in it.
- **Personal fields.** A value may sit in signed content as a commitment. Erasing deletes the value and the salt; the
  block still verifies. An `observe` of kind erase asks honest nodes to do so.
- **For whom.** `refs.for_whom` is a commitment. Being `for_whom` shows you nothing until something reaches you, so a
  surprise gift stays a surprise.
- **Customers in business blocks.** In a block signed `as` a business, a customer side is a commitment. A worker's
  chain shows how many, never who.
- **Ballots.** A vote's choice (Circles).

**Sealing.** A private block's body is encrypted to its audience (Encoding). The envelope names no recipient: each
recipient tries the entries. The node that serves a sealed copy knows who it is for; nobody else does. A block cannot
be unsent; a node stops serving older versions once a newer one narrows the audience.

## 10. Between nodes

Anyone can leave a node with everything they signed. Two messages: Pull and Push. Byte layouts are in Encoding.

**Offline first.** Peers often meet with no platform and no internet. Signing, chains, the write check and folds
work fully offline; blocks sync by Pull and Push whenever two peers meet, over any link.

**Pull.** A node asks for the blocks it may see since a point.
- `since` is the responder's arrival number (exclusive; 0 from the start), never `at`. A node numbers each block it
  takes in 1, 2, 3 and never reuses a number.
- `filter` matches exactly on `type` (read through aliases), `kind`, `author`, `hash`, `record` (a record's first
  hash: every version) and `refs` (`{ key: hash }`). Keys AND together.
- `heads: true` returns only the heads among the matches: those no other match names by `prev` or `updates`.
- `limit` is the asker's wish; the responder caps it.
- The answer is the matches in arrival order, each with its arrival number, and `next`, where to go on.
- An unsigned pull gets public blocks and the public headers of sealed ones. A signed pull also gets the copies
  sealed to the asker. It names the asker, the node it is for, a fresh `nonce` and `at`; the node refuses an `at`
  more than 5 minutes from its own clock, either way (`limits.signed_window`, `PT5M`), and a nonce it has seen; it
  remembers each nonce at least that long. A signed push is checked the same way.

**Push.** A node sends signed blocks; a sealed copy may say which of the receiving node's people it is for. A push
may be signed like a pull (`pusher`, `node`, `nonce`, `at`, `signature`).
- A block whose `prev` is not held waits. Waiting blocks count against admission and expire after a time the node
  sets. A node asks for the missing block only from the signer of a signed push; an unsigned push's waiting blocks
  are never fetched, only kept until they expire.
- Other refs to blocks not held are fetched when a reader needs them; they never hold a block back.
- A block without `seq` is taken in only as history (Who someone is): its hash and signature are checked and its shape
  is read through aliases.
- The answer says which blocks were taken, which wait, which were refused (each `{ hash, code, detail }`, A block),
  and which pairs prove an equivocation. `equivocations` is always present, an empty list when there are none; each
  pair is sorted as text. The block of a pair that arrives second is neither taken nor refused: it is listed in its
  pair, and the node keeps both blocks and serves them together.

**Signed answers.** A node signs every answer with any live signing key of its holder (a person or a machine), the
genesis key or one brought in by a key grant; discovery's `node` is the holder's id. There is no separate node actor.
Two signed answers that give different blocks for one arrival number prove a lie.

**Admission.** Each node admits by its owner's published rule, a block whose hash discovery names: an `observe` of
kind admission whose state is `{ parties, per_stranger, deposit }` (the ids always admitted, how many blocks a day
from anyone else, and the money held for an ask that needs a person; each optional). A node may refuse
any push. No platform decides.

**Discovery.** A node publishes `.well-known/foodblock`: `{ protocol: "foodblock", version, node, holds, speaks_for,
admission, endpoints: { pull, push } }`. Nodes are found the way email addresses are: given directly, listed in any
directory, or followed from a ref. Nearby, a node may answer the same document on a local network (mDNS / DNS-SD)
or announce it over a short-range link. On mDNS / DNS-SD the service type is `_foodblock._tcp`, with TXT records `version`, `node` and `path`
(`/.well-known/foodblock`). A local announcement is `{ protocol: "foodblock", version, node, endpoints }`;
the full document is fetched from it. None is required; a node with no peers is still valid.

**Equivocation.** Two blocks with one signing key and one `seq`, two binding blocks for one record that do not see
each other, or two recovery rotations that cross: a node keeps both and serves them with the chain, so anyone may
publish the proof.

**Finding.** A pull with a filter returns every match, unranked. Ranking happens only in the reader's node. Any node
may be an index, and a reader can check that an index left nothing out against public headers, `seq` gaps and
heads. So nobody can be paid to rank.

## 11. Folds

A **fold** reads a set of blocks into one answer. Every node computes the same answer from the same blocks. Until
every block has arrived, a fold is a view; only the sequencer's own blocks trigger acts in the world.

**Sequencer.** A record's sequencer is the key that signed its first block, or the key its `state.sequencer` names.
Its binding blocks (an offer's allocations) must each have the one before in their causal past. An instance's
ownership is sequenced by its owner: a transfer of ownership counts only if signed by the owner the previous counted
transfer named (or the maker, for the first), with that transfer in its causal past.
A transfer to a named receiver moves ownership, and holding, when the receiver answers it `accepted`; until then it
stays with the giver. A transfer to an open receiver (a `count`) moves on the sequencer's signature.

**A promise's stage.** Input: the first promise P and every block naming P in `for`, or answering a block in the deal.
1. Keep only blocks signed by a side, or by an agent under that side's live grant. A side is P's `from` or `to`; an
   open side is filled by whoever's accept binds.
2. The live offer is P, or the latest counter between the same two sides.
3. If the author stopped it `before` and no accept binds over the stop (an accept binds unless the stop is in its
   causal past): **stopped**.
4. If the other side answered `declined`: **declined**.
5. If no binding accept exists: **offered** (signed by `from`) or **asked** (signed by `to`); **expired** once the
   reader's clock passes `expires` (a view; the offerer's clock binds).
6. A binding accept (Promises, Who may bind): **accepted**.
7. Counted blocks `for` it (Settling): **underway**.
8. **Done** when counted blocks cover the terms: for each line (or the whole), counted transfers move at least the
   quantity accepted of `what` to the `to` side, and counted money transfers to the `from` side total at least the
   price. A job is done when the receiving side `answers` the worker's work block `accepted`; time, when accepted
   work blocks cover `terms.quantity`. A standing promise is done occurrence by occurrence; an occurrence named in a
   `stop` is stopped.
9. An answer `stopped` with `onward`: **stopped** from that block.
10. **Reversed** when a done promise has counted transfers back `for` it covering what was paid.

**Circle membership and roles.** Input: the circle C and every member grant with `refs.subject` C, in causal order.
1. The founder holds `admin`.
2. A member grant counts if signed `as` C by a key of someone holding `admin` in the fold of its causal past.
3. A member holds the grant's roles once their own `answers` accepts it; roles added later count once answered, roles
   taken away count at once.
4. A grant ends at the member's `stopped` answer, or an admin's `stopped` update; the member's blocks after
   `last_counted` carry no authority for C. An invitation an admin stops before it is answered ends: a later answer
   accepts nothing. A stopped grant stays stopped; a new grant is needed to rejoin, and a stop of an old grant never
   ends a newer one.
5. Crossing removals of admins resolve by Circles; no step reads `at` or a hash order.

**Audience members then.** A circle in a block's audience means the members in the fold of the circle's grants
within that block's causal past. A role means its holders there. So an author who wants new members in names the
circle's head in `after`.

**Where a thing is now.** Its place is the `to_place` of its latest counted transfer signed by its owner, or by a
holder the owner named in a transfer `to_holder`, else its own `refs.place`. If
that place is a thing, the thing is wherever that place is, found the same way (stop at a repeat). If two moves do not
see each other, both places are the answer.

**Who owns an instance.** The `to_owner` of its last counted ownership transfer (Sequencer), else its maker.

**Equivocations in folds.** The two blocks of a pair (two at one `seq`, two binding blocks of one record that do not
see each other, two ownership transfers that cross) count for nothing in any fold, except as Who someone is says for
the identity fold. A fold that meets a pair names it (`forks` in a promise, `conflict` in ownership) and counts only
what came before it. Two moves of a thing that cross are not a lie: both places are the answer.

**What each fold returns.** Every node returns these names, so readers share one API; `protocol.json` (`folds`)
lists them. Ids and hashes are hex, and a list of them is sorted as text unless it says otherwise. A quantity a fold
counts is a number in the line's unit (fold output, not signed content). A field that does not apply is null, or an
empty list.
- **identity** (an id): `signed_by_author` (for each block: true when it is the id's, signed by a key that speaks for
  it, or a key grant the recovery key signed), `keys` (the identity's keys, Who someone is), `frozen` (those
  frozen), `operators` (the authors of live operator grants naming it), `history` (`none` for a 1.6 genesis, `open`
  or `closed`).
- **promise_stage** (a first promise): `stage` (`offered`, `asked`, `expired`, `declined`, `stopped`, `accepted`,
  `underway`, `done`, `reversed`); `stop` (`before` or `onward`, when stopped) and `from` (the onward stop's hash);
  `offer` (the live offer); `accept` (the binding accept: the promise itself when made to oneself, the first
  allocation on an open offer); `sides` (`{ from, to }`); `quantity` (the quantity chosen); `takers` (on an open
  offer, `[{ who, request, allocation, quantity }]` in causal order); `forks` (allocations that do not see the one
  before: proof, not counted); `lines` (`[{ id, needed, moved }]`, `id` null for a promise without lines, `moved`
  capped at `needed` when a whole instance covers the line); `total` (money the price comes to, or null); `paid`
  (money counted to the `from` side, or null); `stopped` (the occurrence start times stopped).
- **circle_state** (a circle): `founder`; `members` (`{ id: { roles, grant, last_counted } }`, `grant` the member
  grant that put them in, or the circle for the founder); `removed` (`{ id: last_counted }`, Circles).
- **may_act_as** (a block, a circle, a role or none): true when the block's author holds, in the circle's fold of
  the block's causal past, that role, or with none a role in the circle's `signers`.
- **members_then** (a block, a circle or `circle#role`): the member (or holder) ids, Audience members then.
- **where_now** (a thing): the places, a list; empty when no place is known, two or more when moves cross.
- **ownership** (an instance): `owner` (an id, or null after a transfer to an open receiver); `transfers` (the
  counted ownership transfers, in order); `conflict` (the crossing pair, or null; `owner` is then the owner before
  them).
- **successor_state** (a successor grant, arrivals, the reader's clock): `events` (the standing event observes, one
  per witness), `cancelled` (those the person defeated in time), `since` (the arrival of the needed-th event),
  `fires` (`since` plus `wait`, or null), `fired` (true once the clock reaches `fires`).
- **circle_key** (a circle): `epoch` (0 is the key in the circle's actor), `keys` (the encryption keys of the epoch's
  counted rekeys: two or more while an epoch is split), `grants` (their hashes).
- **counted_in** (a ballot result, a commitment, the named counter): true when the result is signed by that counter
  and lists the commitment in `counted`.

## 12. What never becomes a block

Only signed blocks cross between nodes. Drafts, goals, limits, budgets, private rules, rankings and what a person
loves stay on their node; a link to a private goal is removed before a block goes out.

The protocol depends on no one transport; email, messaging and links are envelopes (transport.md, which names
`state.dkim`).

## 13. Encoding

**Bytes.**
- A hash is 64 lowercase hex characters, everywhere.
- A signing key is Ed25519, its SPKI DER bytes in lowercase hex (88 characters, starting
  `302a300506032b6570032100`). A signature is the 64-byte Ed25519 signature, lowercase hex.
- An encryption key is X25519, its raw 32 bytes in lowercase hex.
- A salt or a nonce is 16 random bytes in lowercase hex.
- A time is UTC ISO 8601 with milliseconds, exactly `YYYY-MM-DDTHH:MM:SS.sssZ`, so times compare as text. A date is
  `YYYY-MM-DD`. A time or date must be a real calendar instant (no 30 February). A duration is ISO 8601 (`P30D`) and names at
least one unit; its pattern in `protocol.json` uses no lookahead, so every regex engine can run it. The time fields and the date fields (`use_by`) are in `protocol.json` (`time_fields`, `date_fields`); they are checked in top-level `state`, `terms`, `scope` and each line.
- `recovery_key_hash` is SHA-256 of the recovery key's SPKI hex, as UTF-8 text.

**Canonical form.** canonical.md. The id is SHA-256 of the canonical UTF-8 string of `{ type, state, refs }`, nulls omitted,
inside arrays too; the
author signs the same bytes with Ed25519. The reader recomputes the hash and never trusts a sent one.

**Numbers.** Signed content holds no floats. A plain number is an integer from -(2^53 - 1) to 2^53 - 1 (`seq`, a
count). Anything with a fraction is a decimal string matching `-?(0|[1-9][0-9]*)(\.[0-9]+)?`. Shapes are recognised
by their keys wherever they sit in `state`:
- an amount is `{ value, unit }`, the value a decimal string, the unit from UCUM or a pack the thing defines;
- money is `{ minor, currency }`, an integer in the currency's ISO 4217 minor units;
- a confidence is a decimal string from 0 to 1.

**Limits.** A block's canonical body is at most 65,536 bytes; larger content is linked by its hash. `after` names at
most 16 heads. A sealed copy is checked once opened: a block inside over the limit is refused (`size_limit`).

**Messages.** A message is UTF-8 JSON. Where a message part is signed, the signature covers its canonical JSON (the
canonical.md rules) without the `signature` key, by an Ed25519 key of the named signer.
- **A public block:** `{ version, block, signature }`. `version` is `"1.6"`.
- **A sealed block:** `{ version, header, header_signature, envelope }`. `header` is `{ author, seq, prev, hash }`;
  `header_signature` is by the key that signed the block. A reader outside the audience gets it without `envelope`.
- **The plaintext of an envelope:** `{ version, block, signature, reveals }`, `reveals` being `[{ salt, value }]`,
  the openings for this recipient only (its audience salt, with `value` its own id; a personal field's salt and
  value). A copy with reveals is sealed to one recipient; one envelope holds several only when they share every
  reveal (the members of one circle).
- **Pull request:** `{ since, limit, filter, heads }`; signed, it adds `asker`, `node`, `nonce`, `at` and
  `signature`.
- **Pull answer:** `{ node, request, blocks: [{ n, message }], next, signature }`, `request` the SHA-256 of the
  canonical signed request message, `n` the arrival number.
- **Push request:** `{ messages, for }` (signed, it adds `pusher`, `node`, `nonce`, `at` and `signature`), `for` optional (`{ hash: id }`, which of the node's people a sealed copy is
  for).
- **Push answer:** `{ node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]],
  signature }`. Every key is always present; an empty list is written `[]`.

**Envelope.** The plaintext is encrypted with AES-256-GCM under a random 32-byte content key and a 12-byte nonce, with
no additional data. A fresh X25519 key per envelope agrees a secret with each recipient's key. HKDF-SHA256 turns the
secret into a 32-byte key, salted with the ephemeral public key's bytes followed by the recipient's, with info
`foodblock envelope key` (UTF-8); that key seals the content key with AES-256-GCM and its own 12-byte nonce.
- The envelope is `{ alg, ephemeral_key, nonce, ciphertext, recipients: [{ encrypted_key }] }`. `ephemeral_key` is
  hex; `nonce` and `ciphertext` (its 16-byte tag at the end) are base64; `encrypted_key` is base64 of the sealed key,
  its tag, then its nonce.
- New envelopes say `alg: "x25519-hkdf-sha256-aes-256-gcm"`. Readers also open `x25519-aes-256-gcm`, where the secret
  was the key, and ignore a `key_hash` in older envelopes.

**Aliases.** `aliases.json` reads older shapes, in the order given in `protocol.json`: type names first (per-type rows, then
every-type rows, `*`), then the shape rules for the new type and kind in listed order (each `when` tested on the block as read so far), then the
shared ref renames, then `outside`. Reading never changes a block or its hash.
- A type name with no row, written `base.rest`, where `base` is a 1.6 type or a type row that is not retired, reads
  as `base` reads, with `state.kind` set to `rest` (all after the first dot) unless the block already has a
  `state.kind`: `observe.whatever` reads as type `observe`, kind `whatever` (`aliases.json`, `types_dotted`). A type
  row's `kind` likewise never overwrites a `state.kind` the block has.
- A reading is `{ hash, type, state, refs }`, the hash unchanged, plus the reader's marks only when they apply:
  `settles` (the hash the block settles), `outside` (`{ ref: name }` for an open side named outside), `retired`
  (true: no longer protocol; `outside` in the type row says where it went).

**Three profiles: micro, edge, node.** One protocol, three sizes of peer, by what they do (not separate products):
- **Micro**, the device (a soil or fridge sensor, a scale, an oven, a robot's body): connects, measures, signs,
  buffers and sends. It needs the canonical form, SHA-256, Ed25519, the write check, its own chain, and the vectors
  for these. A micro that acts in the world adds the grant check and obeys a stop on arrival.
- **Edge**, the local operator (the computer at a farm, in a kitchen, a vehicle or a shop): adds local discovery, Pull and Push with the
  peers near it, the promise fold for its own deals, and keeps working offline. It reads devices that cannot sign
  (an old sensor on a radio link), signs what it read as its own observe, the device named as a thing in
  `refs.from`, so a stranger weighs the edge's word, not the device's.
- **Node**, the persistent level, held by a person or a machine: adds envelopes and
  commitments, serving Pull and Push to anyone, signed answers, internet discovery, and the folds for every record
  it holds. A node may also be an **index** (it serves others' public records and every fold).
Only people and machines hold nodes. A business, a household, a regulator or a community is a circle of them
(§8): it has an id and a record, kept by its members' nodes, never a node of its own. A peer may run any profile;
a phone or a robot may run all three. `protocol.json` names the outputs of the chain helpers (`next_link`, `chain`) and the
keypair shapes SDKs and vectors use, so every SDK returns the same fields.

**Conformance.** A node conforms only when it reproduces the vectors for what it does in `spec/vectors.json` exactly: canonical strings, hashes,
signatures, commitments, envelopes, and how identities, deals and circles read. Fold vectors (with expected stages),
refusal vectors (blocks every node must refuse, with the codes a strict check finds) and alias reads are owed.
Every 1.6 block in a vector's stories, outside the refusal cases and the draft-words hashes, passes the write check. A
node finds a block's signing key from the identity fold, never from a vector's signer name. A stranger can build a node from this
document, `protocol.json`, `aliases.json` and the vectors alone.

## Glossary

- **Causal past:** every block reachable from a block through its refs.
- **Circle#role:** the holders of a role in a circle, named by the circle's id, `#`, the role.
- **Commitment:** a salted hash; its salt or value travels only to whoever it is for.
- **Counted:** a block a fold accepts as settling (answered by the receiver, signed by the sequencer for an open
  receiver, or confirmed under the grounds).
- **Fold:** reading a set of blocks into one answer by a fixed rule.
- **Grounds:** the real event a kind of block depends on, stated in its schema.
- **Head:** the latest block of a chain or record.
- **Node:** the software that holds a person's blocks and speaks for them.
- **Record:** a block and every version after it, named by the first.
- **Sealed:** encrypted to an audience. **Signed:** carrying its author's signature. Every block is signed.
- **Sequencer:** the one key whose blocks order a record.
- **Side:** `from` or `to` of a promise.

## Open questions

- **Ranking.** How a person's node should weigh closeness (a friend's bakery against a stranger's equal one). Each
  node decides; the protocol only guarantees ranking happens there.
- **Arrival for a newcomer.** A node that takes in a whole history at once sees everything arrive now, which moves
  recovery reach. How it inherits arrival from the node it syncs from.
- **Part of an instance in a transform.** A transfer can move part of an instance; how a transform names the amount
  of an input it uses (200 g from a 1 kg bag) is not yet said.
- **Recall through sealed blocks.** Public headers show the chain but not the content, so a recall travels by asking
  each holder, who answers for the blocks they hold.

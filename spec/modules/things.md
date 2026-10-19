# Things, transforms, transfers and truth

What the types hold, in detail. The types and verbs are in core.md.

## Things
- **Kind and instance.** A thing is a kind (eggs, a recipe) or one of a kind (this tray). An instance names its kind with `refs.of`. Offers and asks name kinds; transfers move instances. A thing may carry a `name`; an instance carries its `lot`, its `use_by` (a date) and its `pack` (an amount) as data.
- **Marks.** A thing carries its exact marks, `[{ scheme, value }]` (a lot code, a barcode, a phone number), and the words printed on it as read when first seen (`words`). A recall matches marks exactly.
- **Containment.** A thing can be in another (`refs.place`), and what is inside moves with it until taken out. Its own `refs.place` is where it was made or first seen. Where it is now is a fold (folds.md).
- **Parts.** A transfer may move an amount of an instance (`state.amount`). The part keeps the instance's marks; the rest stays with the sender. A transfer with no `amount` moves the whole instance. Toward a promise line, that means its `pack` in the line's unit, and an instance with no pack in that unit covers the line.
- **Shares.** A share is a thing, so it can be held and sold. Whole ownership is not a thing: it is who owns after a transfer. Shares or stock a member makes `as` a circle are the circle's own (folds.md, Ownership).
- **Schemas.** A schema is a thing of kind `schema`. A law, a custom, a faith duty or a house rule is one too, so `under` can name it. Anyone may write one; equal schemas are linked with `same_as`. A `refs.under` that names a law counts only for readers who trust that law's author. A schema states:
  - `target`: the type, or `type.kind`, it is for;
  - `fields`: each field's name, with a short hint of its value (`text`, `integer`, `money`...); nothing checks the hint, the name is what declares the field;
  - `roles`: the ref keys it declares beyond the shared ones;
  - `grounds`: the real event without which a block of this kind is a lie (`event`), which types or roles confirm or defeat it (`confirms`, `defeats`), and who can confirm them (`confirmers`, a list of ids or `circle#role`). Readers do the weighing;
  - `undo`: `never` when the act cannot be taken back, `ok` when it can; every schema for an act that moves things or binds someone says which (authority.md, Acts that can be undone). An act whose schema is silent, untrusted or not named is treated as irreversible;
  - `labels`: names for its fields and values in each language, `{ lang: { name: label } }`. Words people read live here, never in the protocol.

  **The base schemas** are published in `spec/schemas/` (`schemas.json` is their source, `published.json` the signed things, with stable ids). They describe, as data, what the protocol reads of its own kinds and what the open types carry: `thing`, `schema`, `make` and `observation` (the fields of the open types), `admission`, `limit`, `consent`, `reading`, `work`, `attestation`, `share_vote`, `kept_promises`, `person_confirmed`, `sensor_confirmed`, `teach`, `loan` and `payout`. Nothing is refused for lacking one: an open type carries what it likes, and a closed type carries the fields of `protocol.json` (`fields`) and of the schema it names. The publisher is a convention for finding them, not an authority: a reader trusts a schema by the rules of authority.md.

## Transforms and keeps
- **A make** is a `transform` that names its inputs in `refs.derives_from`, each with its share if it matters (`state.shares`: `[{ from, share }]`). Its outputs are things that name it in `derives_from`. A transform consumes its inputs; with no output, it ends them (eaten, thrown out).
- **A keep** is a `transform` that names the thing in `refs.subject` and consumes nothing. Anyone holding a thing can write a keep about it. A thing's state is the fold of what is written about it.
- Inputs held by others count once each holder's own block `answers` the transform.
- First possession (wild food, a catch) is a transform with no inputs; its author is the first owner.
- **Work** done is the worker's own block, signed by them (`as` the business if for one): a `transform` if a thing changed, otherwise an `observe` of kind `work`. It stands without anyone else's signature. The other side's `confirms` adds weight, and its `defeats` opens a dispute.

## Transfers
- A transfer names what changed: `refs.to_owner`, `refs.to_holder`, `refs.to_place` (any subset), and `refs.what`. Selling moves the owner; lending moves the holder; moving stock moves the place.
- **Open receivers.** A transfer to someone unnamed leaves `to_owner` out and says how many received (`state.count`).
- **Money** moves by transfer like anything else: `refs.to_owner`, `refs.for`, `state.money`, and `state.marks` (the payment rail's reference, profiles/payment-proof.md). A refund is the same, the other way. A payment `for` several promises says how much goes to each (`state.split`: `[{ for, line, money }]`). A payment names no thing, so it needs no `refs.what` (core.md, section 7). A transfer that names both a thing and money (`refs.what`, `state.money`, `refs.to_owner`) is a **sale**: it moves ownership like any transfer of that thing, once the receiver accepts it, and the money counts toward the promise it is `for`. A failed attempt (a declined card) is an `observe`, never a transfer. The protocol never holds money.

## Truth

- An `observe` with no `derives_from` is direct sensing; with it, an interpretation.
- `confidence` is the author's stated probability. Readers work out whether an author is well calibrated from confirms and defeats over time; it is never written.
- An `observe` says what is so in `state.text`, or in fields its schema declares. A reading carries its `amount`, and may add its `accuracy` and `coverage`, and names the sensor it came from, a thing, in `refs.from`. It counts as grounds (a schema's `grounds`, a condition) only when it is signed by the sensor's own key, by the sensor's owner, or by an agent the owner named with an operator grant (profiles/attestations.md, Devices); a reading from any other signer is ignored.
- **A model's reading is not a person's observation.** An `observe` of kind `reading` is signed by the agent's own key, `derives_from` the raw evidence, and states the `method`. Sharing it claims nothing. It becomes the person's claim only when she puts that fact to someone else in her own step: a block she signs, naming someone other than herself in `refs.to` or `refs.to_owner`, with the reading in `derives_from`. Her private `confirms` is not enough.
- **An import** (a record brought back from a platform) is a reading with `method: import`: the agent's `observe` of kind `reading`, `derives_from` the export file's hash, naming its source in `state.text`. There is one kind, `reading`, for every model's reading. Platforms do not sign. It is the person's claim only once she puts that fact to someone else.
- **Large content** is linked by its hash. A stream is linked by its **Merkle root** (encoding.md, Large content).
- A physical act carries its grounds, linked by hash: the readings, a camera frame's hash, the door sensor's observe. So a stranger can weigh a machine's claim. A sensor gives evidence; it never settles a promise alone (promises.md, Settling).
- What counts as evidence for a kind of block is its schema's grounds. There is no global score; each reader weighs.

## Invariants

24. A model's reading is never the person's claim until she puts that fact to someone else in her own step; sharing it claims nothing.

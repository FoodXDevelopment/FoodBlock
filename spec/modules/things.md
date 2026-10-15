# Things, transforms, transfers and truth

What the types hold, in detail. The types and verbs are in core.md.

## Things
- **Kind and instance.** A thing is a kind (eggs, a recipe) or one of a kind (this tray). An instance names its kind with `refs.of`. Offers and asks name kinds; transfers move instances. A thing may carry a `name`; an instance carries its `lot`, its `use_by` (a date) and its `pack` (an amount) as data.
- **Marks.** A thing carries its exact marks, `[{ scheme, value }]` (a lot code, a barcode, a phone number), and the words printed on it as read when first seen (`words`). A recall matches marks exactly.
- **Containment.** A thing can be in another (`refs.place`), and what is inside moves with it until taken out. Its own `refs.place` is where it was made or first seen. Where it is now is a fold (folds.md).
- **Parts.** A transfer may move an amount of an instance (`state.amount`). The part keeps the instance's marks; the rest stays with the sender. A transfer with no `amount` moves the whole instance. Toward a promise line, that means its `pack` in the line's unit, and an instance with no pack in that unit covers the line.
- **Shares.** A share is a thing, so it can be held and sold. Whole ownership is not a thing: it is who owns after a transfer.
- **Schemas.** A schema is a thing of kind `schema`. A law, a custom, a faith duty or a house rule is one too, so `under` can name it. Anyone may write one; equal schemas are linked with `same_as`. A `refs.under` that names a law counts only for readers who trust that law's author. A schema states:
  - `target`: the type, or `type.kind`, it is for;
  - `fields`: each field's name and field type (the field types are in `protocol.json`);
  - `roles`: the ref keys it declares beyond the shared ones;
  - `grounds`: the real event without which a block of this kind is a lie (`event`), which types or roles confirm or defeat it (`confirms`, `defeats`), and who can confirm them (`confirmers`, a list of ids or `circle#role`). Readers do the weighing;
  - `undo`: `never` when the act cannot be taken back (authority.md, Acts that cannot be undone);
  - `labels`: names for its fields and values in each language, `{ lang: { name: label } }`. Words people read live here, never in the protocol.

  Until the base schemas are published, the fields this spec names are the base, listed per type in `protocol.json`.

## Transforms and keeps
- **A make** is a `transform` that names its inputs in `refs.derives_from`, each with its share if it matters (`state.shares`: `[{ from, share }]`). Its outputs are things that name it in `derives_from`. A transform consumes its inputs; with no output, it ends them (eaten, thrown out).
- **A keep** is a `transform` that names the thing in `refs.subject` and consumes nothing. Anyone holding a thing can write a keep about it. A thing's state is the fold of what is written about it.
- Inputs held by others count once each holder's own block `answers` the transform.
- First possession (wild food, a catch) is a transform with no inputs; its author is the first owner.
- **Work** done is the worker's own block, signed by them (`as` the business if for one): a `transform` if a thing changed, otherwise an `observe` of kind `work`. It stands without anyone else's signature. The other side's `confirms` adds weight, and its `defeats` opens a dispute.

## Transfers
- A transfer names what changed: `refs.to_owner`, `refs.to_holder`, `refs.to_place` (any subset), and `refs.what`. Selling moves the owner; lending moves the holder; moving stock moves the place.
- **Open receivers.** A transfer to someone unnamed leaves `to_owner` out and says how many received (`state.count`).
- **Money** moves by transfer like anything else: `refs.to_owner`, `refs.for`, `state.money`, and `state.marks` (the payment rail's reference, profiles/payment-proof.md). A refund is the same, the other way. A payment `for` several promises says how much goes to each (`state.split`: `[{ for, line, money }]`). A failed attempt (a declined card) is an `observe`, never a transfer. The protocol never holds money.

## Truth

- An `observe` with no `derives_from` is direct sensing; with it, an interpretation.
- `confidence` is the author's stated probability. Readers work out whether an author is well calibrated from confirms and defeats over time; it is never written.
- An `observe` says what is so in `state.text`, or in fields its schema declares. A reading carries its `amount`, and may add its `accuracy` and `coverage`, and names the sensor it came from, a thing, in `refs.from`.
- **A model's reading is not a person's observation.** An `observe` of kind `reading` is signed by the agent's own key, `derives_from` the raw evidence, and states the `method`. It becomes the person's claim only when the person's own block `confirms` it (strangers.md).
- **An import** (a record brought back from a platform) is a reading of kind `import`: the agent's `observe`, `derives_from` the export file's hash, naming its source. Platforms do not sign. It is the person's evidence only after the person confirms it.
- **Large content** is linked by its hash. A stream is linked by its **Merkle root**: split it into chunks, hash each chunk with a leading byte `00`, join neighbours by hashing byte `01` then both hashes, and carry an odd one up unchanged. The root proves one chunk without sending the rest.
- A physical act carries its grounds, linked by hash: the readings, a camera frame's hash, the door sensor's observe. So a stranger can weigh a machine's claim. A sensor gives evidence; it never settles a promise alone (promises.md, Settling).
- What counts as evidence for a kind of block is its schema's grounds. There is no global score; each reader weighs.

# Things, transforms, transfers and truth

What the types hold, in detail. The seven types and verbs are in core.md.

## Things
- **Kind and instance.** A thing is a kind (eggs, a recipe) or one of a kind (this tray), which names its kind with
  `refs.kind`. Offers and asks name kinds; transfers move instances. A thing may carry a `name`; an instance carries
  its `lot`, its `use_by` (a date) and its `pack` (an amount) as data.
- **Marks.** A thing carries its exact marks, `[{ scheme, value }]`, and the words printed on it as read when first
  seen (`words`). A recall matches marks exactly.
- **Containment.** A thing can be in another (`refs.place`), and what is inside moves with it until taken out. Its own
  `refs.place` is where it was made or first seen; where it is now is a fold (folds.md).
- **Parts.** A transfer may move an amount of an instance (`state.amount`). The part keeps the instance's marks; the
  rest stays with the sender. A transfer with no `amount` moves the whole instance: toward a line, its `pack` in the
  line's unit, and an instance with no pack in that unit covers the line.
- **Shares.** A share is a thing, so it can be held and sold. Whole ownership is not a thing: it is who owns after a
  transfer.
- **Schemas.** A schema is a thing of kind schema. A law, a custom, a faith duty or a house rule is one too, so
  `under` can name it. Anyone may write one; equal schemas are linked with `same_as`. A schema states:
  - `target`: the type, or `type.kind`, it is for;
  - `fields`: each field's name and field type (the field types are in `protocol.json`);
  - `roles`: the ref keys it declares beyond the shared ones;
  - `grounds`: the real event without which a block of this kind is a lie (`event`), which types or roles confirm or
    defeat it (`confirms`, `defeats`), and who can confirm them (`confirmers`, a list of ids or `circle#role`).
    Readers do the weighing.

  Until the base schemas are published, the fields this document names are the base, listed per type in
  `protocol.json`.

## Transforms and keeps
- **A make** names its inputs in `refs.derives_from`, each with its share if it matters (`state.shares`: `[{ from,
  share }]`). Its outputs are things that name it in `derives_from`. A transform consumes its inputs; with no output,
  it ends them (eaten, thrown out).
- **A keep** names the thing in `refs.subject` and consumes nothing. Anyone holding a thing can write a keep about it.
  A thing's state is the fold of what is written about it.
- Inputs held by others count once each holder's own block `answers` the transform.
- First possession (wild food, a catch) is a transform with no inputs; its author is the first owner.
- **Work** done is the worker's own block, signed by them (`as` the business if for one): a `transform` if a thing
  changed, otherwise an `observe` of kind work. It stands without anyone else's signature; the other side's `confirms`
  adds weight, and its `defeats` opens a dispute.

## Transfers
- A transfer names what changed: `refs.to_owner`, `refs.to_holder`, `refs.to_place` (any subset), and `refs.what`.
  Selling moves the owner; lending moves the holder; moving stock moves the place.
- **Open receivers.** A transfer to someone unnamed leaves `to_owner` out and says how many received (`state.count`).
- **Money** moves by transfer like anything else: `refs.to_owner`, `refs.for`, `state.money`, and `state.marks` (the
  payment rail's reference). A refund is the same, the other way. A payment `for` several promises says how much goes
  to each (`state.split`: `[{ for, line, money }]`). A failed attempt (a declined card) is an `observe`, never a
  transfer.

## Truth

- An `observe` with no `derives_from` is direct sensing; with it, an interpretation.
- `confidence` is the author's stated probability. Readers work out whether an author is well calibrated from confirms
  and defeats over time; it is never written.
- Large content is linked by its hash; a stream by its Merkle root, so one reading can be proved without sending the
  rest.
- An `observe` says what is so in `state.text`, or in fields its schema declares. A reading carries its `amount`, and
  may add its `accuracy` and `coverage`, and names the sensor it came from, a thing, in `refs.from`.
- A physical act carries its grounds, linked by hash: the readings, a camera frame's hash, the door sensor's observe.
  So a stranger can weigh a machine's claim.
- An import (a record brought back from a platform) is the person's own `observe` of kind import, `derives_from`
  the export file's hash, naming its source; platforms do not sign, so it is the person's evidence until the other
  parties confirm it.
- What counts as evidence for a kind of block is its schema's grounds. There is no global score; each reader weighs.


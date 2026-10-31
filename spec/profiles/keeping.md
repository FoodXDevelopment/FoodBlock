# Profile: keeping

Optional. A holder of goods (a store, a lorry, a neighbour's shed) says in advance what happens if a thing in his keeping is lost. Two base schemas: `keeping` and `loss`. The one who has the goods in hand is their holder (things.md, Ownership and holding); `keepers`, the plural, is only ever a clock (blocks.md, A named clock).

**Adds:** the base schemas `keeping` and `loss`, and the terms `loss_band` and `loss_within`, which only the `keeping` schema declares. No fold reads them.

- **The holder's promise** is a promise under the schema `keeping`: `refs.from` the holder, `refs.to` the owner, `refs.what` the lot. *If a thing in my keeping is lost I sign a `loss`, with evidence, within `loss_within` of knowing (the time on a named clock); a loss up to `loss_band` of the lot is yours; beyond that, or with no `loss`, I restore its value.* It is the holder's signed word and binds only him.
- **The `loss`** is an `observe` under the schema `loss`: what was lost and how (`text`), how much (`amount`), the lot in `refs.subject`, the evidence in `derives_from`. It binds his name to its truth and moves nothing by itself. A `loss` signed after `loss_within` on the named clock counts as none.
- **`loss_band` is not `band`.** `band` is catch weight on a priced delivery (promises.md, Terms) and stays as it is. `loss_band` is this schema's own term: the share of the lot whose loss is the owner's when the holder signed a `loss` in time. Nothing fills it in; with none, the whole value is restored.
- **A normal-error standard** is the same shape the other way round: a carrier's per-unit price with `band` "0.05" is covered when what arrived is inside the band (promises.md, More worked examples).
- **A counted lot.** A herd is one thing with a `count`, and each visit a tally both sign (things.md, A herd is a counted lot). The holder's loss is read against the last countersigned tally.

Trust the schemas by hash (`spec/schemas/README.md`).

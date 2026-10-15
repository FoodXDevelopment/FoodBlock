# Profile: tax reporting and recall

Optional. Two jobs that platforms do today and a record can do with no platform.

**Adds:** the observe kind `tax_report` and the grant kind `recall`.

- **Tax report.** A seller signs an `observe` of kind `tax_report`: `state.period` (a start and end date), `state.gross` and `state.fees` (money), `state.country`, and `state.tax_id` as a commitment. It is sealed to the tax authority (the audience). Exports to a tax authority's own format are an adapter's work.
- **Recall.** A holder of food publishes a `grant` of kind `recall` to a regulator: `refs.to` the regulator (a circle), `state.answer_within` a duration, `state.marks` the mark schemes it covers (`tlc`, `lot`, `gtin`). The grant itself is public.
- When the regulator sends a signed pull for blocks whose marks match a lot, the holder answers with copies sealed to the regulator, inside `answer_within`. This is how a recall reaches sealed records.
- A regulator that does not hold such a grant sees only public headers.

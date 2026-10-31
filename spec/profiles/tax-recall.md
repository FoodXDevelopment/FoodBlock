# Profile: sealed reports and recall grants

Optional. Two jobs platforms do today, done with an ordinary schema and an ordinary grant. The page gives no reader a special place; a schema counts only for readers who trust its author.

**Adds:** nothing to the protocol's lists. `tax_report` and `recall` are labels a schema reads.

- **A sealed report.** A seller signs an `observe` of kind `tax_report`: `state.period` (start and end date), `state.gross` and `state.fees` (money), `state.country`, `state.tax_id` (expected committed, privacy.md, A commitment). It is sealed to the readers the seller names (the audience).
- **A recall grant** is an ordinary public grant to a reader the holder names: `refs.to` that reader, `scope.acts` `['pull']`, and if it chooses `scope.until` and `scope.notice`. `answer_within` (a duration) and `marks` are fields of a schema the holder names in `refs.schema`. The answer time is the holder's own word, binding it alone; a grant that names none promises no time.
- When the named reader sends a signed pull for blocks whose marks match a lot, the holder answers with copies sealed to that reader, inside the time it stated. A reader with no such grant sees only public headers.

# Profile: sealed bids

Optional. A shared form for settling a quarrel over a price without either side naming a number first (Colin Rule, *Online Dispute Resolution*, illustrates). Built from commitments (privacy.md); no new primitive.

**Adds:** the base schema `bid`.

- The quarrel is a deal's first promise. Its `to` side pays; its `from` side has the price to come.
- Each side signs one `observe` of kind `bid`, `refs.subject` the quarrel, `state.commitment` a commitment to a number (a decimal, text). The paying side commits to the most it would pay, the paid side to the least it would take.
- Both bids state the same `deadline`, the same named clock `clocks` (blocks.md, A named clock) and the same `unit` and `of`. If they differ, no bid counts. There is no default clock.
- After both are in, each side opens by a block of its own carrying `state.opening` (privacy.md). Openings are sealed to the reader the sides chose, or each to its own node. A bid or an opening counts only if `needed` clocks received it by the deadline. A late opening counts for nothing, and so does an opening that `needed` clocks received before they had received both bids: a side that sees the other's number before it bids has no blind bid.
- Read from the openings: if the paying side's number is at least the paid side's, they overlap and the middle (their mean, exact) is a fact. The sides may then settle by an ordinary transfer, or the referee may confirm it. If they do not overlap, nothing more is shown than that.
- It binds only by what the sides signed in the form. The protocol enforces nothing.

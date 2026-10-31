# Profile: sealed bids

Optional. A shared form for settling a quarrel over a price without either side naming a number first (Colin Rule, *Online Dispute Resolution*, illustrates). Built from commitments (privacy.md); no new primitive.

**Adds:** the base schema `bid` and the fold `bids_shown` (folds.md).

- The quarrel is a deal's first promise. Its `to` side pays; its `from` side is owed.
- Each side signs one `observe` of kind `bid`, `refs.subject` the quarrel, `state.commitment` a commitment to a number (whole minor units, text). The paying side commits to the most it would pay, the paid side to the least it would take.
- Both bids state the same `deadline`, the same named clock `keepers` (blocks.md) and the same `currency`. If they differ, no bid counts. There is no default clock.
- After both are in, each side opens by a block of its own carrying `state.opening` (privacy.md). Openings are sealed to the reader the sides chose, or each to its own node. A bid or an opening counts only if `needed` keepers received it by the deadline. A late opening counts for nothing, and so does an opening that `needed` keepers received before they had received both bids: a side that sees the other's number before it bids has no blind bid.
- Shown: if the paying side's number is at least the paid side's, they overlap and the middle (their mean, rounded half up) is a fact. The sides may then settle by an ordinary transfer, or the referee may confirm it. If they do not overlap, nothing more is shown than that.
- It binds only by what the sides signed in the form. The protocol enforces nothing.

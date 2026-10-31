# Profile: ballots

Optional. A secret vote in a circle.

**Adds:** a counter, sealed votes, a signed result, and the fold `counted_in`.

- A vote's rule (a schema, named in `refs.under` of the shared record, circles.md) names a **counter**: an actor.
- Each vote is sealed to the counter alone and carries the choice as a commitment (privacy.md, A commitment).
- The counter signs the result and lists the commitments it counted in `state.counted`, so each voter can check theirs.
- `counted_in(result, commitment, counter)` is true when that counter signed the result and it lists the commitment.

The counter is trusted not to reveal votes early; the protocol does not prove it. A circle that needs more uses several counters and compares.

A vote that moves nothing may be secret. A yes that moves property is signed: it may be sealed from the rest of the circle (to the counter), but never unsigned, because only a signed word moves what is owned.

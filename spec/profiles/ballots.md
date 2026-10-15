# Profile: ballots

Optional. A secret vote in a circle.

**Adds:** a counter, sealed votes, a signed result, and the fold `counted_in`.

- A vote's rule (a schema, named in `refs.under` of the shared record, circles.md) names a **counter**: an actor.
- Each vote is sealed to the counter alone, and carries the choice as a commitment (privacy.md).
- The counter signs the result. It lists the commitments it counted in `state.counted`, so each voter can check theirs was counted.
- `counted_in(result, commitment, counter)` is true when the result is signed by that counter and lists the commitment in `counted`.

The counter is trusted not to reveal the votes before the result. The protocol does not prove it. A circle that needs more uses several counters and compares their results.

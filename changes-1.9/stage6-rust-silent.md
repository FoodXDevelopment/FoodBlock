# Stage 6 (circles): where the text was silent or split, as the Rust core built it

Each item: the section, the reading built (the one closest to the centre: only a signed word binds, and only its signer; nothing fills anyone's silence; a later word takes back nothing already built on), and the test that pins it (`sdk/rust/tests/stage6.rs` unless named). Built 2026-11-19, without reading the oracle.

## Parts and hands

1. **Where a hand's parts are read** (C15). On an index of the hand's own causal past alone. So no reading of a move ever asks about the move itself, and one circle's question never loops. Pins: `c15_hands`, `c4_unissued_parts`.

2. **"The parts she owns" is her free parts** (C15, C6). That is what she owns less what her own draws still hold, the same in a parts row and in the every-owner way. C15's story counts the every-owner way ("50 of 100") with Leila's held transfer at 0. Pin: `c15_hands`.

3. **Parts on their way into the circle** (C4, C6). "Every part persons own" is the pack, less the unissued parts, less parts held toward the circle itself (given by their owner's word, not yet accepted `as` the circle). Without this, Kofi could never accept his own 999 parts `as` L. Pin: `c4_unissued_parts`.

4. **A hand's ends** (C15). For a parts row, an end is a draw of hers on the circle's parts that is signed after her hand (not in its past) and that the completing block has seen, or her close. The same ends apply in the every-owner way, because a hand that sold its parts should not bind the buyer. Pins: `c15_hands` (second world), `c7_joining_leaving_a_close`.

5. **SPLIT: a ring of circles cannot close by accepts alone** (C5 against C15). The text says both accepts take. Under items 2 and 4, Kofi's parts of B are held toward A from the moment he signs that transfer. So his hand `as` B counts none of them, and A's yes waits `on: hands`. Nothing is refused. A circle's owner that is another circle does act, by a confirm signed `as` that circle where its own row holds. The owner should choose: count held parts that go toward the move's own circle, or keep this. Pin: `c5_a_circle_as_owner`.

6. **The meter's receipt that states the unissued parts** (C6, story 3). The byte is `state.unissued`, an amount in `part`, on the meter's `observe` of kind `receipt` that names the move in `refs.derives_from`. The meter's line is read as `refs.meter` is. Any such receipt the reader holds counts. Where several are held they must agree, else there is no every-owner way. Pin: `c6_every_owner_together`.

7. **Confirms** (C15). A hand is any counted block that names the move in `refs.confirms` (the tests use an `observe` of kind `confirm`). A confirm `as` the circle itself is a hand on unissued parts (`not_voice`). A confirm `as` another circle is that circle's hand where a row of that circle holds for it (C5). Pins: `c4_unissued_parts`, `c5_a_circle_as_owner`.

8. **Where a move holds** (C15, invariant 27). The candidates are the move and each confirm, tried fewest-past first, and the first where one row (or every owner) holds is reported in `at`. The order only picks which block is named. Whether the move holds does not turn on it. `holds` is read among all blocks held, and the cut is not run again for blocks that built on the move before its completing block. Pins: `c11_head_counts` (`at`), `c12_bounds`.

9. **Hands that do not stand, and pairs** (C15). A hand stands by `stands` without the circle's own rows. One that does not is `why: waiting`. A hand that is one of a pair is `why: pair`. Neither counts. Not pinned by a story.

## Rows

10. **A row's bounds bound every kind** (C10, C12). A row that states `each` or `limit` is read as a grant's is: an amount of another kind is above it. A row with no bound bounds no amount (C4's row has none). Pins: `c4_unissued_parts`, `c0_what_a_circle_is`.

11. **The amount a block binds the circle to** (C12). A transfer's `state.amount`. An offer's or order's total (`terms_total`). An accept's total of the promise it accepts. No other block has one. Pins: `c12_bounds`, `c0_what_a_circle_is`.

12. **A row's `limit`, and `every`** (C12). `limit` is read as the sum of the blocks this same row held for in the block's causal past, plus this one. `every` is not read: no period turns, so a row's limit is for all time, which is narrower. Not pinned by a story.

13. **Counted once** (C12, kept word). A transfer `for` a deal whose binding promise `as` the circle holds in its past is not counted against a row's bounds again. Pin: `c12_bounds` (Amara repays £2,200 under r1 after Leila's close).

14. **How wide a grant from a row may be** (C13). Its types are a subset of the row's. Where the row states `each`, the grant states an `each` no higher, or no `each` and a `limit` no higher than the row's `each`. Where the row states `limit`, the grant states one no higher. Its `refs.what` stays inside the row's `what`. A wider grant is one no row holds for (`row_holds` false), and the core says why with `wider_than_parent`. Pin: `c13_a_grant_from_a_row`.

15. **Who a move gives to** (C16). A transfer's `to_owner` and `to_holder`. A grant's `refs.to`. An offer's or order's sides. An accept of a promise: that promise's sides and author. An accept of a transfer gives nothing (it receives). A "tool of hers" is the holder of a counted grant she signed in her own name, in the move's past. "A circle in which her hand could count" is one where she owns parts, or where a row's `to` names her. Pins: `c16_no_one_is_both_sides`, `c5_a_circle_as_owner`.

16. **The `scope.on` exemption in a row** (C16, last clause). It applies where the row's `scope.on` names a promise the move is `for`, and that promise names her in `from` or `to`. Not pinned. C17 runs through a grant instead.

17. **A row's `what`** (C4; the text's SILENT 11). A row carries `what` inside its `scope`, since a row has no refs: one id or a list of ids. The check reads it as ids and the rest of the scope as a grant's. A block's `refs.what` must be within it. A block that names the circle itself needs a row that names it. Pin: `c4_unissued_parts`.

18. **A row naming the circle itself** (the text's SILENT 3). No founding block can name its own id, so a row whose `scope.what` or `to` names the circle or one of its grants comes by a version. Pins: `c4_unissued_parts`, `c11_head_counts`.

19. **Head counts** (C11). `to` is one id or a list. An id that is a grant `as` the circle that holds stands for its holders as it stands in the hand's past: the newest newer word `as` the circle that holds; none where a holding stop of it is seen; only the ids both name where two newer words do not see each other; less each holder who ended her own place. Pin: `c11_head_counts`.

20. **Which rows stand for a block** (C19). They come from the version in the block's own causal past. A block by someone other than the version's signer is read under the version only where it names it (`after`). Pins: `c11_head_counts`, `c19_versions`.

21. **Versions** (C19, C20). A version is an `actor` of kind `circle`, `as` the circle, that updates the founding block or a version. `pack` and `refs.meter` are read only from the founding block (`pack` never changes). `rules` and `clocks` come from the standing version. Pins: `c19_versions`, `c20_a_circles_clock`.

## Ends, grants, readings

22. **Ending a grant signed `as` a circle** (section 4, `authority.md`, Ending). Its author's stop counts while her hand could still count there. A stop `as` the circle counts where a row holds for it. Any other stop ends nothing. Pin: `c14_anyone_who_owns_no_part` (Rex's stop).

23. **Keeps to and `refs.as`** (stage 4's Keeps to, item 1). `as` is read as what every block has of its own, like `author`. Otherwise a circle's want could never be kept to by the other side, and no tool could buy for a circle. This changes stage 4's answer only for promises that carry `as`. Pins: `c6_every_owner_together`, `c14_anyone_who_owns_no_part`.

24. **A circle's account word** (C9a). `account_of(circle)` reads account words signed `as` the circle whose speaker is the circle. Pin: `c9a_a_circles_account_word`.

25. **`row_holds` and `ways_in` at the door.** `row_holds(block, held)` reads the circle from `refs.as`, and its answer adds `at`. `ways_in(circle, held)` gives `{ circle, rows: [{ row, least }], every_owner: { least } | null }`. A parts row's `least` uses free parts, and every `least` is clamped to the every-owner way's. Pins: `ways_in_and_counts`, `c3_owners_unsaid`.

26. **Owners shown, and owners in an audience** (C1, C8). `circle_state.owners` shows free parts, as `ownership` does. Held parts show in `ownership.held`. `members_then` names title-holders: an owner whose parts are held is still an owner until they land. Pins: `c1_parts`, `c8_a_buyer_of_parts_and_blocks_sealed_before`.

27. **`no_person`** (C5). True where an owner is a circle whose owners, followed through, are only circles and come back round. False for a circle with no pack. Not reached by a story here (see item 5).

28. **Roles gone everywhere.** A name with `#` names no one (clocks, a bench, a condition's `by`, an audience). The bench's `role` tie is gone. Its `member` tie now means "owns parts of the side's circle". The bench's "appointed after the deal bound" check (H9) went with roles. `state.to_role` and the member grant's checks are gone. Pin: `c8_a_buyer_of_parts_and_blocks_sealed_before`.

29. **`count_of`** (section 5). A whole number from 1 to the size of the set, else null. Pin: `ways_in_and_counts`.

30. **CBOR names** (section 5). `removal` is replaced in place by `rules`, so no other key moves. `parts` and `needed` are added at the end. `scope` was already there.

31. **A fraction of a part** (C1). It is read as a draw that takes nothing, with `unit`. Pin: `c1_parts`.

## Not built in this core

- C9b, the listing (a reading; "may land after the lock").
- C21's two tills ordered by the circle's meter, and the no-meter take-up (`counted_to` on another hand's line). Only `refs.meter` is shown, in `circle_state`.
- C20 for hands: no hand is read on the circle's clock. Only a grant `as` the circle that names the clock in its own `scope.clocks` is cut on it, by stage 4's cut.
- The text's SILENT 1 (whether a buyer may claim to see blocks sealed before he bought).
- Section 4's prose edits to the spec, and deleting `share_vote` from `spec/schemas`: outside `sdk/rust`.

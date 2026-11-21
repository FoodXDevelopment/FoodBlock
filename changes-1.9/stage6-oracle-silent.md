# Stage 6 (circles): where `06-circles.md` is silent, and what the oracle built

Written by the oracle builder (`spec/oracle/fb.cjs`, stories in `spec/oracle/stage6/`), without reading the Rust core. Each entry: the section of `06-circles.md`, the reading chosen (the one nearest the centre: only a signed word binds, and only its signer; nothing fills anyone's silence; a later word takes back nothing already built on), and the story that pins it. Marks: S = silent, C = the text conflicts with another stage's text, N = not built.

## Conflicts between texts (3)

**C1. C13/C14 against stage 4's G1.** The café's `r1` names no `on` and no `parties`. A grant under a row is no wider than the row (C13), so no grant under `r1` can name a promise or a party. Stage 4 lets a tool deal only with a side its grant admits and keep to a promise in `scope.on`. So Joe cannot "order milk under G" in the world as section 2 writes it. Story `6-C13-C15` (C14) and `6-C16-C18` (C18) use `staffWorld()` in `stage6/lib.cjs`: `r1` also names Amara's want in `on`, Harry in `parties` and a `limit`. The text should say which side gives way: a row that can carry `on`/`parties`, or a grant under a row that may add them.

**C2. C17 against stage 4's `due`.** A promise names one side (`refs.to` is one id), so "one standing promise" for two owners cannot name both. A payout `for` a promise that states no price is `not_due` ("a payment is by the side that pays"). The story writes one promise to each owner and tests the circle's clause (the last clause of C16) on a row whose `scope.on` names them; the grant path (TG) is tested only for holding and being read. Pinned: `6-C16-C18` (C17).

**C3. C4 against the founding block.** The row `{ parts: 1, scope: { types: [transfer], what: L } }` names L by hash, and a founding block cannot name its own hash. So the row can come only by a version (the text says so in SILENT 3 for head counts, not for this). A version needs every owner or an `actor` row; with 999 unissued that needs the meter's receipt to state the unissued number. Pinned: `6-C4-C5`.

## Readings (S)

**S1. C6, the unissued number.** "The meter's receipt of the move states" is read as a counted `observe` of kind `receipt` on the meter's line, `refs.derives_from` naming the move, with `state.unissued` a whole number (or an amount of parts). With no such receipt, or no meter, there is no every-owner way. Pinned: `6-C4-C5`, `6-C6` (story 3, both worlds).

**S2. C15, what a hand counts.** Parts she owns, read at two places: in the causal past of her hand and in the past of the block where the move holds; the smaller counts. Parts held for a sale count for nothing (Leila's story). Exception, read from C4 and C5: a draw of hers that the move answers (or that a move it confirms answers) is no end of her hand for that move, because the parts are hers until the accept lands. Pinned: `6-C4-C5`, `6-C13-C15` (C15).

**S3. C15, where a move holds.** At the move, or at a confirm of it (a block with the move in `refs.confirms`), whichever has enough hands in its past; the first such block is where it holds, and it stays held (what stands stays), so Leila selling after a confirm that already completed the move takes nothing back. Hands from different people reach one block only if a block `after`-joins them: independent confirms are counted in no one place. Pinned: `6-C10-C12` (C11 chain), `6-C13-C15`.

**S4. C15, `why` of a hand.** `not_voice` for a hand that is ended (her key's close in the past of the completing block), that the move gives to, or that owns nothing the row counts. `waiting` for a hand that does not stand (or is voided). `both_sides` is not used for a hand; the block waits (`on: hands`). A confirm by a closed key is listed, not left out. Pinned: `6-C7-C8`, `6-C16-C18`.

**S5. C16, "gives to".** The ids a move gives to: `to_owner`, `to_holder`, and `refs.to` of a grant or promise. Gives to an owner if the id is her, a tool of hers (a grant she herself signed, not `as` a circle, naming it; or a two-key link), or a circle in which her hand could count (she owns its parts, or a row of it names her in `to` or in the holders of a grant it names). Pinned: `6-C16-C18` (stories 1 to 3).

**S6. C16, last clause.** "A promise that names her as the one paid" is read as: her id appears among the promise's refs. It applies to a row (or grant) whose `scope.on` lists the promise: her hand then counts for a block `for` it. Pinned: `6-C16-C18` (C17).

**S7. C12, what `each` reads.** Only a money amount of the same kind as `each`: a transfer's `state.amount`, or a promise's total at its price and quantity. A block with no such amount is not bounded. A payment `for` a promise of the circle that already held is not bounded again (stage 4's counted-once rule, so the kept-word repayment holds). Pinned: `6-C10-C12` (C12, both).

**S8. C10, how a row covers a move.** `scope.types` by the block's type names; `scope.what` (the key the text's C4 story writes; SILENT 11) lists ids, and every id in the move's `refs.what` must be in it; a move whose `refs.what` names the circle itself is covered only by a row whose `scope.what` names it. `scope.on` covers a transfer or an answer only `for`/answering one of those promises; a grant's own `scope.on` is judged as narrower, not as a cover. Pinned: `6-C4-C5`, `6-C16-C18`.

**S9. C13, which row.** The first row that holds for the grant. Where every owner signed it, no row binds it. Read in `read` (`wider_than_parent`), on the blocks held, so a later confirm that makes every owner can change the finding. A key grant (a rekey) is not a tool grant and is exempt. `parent` pseudo-row: `depth` is not limited, `meter` must be the circle's. Pinned: `6-C13-C15`, `6-rekey`.

**S10. C14, who may end a word `as` a circle.** The grant's holder ends her own place with a stop of it (an `updates` by her), alone. Its author's stop counts only while she still owns parts of the circle or is named in a row's `to` (authority.md, Ending). A stop `as` the circle counts where a row holds for it (`r1` names `grant`). Pinned: `6-C13-C15` (C14).

**S11. C11, the grant a row names.** A grant `as` the circle; its holders are `refs.to`, a list. A newer word is a grant `as` the circle that `updates` it and holds (a row that names `grant`, or every owner); the head is the newest in the hand's past; two heads that do not see each other stand as the grant both have in their past. A stop that holds ends it for everyone. An id counts once. Pinned: `6-C10-C12` (C11).

**S12. C19, versions.** A version holds by an `actor` row of the founding block (read there only) or by every owner, and its `refs.updates` must be the founding block or a version that holds. The standing version for a block is the one all other holding versions in its past are in the past of; rivals: the latest block (a version or the founding block) both have in their past. A version may state its own `refs.meter`; `pack` is read only from the founding block. Pinned: `6-C19-C21`.

**S13. C21, the circle's line.** With a meter: every draw `as` the circle on a measure is counted on one line (key `circle`), in the order of the meter's receipts that name the draw (`refs.derives_from`); a draw no receipt names comes after, in causal order. With no meter: the line of the key that signed the start for the measure; another key's block joins only by naming in `state.counted_to` a block on that line in its causal past, and the line is read on from that block. `counted_to` is a field every block may carry (00-shared, A line goes on). Pinned: `6-C19-C21` (C21, both).

**S14. Doors.** `row_holds(block, circle?, held)` answers `{ circle, holds, row, every_owner, hands: [{ id, block, parts, counts, why }], waiting, listed }` (`row` a row's place, null for every owner; `listed` is C9b). `ways_in(circle, held, within?)` answers `{ circle, ways: [{ row, least, holders? }, { row: null, every_owner: true, least }] }`; `holders` is the number of ids a `to`-row counts as it stands. `circle_versions` answers `now` as the founding block's id when no version stands. `circle_state.owners` leaves out the circle itself (that is `unissued`); `no_person` follows owners through circles and is true where they end in no person. `members_then` (C8) lists owners by parts, counting parts held for a sale until the receiver's yes. `count_of` takes a whole number only. Pinned: all stories.

**S15. C9b, the listing.** Words of the circle that stand and are not done: promises `as` the circle that hold, are not in the move's past, and whose stage is not done, stopped or declined. Listed only when the move gives to an owner (S5). Pinned: `6-C9` (C9b).

**S16. `stands`, order of `on`.** `hands` sits after `named`, before `condition`. A block `as` a circle waits on it unless a row holds. A hand's own standing leaves `hands` out (a hand stands as her word would). Pinned: `6-C6`, `6-C22-C23`.

**S17. C5, a circle's hand.** A hand's voice is the circle if the hand is a block `as` that circle for which a row of its own holds; the ring in the story needs one such block (a confirm `as` B). The ring itself reads as holding nothing if it has no such block. Pinned: `6-C4-C5` (C5).

**S18. C9a.** An account word `as` a circle is the circle's account word where it holds; `account_of(circle)` and the deal fold read it (a payee's `account` word is one signed by the payee or `as` it). Pinned: `6-C9`.

**S19. Rekeys.** A key grant with `epoch` is not a voice of anyone's list: it stands as any word of its signer does, and `circle_key` counts those a row holds for. Pinned: `6-rekey`.

**S20. Old founding blocks.** `roles`, `removal`, `needed`, `change` on a circle, and a `member` grant, are undeclared fields or kinds: read refuses them (the product re-signs).

## Not built (N)

**N1. C12, `limit` and `every` on a row.** Only `each` (and the type, `what`, `on` covers) is read. A row with `limit`/`every` is shaped and compared by C13, but its running total is not counted.

**N2. C20, hands read on the circle's clock.** A hand and a block `as` the circle are not read on `clocks`; only a grant that names clocks is (stage 4's machinery), which the C20 stories use.

**N3. C15, the cut for a gathered move.** "A move's signer is all its hands together; no hand's own later block passes an end" is not built beyond: a hand is ended by her close, or by the draws in S2.

**N4. C8, may a buyer claim to see earlier blocks.** SILENT 1 of the text, unchanged: the oracle only answers who the audience names (`members_then`).

**N5. Outside `spec/oracle/`.** `protocol.json`, the spec modules, the vectors, and the Rust fixtures (`export.cjs` for stage 6 would write into `sdk/rust`) are not touched. The oracle patches its own copy of `protocol.json` at load (`P.fields.actor`, `P.refs_single`) and no longer reads `powers`.

## Counts

Conflicts 3, silent readings 20, not built 5.

# Stage 7 (last): where the text was silent or split, as the Rust core built it

Each item: the section, the reading built (the one closest to the centre: only a signed word binds, and only its signer; nothing fills anyone's silence; a later word takes back nothing already built on; one rule every part reads, simplest wins), and the test that pins it (`sdk/rust/tests/stage7.rs` unless named). Built 2026-11-19, without reading the oracle.

## Who learns what (Job A)

1. **A1's world needs a sealing key on its own line** (A1, What stays public). The world says Harry's sealing key S signs H2, so Sam can still be shown R. Built as a second voice of Harry's list (no key grant `K1` under a sealing voice: a voice is the smallest block that puts S on a line of its own). Q is made by S, so S's line holds it. Pin: `a1_what_stays_public`.

2. **A header held with no body, and no copy for the asker** (A2 line 37 against CORE-SET 3a-5). 3a-5 says a relay "passes on as its header" a body whose audience it cannot read; A2 says nothing of a sealed block goes to any other asker. Built A2, the later word: an unsigned pull, and a signed one for whom the node holds no copy, gets no header at all. A header held alone is served only with a copy for that asker. Changes `core_set_a.rs` `a3_05` (rewritten) and its oracle fixture case (skipped there, marked "changed by stage 7"). Pin: `a1_what_stays_public`; `core_set_a.rs` `a3_05_a_relay_passes_on_a_header`.

3. **What padding measures** (A1, Sealed messages). "Pads to the next of 512 ..." is read as: the plaintext's canonical bytes, `pad` included, are exactly the next size at or above its size with `pad: ""`. `seal_copy(..., pad: true)` and `seal(..., pad: true)` do it; `padded_size(n)` names the size. Pin: `a1_padding_sizes`.

4. **The bytes of a wrapped copy** (A1, A wrapped copy). No source gives them. Built as `{ mailbox, envelope }`: the envelope seals the whole sealed-copy message to the one mailbox key (`wrap_copy`). `bytes` is the canonical length of that message. The node's clock (`at`) is the node's own and is not in the core's answer. Pin: `a1_a2_a_wrapped_copy`.

5. **How a node states its admission rule for copies** (A2 line 44). No field names are given. Built as `accept`'s `choices.copies: { signed, handed_on, unsigned, mailboxes }`, each optional, and the push as a fifth argument `{ signer?, for? }`. A rule that states nothing keeps no copy (silence fills nothing). `signed`: a signed push by the block's author. `handed_on`: a signed push by anyone else, listed `from: handed_on`, never in the author's place. `unsigned`: an unsigned push. `mailboxes`: a wrapped copy to one of those keys. The answer adds `copies: [{ hash, for, from }]` and `wrapped: [{ mailbox, bytes }]`. Without `copies` or `push`, `accept` answers as before. Pin: `a1_a2_a_wrapped_copy`, `a2_which_copies_a_node_keeps`.

6. **A receipt to a pusher** (A2 line 15). Built in `push_answer`: a receipt that names (in `refs.derives_from`) any block not in this answer's `taken` is refused (`shape`). Pin: `a2_a_receipt_names_only_its_push`.

7. **Announcement and local discovery** (B2). Discovery loses `version`; the text says nothing of the announcement and the mDNS TXT record, which also carried `version`. Built: both lose it too (one rule: no reader reads a version). Not pinned by a story.

8. **`terms.backing`'s shape** (A1, backing). Read as an amount (its existing check). Pin: `a1_a_seller_backing_his_title`.

## Rule sets (Job B)

9. **The rule set this build is made from** (B5, `read`'s default; `spec`'s `rule_set`). The repository publishes no `spec/rule-set.json`, so the build is given no manifest: `spec` answers `rule_set: null`, and `read` with no `runs` runs no stated set (every stated id is `unknown_rules`, as 3a-13). `read(block, held, schemas?, runs?)`: a set in `runs` is read by this core's rules. Pin: `b1_a_rule_set_is_named_by_its_hash`, `b5_read_runs`.

10. **`rule_set(files)`'s bytes** (B5). Files are given as text; each file's hash is the SHA-256 of its UTF-8 bytes. The op names exactly the paths given (it does not check the list of section 11). Pin: `b1_a_rule_set_is_named_by_its_hash`.

## The read-back (Job C)

11. **How a reading and a renderer are named** (section 8, SILENT 1 and 2). No file is published, and no source says what language they are written in. Built: each is code in this core, named by the SHA-256 of its path text (`readings/readback`, `renderers/en`, `renderers/en-sms`; `readback_names`). A second engine that names them otherwise gets `not_run`. This is a placeholder until the files exist.

12. **The read-back adds door ops** (section 6 says "adds no door op"; section 7 says both engines run the reading and renderers through the audit). Built as readings, outside `door.protocol`: `readback(block, held, renderer?, digits?)`, `readback_reading(id, held)`, `readback_redo(rb, held)`, `render(answer, renderer)`, `readback_names()`.

13. **What `inputs` are** (C3). "The sorted ids the reading read." Built: the blocks the answer read and every block in their causal past, held as bodies. The answer is then computed again over those inputs alone, so anyone who holds them gets the same answer. World A's inputs `[H0, H1, H2]` come out with Amara's genesis beside them (her name is read). Pin: `c3_the_read_back_redone`.

14. **The answer's shape** (C3). Built: `{ block, type, by, as, lines: [{ what, amount, to, draw, pair?, stated? }], amounts: [{ side, who, out, in }], readers, read, lacks }`; each id `{ id, code, name }`, the name from the id's own block. A line's draw is the ownership fold's for this block: `{ state }`, `{ why }`, or `{ not_shown, lacks }`. A line whose block draws nothing on the instance gives `draw: null` (the `read_whole` test for such a line is not built). Pin: `c3_c4_the_reading_and_its_renderers`.

15. **A pair in the read-back** (C3, world D). The ownership fold, by rule 4, reads a draw of a pair with no yes as nothing, so it shows no pair there. The reading finds the pair itself (two blocks of one key at one place) and gives both: `{ draw, to, yes }`. Pin: `c3_a_pair`.

16. **"You" in the renderers** (C4). The read-back's fields name no viewer, so the renderers speak of each person by her name and code, never "you". Only part of C4's twenty lines is built: lines 1, 2, 4 to 10, 17, 18 and 19. Lines 3, 11 to 16 and 20 are not rendered yet (line 3 needs a holder other than the signer; 11 to 14 need stage 4's worst case in the answer; 15, 16 and 20 are FoodX's own or a term's words). Text and digits: `en` joins lines with a newline and the digits after one; `en-sms` joins with ". " and the digits after a space. Pin: `c3_c4_the_reading_and_its_renderers`.

## Conformance and the cut (Job D)

17. **Named readings and `reading_not_run`** (D5 against `00-shared.md`, Named readings, and stage 5's build). D5 says a block whose condition names `settled` or `paid` is held not read (`reading_not_run`). The shared ground (which wins) and stage 5 say the condition is not read: `condition_holds` null, it never holds, and what it holds stays held. Built the shared ground: no `reading_not_run`. `condition_shapes_class` sorts `ruled` and a bare `reading` as protocol (stage 5: `ruled` reads signed fields; 3c-5: a bare reading never holds), `settled` and `paid` as readings. Pin: `d2_the_ops_sorted`.

18. **What the cut deletes** (D2, section 6). The text sorts ops; it deletes none (the operator op went in stage 4, `may_act_as` in stage 6). Built: `door.protocol` `{ sound: 7, word: 30 }` and `door.classes` (reading, library, node) over every other op; `identity_state` gets its door entry. Pin: `d2_the_ops_sorted`.

19. **The machine lock's answer** (D6, as 1.8 C6). `locks` and `claimed` are lists of ids. The lock is any standing grant of kind `stop` whose `refs.subject` is the machine, ended as anything ends, by its author's stop. `now` stays an optional argument (a reading may read a clock). `fields.grant` loses `fence`; the fence's shape check stays only for `fence_reading`. Pin: `d6_the_machine_lock_is_a_reading`.

20. **`kinds`** (C2). No list is given for 1.9. Built from what the core's words read: grant `key`, `referee`, `stop`; observe `account`, `cutoff`, `dropped`, `paid`, `received`, `receipt`, `ruling`, `witness`; thing `schema`. Pin: `d2_the_ops_sorted`.

21. **The CBOR table** (E2). `tools/cbor-table.cjs` does not exist. Built by hand in `protocol.json`: removed names taken out (`withheld` was the only one present), added names absent appended at the end in byte order (`above`, `closed`, `destination`, `destinations`, `in_hand`, `passes`, `receives`, `rule_set`, `step`, `to_come`, `to_come_back`, `to_come_on`). Not re-sorted under the 1.8 rule. Not pinned (vectors).

## The mount (Job F)

22. **A mount in place of `held`.** Any argument the door reads as a list takes a mount's id (text) in its place. An id that names no mount is an argument error `unknown_mount`. An argument read only when it is a list (`schemas`, `answer_pull`'s `held`) does not take a mount. "What is done once" (verdicts kept between calls) is not built: each call reads the mount's blocks afresh, so no answer changes. Pin: `f_the_mount`.

## An old reader (C5)

23. **The depth stop.** This core fixes no depth and never stops, so `lacks` naming "the first block not read" has nothing to name here. The story's 6,000 makes are 300 in the test, for time. Pin: `c5_an_old_reader_answers_less_never_otherwise`.

## The owner's decisions of 2026-11-19

24. **A row's money cap and a sale** (decision 1). A row's bound reads a block's amount in the bound's kind. Where the bound is of the quantity's kind, the quantity. Else the deal's total at that quantity. A transfer of goods `for` a deal is read as the deal's total at the transfer's amount. A transfer with no deal keeps its own amount, so a loaf given for nothing is above a money cap. `each` and `limit` are each read in their own kind. Changes three stage 6 oracle-fixture questions (#44, #127, #128: r1 now holds for the till's sales), skipped there and marked. Pin: `owner_1_a_rows_money_cap_reads_a_sale_as_its_total`.

25. **`binds` on a draft `as` a circle** (decision 2). The draft is read as signed now, after every block held (`refs.after` the heads held, where it names no `prev` or `after`). Its own hand is taken as counting, with no other rule changed. It binds where `gives` of the circle is not empty. A draft that offers only a kind gives nothing even when signed, so it stays false. Pin: `owner_2_binds_as_a_circle`.

26. **`circle#role`** (decision 3). Gone from the core: a signal's `by`, a clock's names and a bench's names are ids only, and a name with `#` names no one. Gone from `protocol.json`'s figure and repeat texts. **Not done:** `of_members` in the `bounded_change` schema and the pools/promise sentences live in `spec/schemas/schemas.json` and `spec/profiles/pools.md`, outside the files this build may touch. Pin: `owner_3_no_circle_role`.

## Not built (outside this build's files, or a later step)

- `optional_profiles`, `peers`, `modules` stay in `protocol.json`: the core reads the profiles' fields and the short form from them, and their new home (`conventions.json`) is not a file this build may create. The same for moving `views`, `repeat`, `envelope`, `messages`, `local_discovery` and `cbor` out.
- `spec/vectors.json` is not regenerated (section 4 lists the cases and re-signs; it names no engine, and this build's brief keeps it for a later step). Plan: re-sign the blocks with `withheld`, `terms.show`, consent `keep` or `move`, and lock fields; drop `sound` and `version` from the discovery case; add section 4's 21 new cases; then every `accept` case of an unsigned sealed push and every `answer_pull` case that served a sealed header changes answer.
- `sdk/door.table`, the spec text files, the invariants table (E1) and the machine schema's `fence`.

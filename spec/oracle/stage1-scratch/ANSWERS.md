# Stage 1 (keys): the questions asked of the oracle and its answers

Made by hand with Node's `crypto` (Ed25519, p256 for the suite move), blocks signed the 1.7 way (canonical.md). The stories are in `stories.cjs` (run `node stories.cjs`), built from `lib.cjs` and `maria.cjs`. `stands(...)` answers print `true`, or `false [{ on, block }]` where `block` is the index of the block in that story's list (the order the story wrote them in, genesis blocks first). `signed_by_author` is `identity_state.signed_by_author` for one block. Read each answer against the sentence below its group; a line marked GUESS in the code is listed in the report, not here.

## 0 genesis

- Q: voices  
  A: `[["key"]]`
- Q: keepers  
  A: `null`
- Q: valid: a genesis with reach and no keepers  
  A: `["bad_genesis"]`
- Q: check: a list whose first voice is people (names)  
  A: `["shape"]`
- Q: check: a list with a reach and no keepers  
  A: `["shape"]`

Spec: identity.md, Her voices: "The genesis is a list of one voice: its own key".
Spec: protocol.json genesis.optional_about / core.md section 4: reach "keepers required with reach" (bad_genesis); identity.md: "A list that states a wait above zero, or any reach, states `state.keepers` ... one that does not is no list (`shape`)"; "The first voice is a `key` or `key_hash` of hers, never other people" (`shape`).

## 1 lost phone

- Q: identity_state after the genesis key signs her list and signs it again: voices count / keepers  
  A: `3 / true`
- Q: stands(K1) the phone's own list  
  A: `true`
- Q: stands(K2) mum signed, brother confirmed, no keeper has spoken  
  A: `false [{"on":"wait","block":10}]`
- Q: signed_by_author: a phone block written in the week, K2 in its past but not standing  
  A: `true`
- Q: stands(K2) two keepers have receipted and cut off through receipt + P7D, nobody has confirmed again  
  A: `false [{"on":"wait","block":10}]`
- Q: stands(K2) mum again only (needed 2)  
  A: `false [{"on":"wait","block":10}]`
- Q: stands(K2) mum and brother both again after the wait  
  A: `true`
- Q: identity_state.voices[2].key is the new phone  
  A: `true`
- Q: identity_state.keys  
  A: `1 key(s); old phone among them: false`
- Q: signed_by_author: the old phone's block before the key grant  
  A: `true`
- Q: signed_by_author: an old phone block that has K2 standing in its past  
  A: `false`
- Q: signed_by_author: a new phone block (refs.key K2) with K2 standing in its past  
  A: `true`
- Q: signed_by_author: the new key's block written before K2 stood (K2 not standing in its past)  
  A: `false`
- Q: stands(oldBefore) a reading-free thing: nothing it waits for  
  A: `true`

Spec: identity.md, When a key grant stands: "stands when its signer's voice has signed it again after that voice's `wait` has run from her keepers' receipt of the first signing"; for a voice of named people "`needed` of them each confirming again"; blocks.md, A named clock: a wait has run when `needed` lines each hold a cutoff through receipt + wait. `on: wait` = "a wait not yet run" (protocol.json door.stands).
Spec: identity.md, While it waits: "During a wait she has only the keys she already had"; invariant 8: a key speaks only while it is the key of a voice of the list that stands in the block's own causal past. A waiting key grant in a block's past is no end of the key.
Spec: blocks.md, The cut / Seen: a block that has seen a standing end counts for nothing; one written before it (or that has it in its past only as a waiting word) is true.

## 2 stolen phone

- Q: stands(sale) the thief sells the oven at nine; the phone's voice states reach P1D; no keeper has spoken  
  A: `false [{"on":"reach","block":11}]`
- Q: stands(sale) both keepers hold a receipt, no cutoff yet  
  A: `false [{"on":"reach","block":11}]`
- Q: stands(sale) one keeper received the key grant that leaves the phone out before her cutoff; the other's cutoff closed  
  A: `false [{"on":"reach","block":11}]`
- Q: stands(thief's key grant adding his key) waits 30 days, not confirmed  
  A: `false [{"on":"confirm","block":18}]`
- Q: [2b stolen phone, control] stands(sale) two keepers cut off through receipt + P1D with nothing unnamed, no end  
  A: `true`
- Q: [2c a voice above confirms a reach word] stands(sale) before anyone above has spoken  
  A: `false [{"on":"reach","block":11}]`
- Q: [2c a voice above confirms a reach word] signed_by_author(card's showing block)  
  A: `true`
- Q: [2c a voice above confirms a reach word] signed_by_author(card's later block, refs.key the showing grant)  
  A: `true`
- Q: [2c a voice above confirms a reach word] stands(sale) the card (a voice above the phone) names it in refs.confirms  
  A: `true`

Spec: identity.md, Reach: a `transfer` signed by a key whose voice states a reach "is waiting until her clock has held it for the reach": `needed` keepers each hold a receipt and a cutoff through receipt + reach, "and no key grant that leaves the key out is received before those cutoffs on any one of those lines" (one line is enough to narrow: blocks.md, One to narrow). `on: reach`.
Spec: identity.md: a key grant that adds a key stands only after the signer's second signature (rule 13) and its wait; none was made, so `on: confirm`.
Spec: identity.md, Reach: "It also stands once a voice above that key names it in `refs.confirms` of a counted block." (vector 18: true at once).

## 3 ten minutes

- Q: (1) a list putting her key in the phone's place with wait and reach zero: is it a key grant (stands)?  
  A: `false [{"on":"end","block":10}]`
- Q: (1) the same, and the phone signs it again at once  
  A: `false [{"on":"end","block":10}]`
- Q: (1b) a list that keeps the phone's place as it was and adds her key below, never signed again by the phone  
  A: `false [{"on":"confirm","block":12}]`
- Q: (2) a grant to her own key, never signed again (the planted grant)  
  A: `false [{"on":"confirm","block":13}]`
- Q: (3) a new account word  
  A: `false [{"on":"confirm","block":14}]`
- Q: (4) the van sold, no keeper has received it  
  A: `false [{"on":"reach","block":17}]`
- Q: (4) the van sold, a day passes, two cutoffs close the reach (Maria not told)  
  A: `true`
- Q: identity_state.keys: Leila's key speaks?  
  A: `false`
- Q: identity_state.waiting lists (blocks, on)  
  A: `[{"i":10,"on":"end"},{"i":12,"on":"confirm"},{"i":13,"on":"confirm"},{"i":14,"on":"confirm"}]`

Spec: identity.md, A voice changes only what is below it: "its own place's `wait` and `reach` as they were; one that does not is no key grant" (the thief cannot zero the phone's wait).
Spec: blocks.md, Finality / rule 13: a key grant that brings a key in, a grant, an account word stand only when signed again by the same key after its wait, or by a voice above. The planted grant is never signed again: stands false, `on: confirm`.
Spec: identity.md, Reach: the van sale waits one day on her clock; with two cutoffs through receipt + P1D and no end, it stands (the thief's sale stands if Maria is not told: THREAT-MODEL row).

## 4 malicious host

- Q: stands(a key grant putting the thief in) the host alone cuts off (two keepers needed of three)  
  A: `false [{"on":"wait","block":9}]`
- Q: [4b host as the only keeper] stands(thief's key grant) with the host her only keeper, backdating a cutoff through receipt + P30D  
  A: `true`
- Q: [4b host as the only keeper] stands(card's key grant: new phone key, new keepers) not yet signed again  
  A: `false [{"on":"confirm","block":10}]`
- Q: [4b host as the only keeper] stands(card's key grant) the card signs it again (first voice: wait zero, no clock read)  
  A: `true`
- Q: [4b host as the only keeper] identity_state.keepers is the new keepers  
  A: `true`
- Q: [4b host as the only keeper] stands(thief's key grant) a list already replaced: is it a key grant  
  A: `true`

Spec: blocks.md, One to narrow, the stated number to widen: "that a wait has run ... `needed` lines": the host alone cannot close two of three.
Spec: THREAT-MODEL (01-keys 2.8): "One keeper named alone can end every wait"; with the host the only keeper, backdating a cutoff closes the wait early.
Spec: identity.md, The first voice: "asks nothing of the clock"; "Only the first voice changes `keepers`".

## 5 quarrelling relatives

- Q: stands(Ka) mum+brother, a wait run, needed 2  
  A: `false [{"on":"end","block":9}]`
- Q: stands(Kb) sister+mum, a wait run, needed 2 (neither sees the other)  
  A: `false [{"on":"end","block":11}]`
- Q: stands(Kc) a third by the same voice that has both in its causal past, after its wait  
  A: `true`
- Q: identity_state.voices[2].key is Kc's key  
  A: `true`
- Q: [5b the card says no] stands(Ka) one keeper's line holds the card's no before her cutoff that closes the wait  
  A: `false [{"on":"end","block":8}]`
- Q: [5b the card says no] signed_by_author(card's no)  
  A: `true`
- Q: [5c a key grant naming a list already replaced; no keepers read] stands(K) a list that names the genesis (already replaced by K1 standing in its past)  
  A: `false [{"on":"end","block":3}]`

Spec: identity.md, Two by one voice: "Two key grants of one voice, neither in the other's causal past, are a pair of that voice: neither stands ... until one block of that voice has both in its causal past"; the third that sees both stands after its wait (01-keys section 5, Quarrelling relatives).
Spec: identity.md, Saying no is signing: "one keeper's line holding the no's receipt before her cutoff that closes the wait is enough".

## 6 death

- Q: stands(successor grant) a voice above the phone (the card) signs it  
  A: `true`
- Q: stands(Kw) fourteen days on, no "no" from a voice above (the phone is below them)  
  A: `true`
- Q: under_ok(heir transfer) before any close: speaks for no one  
  A: `false`
- Q: under_ok(heir transfer) with the successor's close (the grant stands, the witnesses' key grant stands in its past) in its causal past  
  A: `true`
- Q: stands(a later key grant of Harry's, a counted close in its past)  
  A: `false [{"on":"confirm","block":27}]`
- Q: identity_state.voices length (the witnesses' grant stood: card only)  
  A: `1`

Spec: identity.md, When a key grant stands: the voice above (the card) signs the successor grant (rule 13: "or a voice above that key has signed it"). profiles/successor.md: the witnesses are a voice, "They record the death by a key grant that leaves no voice at their place or below"; "a voice below cannot" say no (the phone is below them).
Spec: profiles/successor.md, When a close counts: the grant stands and "the witnesses' key grant stands in its causal past"; No power before the death; "After a counted close no key grant of hers counts."

## 7 Mama Achieng

- Q: stands(list) card A restates the list, card B above it by hash, A below, no keepers: not yet signed again  
  A: `false [{"on":"confirm","block":3}]`
- Q: stands(list) card A signs it again (zero wait, no keepers)  
  A: `true`
- Q: stands(grant to the SIM tool) card A (place 1, wait PT0S) once  
  A: `false [{"on":"confirm","block":5}]`
- Q: stands(grant to the SIM tool) card A twice  
  A: `true`
- Q: signed_by_author(the thief's block signed with card A)  
  A: `true`
- Q: stands(card B's key grant) card B signs it twice  
  A: `true`
- Q: signed_by_author(the thief's block signed with card A that has the new list standing in its past)  
  A: `false`
- Q: signed_by_author(the thief's block signed before, never seeing it) still true  
  A: `true`
- Q: identity_state.keys (B shown, A2)  
  A: `2`

Spec: identity.md, The first voice: "its wait is zero whatever it states"; a wait of zero "has run at once and asks nothing of the clock", but a second signature is still needed (01-keys 6, vector 12: "true at its confirm, with no keepers").
Spec: identity.md, refs.key: a key named by hash "speaks first in the key grant that shows it" (card B shows itself once, signs twice); invariant 8 / The cut: the thief's block that has the new list standing in its past counts for nothing, one written before does not.

## 8 one voice, no clock

- Q: stands(grant) signed once  
  A: `false [{"on":"confirm","block":2}]`
- Q: stands(grant) signed again by the same key (first voice, wait zero)  
  A: `true`
- Q: stands(a promise) no reach stated, no relier yet  
  A: `false [{"on":"end","block":4}]`
- Q: stands(a promise) a relier's accept (not its signer) that has seen no end  
  A: `true`
- Q: identity_state.waiting is empty  
  A: `0`

Spec: blocks.md, Finality, rule 13 (a grant stands at its second signature); The cut: "with no clock ... a relier's counted block uses it, or the word's signer names it in a later counted block" - a plain promise of a no-reach key waits until a relier uses it (vector 19).

## 9 broken suite

- Q: stands(the key grant that puts sound-suite keys in every place)  
  A: `true`
- Q: signed_by_author(old phone block that the move has in its causal past)  
  A: `true`
- Q: signed_by_author(old phone block written before the move, not in the move's causal past, cut by causal order alone)  
  A: `false`
- Q: fork_pairs: two old-key blocks naming one prev, neither in the move's causal past (they count for nothing)  
  A: `0`
- Q: fork_pairs: the same two blocks with no suite move held (control)  
  A: `1`

Spec: identity.md, A suite move: "cuts by causal order alone: a block of the old key counts only when that key grant has it in its causal past ... A block that does not count for its author forms no pair."

## 10 key under a voice

- Q: signed_by_author(tablet block) the key grant adding it waits 30 days (phone), no confirmation yet  
  A: `false`
- Q: stands(U) added under the phone  
  A: `false [{"on":"confirm","block":9}]`
- Q: stands(U) the phone signs it again after the 30 days closed on two keepers  
  A: `true`
- Q: signed_by_author(tablet block that has U standing in its past)  
  A: `true`
- Q: identity_state.keys includes the tablet  
  A: `true`
- Q: key_timeline voice/under for the tablet  
  A: `[{"voice":null,"under":"phone"}]`
- Q: signed_by_author(a key grant signed by the tablet) a key under a voice signs no key grant  
  A: `false`
- Q: signed_by_author(tablet block that has the stop of its key grant in its past)  
  A: `false`

Spec: identity.md, A key under a voice: "speaks while that voice speaks, ... signs no key grant, and stands as a key grant of that voice does"; "Its signer, or a voice above, ends it by a stop of the key grant that added it."; core.md 01-keys 2.1 (key_timeline: `voice` null, `under` the key of its voice).

## 11 a lower voice changing its own wait

- Q: stands(a list by the phone that changes its own wait to zero), signed twice  
  A: `false [{"on":"end","block":9}]`
- Q: stands(a list by the phone that changes a voice above it)  
  A: `false [{"on":"end","block":11}]`
- Q: stands(a list by the phone that changes keepers: only the first voice may)  
  A: `false [{"on":"end","block":12}]`

Spec: identity.md, A voice changes only what is below it: restates every voice above, its own place's wait and reach as they were, and "Only the first voice changes `keepers`"; a list that does not is no key grant.

## 12 shapes

- Q: stands(a key grant of the phone that only takes the phone's own place out), signed once  
  A: `true`
- Q: identity_state keys after it (the phone is out)  
  A: `false`
- Q: signed_by_author(a phone block that has the standing key grant that took the phone out in its past)  
  A: `false`
- Q: [12b encryption key] stands(a key grant that states only an encryption key), signed once  
  A: `true`
- Q: [12c a closed identity] stands(a key grant that leaves no voice), signed once  
  A: `true`
- Q: [12c a closed identity] signed_by_author(a block after the list with no voice left)  
  A: `false`
- Q: [12c a closed identity] identity_state.voices / keys  
  A: `[0,0]`

Spec: identity.md, Taking oneself out: a key grant that adds no key and only takes its signer's own place out "stands when signed"; Encryption keys: "brings in no voice, lets no one act and waits on nothing"; "A list with no voice left closes her identity: nothing signed after it in any block's causal past counts for her".

## 13 short reply

- Q: short_reply: answer, valid codes, id equals the id of the template block  
  A: `accepted [] true`
- Q: the reply is how many characters  
  A: `107`
- Q: valid(the same signature on the template for the other offer)  
  A: `["bad_signature: no key that its refs.key names (or its genesis key, with none) opens it"]`
- Q: short_reply with the code of the other offer  
  A: `null`
- Q: short_reply by her second key (refs.key from her list, prev the key grant)  
  A: `accepted []`
- Q: short_code(O1) is XXXX-XXXX  
  A: `RQQB-T8WN`
- Q: code_matches(lower case, no hyphen, O for 0)  
  A: `true`

Spec: profiles/short-form.md, The short reply (way 1): the receiver rebuilds the template with `refs.key` from her list (none for her genesis key) and checks it: "The block whose signature opens is the block; if none opens, nothing was said"; "It changes no signed byte and no id"; The short code: the first 5 bytes of the id in Crockford Base32, XXXX-XXXX, typed in any case, `O` as 0, `I` and `L` as 1.

## 14 a voice with no wait

- Q: stands(K2) a key grant by a voice that states no wait (place 1), signed twice by the same key  
  A: `false [{"on":"confirm","block":3}]`
- Q: stands(K2) the voice above (the card, shown) signs it  
  A: `true`

Spec: identity.md, When a key grant stands: "A voice that states no `wait` brings in no key by itself; a voice above may." (vector 7)

## 15 operator

- Q: stands(operator's key grant for the machine) signed once  
  A: `false [{"on":"confirm","block":5}]`
- Q: stands(operator's key grant) the operator's key confirms it (wait zero)  
  A: `true`
- Q: identity_state.operators of the machine  
  A: `[true]`
- Q: stands(a stranger's key grant for the machine, no operator grant) signed twice  
  A: `false [{"on":"confirm","block":8}]`

Spec: identity.md, Autonomous systems and machines: the operator is "a voice above the machine's whole list, with a wait of zero: its key grant for the machine, naming the operator grant in `refs.under`, stands when the operator's key confirms it"; the operator grant is itself a grant (rule 13) and the machine consents.

## 16 counted_to, no reach

- Q: stands(Kc) the card ends the key and names counted_to X1 (a key grant by a voice above)  
  A: `true`
- Q: stands(X1) on the counted line  
  A: `true`
- Q: stands(X2) off the line, a relier used it before seeing the end  
  A: `true`
- Q: stands(X3) off the line, nobody used it  
  A: `false [{"on":"end","block":7}]`

Spec: identity.md, Ending a key: "The counted line ... is inside the cut, and a waiting block on it stands."; blocks.md, The cut: a word with no clock passes an end when it is inside the end's cut, "a relier's counted block uses it", or its signer names it later (vector 20).

## 17 refs.key

- Q: valid(block with refs.key the key grant that lists the key)  
  A: `[]`
- Q: valid(the same key, no refs.key)  
  A: `["bad_signature"]`
- Q: valid(refs.key naming a key grant that does not bring the key in)  
  A: `["bad_signature"]`

Spec: core.md section 5 / identity.md, refs.key: a block signed by a key other than its author's genesis key names, in `refs.key`, the key grant that brought that key in; valid resolves the key from it alone (changes-1.8/00-shared.md, row 29-30).

## 18 phone confirms after its wait

- Q: stands(grant) two keepers cut off through receipt + P30D, the phone has not signed again  
  A: `false [{"on":"confirm","block":10}]`
- Q: stands(grant) the phone signs it again after the 30 days have run  
  A: `true`
- Q: stands(grant) the phone signs it again at once, before any wait has run  
  A: `false [{"on":"wait","block":16}]`

Spec: blocks.md, Finality, rule 13: a grant "stands only when the same key has signed it again after that key's wait has run" (P30D for the phone, run on her keepers' clock); a second signature before the wait has run does not count (`on: wait`).

## The GUESS list (every place the text was silent or unclear; each is marked `GUESS` in `../fb.cjs`, or noted where it is a reading of the text)

1. `voices: []` is allowed in a key grant (the shape says a list is non-empty; "a list with no voice left" and vector 27 have no other way to be written).
2. Two standing key grants that name one list and do not see each other, by different voices: the higher voice's is the list; by one voice: neither (a pair). Text names only the pair of one voice and the "no".
3. "One list at a time" is read by causal past only: a key grant counts only if its `refs.updates` is the list standing in its own causal past (the "where `needed` keepers received it" reading is not built).
4. A pair is two key grants of one voice (same place) that name one list and do not see each other; its members never stand, even once a block of that voice sees both (the third block that sees both stands after its wait).
5. `on` for a key grant that is no key grant (restates wrongly, names a replaced list), for a pair, and for a "no" seen is `end`; for a key grant with no speaking signer, `confirm`. `stands` lists the word and each named block that does not stand, each with its own reason; the single reason is the first of named, confirm, wait, reach, end, condition.
6. The second signature: a counted block of the same key (any type; `observe` kind `confirm` in these stories) naming the word in `refs.confirms`; the wait is read as run in that block's own causal past (the cutoffs reach it by `refs.after`/`prev`). The text says "after the wait has run" and never says whose reading.
7. Voice of named people: `needed` distinct ids each confirm again after the wait; the signer's own key grant is not one of them; no separate count of first signers.
8. "No": a key grant by a voice above naming the same `refs.updates`, signed by a key that speaks (it need not stand itself); "first" = in the confirming block's causal past (also used when a clock exists) or, with a clock, one line holds its receipt before the closing cutoff.
9. A cutoff: `refs.subject` the word, `when` at or after receipt + wait, after the keeper's receipt on her line; `derives_from` lists the blocks received. Relevant blocks: for a key grant's wait, the "no" grants and stops of it; for a reach, key grants that leave the key out (a key grant that itself takes its own key out is not its own end). A cutoff that names one denies; one that leaves one out is false and closes nothing.
10. A keeper's line: the block id's key's counted blocks after it (a genesis id: all its genesis key's blocks); no continuation past a keeper's key replacement; `circle#role` gone; `names` must be sorted ids, `needed` stated for more than one.
11. A key under a voice: a key grant stating one `public_key_sign` and no `voices` (with `voices` too it is `shape`); its place is its signer's voice; it ends when the key of that place changes unless its adding block is inside that key grant's causal past, or by a stop of its key grant by its signer or a voice above; it signs no key grant.
12. A reach also holds the key grants of her own list (except taking oneself out and an encryption key, which wait on nothing); list standing uses the wait only (reach is a conjunct of `stands`).
13. Rule 13 words: a `grant` that is not a key grant or an answer, an `observe` of kind `account`, a `transfer` naming in `refs.what` an `observe` of kind `invasion` or `claim`.
14. Ends in `stands`: a stop by the signer, a standing key grant that leaves her key out; `until`, `expires`, removal and a newer word are not read (no clock). With a reach the word's clock is the list's keepers; a voice above that confirmed it also passes its ends. A stop names its word in `refs.updates`, so a stop of a waiting word does not itself stand.
15. A sealed header names no `refs.key` until stage 2 adds the header `key`: every key a key grant of its author brought in is tried.
16. `refs.key` may name any key grant that lists the key; a showing block names the list that holds the hash and has that list as its `prev`; the shown key's suite is its voice's `suite`.
17. A block whose `refs.key` names a block not held is `bad_signature` (refs.key is not yet in `needs`: stage 2).
18. The successor: the witnesses are any `names` voice that signs a key grant leaving no voice at its place or below; the close still needs `scope.types` to name `observe.close` (the old rule is kept); "the successor is never one of the witnesses (`shape`)" cannot be a `shape` (it needs her list) and is not built; `yieldsToSuccessor` reads a counted close of her under the grant where it read a trigger.
19. A machine lock's own `reach` is text, not a duration: skipped by the duration check and the undeclared-key-field check (the name is used twice in the text).
20. `short_code` keeps its `long` argument (protocol.json's door still lists it); `code_matches` takes any typed length of 8 or more as a prefix ("more characters of the id, five bits at a time").
21. The short reply: `refs.for` is the block answered; `derives_from` is the held `readback` observe `for` it; a decline has neither `derives_from` nor, with `at` all zero, an `at`; `prev` is the key's highest-seq block held below `seq`, else the block that brought the key in; `refs.key` is the key grant that lists the key. The door op `short_reply` is the oracle's own (not in protocol.json).
22. A suite move is a standing key grant that takes a key out of the list and puts another suite's key in its place; it cuts only what the reader holds as standing.
23. `identity_state.waiting` lists every word of hers that does not stand, including a plain promise that no relier has used (a literal reading of Finality).
24. `key_timeline` lists the keys of the genesis, of standing lists, shown keys and standing keys under a voice; `ended` is the standing key grant that took the key out (or the stop).
25. After a counted close, a key grant stands only through a confirming block that does not have the close in its causal past.

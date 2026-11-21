# Stage 2 (the store): the questions asked of the oracle and its answers

Made by hand with Node's `crypto` (`lib.cjs`: its own canonical writer, Ed25519 and P-256), every block but a genesis signed over its header (core.md, section 2), a genesis over its own bytes. Run `node stories.cjs`; this file is made by `node make-answers.cjs`. Ids are shortened to six hex characters where an answer shows one.

## 1 not read

- Q: valid(41) block with state.sparkle  
  A: `[]`
- Q: read(41)  
  A: `["undeclared_field"]`
- Q: valid(42), only 41 held beyond her genesis and 1  
  A: `[]`
- Q: read(42)  
  A: `[]`
- Q: valid(43), the thing that names 41 in refs.for  
  A: `[]`
- Q: read(43): names_unread, with the id  
  A: `[["names_unread",["e996b7"]]]`
- Q: accept(41, 42, 43): taken / unread  
  A: `["0e7347","68d0c7","e996b7"] / [["68d0c7",["names_unread"]],["e996b7",["undeclared_field"]]]`
- Q: what a fold reads of 41: its header, no type  
  A: `undefined sealed`
- Q: what a fold reads of 42: the block  
  A: `thing`
- Q: signed_by_author(42)  
  A: `true`
- Q: read(41) once the reader knows the field: a schema declaring sparkle, named in refs.schema  
  A: `(see story 1b)`

Spec: core.md, section 8: "A block that is valid and not read is kept as its header and counts in no fold; it is never refused for being unreadable." `read`: "true when the reader holds the body, the body passes check 8 against `schemas`, and every block it names for its meaning ... is held, valid and read (`names_missing` ..., `names_unread` ...)". folds.md: "A block that is valid and not read ... is held as its header: it keeps its place on its line, and no fold reads its body".

## 1b not read, then read

- Q: read(41 naming a schema it declares), schema not held  
  A: `["names_missing"]`
- Q: read(41 naming the schema), the schema held  
  A: `[]`

Spec: core.md, section 8, The schema store: "a schema not held is `names_missing`"; "A closed block that names a held schema in `refs.schema` may carry the `fields` ... the schema declares".

## 2 lost block

- Q: valid(4) with 3 not held  
  A: `[]`
- Q: check_chain: gaps / broken  
  A: `[3] / 1`
- Q: read_whole(4, 1): whole, lacks (3 named by 4's prev)  
  A: `false [true]`
- Q: a fold that reads the line (onLine) answers  
  A: `{"not_shown":true,"lacks":["<3>"]}`
- Q: read_whole(4, 1) with 3 held  
  A: `{"whole":true,"lacks":[]}`
- Q: the fold now answers  
  A: `"an answer"`
- Q: read_whole(c4 seq 4 prev block 2, 1): lacks by number  
  A: `{"whole":false,"lacks":[{"author":"<maria>","key":null,"seq":3}]}`
- Q: read_whole(4, 1) with 3 held as its header only  
  A: `false ["<3>"]`
- Q: read_whole with the genesis as start  
  A: `no error`

Spec: core.md, section 5 (the `seq` bullet): "A block whose `seq` or `prev` does not fit its line is still valid"; blocks.md, Micro safety; folds.md, A line: "answers `{ not_shown: true, lacks }` ... its id where a held `prev` names it, else `{ author, key, seq }`"; the chain fold (folds.md) shows `gaps` and `broken`.

## 3 key grant

- Q: valid(tablet's first block), key grant not held  
  A: `[["unmet","pieces not held: <KG>"]]`
- Q: valid(tablet's first block), key grant held  
  A: `[]`
- Q: accept(tablet block) with no key grant: unjudged needs the key grant  
  A: `{"taken":0,"unjudged":[["<KG>"]]}`
- Q: accept(key grant, then the tablet block, in one push)  
  A: `{"taken":2,"unjudged":0}`
- Q: valid(a key grant signed by the key it brings in, no refs.key)  
  A: `["bad_signature"]`
- Q: valid(a block naming the forged key grant)  
  A: `["bad_signature"]`
- Q: valid(refs.key names a genesis, not a key grant)  
  A: `["bad_signature"]`
- Q: valid(refs.key names a key grant whose subject is another author)  
  A: `["bad_signature"]`
- Q: valid(block of a key brought in by a not-read key grant)  
  A: `[]`
- Q: read(that key grant): undeclared_field  
  A: `["undeclared_field"]`
- Q: signed_by_author(block of a key a not-read key grant brings in)  
  A: `false`

Spec: core.md, section 8, checks 5 and 6: "Each piece is held and valid (`unmet`, naming each one not held, ids ascending)"; "The block `refs.key` names is a key grant ... whose `refs.subject` is this block's author ... (else `bad_signature`)"; "A key grant that is valid brings its key in for this check whether or not this reader can read it; one that is not read gives its key no voice in any fold."

## 4 unknown suite

- Q: valid(a key grant naming suite pq1)  
  A: `["unknown_suite"]`
- Q: valid(a key grant adding a key that fits no suite)  
  A: `["unknown_suite"]`
- Q: valid(a block whose key grant names a suite not known)  
  A: `["unknown_suite"]`
- Q: accept(both): taken / unjudged / refused  
  A: `0 / 2 / 0`

Spec: core.md, section 2, Which suite: "A block whose key names a suite the reader does not know is not judged (`unknown_suite`): like `unmet`, it waits"; section 8: "`unmet` and `unknown_suite` are waits".

## 5 held header

- Q: valid({ header, header_signature }) with its pieces held  
  A: `[]`
- Q: the header carries key  
  A: `true`
- Q: valid(the header with key left out)  
  A: `["bad_signature"]`
- Q: valid(the header with key changed to the genesis id)  
  A: `["bad_signature"]`
- Q: valid(the header with seq 2)  
  A: `["bad_signature"]`
- Q: valid(the header with another prev)  
  A: `["bad_signature"]`
- Q: valid(the header with an extra key)  
  A: `["shape"]`
- Q: valid(the header, key grant not held)  
  A: `["unmet"]`
- Q: valid(the header: a bare unsigned header)  
  A: `["shape"]`
- Q: valid(the block signed over its own bytes: the body form)  
  A: `["bad_signature"]`
- Q: verify(block, signature, key) over the header  
  A: `true`
- Q: verify(block, body-form signature, key)  
  A: `false`
- Q: a header held beside its body is nothing new: accept(header) taken  
  A: `["612f07"]`
- Q: a header that does not describe the body held  
  A: `["bad_hash"]`
- Q: a body arrives for a header held under its hash that names another prev: taken / false_headers  
  A: `1 / ["612f07"]`

Spec: core.md, section 8, A held header: "`valid` of a header checks its keys (`header`, `header_optional`; `shape`), its pieces ... and its signature"; section 2: "A block is signed over its header ... and over nothing else"; privacy.md, The public header: "A header and a body of one hash are two halves of one block ... a body arriving under the hash of a header it does not fit shows that header false and replaces it (`false_headers`)".

## 6 pairs

- Q: fork_pairs: two blocks of one key on one prev  
  A: `[["cfd811","f6bc37"]] ["cfd811","f6bc37"]`
- Q: check_chain equivocations  
  A: `1`
- Q: fork_pairs: two blocks at one seq, one naming a made-up prev  
  A: `[["6f4a8c","8caa79"]] ["6f4a8c","8caa79"]`
- Q: accept(c2b) when c2 is held, takes_pairs false: taken / equivocations / refused / unjudged  
  A: `0 / 1 / 0 / 0`
- Q: the same with takes_pairs true: taken  
  A: `1`
- Q: both of the pair in one push, takes_pairs false: taken / equivocations  
  A: `0 / 1`
- Q: counts(b2a), counts(b2b), counts(b1), counts(b3 after the pair)  
  A: `[false,false,true,false]`
- Q: fork_pairs of two held headers  
  A: `[["cfd811","f6bc37"]]`
- Q: a block of another key on the same prev as two a (not a pair); pairs are still just the old one  
  A: `0`

Spec: core.md, section 9, invariant 3: "no two name the same `prev` or state the same `seq` ... Two that do are a pair, and both are kept"; folds.md, A fork is a burden: "every block of that key whose `seq` is at or above the lower `seq` of the pair are blocks of a fork"; nodes.md, Push (The answer): the star, `takes_pairs`; Equivocation: "it needs no line, only the two (or their headers). Blocks of two keys are never a pair".

## 7 wire

- Q: strict_text(the canonical bytes)  
  A: `[]`
- Q: strict_text(450.0 for 450)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(450 written 4.5e2)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(keys reordered: refs first)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(a space after a colon)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(a newline at the end)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(an escape that is not the shortest, \u0073 for s)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(a repeated key)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(-0)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(2^53)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(2^53 - 1)  
  A: `[]`
- Q: strict_text(a null)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(not JSON)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(a set not sorted in refs: check 1 on a canonical text)  
  A: `[["not_canonical","hash of these bytes"]]`
- Q: strict_text(nested deeper than limits.depth)  
  A: `[["size_limit","hash of these bytes"]]`
- Q: strict_text(over limits.block_bytes)  
  A: `[["size_limit","hash of these bytes"]]`
- Q: strict_text(over the limit and not canonical: size_limit first)  
  A: `[["size_limit","hash of these bytes"]]`
- Q: strict_push(canonical)  
  A: `[[],[]]`
- Q: strict_push(message keys out of order)  
  A: `[{"hash":"<h>","code":"not_canonical","detail":"not the canonical bytes of the value"}]`
- Q: strict_push(450.0 inside a block of a canonical-looking push)  
  A: `[{"hash":"<h>","code":"not_canonical","detail":"a number token that is not canonical"}]`
- Q: strict_push(a block with a null inside canonical bytes): the block alone is refused  
  A: `[[{"hash":"7f87e41a31b6fd8a2924e693bf75a01db720967cada865c033157c2b2dbf0d12","code":"not_canonical","detail":"null at state.z"}],[]]`
- Q: unwrap(message): the id is the hash of the bytes as written in the suite of her key  
  A: `true`
- Q: unwrap(a message with suite)  
  A: `shape`
- Q: unwrap(a message with version)  
  A: `shape`

Spec: canonical.md, On the wire: "A message is its canonical bytes ... Any difference refuses the message (`not_canonical`)"; "A refusal names bytes. Its `hash` is the SHA-256 of the bytes refused"; "Two limits are read on the bytes first"; Strict writing rule 3: "any other number token is not canonical"; core.md, section 6: "exactly `{ block, signature }`: any other key refuses it (`shape`)"; nodes.md, Push: "bytes that are not canonical refuse the whole push (`not_canonical`) ... A block whose own bytes break strict writing is refused alone".

## 8 text

- Q: the two spellings are two texts: two ids  
  A: `true`
- Q: strict_text(composed), strict_text(decomposed)  
  A: `[[],[]]`
- Q: valid(composed), valid(decomposed)  
  A: `["[]","[]"]`
- Q: accept(both) takes_pairs true: taken (they also stand on one seq: a pair)  
  A: `2 1`
- Q: a key not in NFC  
  A: `[]`
- Q: strict_text(a lone surrogate written as an escape)  
  A: `["not_canonical"]`
- Q: strict_text(a lone surrogate, raw in the text)  
  A: `["not_canonical"]`
- Q: strict_text(a noncharacter U+FFFF in a name)  
  A: `[]`
- Q: valid(a block whose text holds a lone surrogate)  
  A: `["not_canonical"]`

Spec: core.md, section 3: "Text is well-formed Unicode: valid UTF-8 with no surrogate code point, keys too ... no normal form ... Two texts are the same when their bytes are the same. Noncharacters are text."; canonical.md, Edge cases: "a lone surrogate, as an escape or raw | refused".

## 9 passkey

- Q: valid(a genesis of the p256 suite signed by a passkey)  
  A: `[]`
- Q: the challenge of a genesis is its id in base64url  
  A: `true`
- Q: the challenge of a block is the SHA-256 of its header, base64url  
  A: `true`
- Q: valid(a block signed by a passkey, 91-byte frame, nothing after it read)  
  A: `[]`
- Q: valid(the same, clientDataJSON with extra fields after the frame)  
  A: `[]`
- Q: valid(the challenge of the block's own bytes, not its header)  
  A: `["bad_signature"]`
- Q: valid(clientDataJSON with the origin missing: not the 91-byte frame)  
  A: `["bad_signature"]`
- Q: signature lengths made  
  A: `8192 8193`
- Q: valid(a passkey signature of exactly 8,192 bytes)  
  A: `[]`
- Q: valid(a passkey signature of 8,193 bytes: opens with no key)  
  A: `["bad_signature"]`
- Q: verify(block, passkey signature, key) 8,192 / 8,193  
  A: `[true,false]`
- Q: verify with bit 0 of the flags byte off  
  A: `false`

Spec: encoding.md, Passkeys, The check (1 to 4): the form, `limits.signature_bytes`, flags bit 0, "`clientDataJSON` begins with exactly these bytes ... 91 bytes in all ... no JSON is parsed", then ECDSA over `authenticatorData || SHA-256(clientDataJSON)`; Bytes: "at most `limits.signature_bytes` bytes (8,192) ... a longer one opens with no key"; What was signed: "the challenge is `base64url(SHA-256(M))`" with M a block's header, a genesis's own bytes.

## 10 stranger push

- Q: accept(Harry's ask and his genesis) into a node holding only Maria: taken  
  A: `["genesis","ask"]`
- Q: accept(the ask alone): unjudged needs his genesis  
  A: `[["genesis"]]`
- Q: the keys that may sign for Harry, read from the pieces carried  
  A: `1 (his genesis key)`
- Q: the signed push is checked against those keys: refusals  
  A: `[]`
- Q: with no pieces carried (node holds nothing of him): no key  
  A: `["bad_signature"]`

Spec: nodes.md, Messages: "A signed request from a signer the node does not hold is checked against the pieces the push carries"; Push: "A node judges each block on its pieces".

## 11 per_stranger

- Q: 60 pieces pushed first, then one ask: asks taken today = 0: refusals of the ask  
  A: `[]`
- Q: a piece (a block that names none of the node's people) with 20 asks taken: refusals  
  A: `[]`
- Q: the 21st ask: asks taken today = 20  
  A: `["not_admitted"]`
- Q: the 20th ask: asks taken today = 19  
  A: `[]`
- Q: a listed party's ask with 20 taken  
  A: `[]`
- Q: asks_today not stated  
  A: `argument error`

Spec: nodes.md, Admission: "`per_stranger` is the most **asks** one day may bring from each sender ... An ask is a block that names one of the node's people in a ref; a block's pieces, and the blocks its answer reads, are never counted."

## 12 push answer

- Q: accept: taken  
  A: `["plain","sparkle"]`
- Q: accept: unjudged  
  A: `[["lost",["KG"]]]`
- Q: accept: unread  
  A: `[["sparkle",["undeclared_field"]]]`
- Q: accept: refused  
  A: `[["ce955f","bad_signature"]]`
- Q: push_answer: keys, in order  
  A: `["node","taken","unjudged","refused","unread","equivocations","signature"]`
- Q: push_answer: receipt and held left out; empty lists are []  
  A: `[[],false,false]`
- Q: push_answer with held and receipt: keys  
  A: `["node","taken","unjudged","refused","unread","equivocations","receipt","held","signature"]`
- Q: push_answer signature opens over the answer without it  
  A: `true`
- Q: the same push in the reverse order gives the same answer  
  A: `true`

Spec: nodes.md, Messages and Push: "A push answer is `{ node, receipt, taken, held, unjudged, refused, unread, equivocations, signature }`; every key is always present but `receipt` and `held`"; "One whose pieces are not all there is unjudged (`unjudged`, with the pieces it lacks as `needs`) ... a valid block is taken; it is then read, and one that is not read is listed in `unread` with its codes"; "what is taken never depends on the order of a push".

## 13 log

- Q: the answer: log is the one asked, next, n of each block  
  A: `[true,3,[],true]`
- Q: log_shown: receipt 2 puts A at 2, the answer covers 2 (since 1, next 3) and omits A: left_out  
  A: `["A"]`
- Q: with dropped (seq 4) naming A, next 4 (then nothing is left out)  
  A: `[]`
- Q: dropped naming the receipt (seq 5), next 5  
  A: `[]`
- Q: a drop naming a block Maria signed: left_out still lists it  
  A: `["hers"]`
- Q: a number at or below since is not covered (since 2)  
  A: `[]`
- Q: the request filters on kind receipt: A is no match, so not left out  
  A: `[]`
- Q: stopped short: seen receipt 3, answer next 1 = since 1  
  A: `[1,true]`
- Q: a node that read to the seen receipt answers next 3: stopped_short  
  A: `[3,false]`
- Q: two logs: fork_pairs of two receipts of one door key at seq 2  
  A: `[["r2b","r2"]]`
- Q: a block with no arrival number is served only as a proof (not a match of since 0)  
  A: `[1]`
- Q: an answer with no log asked names none  
  A: `false`

Spec: nodes.md, The arrival log: "Left out", "Stopped short", "Two logs", "A block's arrival number on a log is the `seq` of the first receipt on it that names the block", "`dropped` ... drops every block they name that the door's person neither signed nor answered"; Pull: "`seen` ... an answer to it is the node's word that it read its log at least that far".

## 14 export

- Q: her export: the blocks in it  
  A: `[".",".",".","KGm",".",".","genesis","m1","m2"]`
- Q: the export is canonical JSON, each block as signed: the document  
  A: `true`
- Q: exportWhole(her export, the door log, receipt 3 she holds)  
  A: `{"whole":true,"why":[]}`
- Q: the same with a block a receipt names removed (m1)  
  A: `{"whole":false,"why":["a block a receipt names is not in it: d796d980","a line lacks a block a receipt names: d796d980"]}`
- Q: the same with a piece removed (her key grant)  
  A: `{"whole":false,"why":["a block a receipt names is not in it: d796d980","a block a receipt names is not in it: 79f34696","a piece is not in it: b481d291"]}`
- Q: the same with receipt 1 removed: the door log has a hole  
  A: `{"whole":false,"why":["the door log has a hole"]}`
- Q: m1 is missing though a dropped names it; a receipt names it too and m2's line reaches back to it  
  A: `{"whole":false,"why":["a line lacks a block a receipt names: d796d980"]}`

Spec: nodes.md, A host, Her record at a host: "An export is whole when the door log runs unbroken from its first receipt to a receipt she holds; every block a receipt on it names is in it or named by a `dropped`; every piece of every block in it is in it; and no fold asked of a block in it answers `not_shown` with a `lacks` that a receipt on the log names."

## Stage 1's questions under the header signature

`stage1-resigned/` holds the stage 1 stories (`lib.cjs`, `maria.cjs`, `stories.cjs`), copied from `../stage1-scratch/` and signed by the new oracle: every block but a genesis over its header. Two edits were needed to ask the same questions: the two `refusals` calls (the op is gone) became `writeFindings` (checks 1 to 4, then check 8 with nothing held), and the short reply calls moved to `short_reply_open` (the stage 1 stories used an op name the door no longer has; the story also wrote `derives_from` as a bare id where the oracle's rebuilder writes a list of one, and a bare id and a list of one are different bytes). `node cmp-stage1.cjs` compares with `../stage1-scratch/ANSWERS.md`, which predates the coordinator's rulings 53 to 60 (so it differs for `stands`); the fair comparison is `baseline/`: the 1.7-signed stage 1 stories under the oracle as it stood before this stage (`fb.before-stage2.cjs`, with today's `protocol.json`). Result: all 116 answers are the same under both; the one difference is the text of a detail (`bad_signature: no key ... opens it` is now `no key its pieces name opens the signature over its header`), not a code. The short reply rebuilds and verifies under the header signature (`accepted [] true`, and by her second key `accepted []`).

## The numbered GUESS list (each also marked `GUESS: [S2-n]` in fb.cjs)

1. **Check 8's other codes.** `refusals.read` lists 12 codes and leaves out `shape`, `grammar`, `decimal`, `time`, `calendar`, which the module checks of a closed block still find in its terms, scope, condition and epoch. Decided: `read` gives them too, after the listed ones, in the order of `refusals.codes.block`. (Or the text moves those checks into check 2.)
2. **`n` for a block with no receipt on the log.** Decided: n is 0 (and a log entry with no `n` is read so); such a block is never a match of a `since`, and only travels as a pair's proof.
3. **A pull answer's `log` when the node keeps none.** `pull_answer` lists `log` with no optional mark, but a signed answer holds no null and discovery's `log` is "when it keeps one". Decided: the key is left out.
4. **Which block `per_stranger` refuses.** The text counts asks and refuses "the next". Decided: only a block that is itself an ask (names the receiver in a ref other than `author`) is refused for the count; a block that is no ask is not.
5. **`lacks` by number.** "its id where a held `prev` names it, else `{ author, key, seq }`": decided that the id case is a walk step to a `prev` not held (or held as a header, or not read), and the number case is a held block whose seq is not its held prev's plus one with no skip, one entry for each number between. (New vector 8 says `read_whole(4, 1)` with 3 not held gives `{ author, key, seq: 3 }`; if block 4's `prev` names block 3, the sentence says the id, and the oracle gives the id. Needs the vector's blocks to settle.)
6. **No door op for leaving.** `protocol.json` names none, though new vector 17 asks one. The oracle has `exportOf` and `exportWhole` as module exports. "The lines each one's answers read": decided as the block's own key's line back to where it begins, since the starts are the folds' (stages 3 to 6).
7. **Discovery's `log`** is optional (`wellKnownErrors` does not ask for it).
8. **The stray "8." in core.md section 8.** Decided: check 8 belongs to `read` (so `valid` stops after check 6); the old check 4 rule that a consent yes names whom it is about (`required`) moved to `read` with it.
9. **A piece held and not valid, a piece held as its header, a piece that waits.** `unmet` names only what is not held (a header holds no key, so it is not held). A held piece that is not valid brings no key in, so the block gets `bad_signature` (this is what new vector 4, a forged key grant, asks); a piece whose only finding is `unknown_suite` makes the block `unknown_suite`.
10. **`read` with no `schemas`.** Decided: the store is `schemas_from(held)`.
11. **`strict_push` of a push that is not canonical whole.** The door text says `not_canonical` (a message code); decided as a flat list of one refusal (the per-message answer is a list of lists). Text that is JSON but no push is an argument error; text that is not JSON is `not_canonical`.
12. **The id in the signed header.** A reader "never trusts one it was sent": the signature is read over the header with the id the reader computes in the key's suite; an id sent that differs is `bad_hash` beside a signature that opens.
13. **A key grant that shows its own key, held as a header.** The key is in its body, so a held header of it opens only with keys its pieces name.
14. **Who counts toward a pair.** "both counting in the identity fold": decided as `signed_by_author` true by the identity fold, for a block held as its header (sealed, or not read) as for a whole one.
15. **`accept` details.** A block whose body is held is nothing new and is not listed. A header whose body is held is taken when it describes it exactly (hash, author, key, seq, prev, skip, withheld), else `bad_hash`. `unread` lists whole blocks only. An id sent with a block is replaced by the id the reader computes. A block that waits only for a suite has `needs: []`.
16. **`log_shown`.** Receipts are given as whole blocks of the log (an opened sealed one as `{ header, header_signature, block }`); the log is `refs.key`, else the author; the answer counts for the request when it names the same log and the request's hash (its node signature is not checked: no key is given); the rule that a receipt after her address stops naming the node is not built; a `dropped` reaches a block the door's person did not sign and did not answer.
17. **The fold answer shape.** No fold in this oracle reads an order, a sum or what a key had seen yet; `onLine(block, start, held, answer)` gives the one shape, `{ not_shown: true, lacks }` (the line itself is `read_whole`).
18. **"Two continuations of one line are a pair"** is not built; the walk through a key's replacement goes on from the key grant's `prev` (the old key signed it), or from `state.counted_to`.
19. **`push_answer` parts** are sorted as `push_answer_order` says; `taken` is read from the parts too (the door's parts list does not name it).
20. **A refusal of `strict_text`/`strict_push` carries `hash`** (the SHA-256 of the bytes as they came) beside code and detail.
21. **`read_whole`.** A block asked of that is itself held only as a header is lacking (its id); a start the walk never meets, with nothing lacking, is an argument error; the genesis counts as a start.

## Where the text looks wrong or unclear (not changed)

- core.md section 8: the "8." (see 8), and `refusals.read` missing five codes (see 1).
- 02-store.md new vector 8 (see 5), and vector 17 has no op (see 6).
- nodes.md Pull: `n` for a block with no receipt, and `log` of an answer for a node with no log (see 2, 3).
- `unmet` for a piece that is held and refused (see 9): the text says "held and valid" in check 5 and "naming each one missing" in sentence 1.
- encoding.md, The check, rule 3 says "WebAuthn Level 2 and Level 3, 5.8.1.1" and fixes the frame as `{"type":"webauthn.get","challenge":"` + 43 characters + `","origin":"`; a real client that writes `crossOrigin` or a different key order first is refused by this frame (the text's own "Open": real passkeys from six clients).

## The run

`node spec/oracle/run.cjs` before this stage: 3,103 passed, 529 failed (stage 1's expected sections; the task named about 3,105 and 527). After: 1,177 passed, 2,455 failed: every vector signed the 1.7 way fails to open under the header signature, the genesis blocks that still carry the recovery fields fail `bad_genesis`, and the NFC and `accept_sealed`/`refusals` cases changed on purpose. That run is not a check this time.


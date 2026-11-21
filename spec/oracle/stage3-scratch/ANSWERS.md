# Stage 3 (amounts): the questions asked of the oracle and its answers

Made by hand with Node's `crypto` (`lib.cjs`, stage 2's: its own canonical writer and Ed25519), every block but a genesis signed over its header, a genesis over its own bytes. Run `node run-all.cjs`; this file is made by `node make-answers.cjs`. Stories are `s1.cjs` to `s9.cjs` (`h.cjs` has the helpers). Where an answer shows `harry`, `maria` ... they are the people of the story; a draw is listed `[block, by, to, amount, takes, why, state]`.

Stage 1 and 2 stories re-run: see "Stage 1 and 2 stories re-run" at the end.

## S2 200 g from 1 kg

- Q: make with inputs 0.2 kg: bag  
  A: `owners [["maria","0.8"]] held 0 ended 0.2 | make0.2 takes landed`
- Q: the loaf  
  A: `owners [["maria",null]] held 0 ended 0 | `
- Q: then a make written 200 g: bag  
  A: `owners [["maria","0.8"]] held 0 ended 0.2 | make0.2 takes landed; make200g unit`
- Q: the loaf of the 200 g make  
  A: `owners [] held 0 ended 0 | `
- Q: then 0.9 kg to Amara: past  
  A: `owners [["maria","0.8"]] held 0 ended 0.2 | to Amara 0.9 past; make0.2 takes landed; make200g unit`
- Q: then 0.8 kg: takes, held  
  A: `owners [] held 0.8 ended 0.2 | to Amara 0.9 past; make0.2 takes landed; make200g unit; to Amara 0.8 takes held`
- Q: Amara accepts: Amara 0.8, ended 0.2  
  A: `owners [["amara","0.8"]] held 0 ended 0.2 | to Amara 0.9 past; make0.2 takes landed; make200g unit; to Amara 0.8 takes landed`

Spec: things.md, A make: "all of each input, or the amount `state.inputs` gives (`amount` in the input's own kind)"; folds.md, What is left, One whole: "an amount of another kind than the measure takes nothing (`unit`)"; "A draw that does not fit takes nothing (`past`)"; Lands: "Nothing fills her silence: until her yes, no one is shown owning what is held".

## S3 0.6 + 0.6

- Q: first 0.6 to Maria inside her order: lands at once (her yes is in its past)  
  A: `owners [["harry","0.4"]] held 0.6 ended 0 | to Maria 0.6 (inside her order) takes held`
- Q: second 0.6 to Amara: past  
  A: `owners [["harry","0.4"]] held 0.6 ended 0 | to Maria 0.6 (inside her order) takes held; to Amara 0.6 past`
- Q: Amara's deal: stage / lines moved / uncovered  
  A: `["underway",[{"id":null,"needed":{"value":"0.6","unit":"kg"},"moved":{"value":"0","unit":"kg"}}],{"from":[],"to":{"value":"1","unit":"GBP"}}]`
- Q: all he owns to Sam: takes 0.4  
  A: `owners [["sam","0.4"]] held 0.6 ended 0 | to Maria 0.6 (inside her order) takes held; to Amara 0.6 past; all he owns to Sam takes landed`

Spec: folds.md, What is left: "It takes when it is above nothing and ... comes to no more than what its owner owns of the measure. A draw that does not fit takes nothing and is never cut down"; "all she owns of it when it states none"; What each fold returns, `uncovered`: "`to` ... what she paid, less ... the price of what moved to her".

## S4 baked then sold

- Q: the sack: the sale takes nothing  
  A: `owners [] held 0 ended 25 | bake whole takes landed; sale of the sack past`
- Q: the loaf is Harry's  
  A: `owners [["harry",null]] held 0 ended 0 | `

Spec: things.md, A make: "all of each input" when `state.inputs` names none; folds.md, What is left: "you cannot give what you no longer have"; "A draw ... takes nothing (`past`)".

## S5 toll

- Q: no grant: the flour  
  A: `owners [["maria","2"]] held 0 ended 0 | Harry's make, no grant not_owner`
- Q: no grant: the loaf (no owner)  
  A: `owners [] held 0 ended 0 | `
- Q: under her grant: the flour  
  A: `owners [["maria","1.5"]] held 0 ended 0.5 | make under the grant takes landed; grant 0.5 kg to Harry takes held`
- Q: under her grant: the loaf, before her yes  
  A: `owners [] held 0 ended 0 | `
- Q: under her grant: the loaf after her accepted answer  
  A: `owners [["maria",null]] held 0 ended 0 | `

Spec: things.md, A make: "a make by anyone else takes nothing (`not_owner`), and its output has no owner"; "Another's goods enter a make by her transfer first, or by a make signed under her grant that names them"; folds.md, Her start, case 2: "the output is hers from her `accepted` answer to it".

## S3b inside her order

- Q: her yes is in its past, nothing names the draw yet  
  A: `owners [["harry","0.4"]] held 0.6 ended 0 | to Maria 0.6 takes held`
- Q: Harry names it in a later block of his own: it stands, and lands on the yes in its past  
  A: `owners [["maria","0.6"],["harry","0.4"]] held 0 ended 0 | to Maria 0.6 takes landed`

Spec: folds.md, Lands: "where the draw stands (blocks.md, Finality) and every word it names is in the causal past: her yes"; blocks.md, The cut: a word passes its ends when "a relier's counted block uses it" or "the word's signer names it in a later counted block of her own". See guess 1.

## S6 silo

- Q: the silo before any of them answers: no owner on the record  
  A: `owners [] held 0 ended 0 | `
- Q: each answers accepted: Harry 300, Maria 200, Sam 500  
  A: `owners [["sam","500"],["maria","200"],["harry","300"]] held 0 ended 0 | `
- Q: Sam draws 100 (takes); Harry sells 300 (takes); 1 kg more (past); the mill (not_owner)  
  A: `owners [["sam","400"],["maria","200"],["amara","300"]] held 0 ended 100 | Sam draws 100 takes landed; Harry sells 300 takes landed; mill draws it not_owner; Harry 1 more past`
- Q: the mill writes 790: owners named with no amount  
  A: `owners [["sam",null],["maria",null],["harry",null]] held 0 ended 0 | `
- Q: and a draw of an amount on it  
  A: `owners [["sam",null],["maria",null],["harry",null]] held 0 ended 0 | an amount of an unsaid silo no_measure`

Spec: things.md, A make: "from several, each owns in it the amount taken from her when its `pack` is the sum of what was taken, in one kind ... otherwise each is named with no amount and hands on only all she owns of it"; folds.md, Her start, case 2; One whole: "An amount drawn on it takes nothing of it (`no_measure`)".

## S7 carcass

- Q: the steer: cut under her grant  
  A: `owners [] held 0 ended 1 | 4c47fc takes held; cut takes landed`
- Q: side A before she accepts: no owner  
  A: `owners [] held 0 ended 0 | `
- Q: side A after: Leila 140  
  A: `owners [["leila","140"]] held 0 ended 0 | `
- Q: she sells 40 kg of side A to Amara: Amara 40, Leila 100  
  A: `owners [["leila","100"],["amara","40"]] held 0 ended 0 | sells 40 kg takes landed`
- Q: no grant: the steer stays whole and Leila's  
  A: `owners [["leila",null]] held 0 ended 0 | 4dafa3 not_owner`
- Q: no grant: his side C has no owner  
  A: `owners [] held 0 ended 0 | `

Spec: folds.md, Her start (cases 2 and 3); things.md, A make; What is left: a part is drawn on as any amount; "Another key ... draws only on a part passed to its own line".

## S9 stranger of

- Q: Harry's sack: owner Harry (an instance by its own block)  
  A: `owners [["harry","1"]] held 0 ended 0 | `
- Q: Leila's thing: owner Leila  
  A: `owners [["leila",null]] held 0 ended 0 | `
- Q: he sells the sack to Amara: Amara  
  A: `owners [["amara","1"]] held 0 ended 0 | sells the sack takes landed`

Spec: things.md, Things, A kind is a kind by its own block: "a stranger's thing that names an instance in `refs.of` says nothing about that instance, so no stranger unmakes Harry's sack by calling it a kind".

## S10 millstone

- Q: to a silent Maria, then to Sam: Sam past from the first minute  
  A: `owners [] held 1 ended 0 | to Maria takes held; to Sam past`
- Q: Maria's yes: lands, Maria  
  A: `owners [["maria",null]] held 0 ended 0 | to Maria takes landed; to Sam past`
- Q: ended before her yes, her next block sees it, then to Sam with her block in its past: takes  
  A: `owners [["sam",null]] held 0 ended 0 | to Sam (her block in its past) takes landed; to Maria takes freed`
- Q: the same, but Sam's draw does not have her block in its past: waiting on the end, never past  
  A: `owners [["harry",null]] held 0 ended 0 | to Maria takes freed; to Sam (before she saw it) waiting`

Spec: folds.md, Lands, Freed: "by the receiver's own counted `declined` or `stopped` answer, or by an end of the draw that the receiver has seen before any yes ... A no or an end that has her yes in its past frees nothing"; "A draw that would fit only once an end she has not seen frees an earlier draw is waiting (`on: end`)"; 03-amounts.md, story 10.

## S11 second key

- Q: the phone sold to Maria, she resold to Leila; later his till (which never saw it) signs the stone to Sam  
  A: `owners [["leila",null]] held 0 ended 0 | Maria resells takes landed; phone sells to Maria takes landed; till sells to Sam not_on_line`
- Q: the phone passes ten trays to the till (to_owner himself, the till accepts); the till sells 10, then an 11th  
  A: `owners [["sam","10"],["harry","10"]] held 0 ended 0 | till sells an 11th past; till sells 10 takes landed; phone passes 10 trays to the till takes landed`
- Q: the phone signs twice on one prev: a pair  
  A: `owners [] held 0 ended 0 | sale 2 to Sam, same prev pair; sale 1 to Maria pair`
- Q: and a later draw of that key reads pair too  
  A: `owners [] held 0 ended 0 | sale 2 to Sam, same prev pair; sale 1 to Maria pair; a later draw of that key pair`
- Q: one receiver (Maria) lets go: the other is read as a draw alone  
  A: `owners [["sam",null]] held 0 ended 0 | sale 2 to Sam, same prev takes landed; sale 1 to Maria pair`

Spec: folds.md, Her start, and her one line: "A draw on it signed by any other key, hers or anyone's, takes nothing (`not_on_line`). Another key of hers ... draws only on a part passed to its own line: a draw `to_owner` its own owner, which the accept of that key lands"; A fork is a burden: "A thing drawn twice: ... none of them lands, its signer owns none of that measure on that line, each later draw of that key on it reads `pair` too ... when every receiver ... but one has let go, that one is read as a draw alone".

## S22 two accepts

- Q: a reader holding only the phone's accept reads it as the start  
  A: `owners [["maria","10"]] held 0 ended 0 | Sam signs ten sacks to Maria takes landed`
- Q: both held: Maria owns the ten (Sam's draw landed) on no line; both sales not_on_line, no pair  
  A: `owners [["maria","10"]] held 0 ended 0 | tablet sells 2 not_on_line; phone sells 2 not_on_line; Sam signs ten sacks to Maria takes landed`
- Q: her phone signs accepted again, its after naming both: the one start; its next sale takes, the tablet's stays not_on_line  
  A: `owners [["maria","8"],["amara","2"]] held 0 ended 0 | tablet sells 2 not_on_line; phone sells 2 not_on_line; Sam signs ten sacks to Maria takes landed; phone sells 2 (from the one start) takes landed; tablet sells 2 later not_on_line`
- Q: fork pairs listed  
  A: `[]`

Spec: folds.md, One start: "Where two such accepts of one draw ... by two keys ... do not see each other ..., neither starts a line: the yes is given, so the amount is its receiver's ..., but on no line, and every draw on it by either key takes nothing (`not_on_line`) ... A later block of a key that may give that accept, whose `after` names both, is the one start ... lists no `pair`".

## S8 pile

- Q: Mama's 2 kg names the pile: the pile states no pack  
  A: `owners [["mama",null]] held 0 ended 0 | Mama sends 2 kg of the pile no_measure`
- Q: the same draw once Leila answers accepted: no_measure, read as naming none; the deal  
  A: `{"stage":"done","total":"100 KES","paid":"100 KES","quantity":"2 kg","lines":[[null,"2 kg","2 kg"]],"uncovered":{"from":[[null,"0 kg"]],"to":"0 KES"},"unanswered":[]}`
- Q: the whole pile to Sam: takes, Sam owns the pile  
  A: `owners [["sam",null]] held 0 ended 0 | Mama sends 2 kg of the pile no_measure; the whole pile, no amount, to Sam takes landed`

Spec: folds.md, One whole: "A thing that states no `pack` is one whole: a draw on it states no amount and takes all its owner owns of it. An amount drawn on it takes nothing of it (`no_measure`) and is read as a transfer that names no instance"; The other side: "A transfer that names none has only this side: it counts on the receiver's accept".

## S12 loans

- Q: maize: after the lending, accepted by Harry  
  A: `{"stage":"underway","total":"6 sack/fa0c","paid":null,"quantity":"5 sack","lines":[[null,"5 sack","5 sack"]],"uncovered":{"from":[[null,"5 sack"]],"to":null},"unanswered":[]}`
- Q: maize: Harry repays 6 sacks of his lot (its refs.of is the maize kind): done  
  A: `{"stage":"done","total":"6 sack/fa0c","paid":"6 sack/fa0c","quantity":"5 sack","lines":[[null,"5 sack","5 sack"]],"uncovered":{"from":[[null,"0 sack"]],"to":"0 sack/fa0c"},"unanswered":[]}`
- Q: pounds: accepted, nothing sent: uncovered null both sides  
  A: `{"stage":"accepted","total":"110 GBP","paid":null,"quantity":"100 GBP","lines":[[null,"100 GBP","0 GBP"]],"uncovered":{"from":[],"to":null},"unanswered":[]}`
- Q: pounds: Sam sends £100 (names none), nothing answered: unanswered, not counted  
  A: `{"stage":"accepted","total":"110 GBP","paid":null,"quantity":"100 GBP","lines":[[null,"100 GBP","0 GBP"]],"uncovered":{"from":[],"to":null},"unanswered":["Sam sends 100"]}`
- Q: pounds: Maria accepts: underway, moved 100  
  A: `{"stage":"underway","total":"110 GBP","paid":null,"quantity":"100 GBP","lines":[[null,"100 GBP","100 GBP"]],"uncovered":{"from":[[null,"100 GBP"]],"to":null},"unanswered":[]}`
- Q: pounds: Maria repays £110, Sam accepts: done  
  A: `{"stage":"done","total":"110 GBP","paid":"110 GBP","quantity":"100 GBP","lines":[[null,"100 GBP","100 GBP"]],"uncovered":{"from":[[null,"0 GBP"]],"to":"0 GBP"},"unanswered":[]}`
- Q: pounds: Maria stops onward having repaid nothing: stopped, uncovered.from £100  
  A: `{"stage":"stopped","total":"110 GBP","paid":null,"quantity":"100 GBP","lines":[[null,"100 GBP","100 GBP"]],"uncovered":{"from":[[null,"100 GBP"]],"to":null},"unanswered":[]}`

Spec: folds.md, What each fold returns, `uncovered` and A promise's stage, stage 2: "Where the promise names no `what`, what moves is its `terms.quantity`, an amount (a loan of money)"; The other side: "A transfer that names an instance counts toward a price only where the price states an `of` and the instance's `refs.of` is that id"; promises.md, Terms: interest in kind is a plain extra quantity.

## S13 toll

- Q: terms_total: 1 kg of flour per 10 kg, 93 kg  
  A: `{"value":"9.3","unit":"kg","of":"c3d52ef23ae8bab05475e498a1867cac1591517f30265ef44329931650af2b0a"}`
- Q: Leila pays 9.3 kg from her flour lot (refs.of flour), accepted  
  A: `{"stage":"done","total":"9.3 kg/c3d5","paid":"9.3 kg/c3d5","quantity":"93 kg","lines":[],"uncovered":{"from":[],"to":"0 kg/c3d5"},"unanswered":[]}`
- Q: of 9 kg of an unnamed sack (no refs.of): counts for nothing, Harry's answer says nothing of what it covers  
  A: `{"stage":"underway","total":"9.3 kg/c3d5","paid":"0 kg/c3d5","quantity":"93 kg","lines":[],"uncovered":{"from":[],"to":null},"unanswered":[]}`

Spec: promises.md, Terms: "The total is the amount's `value` times the quantity over `per`'s `value`, exact; nothing is rounded; the quantity must be in `per`'s unit"; folds.md, The other side (an instance with no `of` match counts only for what the payee says it covers).

## S14 voucher

- Q: off the record: the same 5 to two payees, both accept: both count  
  A: `["5 credit/0c07","5 credit/0c07"]`
- Q: on the record: a second spend of the same 5 reads past  
  A: `owners [["maria","495"],["cafe","5"]] held 0 ended 0 | Ravi spends the same 5 again past; Maria gives Ravi 5 takes landed; Ravi spends 5 takes landed`
- Q: paid with 5 credit with no of: another kind, paid 0 shown  
  A: `{"stage":"underway","total":"5 credit/0c07","paid":"0 credit/0c07","quantity":"1 cup","lines":[],"uncovered":{"from":[],"to":null},"unanswered":[]}`

Spec: encoding.md, Shapes: "Two amounts are of one kind when their `unit` is the same text ... and their `of` the same id, or neither has one"; things.md, Transfers: a transfer that names none "moves nothing on the record ... counts toward its line only on the receiver's accept"; folds.md, What is left (a second spend of the same 5 reads `past`).

## S15 gold

- Q: a price of 2 g of gold, paid off the record, Sam accepts  
  A: `{"stage":"underway","total":"2 g/1281","paid":"2 g/1281","quantity":"1 ring","lines":[],"uncovered":{"from":[],"to":"2 g/1281"},"unanswered":[]}`
- Q: bitcoin: 0.00000001 BTC per kg, 3 kg  
  A: `{"value":"0.00000003","unit":"BTC"}`
- Q: allocated gold: an instance to_holder the vault; who holds it  
  A: `["vault","ben"]`

Spec: encoding.md, Shapes: "Money is an amount ... an amount of any good"; "A sum ... exact"; things.md, Transfers, Handed over or held: "What is kept apart is a thing (a marked tin), never an amount"; folds.md, Where a thing is now, "Who holds it is a reading".

## S16 mixed

- Q: a deal with lines priced in two kinds: the write check  
  A: `["lines"]`
- Q: the same priced in one kind  
  A: `[]`

Spec: promises.md, Terms, `lines`: "Every line's price is of one kind (`lines`)".

## S17 sand

- Q: price {6, sack} with no of: a sand instance counts only for what Sam's answer says it covers; "it came" covers nothing  
  A: `{"stage":"underway","total":"6 sack","paid":"0 sack","quantity":"1 lot","lines":[],"uncovered":{"from":[],"to":null},"unanswered":[]}`
- Q: price {6, sack, of maize}: a sand thing Ben signed with refs.of maize pays it (the lie is Ben's)  
  A: `{"stage":"underway","total":"6 sack/6a6b","paid":"6 sack/6a6b","quantity":"1 lot","lines":[],"uncovered":{"from":[],"to":"6 sack/6a6b"},"unanswered":[]}`

Spec: folds.md, The other side: "toward a price with no `of` it counts only for what the payee's accepted answer says it covers"; "A transfer that names an instance counts toward a price only where the price states an `of` and the instance's `refs.of` is that id".

## S20 big sum

- Q: valid / read of the offer  
  A: `[[],[]]`
- Q: paid twice: total, paid, uncovered are exact text  
  A: `{"stage":"underway","total":"100000000000000000000 KES","paid":"200000000000000000000 KES","quantity":"1 ranch","lines":[],"uncovered":{"from":[],"to":"200000000000000000000 KES"},"unanswered":[]}`

Spec: encoding.md, Shapes: "A sum ... has no cap: `integers` bounds a count and `seq`, never an amount"; core.md, section 3: a decimal names at most `limits.decimal_digits` digits.

## S21 pot

- Q: two payouts of £800 signed ahead on a £1,000 pot: the second reads past from the first minute  
  A: `{"holder":"coop","kind":"GBP","backing":"1000 GBP","paid_in":"0 GBP","held":"800 GBP","paid_out":"0 GBP","left":"200 GBP","cap":null,"payouts":[["payout 800 to Leila (signed ahead)","800",true,null,"held"],["payout 800 to Achieng","800",false,"past",null]]}`
- Q: both receivers accepted, no signal yet: Leila's still holds  
  A: `{"holder":"coop","kind":"GBP","backing":"1000 GBP","paid_in":"0 GBP","held":"800 GBP","paid_out":"0 GBP","left":"200 GBP","cap":null,"payouts":[["payout 800 to Leila (signed ahead)","800",true,null,"held"],["payout 800 to Achieng","800",false,"past",null]]}`
- Q: the vet's signal comes: Leila's payout lands  
  A: `{"holder":"coop","kind":"GBP","backing":"1000 GBP","paid_in":"0 GBP","held":"0 GBP","paid_out":"800 GBP","left":"200 GBP","cap":null,"payouts":[["payout 800 to Leila (signed ahead)","800",true,null,"landed"],["payout 800 to Achieng","800",false,"past",null]]}`

Spec: folds.md, A pot: "A payout ... holds from where it is signed, conditioned or not, so a payout signed ahead keeps its place, and a later one that does not fit reads `past` from the first minute; it lands on the receiver's yes and its condition"; profiles/pools.md.

## S22 pot kinds

- Q: pay-ins of GBP and KES, no backing: kind null, the payout is unit; the tin handed to_holder is no pay-in  
  A: `{"holder":"holder","kind":null,"backing":null,"paid_in":null,"held":null,"paid_out":null,"left":null,"cap":null,"payouts":[["payout 10 GBP","10",false,"unit",null]]}`
- Q: pay-ins of one kind (150 GBP): the pot is that kind; 120 takes, 40 is past  
  A: `{"holder":"holder","kind":"GBP","backing":"0 GBP","paid_in":"150 GBP","held":"0 GBP","paid_out":"120 GBP","left":"30 GBP","cap":null,"payouts":[["payout 120","120",true,null,"landed"],["payout 40","40",false,"past",null]]}`

Spec: folds.md, A pot: "The pot's kind is the backing's; with no backing, the one kind every accepted pay-in shares; with pay-ins of two kinds and no backing it has none, and no payout takes (`unit`). Money kept apart for its payer is a thing handed `to_holder` and is no pay-in".

## S23 received

- Q: cash sent, naming none, nobody has accepted it  
  A: `[null,1]`
- Q: her own observe of kind received: counted toward the price; the transfer stays unanswered  
  A: `["100 KES",1,null]`

Spec: folds.md, The other side: "A receiver with nothing to answer (a basic phone's \"received\") signs her own `observe` of kind `received`, `refs.for` the deal, `state.amount` what came ... her word against herself, added toward that line, or toward the price where she is the payee"; `unanswered`.

## S25 header only

- Q: draw 1 held only as its header: the line is not read whole  
  A: `not_shown ["draw 1"]`
- Q: the whole line held  
  A: `owners [["maria","6"],["harry","4"]] held 0 ended 0 | draw 2 takes landed; draw 1 takes landed`

Spec: folds.md, A line: "A block held only as its header leaves the line not whole"; "answers `{ not_shown: true, lacks }`"; A fork is a burden (an end or a branch held only as a header).

## S26 allocations

- Q: allocations 15 then 15 on one line: the second does not take, over_allocated; the offer's quantity is what takes  
  A: `{"stage":"accepted","quantity":"15 kg","total":"1 GBP","takers":[["a","15 kg",false],["b","15 kg",true]],"over":true,"forks":0}`
- Q: the second one's own deal reads over_allocated  
  A: `true / false`
- Q: the same two as a pair (one prev): both bind, both over_allocated  
  A: `{"stage":"accepted","quantity":null,"total":"1 GBP","takers":[["a","15 kg",true],["b","15 kg",true]],"over":true,"forks":2}`

Spec: folds.md, What each fold returns, `over_allocated`: "true ... when the allocation does not take as a draw on the open offer's `terms.quantity` (What is left: `past` or `pair`)"; "`quantity` is the sum of the takers' quantities that take".

## S28 claim

- Q: £80 to Sam then £80 to Leila, each signed twice: Sam 80, Leila past (not 20)  
  A: `{"from":[["sam","80 GBP"],["ana","20 GBP"]],"to":[["ben","1 lot"]],"draws":[["hand-over 80 to Sam",true,null,"landed"],["hand-over 80 to Leila",false,"past",null]]}`

Spec: promises.md, Owed: "A hand-over is a draw on what its signer is owed (folds.md, What is left), and is signed twice (blocks.md, Finality)"; 03-amounts.md, new vector 25: "£80 to Sam then £80 to Leila: Sam 80, Leila `past` (not 20)".

## S27 uncovered

- Q: the deliverer sent 2 t, nothing is paid: uncovered.from 2 t  
  A: `{"stage":"underway","from":[[null,"2 t"]],"to":null,"paid":null}`
- Q: paid in full: done, nothing uncovered  
  A: `{"stage":"done","from":[[null,"0 t"]],"to":"0 GBP","paid":"500 GBP"}`
- Q: the payer sends £500 twice on a done deal: uncovered.to £500  
  A: `{"stage":"done","from":[[null,"0 t"]],"to":"500 GBP","paid":"1000 GBP"}`

Spec: folds.md, What each fold returns, `uncovered`: "`to` ... `from` (the delivering side) is `[{ line, amount }]` ... less what the payments covered ... on a flat price, all of it once the price is paid in full, else nothing"; 03-amounts.md, vector 27.

## S18 recall

- Q: L7: Amara holds 501 kg (500 from Harry, 1 from the rival)  
  A: `owners [["harry","499"],["amara","501"]] held 0 ended 0 | Harry to the rival 1 takes landed; Harry to Amara 500 takes landed; rival to Amara 1 takes landed`
- Q: the rival's word about L7 reaches  
  A: `{"whole":false,"amount":{"value":"1","unit":"kg"}}`
- Q: Harry, the author of L7, speaks of it whole  
  A: `{"whole":true,"amount":{"value":"1000","unit":"kg"}}`

Spec: things.md, Parts: "A word about an instance by one who handed on part of it is about the amount his own draws handed on, and no more ... Only the author of the make or first use an instance came from speaks of it whole".

## S19 reversed

- Q: the café paid, Femi accepted: the mixer lands  
  A: `owners [["cafe",null]] held 0 ended 0 | the mixer to the café on paid takes landed`
- Q: Femi takes her own accept back after the resale: owner Leila, the sale still paid  
  A: `["owners [[\"leila\",null]] held 0 ended 0 | the mixer to the café on paid takes landed; the café resells to Leila takes landed","100 GBP","0 GBP"]`

Spec: folds.md, Lands/What landed stays landed: "a payment reversed after the draw landed and stood is a sum the receiver owes the giver, and never takes goods from a later buyer"; things.md, Transfers (a condition is read in the causal past of the block that relies on it).

## X1 lines

- Q: eggs delivered (12), flour not: total, moved, uncovered.from  
  A: `{"stage":"underway","total":"9 GBP","paid":null,"lines":[["e","12 egg","12 egg"],["f","2 kg","0 kg"]],"from":[["e","12 egg"]],"to":null,"occ":[]}`
- Q: both delivered, £9 paid of £9: done  
  A: `{"stage":"done","total":"9 GBP","paid":"9 GBP","lines":[["e","12 egg","12 egg"],["f","2 kg","2 kg"]],"from":[["e","0 egg"],["f","0 kg"]],"to":"0 GBP","occ":[]}`

Spec: promises.md, Terms (`lines`, a per-unit price); folds.md, What each fold returns (`lines`, `uncovered`).

## X2 band

- Q: 96 kg of 100 inside a 5% band: priced at what came, £96 paid, done  
  A: `{"stage":"done","total":"96 GBP","paid":"96 GBP","lines":[[null,"100 kg","96 kg"]],"from":[[null,"0 kg"]],"to":"0 GBP","occ":[]}`

Spec: promises.md, Terms, `band`; folds.md, A promise's stage, catch weight.

## X3 job

- Q: four hours accepted at £10/h, nothing paid: total, uncovered.to null  
  A: `{"stage":"underway","total":"40 GBP","paid":null,"lines":[],"from":[],"to":null,"occ":[]}`
- Q: paid £40: done  
  A: `{"stage":"done","total":"40 GBP","paid":"40 GBP","lines":[],"from":[],"to":"0 GBP","occ":[]}`

Spec: folds.md, A promise's stage, stage 2: "A job or time promise moves no thing: it is done when the receiving side has `answers`-ed the worker's work blocks `accepted`".

## X4 split

- Q: one payment, three promises: the third is paid its own £3  
  A: `["3 GBP","3 GBP","3 GBP"]`
- Q: the write check on a payment for several promises with no split  
  A: `["required"]`

Spec: things.md, Transfers, Paying several deals at once: "`state.split`, a non-empty `[{ for, line, amount, occurrence }]` ... with no `split` it is refused (`required`)".

## X5 shapes

- Q: a transfer that names no instance and no to_owner  
  A: `["required","shape"]`
- Q: a transfer with state.amount and to_holder  
  A: `["shape"]`
- Q: an amount with of beside refs.what  
  A: `["shape"]`
- Q: an amount with of, naming no instance (allowed)  
  A: `[]`
- Q: unit "gbp" is a unit  
  A: `[]`
- Q: a value below zero  
  A: `["shape"]`
- Q: a pack with of  
  A: `["shape"]`
- Q: a make whose inputs name a thing not in derives_from  
  A: `["shape"]`
- Q: a make whose inputs name its derives_from  
  A: `[]`
- Q: a promise of an amount with no refs.what  
  A: `[]`
- Q: a price with the 1.7 money shape  
  A: `["shape"]`
- Q: the amount, per 1.8, with a per  
  A: `[]`
- Q: a sum past 2^53 in a price  
  A: `[]`

Spec: core.md, section 7 (`transfer`, `promise`); encoding.md, Shapes (an amount carries no `of` beside `refs.what` or as a pack); things.md, A make (`state.inputs`); protocol.json `refusals.codes.block.shape`.

## S5b tool

- Q: the flour (the grant held 20 kg on her line, the farm drew 0.5)  
  A: `owners [["leila","19.5"]] held 0 ended 0.5 | the farm bakes takes landed; grant to the farm takes held`
- Q: the loaf is hers from the make, no further yes: owner Leila  
  A: `owners [["leila",null]] held 0 ended 0 | `
- Q: who the make speaks for  
  A: `leila`
- Q: a stranger's make naming her inputs: nothing is hers  
  A: `["owners [] held 0 ended 0 | ","owners [[\"leila\",\"20\"]] held 0 ended 0 | 81d66b not_owner"]`
- Q: she answers accepted to the stranger's loaf all the same: still nobody's (the make took nothing of hers)  
  A: `owners [] held 0 ended 0 | `

Spec: folds.md, Her start, case 1: "A make that speaks for her ... signed ... by a tool of hers under her grant so that it binds her ... hers from that block ... No further yes is needed"; case 3 and things.md, A make: a stranger's make takes nothing, so its output has no owner. Guesses 8, 9, 10.

## S21b pot reasons

- Q: not_confirmed, not_holder, and a good one  
  A: `{"kind":"GBP","backing":"100 GBP","paid_in":"0 GBP","held":"10 GBP","paid_out":"0 GBP","left":"90 GBP","cap":null,"payouts":[["payout on another signer","10",false,"not_confirmed",null],["payout to a stranger of the lot","10",false,"not_holder",null],["payout on the vet","10",true,null,"held"]]}`

Spec: folds.md, A pot: "a transfer whose condition is not a `signal` by [the confirmers] is no payout of the pot (`not_confirmed`); where the head's receiver is a thing, a transfer to anyone but the owner ... is none (`not_holder`). Neither takes or holds anything of the pot".

## Stage 1 and 2 stories re-run

`stage2-scratch/stories.cjs` (110 answers) and `stage2-scratch/stage1-resigned/stories.cjs` (118 answers) were run before (the oracle as stage 2 left it, given today's `protocol.json` with the removed money entries put back: `rerun/*.before.out`) and after this stage (`rerun/stage1-resigned.out`, `rerun/stage2.out`).

- **Stage 1: all 118 answers are the same.**
- **Stage 2: 106 of 110 are the same.** The four that changed are story 7 (the wire): its test block carries `price: { currency: 'GBP', minor: 450 }`, which is no shape in 1.8, so `strict_text(the canonical bytes)`, `strict_text(2^53 - 1)`, `strict_push(canonical)` and `strict_push(a block with a null inside canonical bytes)` now also report `shape`. That is the meant change (the money shape leaves). Written as an amount (`stage2-stories-amount.cjs`, `rerun/stage2-with-amount.out`) the same stories give the same answers, bar the three questions that fed a number token into the money's `minor` (`450.0`, `4.5e2`, `2^53`): an amount has no number token, so they have nothing to refuse. Story 8 stops at the same line in both (an argument error the story does not catch).


## The numbered GUESS list (each also marked `GUESS: [S3-n]` in fb.cjs, bar 36 which sits at the typed-fields check)

Each is a place where the text was silent or unclear; the later step compares this list with the other builder's.

1. **A draw lands only when it stands.** Lands (folds.md): "where the draw stands (blocks.md, Finality) and every word it names is in the causal past". A transfer is a standing word and passes the cut only when a block names or uses it, so a draw signed after her yes ("inside her order") waits on `end` until a later block names it (her accept, or the giver's own next block). 03-amounts.md (section 1, story 3, story 8) says such a draw "lands at once". Decided: Finality governs; see S3b.
2. **A block of a fork is a `pair` draw.** The reason list says "one of a pair, and each later draw of that key"; decided: every block in the fork set (a member of a pair, or a later block of that key) that draws on the measure reads `pair`, even when its twin draws on another measure.
3. **A line with an open pair has no owner.** "its signer owns none of that measure on that line": she is left out of `owners`, the amounts the pair drew are held by no one, and a receiver's decline (no yes in its past) leaves the other draw alone.
4. **A waiting draw.** "A draw that would fit only once an end she has not seen frees an earlier draw is waiting": decided takes false, no reason, listed in `waiting` (`on: end`), not counted against later draws. An 'all' draw (no amount) with nothing left waits the same way. A draw whose own word does not yet stand for another reason still holds and is listed with that reason.
5. **`state.expires` as an end.** The text makes it an end (things.md) but a time is read only against its signer (blocks.md, Time). Decided: the receiver's own block dated at or after it has seen it and frees the draw; her accept dated at or after it, or undated, is late by its own word and is no yes.
6. **A draw by the line's own key before her start** reads `not_on_line` (03-amounts.md, vector 36: "the two earlier draws stay `not_on_line`"); `not_owner` is for one who owns none of the measure on any line.
7. **An accepted answer that states more than the draw, or another kind**, is read as stating none: the whole draw lands.
8. **A make under a grant speaks for the owner** only where the grant names a promise in `scope.on` (sentence 4: what binds her keeps to a promise she signed that the grant names). Without it the make is toll work and the maker's own word. authority.md has no Toll work yet.
9. **A grant that names an instance in `refs.what` passes a part** (`scope.limit`, else all she owns) to a line of its own, `grant:<hash>`; the holder's makes naming the grant in `refs.under` are draws by the grantor on that line; no walk is made of it. A hand-back and a grant's end (folds.md, A draw) are not built: authority.md (stage 4) does not say who "binds her" yet.
10. **Cases 2 and 3 of her start are one rule**: her own `accepted` answer to the output starts her line. A stranger's make takes nothing of hers (T9: "a make by anyone else takes nothing"), so there is no output to accept; case 3's "nothing is hers until she answers accepted" cannot make a stranger's loaf hers.
11. **Several makes of hers**: her start for an output is the one that sees the others; apart, she owns it on no line.
12. **`held`, `ended`, `let_go` of a thing with no pack** are amounts of unit `whole`; an owner of a whole, or of an amount not said, has `amount` null.
13. **`kind`** of an ownership answer is `{ unit, of }`: the unit of the pack, `of` the instance's `refs.of` or null.
14. **A block that speaks for no one is not a draw** and is not listed.
15. **Who holds a claim**: the one owner of the claim; while a hand-over is held or a pair stands, the owner it was drawn from; else the claimant.
16. **A pot with no kind** (pay-ins of two kinds and no backing, or nothing) gives null sums and every payout `unit`; a pot with a kind and no backing states `backing` 0; `cap: all` takes every payout.
17. **A pay-in counts for a payout** when the holder's accept of it, by any key of hers, is in the payout's causal past.
18. **An open offer with no `quantity` and no `lines`** has no measure: none of its allocations is over-allocated.
19. **Allocations are read in `seq` order**; the hash breaks a tie in the listing only.
20. **A promise with no `what` and no `lines`** (a loan of money) moves its `terms.quantity`: read as one line, id null.
21. **`lines[].needed` and `moved` are amounts** in the line's kind, null where the line states no quantity.
22. **`uncovered.from`** has one entry for each line that moved something (the amount may be 0); payments with no line label cover lines in the order the terms list them; before a binding accept it is `{ from: [], to: null }`.
23. **A transfer back** (from the delivering side, in the price's kind) is read only where the line's kind is another; in a one-kind deal (a loan) such a transfer is a delivery.
24. **A total with no finite decimal form** (a third of a pound) is null.
25. **A payment that names an instance** counts its landed draw toward a price only where the price states an `of` that is the instance's `refs.of` and the units agree; otherwise only what the payee's answer says it covers (the largest of several answers); a payment with a `split` counts as its parts for the deal say.
26. **`received`**: the payee's word counts toward the price; the other side's toward the line its `state.line` names (the only line when it names none). A signer named by an account word (`state.by`) is stage 5's and is not built.
27. **`unanswered`** lists transfers of either side that name no instance, are `for` the deal and speak for a side, and that the other side has not accepted.
28. **A hand-over of what is owed** is a draw on the side its signer is owed on; it is listed where it does not read `not_owner`, `unit` or `no_measure`; each side's owner starts at the binding accept or the offer, whichever that side signed; `owed` is null until a counted hand-over is held. A hand-over's amount carries no `of` (shape), so it is compared by unit only.
29. **"Read as a transfer that names no instance"** (no_measure) is read for the stage: it counts toward its line or price in its own kind on the receiver's accept, and is no draw.
30. **The ownership of a kind or an actor** is the empty answer; a block the reader does not hold as read gives no answer at the door (row 106).
31. **The reach of a word about an instance** (things.md, Parts) is a reading (`reachOfWord`, no door op): whole for the author of the make or first use it came from, else the amount the author's own draws handed on and that landed.
32. **Who holds it** (`holderOf`, no door op): the latest counted `to_holder` transfer by an owner or a holder, accepted; several maxima or none fall back to the owner.
33. **The export clause**: the folds asked of every block in the document are the ownership of an instance and, of a first promise, its stage and its pot; the lines they read (each from the block back to the fold's own start) go with the document. Stages 4 to 6 add the folds they name.
34. **`made_from`**: an output is a thing written by the make's author that names it in `derives_from`; `took` is what the make's draw states (null for all).
35. **A bid's form** states `unit` (and `of`) beside the deadline and the clock; `bids_shown.kind` is `{ unit, of }` or null.
36. **`received`** is named only in `kind_fields.about`, with no `field:shape` line; its `state.amount` is judged by the field's own shape and `state.line` is not checked.

## Cases left broken until stage 4 (they still read the 1.7 money shape, or need authority.md's new text)

- `within_limit`, `limit_within_parent`, `limit_fence`, `limit_commitment` and `narrower_than` for money: `legacyMoneyProblem`, `noLarger`, `moneyOrAmountProblem` and `withinLimit`'s read of `state.money` as spent are kept as they were (an amount limit works where the old code read an amount).
- `scope.limit` and `scope.each` written as money pass the write check through `legacyMoneyProblem`.
- `scope.on`, `refs.meter`, `state.draws`, a grant's end freeing what it holds, a tool's hand-back (story 21, vectors 31 to 34), and "who binds her" under a grant: not built (authority.md is stage 4's). Story 5b declares `scope.on` in memory for the test.

## Where the text looks wrong or unclear (not changed)

- 03-amounts.md sections 1, 5 (stories 3 and 8, vector 1): "lands at once" for a draw whose receiver's yes is already in its past, against Finality and the cut (guess 1).
- Start, cases 2 and 3, against things.md T9 (guess 10).
- folds.md, What each fold returns: `held`, `ended`, `let_go` are "sums", and a whole has no unit (guess 12); `lines[].moved` is "a sum in the line's kind", `needed` is not said to be an amount (guess 21).
- protocol.json `kind_fields` lists no line for `received` (guess 36); `scope.on` is in `needs` but not in `scope`, so a grant that names one is `undeclared_field` today.
- folds.md, Lands: "her binding accept of the deal the draw is `for`" means reading the deal's stage inside the ownership fold, while the stage reads ownership for a side that names a thing: the text does not say how the loop ends (decided: a deal being read reads no draw that is for it).
- The reasons: `not_on_line` against `not_owner` for a draw of her own key signed before her start (guess 6).
- folds.md says a loan "reaches `done`", and `uncovered.from` is "null (or [])": the oracle gives an entry of amount 0 for a line that moved and was covered, not [].


# renderers/en

Not normative. `readings/readback`'s answer in English, for a screen: the lines below, in this order, each said only where its condition holds, joined by one line feed (U+000A). It reads the answer only, never a block, and classifies nothing. It reads no free text: the deal's own words (`what`) are quoted word for word, marked as its signer's, never read. Names, codes and units are copied as signed, never translated (300 GBP, never £300). It names no rule set, prints no fraction, never prints `needed` or `names`, and never tells her that her own word keeps nothing aside. Its cases are `en.cases.json`: each gives an answer and the text.

## Words

*Me* is `viewer.id` (none where `viewer` is null). Every id is spoken through these, left to right in each line, so a first mention gives the code and a later one does not (*seen*, one set for persons and things, across the whole text):

- **who(p)**: no person: `an id not named here`; *me*: `you`; `name` null: `that id` where seen, else `an id you have no name for (CODE)`; else `NAME` where seen, else `NAME (CODE)`. Each id is seen from its first mention.
- **whose(p)**: *me*: `your`; else who(p) + `'s`.
- **says(p)**: *me*: `you say`; else who(p) + ` says`.
- **thing(t)**: `name` null: `CODE`; seen: `NAME`; else `NAME (CODE)`.
- **amt(x)**: `VALUE UNIT`.
- **Cap**: the first character upper-cased. **and(list)**: one item as it is; else all but the last joined by `, `, then ` and `, then the last.
- *Signer* is `for.signer`; *hers* means the line's `to` is *me*.

## Lines

The number is C4's line (changes-1.9/07-last.md).

| # | Condition | Text |
|---|---|---|
| 17 | the signer is not *me* | `From ` who(signer) `.` |
| 17 | else, `other` is there | `To ` who(other) `.` |
| | `not_valid` | `No key signed this as it stands.`, and nothing more |
| 5 | `not_shown` | `Can't tell yet: N of ` whose(signer) ` blocks is missing.` (`are` where N is not 1; N the length of `lacks`), and nothing more |
| 19 | `not_read`, `rule_set` true and `fields` 0 | `Your reader does not read the rules this names, so it cannot say what this binds you to. Nothing was guessed.`, and nothing more |
| 19 | `not_read`, else | `Your reader does not read one field here, so it cannot say what this binds you to. Nothing was guessed.` (`N fields` where `fields` N is above 1), and nothing more |
| 17 | `first_deal` and the signer is not *me* | `First deal with this buyer.` where `other_side` is `to`, else `First deal with this seller.` |
| 18 | `audience` is not `public` and the signer is not *me* | `N readers; you can see only yourself.` |
| | `what` | `In ` whose(by) ` words: "` TEXT `".`, TEXT its `text` copied exactly, every character, between two `"` (U+0022): her words, quoted, never read |

Then for each line of `things`, in order (T is thing(what), spoken where first used):

| # | Condition | Text |
|---|---|---|
| 9 | `what.pack`, hers, and the draw's state is `held` | T `: ` amt(pack) `, on ` whose(stated_by) ` word.` |
| 7 | `pair` and the draw is not `{ why: "pair" }` | T `: ` who(by) ` signed it twice.` |
| | draw `not_drawn` | nothing |
| 4 | draw null, `amount`, hers, `by` not *me* and `by` the signer | T `, ` amt(amount) `: ` whose(by) ` word; nothing set aside.` |
| | draw null, else | nothing |
| 5 | draw `not_shown` | T `: can't tell yet: N of ` whose(by) ` blocks is missing.` (`are` where N, the length of its `lacks`, is not 1) |
| 1 | state `landed` | T `: yours.` where hers, else T `: ` whose(to) `.` |
| 3 | state `held` and `holder` | T `: held for ` who(to) ` by ` who(holder) `, until ` says(freer) ` no.` |
| 2 | state `held` | T `: kept for ` who(to) `, in ` whose(by) ` hands` (where hers: `, on ` whose(by) ` record as you hold it`) `, until ` says(freer) ` no.` |
| 8 | state `freed` | T `: freed: ` who(by) ` may sell it again.` |
| 6 | why `past` or `not_owner` | T `: not ` whose(by) ` to give: already another's.` |
| 7 | why `pair` | T `: ` who(by) ` signed it twice.`, then ` Neither is shown as yours.` where a `pair` entry's `to` is *me* |
| | any other why | T `: ` whose(by) ` word here takes none of it.` |
| | else | T `: can't tell yet.` |

Then:

| # | Condition | Text |
|---|---|---|
| 4 | each `money` whose `to` is *me*, `by` not *me* and `by` the signer | amt(amount) ` to you: ` whose(by) ` word; nothing set aside.` |
| 10 | each `out` amount of *me*'s `amounts` entry whose kind is the kind of a `money` amount | `You pay at most ` amt ` in all.` |
| 10 | each `in` amount of it, likewise | `You may be paid as little as ` amt `.` |
| 16 | `terms.waits_on` is `price` | Cap(`done when ` says(the first `money`'s `to`, else none) ` so.`) |
| 16 | `terms.waits_on` is `goods` | Cap(`paid when ` says(the first `money`'s `by`, else none) ` it came.`) |
| 10 | `grant.not_shown` | `The most you can be made to pay: can't tell yet.` |

Then, for a `grant` that is not `not_shown`:

| # | Condition | Text |
|---|---|---|
| 10 | each `pay_at_most` | `You pay at most ` amt ` in all.` |
| 10 | each `hand_over_at_most` | `You hand over at most ` amt ` in all.` |
| 11 | `can_lose` not empty | `It can give away up to these ` and(each amt) `.` |
| 11 | else | `It can give away nothing of yours.` |
| 12 | `meter_own` | `A copied key could show this to several sellers.` |
| 13 | each `floor` | Cap(who(holder)) ` may sell for as little as ` amt(amount) ` per ` amt(per) `. Every buyer can read this.` |
| 15 | `clocks.one` | `Only ` C ` hears your STOP` then `; if it misses it, ` who(the first `backed_by`) ` pays you back.` where `backed_by` is not empty, else `.` |
| 14 | else `clocks.all` | Cap(and(each C)) ` must both hear each deal. If either is silent, deals wait.` (with more than two: `all`, `one`) |
| 14 | else `clocks` | Cap(and(each C)) ` hear each deal and your STOP.` |
| 20 | `pays` | `What it can move on your bank is your bank's limit, not this.` |

C, a clock of `hear`: whose(of) ` key ` CODE where its `block` is there, else who(of).

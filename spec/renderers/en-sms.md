# renderers/en-sms

Not normative. `readings/readback`'s answer in short English for a basic phone: the same lines as `renderers/en`, in the same order and under the same conditions, with the words below, joined by one space (U+0020). It reads the answer only, never a block, and classifies nothing; names, codes and units are copied as signed. It reads no free text: the deal's own words (`what`) are quoted word for word, as `en` quotes them, never read. It uses GSM-7 characters only where the names, units and words it copies do; a decision text (this, one space, the digits) is meant to fit 160 GSM-7 characters. Its cases are `en-sms.cases.json`: each gives an answer and the text.

## Texts

A text is never cut short. One longer than 160 characters runs whole over several texts, in order (the owner's decision, 2026-11-20). The text here is the decision text: the words, one space, the digits. Each text takes the most whole words that fit in 160 characters (Unicode code points). It ends at a space, and that space is dropped, so the texts joined by one space are the text again. A word longer than 160 characters is cut every 160 characters. A text of 160 characters or fewer is one text. The door op `readback` gives them as `texts`, in order; its digest is still of the one text.

## Words

As `renderers/en`, except: **who(p)**: no person: `an id not named`; `name` null, not yet seen: `unnamed id CODE`; a name not yet seen: `NAME CODE` (no brackets); **thing(t)**: `name` null: `CODE` alone; not yet seen: `NAME CODE`. The rest (`you`, `that id`, whose, says, amt, Cap, and) as `en`.

## Lines

| # | Condition (as `en`) | Text |
|---|---|---|
| 17 | the signer is not *me* | Cap(who(signer)) `:` |
| 17 | else, `other` | `To ` who(other) `:` |
| | `not_valid` | `no key signed this as it is.`, and nothing more |
| 5 | `not_shown` | `can't tell yet; N of ` whose(signer) ` blocks missing.`, and nothing more |
| 19 | `not_read`, `rule_set` and `fields` 0 | `your reader can't read the rules this names; nothing guessed.`, and nothing more |
| 19 | `not_read`, else | `your reader can't read 1 field here; nothing guessed.` (`N fields` above 1), and nothing more |
| 17 | `first_deal` | `First deal with this buyer.` / `First deal with this seller.` |
| 18 | `audience` | `N readers; you see only yourself.` |
| | `what` | `In ` whose(by) ` words: "` TEXT `".` (as `en`) |
| 9 | pack | T `: ` amt(pack) `, ` whose(stated_by) ` word.` |
| 7 | `pair`, the draw not `pair` | T `: ` who(by) ` signed it twice.` |
| 4 | draw null | T ` ` amt(amount) `: ` whose(by) ` word; nothing set aside.` |
| 5 | draw `not_shown` | T `: can't tell yet; N of ` whose(by) ` blocks missing.` |
| 1 | `landed` | T `: yours.` / T `: ` whose(to) `.` |
| 3 | `held`, `holder` | T `: held for ` who(to) ` by ` who(holder) ` till ` says(freer) ` no.` |
| 2 | `held` | T `: kept for ` who(to) ` in ` whose(by) ` hands till ` says(freer) ` no.` |
| 8 | `freed` | T `: freed; ` who(by) ` may sell it again.` |
| 6 | `past`, `not_owner` | T `: not ` whose(by) ` to give.` |
| 7 | why `pair` | T `: ` who(by) ` signed it twice` then `; neither shown as yours.` where a `pair` entry's `to` is *me*, else `.` |
| | other why | T `: ` whose(by) ` word takes none of it.` |
| | else | T `: can't tell yet.` |
| 4 | money | amt(amount) ` to you: ` whose(by) ` word; nothing set aside.` |
| 10 | out | `You pay max ` amt `.` |
| 10 | in | `You may get as little as ` amt `.` |
| 16 | `price` | Cap(`done when ` says(...) ` so.`) |
| 16 | `goods` | Cap(`pay when ` says(...) ` it came.`) |
| 10 | `grant.not_shown` | `Most you can be made to pay: can't tell yet.` |
| 10 | `pay_at_most` | `You pay max ` amt `.` |
| 10 | `hand_over_at_most` | `You hand over max ` amt `.` |
| 11 | `can_lose` | `It can give away up to ` and(each amt) `.` / `It can give away nothing of yours.` |
| 12 | `meter_own` | `A copied key could show this to several sellers.` |
| 13 | `floor` | Cap(who(holder)) ` may sell at ` amt(amount) ` per ` amt(per) ` or more; every buyer sees it.` |
| 15 | `clocks.one` | as `en` |
| 14 | `clocks.all` | Cap(and(each C)) ` must both hear each deal.` (`all` with more than two) |
| 14 | `clocks` | as `en` |
| 20 | `pays` | `Your bank's limit, not this, caps what it moves there.` |

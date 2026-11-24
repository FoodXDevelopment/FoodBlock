# The fields of an act

An act's facts say how a kind of act works (PATTERNS.md). Its fields say what one real deal is: who, with whom, for
whom, on what terms, where and when, fitting what, towards what, and what she expects. Every field is true with or
without FoodOS: it describes the deal, never how it is shown.

> [who] [verb] [noun] with [the other side] for [whom] on [terms], [where and when], fitting [what it must fit],
> towards [what it serves].

"You buy a dozen eggs from the corner shop for your mum, on your tab, tomorrow morning, under your £5 limit, for her
birthday cake."

The fields and their kinds are fixed in form.json (`fields`).

| Field | Question | Only this changes |
|---|---|---|
| who | who does it, and who answers for it | you cook, or the carer cooks; a child sells, a parent adds their own word |
| the other side | with whom | the corner shop, or the supermarket |
| for whom | who it is for | eggs for you, or for your mum |
| terms | on what deal, including who pays | pay now, or on a tab |
| where and when | its place and time, including how often | tonight at home; every Saturday at the market |
| what it must fit | the limits and preferences it must meet | no nuts; under £25 |
| what it serves | the goal or bigger deal it is for | flour, for the birthday cake, for Hosting a meal |
| what you expect | what she thinks will happen, by when | 60 loaves sold by noon; left blank |

Rules across all of them:
1. Every field has a default and is usually left unsaid: you, nobody, you, no terms, here and now, nothing biting,
   standalone, blank. A deal names only the fields that differ.
2. Fields hold kinds, never instances. Your budget, your flatmate and this café's deal live in people's records.
3. Every value in a real deal carries where it came from and what would prove it wrong, with an as-of date; a number
   only where her record holds many like cases, with the cases listed. That is what background work
   improves: "3 quotes in, Hill Mill is cheapest" beats "probably cheaper somewhere".
4. Meaning (grief, a first date, making up over a meal) is not a field: it lives in the wording and in who it is for.

## The act's own fields
Besides the fields of a deal, an act in the library carries: `sides` (`from` and `to`, the name of each end of one deal in her words), `known as` (the names of the acts merged into it), `was` (their ids, so an old deal that names one still resolves) and `you do this when` (one line saying what sets it apart from its neighbours). `labels` is only for other languages.

## Who
Who does it, and who answers for it. The doer answers unless said otherwise: a child sells lemonade and a parent
adds their own promise; FoodOS acts and you answer; an executor finishes a dead person's acts; whoever owns a machine answers for
what it does under her grant. Kinds: you, your people, together, someone you deal with, a business or
professional, anyone, a machine, FoodOS for you, a member for the group. Automation changes this field and nothing
else: a robot cooking is still Cooking a meal.

## The other side
With whom, for this deal: a person or household, a business, an institution or the state, a group, a market or
platform, or anyone. These are the values of the act's own fact, so the usual case and the real deal speak one
language. The Find acts fill it. An act never commits the other side: only they agree, unless they gave a grant.

## For whom
Who it is for: you, your people, someone you care for, someone you deal with, anyone, a cause or institution. For
whom, who acts and who pays are three things (you order for your mum, her carer cooks, you pay). A role carries
constraints (a child's allergy) and changes who must agree (a guest must answer; nobody signs for a child: a parent makes their own promise to the child). What you know about someone comes only from what they shared or you may know; watching someone needs
their consent or the consent of who may give it. Being who something is for shows you nothing until it reaches you,
so a surprise gift stays a surprise.

## Terms
The act's facts give the shape (what goes in exchange, who waits, how long it runs, how the price is set); the terms
are this deal's numbers and promises:
1. How much: a set price; less (discount, quiet-time, bulk or group price, a markdown near its end); your own price
   (a bid, a counter-offer); pay what you can; highest bid; matched
2. When each side's part arrives, what backs it (a deposit, a guarantor, a pledge, a named judge) and what leaving costs
3. Extras besides the thing: points, a reward after N, a free item, a reward for bringing someone
4. Not money: a swap of food, help or the use of something; a favour returned
5. How long and how often: once; a term (hold the price); every time
6. If it goes wrong: a deposit kept or returned, a refund, a substitute accepted or refused, a cut-off to cancel
7. Conditions: only if enough people join; only when quiet; only for those it is for
8. When the sides disagree: two records that differ, the evidence each holds, and who settles it (named in advance)
9. Who pays: you, your business, someone else, paid forward
10. A claim's own terms: who issued it, what it pays out in, whether it can be passed on, what covers it
11. Promises that take effect only if another deal fails, a default if nobody acts, a quantity that floats with what
    there turns out to be, deposits from each side, a promise not to act, and who pays a group's debts

Terms are plain numbers: what you pay, when, how to get out. FoodOS drafts; only the two sides agree. The rules every
deal's terms follow are written once in form.json (`term rules`).

## Where and when
The deal's coordinates: here, nearby, a set place, their place, on the way; now, a set time, ahead for later. And how
often: regularly, for a term, until taken back.

## What it must fit
Stored once per person or group and read by every act. For a group, everyone's limits apply and preferences blend.
- Limits (never broken): diet, allergy, health; a money limit (including ring-fenced money); law and rules; a time
  limit (a deadline, an eating window, opening hours); how many; a safe range (a temperature, a buyer's spec, a
  withdrawal period); a running total (caffeine, alcohol, spend).
- Preferences (traded off): taste; values (local, welfare, less waste); effort and skill; price or quality.
- What it can be made from: what you have, going off first; offers, season, nearby; your skills, kit and plot;
  people and what is spare.
A trade-off between two is a choice for the person, never for FoodOS. When a limit cannot be met alone, the act turns
toward other people. Never claim more than the numbers show.

## What it serves
A signed link to the goal or bigger deal this one is for, never free text. Kinds: a goal of yours, a bigger deal, an
occasion, selling it on, company, pleasure, safety, someone else's need. One link does four jobs:
- purpose: goals rank acts, and each act points at the goals it serves
- whole and part: the shopping serves Hosting a meal; an advance against a catch serves the sale of that catch
- steps: the parts of doing an act are deals linked to it
- undo spreads: cancel the party, and the flour order it served is withdrawn

## What you expect
Asked only when she carries the outcome, and kept private: a number and a date, her own words, or left blank. When
the outcome lands, the gap is hers to read (Looking back at what you expected).

## The grant
What FoodOS may do for you unasked: which acts and moves (by id), the parties, the limits with their units and
running totals, and an end only if she names one; how to take it back is always the same (any time). Background work happens inside
it: FoodOS may find, compare and ask (an ask is a real proposal you would honour), and commits nothing beyond it. A
grant is always yours to sign; anything outside it waits for your tap (the Gate decides, reading the grant through the FoodBlock SDK). The same rule
holds for people and machines ("staff may refund up to £10"). On someone else's platform FoodOS acts only as you,
within your grant, and never collects other people's data. When both sides have grants, a deal happens with no taps,
each side inside its owner's rules: a market with no platform deciding.

# Patterns

The rules of the act library, all agreed by Patrick. The grammar they describe is form.json; the fields of a real
deal are in FIELDS.md.

## The form
- **Everything FoodOS does is an act, and everything it shows you is a move to make, a move someone made, or a
  result**. A suggestion is a move to make, waiting for your yes ("Make 20 more?"). News on something underway is a
  move someone made ("Your rider is 5 minutes away"; "Your AI reordered your milk, under your rule"), shown on that
  act, never asking for anything. An insight is an act's result: FoodOS does
  a Find out act for you and shows what it found ("Your brownies sell out by 11"). Both are pencil until you, or a rule
  you signed, make a move; nothing asks you to confirm a guess. Every result names the records it counted, and "that's
  not right" is a Change. What the camera sees is a result that goes when the moment passes unless you move on it.
  FoodOS's own working-out is not an act; it never reaches you as such. Where each shows is the one list
  (docs/PRODUCT.md §3, docs/ATTENTION-ITEMS.md).
- **Under every act: a promise and its answer** (docs/PRODUCT.md 2.20). Every deal, job, loan, tab, recall and
  pledge is a signed promise and the other side's signed answer; acts and moves are how people name them. Seven rules hold
  for every act: the reader decides (trust and price are worked out in each person's own node, never scored by FoodX);
  nothing leaves a node without a grant she signs; what she did is hers by default (the parties may agree otherwise,
  and what others signed about her stays theirs); she can always leave our system, taking her record and keys to any
  host or engine, while leaving a deal or a group follows the exit terms she signed, its cost agreed up front;
  authority only narrows as it is passed on; nothing fills her silence (the protocol holds no default, a FoodX default
  may only restrain FoodX, and anything that spends her needs her yes); and force is named (a demand backed by force is
  compelled, never consent, and is never filed as buying, selling or giving). FoodX shows the terms of a deal, and
  never forbids a deal both sides freely chose.
- **Results are honest**. A result counts records and names them. Five rules keep it honest:
  - Waiting is a Change to when: "buy when it is under £30" keeps the idea open with that condition; no move means wait.
  - Numbers only where cases repeat. Where her record holds many like cases ("you sell out 8 Saturdays in 10"), show
    the count. A one-off future (a new stall, next year's price) gets the factors and a blank for her own judgement,
    never a probability.
  - What she expects is hers. A move that commits her to a future records her own expectation, in her words; when
    the outcome lands, the gap is her profit or loss, a signed fact that is hers. FoodOS never prints a profit it
    worked out for her.
  - Things that happened together are said as together ("rain days and low takings went together on 7 of 9 days").
    Only a trial (Running a trial) earns "because".
  - A comparison uses only a yardstick she chose (last month, her goal), and other people only through what they
    shared openly. So no shaming, and no "people like you".
- **Not acts, part of the form**: how and when FoodOS reaches you (quiet hours, once a day), language, units, text
  size, the camera off at the till, refusing to hear from a sender, an outage, a trip. They apply to every act, so
  each is a setting the person owns, read by every card. Paying for FoodX is not an act: it is a Compute meter billed after use, under a cap she sets (docs/PRODUCT.md).
- **FoodOS refuses one thing: a falsehood.** It never says what is false or hidden, to either side: fake scarcity
  or a countdown that is not real; a "was" price that never was; a pack shrunk behind a deal without saying so; a fee
  or charge left out; paid placement without a label; a review rewarded without saying so. Everything else about a
  price or a deal (different prices for different people, tiers, surge, points that expire, targeting) is the
  owner's own choice, shown with its terms; and what the person will not take part in is a setting in her own node
  ("never surge", "no alcohol offers", "no credit above 10%"), which FoodOS keeps for her. FoodX forbids no deal both
  sides freely chose.
- **What every move needs to know is worked out, never listed** (tools/moves.py, form.json `move rules`): what it
  does to the world, whether it can be undone, what a yes needs (FoodOS tries your record, then a Find out act, and asks
  you last), the signed record it writes, and what the act itself puts on FoodOS moving alone (only you for what widens a
  grant, a draft for your tap where a demand has no rule behind it or a deal differs from the usual case; whether her
  grant lets FoodOS move alone is the Gate's question, asked of the FoodBlock SDK). Every wait has an answer-by time; past it the act is expired, or stalled if work went quiet.
- **An act = a family, what it is about, its facts, its fields**. The family (the verb) groups it; the nouns say
  what it is about; the facts say how it works (below); the fields are true with or without FoodOS: who (and who
  answers), the other side, for whom, terms (including who pays, when each side's part arrives, what backs it and
  what leaving costs), where and when (including how often), what it must fit, what it serves (a link to a goal or
  bigger act), and what she expects. What started work on an act and how it is shown are not part of the act.
- **A preview is an act at the idea stage that agents keep improving**. Background agents fill
  and firm up its fields (find the other side, ask for quotes, check limits, link it to goals) using the same acts,
  out of sight, inside the person's grant.
- **Term rules are written once** (form.json `term rules`). A rule about a deal's terms is one sentence in the grammar,
  and every act whose facts select it holds it (tools/moves.py, terms_for): compelled, a signed price, credit, what
  backs it, what leaving costs, held not owned, a claim, done when read, what you expect, the wait, a signed rule binds
  only its signers, a shared pot, the law's floor, tax on a price, what's taken off (every deduction points to the signed fact it rests on,
  or shows as unmatched), the remainder (in, less out, less noted, against a count: what nobody wrote down, its cause never named
  by FoodOS), where it came from (a handed-over thing names the lots it came from), and where Austrians differ (the library takes a side and names its source each time, docs/PRODUCT.md). A note never
  repeats one; that is how the rules stay one rule and never drift apart.
- **The other side must fit the facts**. The two sides of one deal agree on what goes in exchange, how the price is set
  and who waits (her "I wait" is their "they wait"), between the same kind of plans, at opposite ends, sharing a change
  and a noun. Consent and how long it runs may differ (a recall is compelled for the seller and chosen by the buyer; a
  open offer meets many one-off deals). The other side is worked out from these facts: the one act they allow, or
  the unique nearest of those they allow, every fact counted the same (tools/moves.py, computed_side). It is written
  (`mirror`) only where the facts tie, where judgement overrules them, or where there are several; a written side the
  facts already decide is refused. Why an act has none is worked out too where its facts say (the state's side is a
  rule; a group acting among itself is its own other side; a telling is answered by its reading), and written only
  otherwise.
- **A new fact only when it changes a rule or decides the other side**. Acts that differ only in what they are about
  (logging health, stock or money) keep the same facts and are told apart by name and note: that difference is words,
  not structure.
- **No build plan in the language**. When FoodX can run an act (now, once there is a network) is not a fact of the act
  and is not stored on it.
- **The facts carry the rules** (form.json `facts`). Every act answers these, each from a short list:
  - What changes: who owns it, who holds it, where it is, what it is, what's known, what's agreed. Often more than one.
  - Who is in it: alone, your group (people sharing one plan: a household, an owner-run crew), or others
    (separate plans dealing). A co-op, a chama or a club of separate owners is others, with a group as the other side.
  - My side, between separate plans: just her (left unsaid), or a group of separate owners she belongs to, acting
    together (selling as a group, a strike, a group buy). A group on either side brings leaving, what leaving costs and
    a rule that binds only its signers.
  - Which way it goes for her: out, in, both, or none.
  - In exchange, one value: money, goods (goods or work in kind), nothing, a share of the outcome, or a claim (paying
    with someone's promise). Empty exactly when everyone in it shares one plan. A price of nothing is a term.
  - How long one deal runs: in one go, once, or until ended; and whether it recurs (dated occurrences inside it: a
    weekly box, wages, rent, a pot's turns), which brings how often, skipping and swapping.
  - Consent: by consent, compelled by a rule (a law, an order, a published rule backed by force), or compelled by force
    (a demand with no rule behind it). A real deal may move consent only toward force.
  - Who waits: nobody, she waits, they wait, or by turn (each member's turn decides who owes). And whether a part comes
    only on a condition (a loss, a pass, a win). A priced deal where one side waits, on no condition, is credit.
  - Who carries the outcome, from her side: her, shared, or nobody. Each side of a deal says its own. What she expects
    is asked only when it is her or shared.
  - The other side, when separate plans deal: a person or household, a business, an institution or the state, a
    group, a market or platform, or anyone.
  - How the price is set, when something goes the other way between separate plans: by the one who offers it,
    bargained, by bidding, by a formula, by a rule she signed, or by a law.
  - How many yeses close an open offer: the first (left unsaid), enough (a threshold, nobody bound before it), every
    party (or none), each yes alone (an offer to many), or one picked (by bid, judge or draw).
  - When something is held or lent: may the holder use it (no; yes, the same thing back; yes, the same amount back;
    yes, only for what was agreed) and when it comes back (on demand, on a date, on a condition, never).
  - Audience, for what she does alone: her node only (left unsaid), people she names, whoever must know by her grant,
    or anyone (a open offer: prices, hours, what she sells). It decides who a move reaches.
  The judged facts are the act's usual case, judged once per act by a model and named in `judged` with who judged; a
  real deal carries its own when it differs (a TB test the law requires is compelled on Calling the vet). No confidence
  number is stored on a usual case: numbers are only for what repeats. Everything else is worked out from the facts,
  never typed per act: which moves it takes and which fit now, what each does, undoes, records and reaches, what it
  needs, the term rules, the everyday words that fit it, and FoodOS's part in it (tools/moves.py). Code reads the
  properties form.json gives each value and each noun (`properties`), never the words.
- **A deal is one deal, read from two sides**. The two sides agree on what goes in exchange, how the price is set,
  whether a part is on a condition, what a holder may do, and who waits (flipped); the deal's shared terms are read from
  both sides, so both see the same terms.
- **FoodOS never moves alone by accident**. Only she signs what widens a grant (Offer, Start, Accept, Change, Resume on
  an act that gives authority or access); anyone she named may narrow it (Pause, End). A demand with no rule behind it
  always waits for her, and so does a deal that differs from the act's usual case. The act library gives the Gate only
  these restraints (`restraintsOf`: what widens a grant, what always waits); it reads no grant. Her grant is read by
  the Gate through the FoodBlock SDK, which alone decides whether FoodOS may move alone: a grant names types, parties and
  a limit, and in `condition` the moves and terms it allows; it names no act, so no change to any library can change what
  she signed; it has no end unless she names one, and a missing amount or party means outside. check.py proves the restraints on every act and move.
- **Card rules are written once** (form.json `card rules`): live choices and plain facts, never her cost; a statement is
  its maker's signed word and says if it was paid; nothing leaves without her grant; the one refusal, a falsehood; only
  signed or counted figures; calling it off; who answers; the law shown apart. A note never repeats one.
- **Picking an act is closed questions** (form.json `questions`). One first-person question per fact ("Who else is in
  it with me?"), each answer one value; code keeps the acts that fit and asks next the question that splits the rest
  most evenly (tools/pick.py, index.mjs). Jev answers from what it sees, and chooses among the last few acts by name and
  note; she is asked only when the choice commits her. Never a small model guessing the act from free text.
- **One library, read the same in Python and JavaScript**. tools/compile.py writes compiled.json, every act's rules
  worked out once; index.mjs reads it for FoodOS. check.py fails when compiled.json is older than the library or the
  rules, or when the JavaScript reader answers any case differently. Labels in other languages sit beside an act, and
  code reads ids and facts, never labels. (An entry of this library may be published as any open `thing`; the protocol gives it no kind of its own and reads none.)
- **Acts are computed from signed blocks, never labelled on them.** Under the act library sits FoodBlock 1.7
  (foodblock/spec/protocol.md): every block is a signed step in one of three moods: is binds his name to its truth; must binds his property to its
  condition; may is his consent to another acting for him. Information nobody signed is pencil, never a block. The verb, the stage and the act's name are read from the blocks; the structure always wins over a
  label.
- **The one rule for merging** (Patrick, 2026-11-05). Two acts are one act only when they are the same action: the two ends of one deal, the same action in another setting, with another thing, or in other words. They stay apart when who carries the risk or what is owed differs. A merge is proved before it is made, by the compiler and not by eye: the merged act, read from each end, must give every act it takes in the same shape, the same terms, the same moves and the same record for each move (tools/moves.py reads, and check.py's twins rule keeps what remains apart named). A merge carries everything the acts it joins knew: every note, card, example and move word is kept, and the old names and ids stay (`known as`, `was`), so a deal that names an old id still finds its act.
- **A deal is one act, whoever signs it.** An act that has two ends names them: `sides` is `{from, to}`, in her words (`from` gives the thing, `to` takes it and pays), and its facts are those of the `from` end; the other end is read by turning `which way` and `who waits` round, never written twice. Which end she is on is read from who signed. `mirror` stays only for two different acts that are the other side of each other (an act merged into a two-ended one points at it).
- **One line each: "you do this when".** Every act has one sentence saying what sets it apart from its neighbours (`you do this when`), the line a model reads when it picks an act from her words. It is not the note's kept-apart sentence, which names the neighbours; no two acts share a line.
- **An idea is not property.** No act lists `who owns it` as a change for an idea (a recipe, a method, a name, a design): what binds is the signed word of the two who deal (who may use it, who promises not to), and what is told is what's known. A name customers know is a reputation, so selling a brand is signing over your word and the real things that can be handed over (a registered mark, accounts, stock). A registered mark is a monopoly the state grants and enforces by force: Registering your brand is compelled by a rule and is not a licence.
- **Verbs are family names, nothing more**; since 2026-11-05 they are browsing labels only: no rule and no pick reads one, and the 23 only group the library for a person to browse (23: Buy, Sell, Swap, Give, Get, Lend, Borrow, Comply, Tell, Find out, Teach,
  Learn, Log, Set, Plan, Agree, Create, Make, Grow, Keep, Carry, Eat, Share). A family helps people and models find an
  act; it carries no rules of its own. Each family names the facts its acts share (form.json `verbs`, `facts`: Buy is
  in, between separate plans, priced; Comply is compelled), and check.py holds every act to it, so a family is a label
  the facts agree with. A family is renamed when its acts read wrong in it (pots and turns moved from Agree to Share). Not families: asking, offering (one move, Promise), booking and paying are moves; Hire and Work are not Borrow / Lend but a service sold as it is done (Employing someone is Buy, Working for someone is Sell), never lent;
  License is Borrow / Lend of an idea; Host is Give, its guest Get.
- **Each act says what it is kept apart from**. Every note has one fixed form: it opens with "You"
  and what you are doing, then the steps, then one sentence "Kept apart from A (why); B (why); and C (why).", and ends
  "It usually starts when ...". The mirror is its own field, never repeated in the note. A note says only what is
  particular to the act and the rules inside it that no term rule already says (what FoodOS shows or never does, who must agree, the law). Why an act exists, what the
  future may bring and the economics behind it are said once, here, never in a note. The kept-apart part names the two to four acts a person would
  really confuse it with, and why (Selling spare food and Giving food away: one is paid,
  the other free). Which acts get confused is meaning, so it is judged, not computed. The kept-apart names are
  read from the note as links (tools/notes.py): each must be an act, and an act whose facts and nouns match another's
  is kept apart from at least one of them. Words differ by culture, place and person ("khata", "your weekly shop") and
  point at the same acts, so the library grows by words. "Leave a job" keeps its card, note and examples as the move
  words of End on Working for someone, because an act is its whole lifecycle.
- **One list of nouns** (16): food, living things, by-products, energy, equipment, space, land and water, rights and
  claims (water allowances, quota, grazing rights, insurance, tickets, a price fixed for the future, an unpaid invoice,
  a share in a business, vouchers and points), a permission (a licence, a rental, a mandate, a grant of authority:
  a right to use, enter or act that someone grants and can end), time (hours and schedules), work (labour sold as a service), a job (a
  finished task), an idea, money, a record, knowledge, people. Owning is not a noun: it is who owns it afterwards (a
  fact). Each act lists its nouns one by one. Work is sold as it is done, never lent: an hour worked does not come
  back. A record is copied, never handed over.
- **What goes in exchange names what goes the other way**, so it reads the same from both sides: Buying and Selling
  both have money in exchange. For good: Buy /
  Sell, Swap, Give / Get. For a while: Borrow / Lend for money (rent, hire, license) or for nothing. Work is a service
  sold (Working for someone is Sell, Employing someone is Buy). A tax, a fine or a licence fee is Comply: compelled,
  never a gift or a purchase. Haggling is Offer and a counter-Offer. In a trade-in the main thing decides the family;
  the cash is a term.
- **Time is in every deal**. Goods now and goods later are different goods. A priced deal where one side waits is
  credit, whatever it is called (a tab, khata, deni, fiado, a deposit, prepaying, a rotating pot, a lease, wages paid
  after the work), and the gap between the two signed prices is read from the deal, shown unsplit (it carries both time and risk), and never set by FoodX (term rule `credit`). Each node
  reads its own rate of trading now for later from its own signed deals, and FoodX never sets one.
- **Money is the most accepted thing; everything else is a claim**. Money is what people near her actually accept at
  par, read from her own record. Points, vouchers, shop credit and IOUs are claims (term rule `a claim`). What is held
  but not owned says whether the holder may use it and when it comes back, so custody, a deposit and a loan are never
  mixed.
- **The stages are worked out from the moves**: each move names the stage it reaches (form.json `moves`). An idea ->
  asked or offered -> accepted -> underway -> done. Off the path: declined, withdrawn (taken back by who made it),
  paused, ended (a lasting act stopped by either side: leaving a job). Four need no move: an idea (FoodOS proposing,
  in pencil), expired (time), stalled (underway, and the proof its next move needs is overdue) and reversed (undoing after a yes is a new act). Cards keep everyday words: book, cancel,
  refund. Each side of a deal has its own half (my side done, your side done), because deposits, prepaying, escrow and
  tabs put payment anywhere; a deal is done when every side's part is in. A group's yes comes by its own rule.
- **If it applies to every act, it is part of the form, never an act**.
  - Finding: every search for the other side of a deal is a Find act (Finding a place to eat, Finding suppliers, Finding
    buyers, Finding company to eat with); the exchange starts once you know who.
  - Undo: ending, cancelling, unsubscribing, leaving, removing, taking back a shared record and pulling a review are
    the withdrawn, ended or reversed stage of the act that made the thing, so everything lasting can be undone
    with no extra act. A word for an undo (Leave a job, Let someone go) is a move word on the act it ends; an act and its
    own undo may share one word (Taking part in a group).
  - Standing: any act + a trigger + a limit, owned by the person (Subscribing is Buy, where and when: regularly).
    A repeating act is a subscription: done by FoodOS within your limits, results coming back to you.
  - Who acts: you, together, an institution, FoodOS under your grant, or a machine are values of the who field, never
    separate acts.
- **Who acts names who does it and who answers for it**. A child sells lemonade, a parent
  answers; FoodOS acts, you answer; a group's rule; someone they named earlier (Answering for someone); the state acting under a law
  (a tax, a fine, a compulsory cull: Comply, compelled by a rule). When a person dies or a business closes, its open acts pass
  to who answers for it (an executor, an heir), who finishes, ends or hands on each one; its record stays its own.
- **Keep changes a thing and it is still the same thing** (freeze, cure, clean, repair); Make makes a new one
  (slaughter). Readings over time (a cold chain) are logs. A hold (until it is safe, until someone decides) is a deed
  done to the thing, not a pause in a deal.
- **Set, Plan and Log split by who must know.** Log is a signed record that something happened. A plan stays private
  until it is shared: then it is a promise to that group (a household menu), and what others must do is an ask to
  each of them (a rota). Set is one of three: a open offer anyone can read (prices, hours, what you sell), a fact
  about you shown only to who must know (a diet, an allergy), or private on your device (a budget, a goal, a private
  rule; a budget given to an agent is the most it may spend).
- **Teaching is a deal only when there is one.** Paid teaching is a promise, done when the learner confirms; free
  teaching needs no record. A skill is your own record, worth what others confirm.
- **A dispute ends one of two ways:** the sides change the terms until both accept (a Change on the deal itself), or
  someone both named in advance decides (Asking for a ruling on a dispute, paid as agreed). Someone not named in advance can only
  propose; a court acts under law.
- **Every move says what proves it** (form.json: each move's `known by`, explained in `proof`): the other side's
  yes, a reading or photo, a receipt, the holder's receipt, a code only the receiver holds, a device's reading,
  the group's rule, every party's yes, a named third party's word, named witnesses, the seller's own count, your word
  (one-sided), the block itself. Whether something can be undone is common
  sense, not a label: what is cooked, eaten or used up cannot be; a deal can be cancelled freely until the other side
  says yes, and after that on its terms. An agent or machine asks first before anything that cannot be undone, unless
  a grant covers it.
- **Telling is done when it is read**. An act that only changes what someone else knows ends with the reader's
  receipt, not the sender's word. Ending a share stops future reads; what was read stays read.
- **Pointing one person to another's word is Telling, never a move of its own**. Introducing two people and Handing a request on are Tell acts: they change only what someone knows, bind only their signer, and are done when read (Done, worded Introduce and Hand on). Introducing is Handing on both ways at once. Neither is Pass: Pass hands over a part the signer accepted and still answers for, so the receiver's yes binds them; Handing on hands over nothing she answers for, only the maker's own signed words, and tells the maker where they went. A word posted to anyone may be pointed to freely; a word told to her alone is its signer's, so she asks first. A finder's fee is a signed offer by the two to her (Promise, worded Agree a finder's fee), the deal they make points back to the introduction, and the introductions that ended in a signed deal are her record as a connector, which each reader weighs for themselves. FoodX takes nothing.
- **Make takes what goes in and what comes out**. A living animal into meat (Slaughtering an animal), grain into flour, wort into beer, scraps into compost. What comes out is said in the deal, not stored on the act.
- **Create, read, change for everything that lasts**. Create makes it (a variation that keeps the original
  is a new Create); Find out reads it; its later life is moves on it: Change, End (history stays, it can come back).
  Settings, plans, logs and listings are changed by the Change move, never by a new act. A one-off change
  while doing it (yogurt for cream tonight) belongs to the doing act.
- **One voice**. "You" in everything a person reads: cards, examples, notes. "She" only inside the rules: the facts
  (which way it goes for her) and the triggers (her record). The actor is always FoodOS.
- **Examples and triggers**. Every act has at least three examples, spread across the world and across lives (a
  household, a stall, a farm, a group), each a generic pattern plus the card one real person would see, ending in the decision it asks of them. No
  example repeats the act's own card. Every move
  word has a trigger: when FoodOS would bring that step up, read only from her own record and open facts (prices, the
  date, the weather, a public notice), never from a guess about her.
- **Every noun has its whole life covered**. Food, money, time, land, groups, records, problems,
  knowledge, equipment (to disposal), living things (to slaughter or fallen stock), energy (generated, bought,
  sold), ideas (licensed, sold, handed down).
- **One rule for sides**. An act is written from the side of the person who sees the card. When ownership or holding
  changes between her and someone else, both ends of the deal are one act (`sides`, from and to, each end's own name kept) unless
  the facts of the two ends differ in who carries the risk or what is owed, in which case the other end is its own act, its
  other side (worked out from the facts, or written where they cannot say; checked both ways): one gives where the other
  receives, or both do the same (both give, together), and the two share a change. Both sides doing the same thing is one act. An act that undoes an
  earlier deal (a return, taking back what was sold) keeps that deal's family, runs the other way, and points at it.
- **A verb is one change; a bundle is a whole act**. Hosting, a shop or an event bundle several changes,
  so they are whole acts made of parts, each with its own verb. Agreeing a job and doing it are separate: the deal
  (Doing a paid job, at 4 a drop), then the doing (Moving food, the route).
- **The checks run every time, and they block**. tools/check.py: every act named for its whole life (a present
  participle), a family from form.json, nouns and every fact from the fixed lists (one value for in exchange and for runs, empty exactly when she is alone), the judged facts named with who judged, a compelled act never filed as buying, selling or giving,
  a card that asks for a decision, a note, at least three examples, every move word with a trigger and one meaning
  across the library, mirrors both ways with the deal's facts agreeing, an act with a twin (same facts and nouns) naming
  one, no name, id or example used twice, every question answering exactly its fact's values, and the restraints: what
  widens a grant is always hers to sign, a demand with no rule behind it always waits (and a deal cannot talk it
  down), every measure a move carries is listed, and the JavaScript reader answers as the Python rules do. tools/wellformed.py is the part any node runs on any publisher's
  act; the rest is FoodX's house style. `--draft` skips notes, examples and triggers while they are being written. The
  library cannot quietly decay.

## Naming
- **Force the verb tag, not the name**. Like HTTP: the method is fixed, the path is free. Every act carries
  one verb; its name is what a person would naturally say. A name starts with a present participle, in the plain words people
  use, even when that word is another verb in everyday speech ("Getting something repaired" is Buy, "Observing a fast" is Set) ("Get insurance" tagged Buy became "Take out insurance", now "Taking out insurance"). A name that reads weird is a prompt to check
  the tag (that is how Hire, Work, Learn and Get were found).
- **The clean name**. The verb plus the most general noun, in the shortest words a person would say. The
  same thing always gets the same word (equipment, sell, spare, free). Mirrors read as mirrors (Buy / Sell; Giving food away / Getting free food; Rent / Rent out; Complaining about an order / Putting a complaint right). "Your" only marks whose
  side (Sharing your record / Asking for someone's record); elsewhere names use none (Setting prices, Logging stock).
- **Named for its whole life, with an active verb**. The name says what she is doing across the act, not its
  first move: Developing a product (not Create, which is only the start), Employing someone (not Hire), Running a group (not
  Start). Never a state (have, be, hold).
- **Moves are prefixes, not acts**. Every act draws on the twenty moves in form.json, through one skeleton (propose,
  reply, do its parts, close) with a step skipped only for a reason its facts give; a shape (deal, alone, standing, one
  block, ordered, exchange) is a label for which steps it skips. Its shape, stage, turn and
  terms decide which apply. A move gets its own name only when it is a different choice with a different consequence.
  An act is its whole lifecycle: a stage of another act is never a kind of act; its words are `move words` on that act.
- **Cards**: a card is a real decision, never a request to confirm FoodOS's guess. It can ask her to Start something she does
  herself ("Push the cart to the bus stage now?"), since Start is her move.
- **Bridges to the physical world**. What happens off the record (cash, births, losses, a no-show, hours with no clock) comes in by her own count, a photo, someone else's signed word, or arithmetic over records already there, never a sensor that is assumed. The bridge words on any deal (Count it at the handover, It didn't happen, Record a loss, Countersign the work, Note a reading, Note a missed sale, Count what you have, Note the wait, Check it over at the start and at the end) and Count who came on the acts that feed people are one rule each, shown where the facts fit: whoever holds a perishable can record its loss, whoever holds another's goods or cash counts at the handover, any deal with another side can say it didn't happen. Three rules do the arithmetic once: the remainder, what's taken off and where it came from. The other side is the cheapest witness: where she can, payment and handover are one signed moment, and her count goes beside theirs. Her measure (tins, bags, heaps) is kept as she says it.
- **Concrete over compressed**. Split an act when people name and do its parts differently (different people,
  places, decisions or words): a household shop and a café's stock order are two acts. Merge only when two names truly
  mean the same thing. Vague acts make models drift; concrete acts in people's own words are easy to recognise.
  How or when you pay (at once, in instalments, from the harvest, with points) or a cut price is a term of the deal, never a new act: the deal's
  own facts (who waits, how long it runs) carry it. A name says the act and no more: a gate, not a farm gate or roadside stall.
- **Groups nest, and members act for them by role**. A member can be a group, answering by its own rule and sending a
  delegate; a machine is something a group shares, never a member. A member acting for the group does so under a role the
  group gave (treasurer, head of catering), and the block names both who acted (it goes on their own record) and who
  answers (the group); roles outlive whoever holds them. A group's money can need k of n signers. A member who cannot sign
  (a baby, a parent with dementia) is answered for by someone with a grant to do it (Answering for someone), and their
  own limits and record stay theirs. An informal group with no
  written rule: each member answers only for what they accept. A group's rule binds its members only.
- **A platform's job done by one person for many neighbours is a paid act of its own**: Running a pickup point,
  Shopping for others, Leading a group buy, Changing money for others, Collecting savings for others, Selling
  for someone on commission. Without a platform in the middle, ordinary people take these jobs on.
- **Decentralised by design**: FoodX never holds the pot, sets prices or sets credit limits; settle in money people
  already use; any index must be runnable by anyone; a group's rule binds its members only. Who must agree, what a
  promise can carry, custody against ownership, and money carrying its issuer are written once in form.json (moves).
- **The library is a cache, not a gate**. Her own words always make an act, listed or not: an act nobody has named
  yet still counts, shown by its parts (its moves, facts and nouns). A name is a reading of what she did, never a gate
  on it. The names in this list are the trusted default, set from real behaviour. The next door: anyone may publish a
  new kind of act as a signed block, the checker asking only that it is well formed, and an act spreads by being used.
- **Generalise, don't compress**. Name each act so it fits anyone in food (a café, a farm, a shop, a home
  cook). Merge only when two general names come out the same. Keep apart what people name differently (the guard).
  An act's name must fit every example under it.
- **One thing, several things, or what you have**. Checking food is right for you, Choosing between products and Switching to a better deal are three different questions, so three acts, each working for any noun.
- **Detail follows how much life happens there**. Cooking is daily, so Cooking a meal, Cooking a meal ahead and Make
  food together stay apart; rare areas can be broader.
- **The act's name is for us; the card's word is the person's**. Doing the shopping shows up as "do a shop",
  "top up", "restock" or "your weekly shop". A general act becomes yours: "Your Saturday market run", named from
  your own habits. The name is not the card: "Your delivery is missing the milk. Ask for a refund?" is a card.
- **The words travel**. Currency, shops, schemes and laws come from where the person is; examples rotate
  countries.

## Making the card
- **A card is worked out, not stored**. The act is stored; the card is what it becomes for this person in
  this moment.
- **Every card gives before it takes**. FoodOS learns the facts of how you work through suggestions, never
  questions, and never your ends: what you want is only what you say. A missing input is asked for with what it
  unlocks; a pattern is offered as standing. No "Do you
  fast?", no forms. Never ask permission to suggest: "Iftar is at 6:42 tonight. Remind you each day?"
- **Every act needs a noun**. A card names its real noun ("the chicken", "your 5 voucher", "Sam"), from
  what is in front of you, your records, the world, or asking. FoodOS never makes a noun up.
- **Answer first; a decision only when FoodOS can carry it out on your tap**. If you act with your own
  hands, the answer is enough: no "order it" in the shop. The decision is one you can make right there, right now.
- **A card is a suggestion when FoodOS adds work you could not easily do**: research, comparing, your needs.
  Only show it if it gives more than the effort it asks (40p next door, yes; 1.20 across town, no).
- **A good act names only the fields that differ**: the ones where the moment has news. Creativity is
  choosing which.
- **A suggestion is a door, not a form**. Tweaking happens where it opens; what you do there teaches FoodOS.
- **No history: "do your first X"**. With doors inside it: show, say, share, connect. Never invent a usual.
- **One card can offer two acts as a choice**. "6 croissants left. Sell them cheap nearby, or give them
  to the food bank?"
- **Your goals rank every card**. Only you know your ends; FoodOS only works out the means.
  The same moment gives different cards to different people ("cook, that's 11 more towards the farm"; "cook with the
  kids, that's 2 of 4 this month"). With no goal set, FoodOS shows facts and never assumes what is good for you.
- **Every decision card shows her live choices, leaving it among them, with the plain facts of what each uses**:
  "Rent out the mixer Saturday, or bake with it?", "40 minutes and 2 eggs". Never what a choice costs her: only she
  knows what she gives up and whether the time is a pleasure. Facts come from her own record and open offers.
- **Pleasure is a first-class end, and FoodOS never lectures**. A treat is not a failure; the
  card shows the trade-off honestly and you choose. Cards can build anticipation. What you loved is the best signal
  for what to suggest.
- **Nothing is ranked for money behind her back**. FoodOS is the person's agent, like a lawyer who takes no money
  from the other side. A seller may pay to be shown only where she has allowed paid offers, labelled as paid, with the
  price visible. A discount, a regulars' price or a free extra wins because it is really better for her. The person
  pays FoodOS, so it works only for her.
- **Praise is progress, never streaks**. Encouragement only as real progress on a goal the
  person set ("veg target: 3 of 4 weeks"), inside Checking how things are going. No streaks, badges or guilt built to keep
  people hooked. Praise from people comes through Vouching for someone and reviews.
- **Plain words**. Everyday words a twelve-year-old understands; the card speaks to the person, starts with
  the action, one short sentence. Keep a specific only when the act exists because of it (an allergy, a licence).
- **Safe is a constraint, not an act**. Waiting after antibiotics, the nut-free cake first: rules other acts
  must fit. The doing on the kit is its own act (Looking after equipment).
- **FoodOS's own recording is never a card**. A person logging is an act (Log): it clarifies what FoodOS
  could not see or got wrong. Ask to record only when it fills a gap, and say what it unlocks: "You buy flour
  somewhere I can't see. Snap your next invoice and I'll warn you when the price goes up."
- **When information is open, tell acts disappear**. What you can't eat sits openly on your profile, so the
  host's FoodOS already knows. Guard: the person reporting chooses who sees it; sensitive reports (harassment,
  discrimination) go only to whoever can act. Openness serves people; it must never expose them.

## How the library is used
- **One list of acts, no suggestion list**. Whether an act is shown is judged in the moment from its note
  and these rules; a fixed suggest yes/no would be a lookup table standing in for understanding.
- **Compress the acts, never the examples**. Acts are the structure (fewer is better); examples are the
  fuel for ideas (more is better) and are always given to the agent with their act.
- **How the agent reasons**: shortlist the acts that fit the moment by closed questions (form.json `questions`),
  reason with each one's examples and note plus your situation, choose none, one or two, shape the card, then show
  now, hold, or leave in the list. What
  it cannot decide: acting without a yes or a grant, crossing a hard limit, inventing, getting between two people
  talking.
- **An ask is worth making only when it lowers the cost of a deal she would sign**. Agent asks out of sight are
  welcome when each finds the other side of a deal she would honour; an ask costs the receiver attention, so volume is
  never counted as a gain. People see only the outcome.

## The economy
- **Economy and catallaxy**. Running your own life well (economy) starts on day one; trading freely with
  others (catallaxy) is what it grows into. Plans never cross the market. The line is drawn by plan, not head count:
  an act is inside an economy when everyone in it shares one plan or rule (alone, a household feeding its child, a crew,
  a co-op), and in the catallaxy when separate plans deal. An economy is one person or group turning limited means into
  chosen ends, over time, under uncertainty: ends (Setting a goal, a budget, a diet, rules), means (the Log acts, the
  camera), choosing (the Plan acts), producing (Make, Grow, Create), time and risk (Putting money aside, insurance,
  spreading risk), knowing how it goes (Checking how things are going, for a household as much as a business).
  Choosing between products is the border between the two: make keeps it inside your economy, buy takes it to the market.
- **Everyone is already a food economy**. There is no moment of becoming a business: selling 2 portions to
  a neighbour is already trade, and a home and a restaurant run the same acts. Starting or closing a business
  changes only how the law sees you (it brings up Getting licences and permits). What an employer used to provide
  comes from acts: a team (Running a group), equipment (Renting something), training (Learn), sick pay (Taking out insurance,
  Saving in a group), steady income (Supplying a business), savings and a tax pot (Putting money aside).
- **Hayek's test**. Every person's knowledge of time and place must have a way into the market as a price.
  A card in the moment is that knowledge made usable ("6 croissants left at 5pm, 200m away"). Prices flow both ways: offers (Posting what you sell) and bids (Posting what you want). Traders who move food from glut to scarcity are part of the market
  (Buying to sell on). Exit is always possible.
- **Seven ways to earn from food**: goods, work, jobs, assets rented out, ideas licensed or sold, shares, and
  what food work produces besides food. Each has acts for both sides. Pure profit, from noticing what others missed,
  is hers too: the margin between promises she linked.
- **Four kinds of work**. Work is paid or unpaid, by the hour or a finished job: Employing someone / Working for someone
  (paid work), Getting a contractor in / Doing a paid job (a paid job), Asking for volunteers / Volunteering with food
  (unpaid work), Asking someone for a favour / Doing someone a favour (an unpaid job). Work is a service sold as it is
  done; a promise of future work binds only what was pledged, never her body, because no word hands on a body she never
  acquired (Kinsella, revising Rothbard).
- **Pay is the price of your work**. A worker sets their rate like any seller (Setting prices) and negotiates
  like any trader; tips are one way of getting paid. FoodOS gives workers the same price signals as sellers: the
  going rate and a record that proves their worth.
- **Coase: every worker can be their own firm** (an option, not a direction). Firms and hourly jobs exist partly
  because finding, measuring and trusting work is costly. As information gets cheaper, finished jobs and small trades
  get easier. FoodOS prefers no form of work: it shows the steady wage and the per-job rate side by side with honest
  numbers and the risk named, and she chooses. Per-job work frees people only with open prices and a portable record.
- **Groups**. A group is people who share something and stick together over time: a household, a café's
  staff, a co-op, a flat, a chama, friends. A person is a group of one, so a group does the same acts with
  "together" in the who field. Only a few acts exist because there is more than one person: Running a group (members
  joining and leaving are its moves: Invite, Accept, Leave, End), Taking part in a group, Deciding as a group (by its own
  rule), Saving in a group, Insuring each other, Sharing a machine, Taking turns to work for each other, Splitting costs, Settling up with trading partners (turns at work are Planning who works when). Letting someone act for you is the authority act for anyone, a group of one included (your drone's
  limits). Groups differ mostly in how they decide.
- **A group that withholds cannot stop others**. A strike, a held crop, a boycott or a market closing is free; every
  such act carries one term no group rule can remove: others may still sell here. A group's rate is a default each
  member can override with her own price.
- **Food moves through care as well as markets**. Families, schools, hospitals and care homes feed people
  with no selling (Feeding someone you care for; Running a canteen, paid by the
  institution or the state). The food is still bought in the market; the feeding is duty, not trade.
- **Your reputation and your audience are yours, not a platform's**. Getting your record back
  brings your history out of the apps and employers that hold it (ratings, sales, tips, how many came back for you); Vouching for someone writes a signed word into another person's record; Following someone keeps follows with the follower and the
  creator. Together they are how a market with no platform owning it starts. Computer use changes no act: FoodOS
  working another platform is who acts plus how it goes out, as you and within your grant.
- **A worker's regulars follow them only by choice.** A worker carries how many came back for them, never who: a
  customer list never moves (taking one to a new job is against the law in many places). Moving on, they say where
  in public, and each regular's own FoodOS may offer to follow them ("Ama, who served you 40 times, now works at
  Lucca. Follow her?"). A business's own followers stay with the business, so selling a bakery keeps its goodwill.
- **Onboarding is Getting your record back, for everything at once**. No page of logos to tick:
  that is a form. Connect email once; its receipts show which platforms the person really uses (delivery apps,
  supermarkets, bookings, suppliers, sales tools). FoodOS shows what it found and what each unlocks ("7 places hold
  your food history. Bring it all in?"): one tap, a real decision. The receipts give a head start in the first
  minute; the full exports arrive over days or weeks as an underway act, each filling in as it lands. Rules: export
  rights differ by country (strong in the UK, EU, Kenya, Brazil; patchy in the US), so the receipts carry day one;
  where a platform makes export hard, FoodOS does it in the person's own logged-in session while they watch, and
  never stores a password; health data is always a separate choice, private by default. It ends the cold start:
  FoodOS knows your usual, your record and your reputation on day one.
- **Trust between strangers comes from records, reputation and neutral settlement**. Open records prove
  claims, reviews carry reputation, Asking for a ruling on a dispute resolves what is left. Your record is your property: share it,
  take it back, or rent it; it goes with you everywhere and outlives you (name who holds it; a standing share can
  start on death). It carries what others said about you, signed by them: you carry it, you can't edit it.
- **Matching**. Every exchange has two sides; FoodOS works out the other side and matches them. People's
  constraints complement each other, and that is why the market exists.
- **Automation changes who acts, never the act**. A robot cooking is still Cooking a meal; an agent ordering
  flour is still Subscribing. The library is automation-proof by design: the future pushes on two fields,
  who acts (who answers for it, and who is paid) and how it is known (sensor readings, camera proof, signed machine
  logs). What stays human: eating, wanting, granting authority, creating, hosting, care, teaching, trust, owning, and
  signing your name to what machines do (Certifying against a standard). Compress shrinking acts (business logs, auctions)
  only when real use shows the shrink.
- **Create becomes the highest-leverage verb**. When machines can Make anything, value moves to whoever
  Creates the recipe: a dish run in 1,000 robot kitchens, earning through Letting someone use your recipe or brand.
- **Owning the machines is a question of economic freedom**. If platforms own the robot kitchens and drone fleets,
  automation centralises; if people own them (a robotic home farm, a co-op's robot), it frees them. FoodOS prefers no
  owner: it shows each route (Buying equipment, Saving in a group, Renting something out, Borrowing money) with its
  cost, and ownership follows from her saving and choices.

## The camera
- **See, read, compare, mismatch, fix, decide**. The camera adds a reading and a comparison to an act we
  already have; it needs no cards of its own.
- **Five readings, each landing on an act**. Identity: Finding out what something is. Amount: Logging stock, Doing the shopping. Condition: Checking food is right for you, Keeping food fresh. Change: Checking how things are going, the Log acts. Layout: Stocking shelves.
- **Never get between two people who are already talking**. Ordering face to face needs no card; in a shop
  a card shows only when it is for later or saves waiting.
- **A person in view is context only**. Never the start of a card, never identified.

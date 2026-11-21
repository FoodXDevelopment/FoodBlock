# The act library

The platonic form of every act in food: what anyone in the food world can do, from a home cook to a farm, a café,
a trader or a machine. FoodOS reads these acts, does them, and suggests them.

It is an open library of names: anyone may copy it, change it and add to it, and another publisher's list is as good as
this one. An act is a reading. The protocol has no act: no block names one, no grant covers one, and nothing checks a
deal against one (FoodBlock 1.8, `promises.md`, A name is pencil). What a deal is, is what its blocks say; a name for it
is its reader's own. The two sides of one deal often name it differently, and both are right.

An act is one person's or one group's whole lifecycle, named in their words ("Selling spare food"), with a permanent
id. It sits in a family (Buy), says what it is about (food) and carries its facts: what changes (who owns it), who is
in it (others), which way (in), what goes in exchange (money), how long it runs (once) and whether it recurs, consent,
who waits and whether a part is on a condition, who carries the outcome, and for deals between separate plans the other
side, how the price is set and how many yeses close it. Its moves, what each does
and FoodOS's part in each are worked out from those facts, never listed per act.

| File | What it is |
|---|---|
| `form.json` | The grammar: 23 families (browsing labels only), the nouns and glossary, the facts and the properties code reads, the questions that pick an act, the term rules and card rules, the 20 moves (each with its stage and its proof), the shape labels, the move rules, who must agree, the fields, the stages. |
| `acts.json` | Every act (358): id, name, family (a browsing label only), nouns, its facts (the judged ones named in `judged`, with who judged), card, note, `you do this when` (one line), `sides` (from and to) where one act is both ends of a deal, `known as` and `was` (the acts merged into it, by name and id), the acts on the other side of its deal, examples and move words. |
| `compiled.json` | The rules worked out once per act by `tools/compile.py`, for FoodOS to read. Generated; never edit by hand. |
| `PATTERNS.md` | The rules: the form, naming, making the card, the economy, the camera. |
| `FIELDS.md` | The fields of a real deal: who, the other side, for whom, terms, where and when, what it must fit, what it serves, what you expect; plus the grant. |
| `LIBRARY.md`, `view/index.html` | Generated views. Never edit by hand. |
| `tools/` | The compiler, the checker and the builders for this library. The checker also holds the merge rule: no two acts share a "you do this when" line, and a merged act keeps the ids of the acts it took in. |

The protocol under the acts is FoodBlock (`foodblock/spec/protocol.md`); an act is read from signed blocks, never
written on them.

After any change to `acts.json` or `form.json`:

    python3 foodblock/acts/tools/compile.py        # compiled.json
    python3 foodblock/acts/tools/check.py          # must pass (--draft while notes, examples and triggers are being written)
    python3 foodblock/acts/tools/build_library.py  # LIBRARY.md
    python3 foodblock/acts/tools/build_page.py     # view/index.html (serve view/ to read it)

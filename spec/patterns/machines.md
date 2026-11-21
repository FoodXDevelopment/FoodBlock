# Pattern: machines

Not normative. A pattern adds no rule. Whether a machine runs is what its owner's kit does with blocks: none of it answers who signed, whom a block speaks for, what it binds or who owns (core.md, section 10).

## A machine's fence

A grant may carry `state.fence`: the bounds its signer draws round a machine she owns, written once, where a reader can check it ("max 180 degrees, 6am to 10pm, heat off, may work alone up to 2 hours"). It is her word, part of her grant, and it binds her alone; the machine signs only readings (core.md). It is not privacy.md's envelope, which is only what a block travels in. Every field is optional: `{ ranges, hours, safe_state, work_alone }`, data, never prose.
- `ranges`: a non-empty list of `{ of, min, max }`. `of` is a name of the signer's own (`temperature`), once in the list, matched exactly and never checked; `min` and `max` are amounts (`{ value, unit }`, any sign, since a freezer holds below zero), at least one of them, in one unit, `min` no more than `max`. The machine's reading of `of`, in that unit, is inside when it is no less than `min` and no more than `max`.
- `hours`: a non-empty list of `{ from, to }`, each an hour of day with its own offset from UTC (`grammar.hour`: `06:00+01:00`, `22:00Z`). An entry takes in the minutes of the UTC day from its `from` up to, not including, its `to`, round midnight when `to` falls earlier; the offset is taken off first, so entries written in different offsets compare. An entry whose two ends are the same minute is `shape` (a whole day is no entry: leave `hours` out). The offset is part of the word and no time zone database is read, because strangers' computers must compute alike and such a database changes under them: a place that changes its clock signs a newer word in its place, or lists both seasons' entries under an `until`. `from` or `to` outside `grammar.hour` is `grammar`.
- `safe_state`: the name (non-empty text) of the state the machine goes to when it is outside the fence or cannot tell. The protocol matches it exactly and never checks it.
- `work_alone`: a duration (`PT2H`): how long the machine may carry on after the newest block it has heard from its node. Left out, it is zero: a signer who does not write it lets no time alone.

A field that is there and cannot be read, or a name that is not one of the four, is refused (`shape`, `grammar`, `time`, `undeclared_field`). Left out, `ranges` and `hours` fence nothing of that kind (the grant's `types` and `until` still bind); nothing fills in hours or a range.

**Narrower on every field.** A grant passed on by its receiver carries a fence no wider than its parent's, else `wider_than_parent`:
- `ranges`: for every range the parent states, the child states one of the same `of` and unit, with a `min` no lower and a `max` no higher at every end the parent states (a child that leaves an end out is unbounded there, so wider); the child may add ranges the parent lacks.
- `hours`: every minute of the UTC day the child's entries take in, the parent's take in; a child with no `hours` under a parent with some takes in the whole day, so wider.
- `safe_state`: the parent's, exactly (a child that names another, or none, is wider).
- `work_alone`: no longer than the parent's, the two spans compared by what each adds to one fixed instant (authority.md, A range and a list); a parent that states none lets none, so a child longer than zero is wider. A child that leaves it out is zero, never wider.
A parent with no fence fences nothing, so a child may state any ranges, hours and safe state, and only a `work_alone` above zero is wider. Ground: she gave only what she wrote; a holder cannot hand on a freer machine than the one she was handed.

**Is the machine inside its fence?** The reading `fence_reading(fence, at, readings, heard)` answers `{ within, why, alone, alone_until }`, from signed facts only; it reads no clock, so the caller names `at` (the machine's time is the later of its own clock and the newest signed block it has seen) and `heard` (the time of the newest block it heard from its node, or null). `readings` is null or `{ name: amount }`, the amounts the machine's sensors last signed.
- `why` lists, in order, `outside_hours` (`at`, as a minute of the UTC day, is in none of the hours), then for each range in the fence's order `unread` (no reading of that name that is an amount in the range's unit: silence never counts as inside) or `out_of_range`. Each entry is `{ code, of }`, `of` null for hours. `within` is true when `why` is empty. A fence that cannot be read gives `junk` alone: it is held to no word. A null fence fences nothing.
- `alone_until` is `heard` plus `work_alone` (zero when left out), null when `heard` is null; `alone` is true when `at` is no later than it. "Up to N" includes N.
The reading says what the signed words say; what the machine does outside its fence is its `safe_state`, and the gate that cuts to it is the machine's kit, not the protocol (a duty exists only where someone signed it).

## A machine lock

**A machine lock** is a stop of a machine: a grant of kind `stop` whose `refs.subject` is the machine. It is the owner's word when it is backed by the machine's owner, as the ownership fold reads him in the lock's causal past: his own block, or one signed under a grant of his that names the type `grant.stop` and that machine. It ends as anything ends: by its author's stop. The owner's grant may say who else may end a lock placed under it, and on what stake; where it says nothing, no one else does. Any other signer's stop of a machine is that signer's reading: shown, and locking nothing. A locked machine goes to its owner's safe state; the lock names none.

The reading `machine_lock(machine, held)` answers `{ locked, locks, claimed }`: `locks` the stops backed by the owner that stand, `claimed` the others.

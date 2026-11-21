"""The folds and views (modules/folds.md): a set of blocks read into one answer, the same on every node from the same blocks;
a view adds the reader's clock. Thin calls into the Rust core. A circle, a person or a thing may be given as its block or as its hash."""

from . import _door as door


def _id(x):
    return x["hash"] if isinstance(x, dict) and x.get("hash") else x


def _block(x):
    return {"hash": x} if isinstance(x, str) else x


# ---- Promises ----
def promise_stage(first_block, blocks) -> dict:
    """A promise's stage, from its first promise and every block in its deal: a function of the blocks alone. No clock."""
    return door.promise_stage(first_block, blocks, {})


def promise_view(first_block, blocks, now=None) -> dict:
    """The same answer with stage `expired` once the reader's `now` passes `expires` and nothing binds."""
    return door.promise_view(first_block, blocks, {"now": now})


def promise_views(firsts, blocks, now=None) -> dict:
    """The views of many deals of one store at once, read against one reading of it: { hash: view }."""
    return door.promise_views([_id(f) for f in firsts], blocks, {"now": now})


def repeat_occurrences(promise, from_, to) -> list:
    """The UTC start times of a standing promise's calendar repeat from `from_` up to, not including, `to`, read in its zone by the pinned IANA database."""
    return door.repeat_occurrences(promise, from_, to)


def due(promise, arrived_at=None):
    """`arrived_at` is { hash: time } data, or a function over the blocks it needs (the promise)."""
    if callable(arrived_at):
        arrived_at = {promise["hash"]: at} if (at := arrived_at(promise["hash"])) is not None else None
    return door.due(promise, arrived_at)


# ---- Circles ----
def circle_state(circle, blocks, within=None) -> dict:
    """A circle's owners and rows. `within` (a block): fold only its causal past."""
    return door.circle_state(_id(circle), blocks, within)


def circle_versions(circle, blocks):
    """A circle's versions and who is on each: { circle, versions, members, rules }; None for a block that is not a circle's founding block."""
    return door.circle_versions(_id(circle), blocks)


def circle_key(circle, blocks):
    return door.circle_key(_id(circle), blocks)


def row_holds(block, blocks) -> dict:
    """Whether a row of the circle a block is `as` holds for it (circles.md)."""
    return door.row_holds(block, blocks)


def ways_in(circle, blocks) -> dict:
    """The fewest hands each row of a circle needs (a reading)."""
    return door.ways_in(_id(circle), blocks)


def machine_lock(machine, blocks, now=None) -> dict:
    """Is a machine locked now (authority.md, A machine lock): { locked, locks, lifted }."""
    return door.machine_lock(machine, blocks, now)


def count_of(needed, members):
    """A threshold read against `members` voices: the number of voices it asks for, or None when it names no count."""
    return door.count_of(needed, members)


members_then = door.members_then
counted_in = door.counted_in


# ---- Authority and money ----
def speaks_for(block, blocks):
    """The one party a fold counts `block` for (authority.md): an id, or None when it speaks for no one. The block need not be among the blocks yet; no clock."""
    return door.speaks_for(block, blocks)


def backed(block, person, blocks) -> dict:
    """Is `block` backed by `person` (authority.md): { backed, why, chain }; `why` is a plain sentence when not (None when backed), `chain` the hashes down to the block the person signed. No clock, no arrival."""
    return door.backed(block, _id(person), blocks)


def backed_all(person, blocks) -> dict:
    """`backed` for a whole set at once: { hash: { backed, why } }."""
    return door.backed_all(_id(person), blocks)


def to_come_back(person, blocks) -> dict:
    """An amount moved in `person`'s name that they do not back (promises.md, What is to come back): { to_come: [{ block, amount, to, why }] }."""
    return door.to_come_back(_id(person), blocks)


def gives(block, person, blocks) -> dict:
    """What of `person`'s would become whose if `block` stands (promises.md): { gives: [{ what | amount, to, back, held }], bench }, read only from typed terms and refs."""
    return door.gives(block, _id(person), blocks)


listing_check = door.listing_check  # a list-keeper's answer against the lookup it answers: { ok, why, bad, left_out }
check_reads = door.check_reads  # a signed check of someone's record against the blocks it names: { ok, why, read }
clearing_applied = door.clearing_applied  # a circle of IOUs cancelled, each promise reduced: { binds, why, who, missing, lines }
ruling_releases = door.ruling_releases  # whether a judge's ruling releases a stake that names it: { releases, to, amount, ruling, why }; no reader's clock
fee_back = door.fee_back  # what a judge's offer gives back of her fee: { settled, releases, to_come, why }
account_of = lambda who, blocks: door.account_of(_id(who), blocks)  # noqa: E731  where a person says money to them goes: { who, destinations, hash, at }, or None


def keeps_to(c, a, blocks=()) -> dict:
    """Whether a promise C keeps to a promise A (authority.md, Keeps to): { keeps, why }."""
    return door.keeps_to(c, a, blocks)


def meter(grant, blocks, block=None) -> dict:
    """The line a grant's blocks are counted on (authority.md): { grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back }."""
    return door.meter(grant, blocks, block)


def worst_case(grant, blocks) -> dict:
    """The worst case of a grant, from her grant and the promises it names alone: `at_most` and `can_lose` per kind."""
    return door.worst_case(grant, blocks)


def lowest_offer(grant, blocks) -> dict:
    """Her deadline's lowest offer, read on the meter's line: { offer, received, cutoff, why }."""
    return door.lowest_offer(grant, blocks)


# ---- Things ----
def ownership(instance, blocks) -> dict:
    """Who owns an instance (folds.md, Ownership): read from the blocks alone, no clock."""
    return door.ownership(_block(instance), blocks)


def ownership_view(instance, blocks, now=None) -> dict:
    """The ownership view: the same fold read at the reader's clock `now`."""
    return door.ownership_view(_block(instance), blocks, now)


made_from = lambda instance, blocks: door.made_from(_block(instance), blocks)  # noqa: E731
owner_of = lambda instance, blocks: door.owner_of(_block(instance), blocks)  # noqa: E731
where_now = lambda thing, blocks: door.where_now(_block(thing), blocks)  # noqa: E731
shares_on = lambda thing, blocks: door.shares_on(_block(thing), blocks)  # noqa: E731
not_free_shown = lambda block, blocks: door.not_free_shown(_block(block), blocks)  # noqa: E731
invasion_shown = lambda claim, blocks: door.invasion_shown(_block(claim), blocks)  # noqa: E731
release_shown = lambda subject, blocks: door.release_shown(_block(subject), blocks)  # noqa: E731
use_shown = lambda place, blocks, keepers=None: door.use_shown(_block(place), blocks, keepers)  # noqa: E731
receiver_of = door.receiver_of
pot = lambda head, blocks, now=None: door.pot(_block(head), blocks, now)  # noqa: E731


# ---- Consent ----
def consent(person, sender, blocks, block=None) -> dict:
    """A person's live word about a sender (or none): { word, block }. `block`: the sender's block, whose grant makes a word about its grantor a word about the sender."""
    return door.consent(person, sender, blocks, block)


# ---- Readings: the read-back of a block, a renderer's words, a second reader's redo ----
def readback(block, blocks, to=None, renderer=None, digits=None) -> dict:
    """The read-back of a block to the person `to`: { answer, text, state }."""
    return door.readback(block, blocks, to, renderer, digits)


def render(answer, renderer) -> str:
    return door.render(answer, renderer)


def readback_redo(rb, blocks) -> dict:
    """A second reader's redo: { same, readback, lacks, not_run }."""
    return door.readback_redo(rb, blocks)

"""The folds (protocol.md §11): a set of blocks read into one answer, the same on every node from the same blocks. Every
block is first read as 1.6 through aliases.json (every row). No step reads another author's clock or breaks a tie on
authority by hash; `now` is only the reader's own clock, for views (expired, until)."""

import math
from fractions import Fraction

from . import _js
from .aliases import read_as
from .grant import is_live, add_duration
from .order import past_of, sees, causal_order, heads_among, index_of
from .spec import PROTOCOL

truthy = _js.truthy


def _get(value, *path):
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _list(ref):
    return ref if isinstance(ref, list) else [ref] if truthy(ref) else []


def _hash_of(value):
    return value.get("hash") if isinstance(value, dict) else value


def _counts(block, by_hash):
    """Whether a block counts in a fold: with seq, or as its author's history (identity.counts)."""
    from .identity import counts
    return counts(block, by_hash)


def _read_all(blocks):
    return {block["hash"]: read_as(block) for block in index_of(blocks).values()}


def _with_first(first, blocks):
    merged = {}
    if isinstance(first, dict):
        merged[first["hash"]] = first
    for block in index_of(blocks).values():
        merged[block["hash"]] = block
    return merged


def _earliest(group, by_hash):
    return [one for one in group if not any(other is not one and sees(one, other, by_hash) for other in group)]


def _or(*values):
    """JavaScript's a || b || c."""
    for value in values[:-1]:
        if truthy(value):
            return value
    return values[-1]


# ---- A promise's stage ----
def _speaks_as(block, side, by_hash, now):
    """Who a block speaks for: a side it names as its author or `as`, or a side whose live grant it acts under."""
    if not truthy(side) or not block:
        return False
    refs = block.get("refs") or {}
    if refs.get("author") == side or refs.get("as") == side:
        return True
    found = by_hash.get(refs.get("under")) if isinstance(refs.get("under"), str) else None
    return bool(found and found.get("type") == "grant" and _get(found, "refs", "author") == side
                and (not truthy(_get(found, "refs", "to")) or found["refs"]["to"] == refs.get("author")) and is_live(found, by_hash, now=now))


def _amount_in(amount, unit):
    return _js.number(amount.get("value")) if isinstance(amount, dict) and _js.strict_eq(amount.get("unit"), unit) else None


def _round_half_up(value):
    """An exact fraction rounded to the nearest whole number, halves up (toward +infinity): never banker's rounding."""
    return math.floor(value + Fraction(1, 2))


def _total_of(price, quantity):
    """The total a price comes to for a quantity: money; money per unit, `money.minor` times the quantity over `per`,
    exactly, rounded to the nearest minor unit, halves up (§6); or None when it is a share of something measured."""
    if not isinstance(price, dict):
        return None
    if _js.is_int(price.get("minor")):
        return {"minor": price["minor"], "currency": price.get("currency")}
    if truthy(price.get("per")) and truthy(price.get("money")):
        if not isinstance(quantity, dict) or not truthy(quantity) or not _js.strict_eq(quantity.get("unit"), _get(price, "per", "unit")):
            return None
        q, per = Fraction(_js.string(quantity.get("value"))), Fraction(_js.string(price["per"].get("value")))
        return {"minor": _round_half_up(price["money"]["minor"] * q / per), "currency": price["money"].get("currency")}
    return None


def _finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def promise_stage(first_block, blocks, now=None, confirmers=()) -> dict:
    """A promise's stage, from its first promise and every block in its deal: offered, asked, expired, declined, stopped,
    accepted, underway, done or reversed. Returns every name the spec gives: { stage, stop, from, offer, accept, sides,
    quantity, takers, forks, lines, total, paid, stopped (occurrences) }, None or [] where one does not apply. `now` is the reader's clock (for expired); `confirmers` are ids whose confirms count
    a transfer, beside those the schema's grounds name."""
    by_hash = _read_all(_with_first(first_block, blocks))
    first = by_hash[first_block["hash"]]
    # The deal: every block naming the first promise in `for`, or answering a block in it (history only where it counts).
    deal = [first["hash"]]
    grew = True
    while grew:
        grew = False
        for block in by_hash.values():
            if block["hash"] in deal or not _counts(block, by_hash):
                continue
            refs = block.get("refs") or {}
            if first["hash"] in _list(refs.get("for")) or any(h in deal for h in _list(refs.get("answers"))) or any(h in deal for h in _list(refs.get("updates"))):
                deal.append(block["hash"])
                grew = True
    side_from, side_to = first["refs"].get("from"), first["refs"].get("to")
    offerer_side = "from" if _speaks_as(first, side_from, by_hash, now) else "to"
    offerer = first["refs"].get(offerer_side)
    other_side = "to" if offerer_side == "from" else "from"
    is_open = not truthy(first["refs"].get(other_side))

    def side_of(block):
        return "from" if _speaks_as(block, side_from, by_hash, now) else "to" if _speaks_as(block, side_to, by_hash, now) else None

    def by_offerer(block):
        return _speaks_as(block, offerer, by_hash, now)

    # 1. Only blocks a side signed (an open side is anyone, until an accept binds).
    in_deal = [block for block in causal_order([by_hash[h] for h in deal])
               if block["hash"] != first["hash"] and (side_of(block) or (is_open and not by_offerer(block)))]

    def status(block, word):
        return _get(block, "state", "status") == word

    def answers_of(h, word=None):
        return [block for block in in_deal if h in _list(_get(block, "refs", "answers"))
                and (_get(block, "state", "status") is None if word is None else status(block, word))]

    # 2. The live offers: the first promise, or the latest counters between the same two sides (crossing counters both stand).
    live = [first]
    if not is_open:
        while True:
            following = [counter for offer in live for counter in answers_of(offer["hash"])
                         if counter.get("type") == "promise" and side_of(counter) and side_of(counter) != side_of(offer)]
            if not following:
                break
            live = following

    # 6. A binding accept: the other side's accept of a live offer (one to one), unless the offerer declined it; or, for
    # an offer open to many, the offerer's own allocation (its accepted answer to an accept), each seeing the one before.
    def declined_by_offerer(accept):
        return any(by_offerer(block) for block in answers_of(accept["hash"], "declined"))

    takers, forks, accept = [], [], None
    # To yourself: a promise whose from and to both name its author is accepted when made.
    to_self = truthy(side_from) and side_from == side_to and first["refs"].get("author") == side_from
    if to_self:
        accept = first
    elif not is_open:
        accept = next((block for offer in live for block in answers_of(offer["hash"], "accepted")
                       if side_of(block) and side_of(block) != side_of(offer) and not declined_by_offerer(block)), None)
    else:
        requests = [block for block in answers_of(first["hash"], "accepted") if not by_offerer(block)]
        request_hashes = [r["hash"] for r in requests]
        allocations = [block for block in in_deal if by_offerer(block) and status(block, "accepted")
                       and any(h in request_hashes for h in _list(_get(block, "refs", "answers")))]
        quantity = _get(first, "state", "terms", "quantity")
        cap = _or(_get(quantity, "max"), quantity)
        # The sequencer's allocations form one chain, each seeing the one before. Two that do not see each other prove a
        # lie: neither counts, nor anything after them; only what came before the pair binds.
        allocated = 0
        for allocation in causal_order(allocations):
            crossed = next((i for i, taker in enumerate(takers) if not sees(allocation, by_hash.get(taker["allocation"]), by_hash)), -1)
            if crossed != -1:
                forks.extend(sorted([takers[crossed]["allocation"], allocation["hash"]]))
                del takers[crossed:]
                break
            request = next(one for one in requests if one["hash"] in _list(allocation["refs"].get("answers")))
            wanted = _or(_get(allocation, "state", "terms", "quantity"), _get(request, "state", "terms", "quantity"))
            q = _amount_in(wanted, _get(cap, "unit")) if truthy(cap) and truthy(wanted) else None
            # What is bound from an offer never exceeds what is offered (invariant 11).
            if q is not None and allocated + q > _js.number(_get(cap, "value")):
                continue
            allocated += q if truthy(q) else 0
            takers.append({"who": request["refs"].get("author"), "request": request["hash"], "allocation": allocation["hash"],
                           "quantity": wanted if truthy(wanted) else None})
        if takers:
            accept = by_hash.get(takers[0]["allocation"])
    offer = by_hash.get(_list(accept["refs"].get("answers"))[0]) if accept and not is_open and not to_self else live[0]

    # Every name the spec gives (§11, What each fold returns): a field that does not apply is None, or an empty list.
    def result(stage, **more):
        return {"stage": stage, "stop": None, "from": None, "offer": offer["hash"], "accept": accept["hash"] if accept else None,
                "sides": {"from": side_from or None, "to": side_to or None}, "quantity": None, "takers": takers, "forks": forks,
                "lines": [], "total": None, "paid": None, "stopped": [], **more}

    # 3. Stopped before: by the offerer (an updates) or the other side (an answers), unless an accept binds over it.
    stops = [block for block in in_deal if status(block, "stopped")]
    before = [block for block in stops if block["state"].get("stop") == "before"]
    if before and (not accept or any(sees(accept, stop, by_hash) for stop in before)):
        return result("stopped", stop="before")
    # 4. Declined by the other side.
    if not accept and not is_open and any(side_of(block) and side_of(block) != side_of(one)
                                          for one in live for block in answers_of(one["hash"], "declined")):
        return result("declined")
    # 5. No binding accept: offered or asked; expired once the reader's clock passes `expires` (a view).
    if not accept:
        expires = _get(live[0], "state", "terms", "expires")
        return result("expired" if now and truthy(expires) and now > expires else "offered" if offerer_side == "from" else "asked")
    # 7, 8. Settling: a giver's transfer counts once the receiver accepts it, or a party the grounds name confirms it.
    terms = _get(offer, "state", "terms") or {}
    chosen = _or(_get(accept, "state", "terms", "quantity"), takers[0]["quantity"] if takers else None, terms.get("quantity"))

    def receiver(side):
        named_side = first["refs"].get(side)
        if truthy(named_side):
            return named_side
        if side == other_side:
            return _or(takers[0]["who"] if takers else None, accept["refs"].get("author"))
        return None

    to_side, from_side = receiver("to"), receiver("from")
    # A confirmer is one given, or one the deal's schema names in its grounds (an id, or circle#role: its holders).
    schema = by_hash.get(first["refs"].get("schema")) if isinstance(first["refs"].get("schema"), str) else None
    named = []
    for who in [*confirmers, *(_get(schema, "state", "grounds", "confirmers") or [])]:
        circle, *rest = who.split("#")
        role = rest[0] if rest else None
        named += holders_of(circle_state(circle, by_hash), role) if role else [who]

    def counted(block, receiver_id):
        return any(answer["refs"].get("author") == receiver_id or answer["refs"].get("as") == receiver_id for answer in answers_of(block["hash"], "accepted")) \
            or any(block["hash"] in _list(_get(other, "refs", "confirms")) and _get(other, "refs", "author") in named for other in by_hash.values())

    transfers = [block for block in in_deal if block.get("type") == "transfer" and _get(block, "state", "status") is None]
    # Goods count when they move ownership: to a named receiver once it answers accepted; to an open receiver (a count)
    # on the sequencer's own signature.
    goods = [block for block in transfers if not truthy(_get(block, "state", "money")) and (
        ((to_side in _list(block["refs"].get("to_owner")) or to_side in _list(block["refs"].get("to_holder"))) and counted(block, to_side))
        or (block["state"].get("count") is not None and not truthy(block["refs"].get("to_owner")) and by_offerer(block) and offerer_side == "from"))]
    pays = [block for block in transfers if truthy(_get(block, "state", "money")) and from_side in _list(block["refs"].get("to_owner")) and counted(block, from_side)]
    refunds = [block for block in transfers if truthy(_get(block, "state", "money")) and to_side in _list(block["refs"].get("to_owner")) and counted(block, to_side)]
    work = [block for block in in_deal if (block.get("type") == "transform" or (block.get("type") == "observe" and _get(block, "state", "kind") == "work"))
            and side_of(block) and _get(block, "state", "status") is None]
    # A job is done when the receiving side accepts the work; time, when accepted work covers terms.quantity.
    accepted_work = [block for block in work if counted(block, to_side)]

    def money_for(block):
        split = block["state"].get("split")
        if truthy(split):
            return sum(part["money"]["minor"] for part in split if part.get("for") == first["hash"])
        return block["state"]["money"]["minor"]

    paid = sum(money_for(block) for block in pays)
    back = sum(money_for(block) for block in refunds)
    # Each line (or the whole) is covered when counted transfers move at least its quantity of `what` to the `to` side.
    lines = terms.get("lines") if truthy(terms.get("lines")) else [{"id": None, "what": offer["refs"].get("what"), "quantity": chosen, "price": terms.get("price")}]

    def moved(line):
        unit = _get(line, "quantity", "unit")
        total = 0
        for block in goods:
            if truthy(line.get("id")) and block["state"].get("line") != line["id"]:
                continue
            amount = _amount_in(block["state"].get("amount"), unit)
            if amount is not None:
                total += amount
                continue
            packs = [v for v in (_amount_in(_get(by_hash.get(h), "state", "pack"), unit) for h in _list(block["refs"].get("what"))) if v is not None]
            total += sum(packs) if packs else math.inf
        return total

    line_state = [{"id": line.get("id"), "needed": _js.number(line["quantity"].get("value")) if truthy(line.get("quantity")) else None,
                   "moved": moved(line), "total": _total_of(line.get("price"), line.get("quantity"))} for line in lines]
    priced = [line for line in line_state if line["total"]]
    total = {"minor": sum(line["total"]["minor"] for line in priced), "currency": priced[0]["total"]["currency"]} if priced else None
    goods_done = all(not truthy(line.get("what")) or (state["moved"] > 0 if state["needed"] is None else state["moved"] >= state["needed"])
                     for line, state in zip(lines, line_state))
    if truthy(terms.get("quantity")) and not truthy(offer["refs"].get("what")):
        unit = _get(terms, "quantity", "unit")
        work_done = sum(_amount_in(block["state"].get("amount"), unit) or 0 for block in accepted_work) >= _js.number(_get(terms, "quantity", "value"))
    else:
        work_done = len(accepted_work) > 0
    done = goods_done and (paid >= total["minor"] if total else True) and (True if truthy(offer["refs"].get("what")) or truthy(terms.get("lines")) else work_done)
    occurrences = sorted(set(t for block in stops for t in (_get(block, "state", "stop", "occurrences") or [])))
    more = {"quantity": chosen if truthy(chosen) else None, "total": total,
            "paid": {"minor": paid, "currency": total["currency"] if total else pays[0]["state"]["money"].get("currency") if pays else None} if total or paid else None,
            "lines": [{"id": line["id"], "needed": line["needed"], "moved": line["moved"] if _finite(line["moved"]) else line["needed"]} for line in line_state],
            "stopped": occurrences}
    # 10. Reversed: a done promise with counted transfers back for it covering what was paid.
    if done and paid > 0 and back >= paid:
        return result("reversed", **more)
    # 9. Stopped onward, from that block.
    onward = next((block for block in stops if block["state"].get("stop") == "onward"), None)
    if onward:
        return result("stopped", **{**more, "stop": "onward", "from": onward["hash"]})
    if done:
        return result("done", **more)
    return result("underway" if goods or pays or work else "accepted", **more)


# ---- A circle: membership and roles ----
def circle_state(circle, blocks, within=None):
    """A circle's members and roles from its member grants, in causal order: { founder, members: { id: { roles, grant,
    last_counted (None for a current member) } }, removed: { id: last_counted } }. A member grant counts if signed as
    the circle by someone holding admin in the fold of its own causal past; a member holds its roles once their own
    answer accepts it; roles taken away count at once, roles added once answered. Crossing removals of admins: the
    admin whose admin grant is earlier in causal order wins (the founder above all); if neither is earlier, both stand.
    `within` (a block): fold only its causal past."""
    by_hash = _read_all(blocks)
    root = by_hash.get(_hash_of(circle))
    if not root:
        return None
    id_, founder = root["hash"], root["refs"].get("author")
    # Every member grant and answer naming the circle that counts: with seq, or as its author's history.
    related = [block for block in by_hash.values() if block.get("type") == "grant" and _get(block, "state", "kind") == "member"
               and id_ in _list(_get(block, "refs", "subject")) and _counts(block, by_hash)]
    needed = _get(root, "state", "removal", "needed") or PROTOCOL["circle"]["removal_default"]["needed"]
    memo = {}

    def past_fold(block):
        past = past_of(block, by_hash)
        return fold([one for one in related if one["hash"] in past])

    def earlier(a, b):
        """Whose admin grant is earlier in causal order (the circle itself, the founder's, above all)."""
        if a == b or not a or not b:
            return False
        return a == id_ or sees(by_hash.get(b), by_hash.get(a), by_hash)

    # One pass in causal order: each invitation, answer, change and removal applies where it falls, so a member removed
    # and later invited again is in, by the new grant; a grant once ended stays ended.
    def fold(group):
        key = ",".join(sorted(block["hash"] for block in group))
        if key in memo:
            return memo[key]
        state = {"founder": founder, "members": {founder: {"roles": ["admin"], "grant": id_, "last_counted": None}}, "removed": {}}
        memo[key] = state
        invitations, updates, ended, agreed = {}, {}, set(), {}
        held = {founder: id_}

        def admin(block):
            if block["refs"].get("as") != id_:
                return False
            member = past_fold(block)["members"].get(block["refs"].get("author"))
            return "admin" in ((member or {}).get("roles") or [])

        def is_stop(block):
            refs = block.get("refs") or {}
            return _get(block, "state", "status") == "stopped" and bool(_list(refs.get("updates"))) and not _list(refs.get("answers"))

        stops = [block for block in group if is_stop(block) and admin(block)]

        def remove(who, last_counted):
            state["removed"][who] = last_counted or None
            state["members"].pop(who, None)

        for block in causal_order(group):
            answered, updated = _list(block["refs"].get("answers")), _list(block["refs"].get("updates"))
            status = block["state"].get("status")
            if not answered and not updated and status is None:
                if admin(block):
                    invitations[block["hash"]] = {"to": block["refs"].get("to") or None, "roles": block["state"].get("roles") or []}
            elif answered:
                grant = next((h for h in answered if h in invitations or h in updates), None)
                if not grant:
                    continue
                target = invitations.get(grant) or updates.get(grant)
                who = block["refs"].get("author")
                if target.get("to") and target["to"] != who:
                    continue
                current = state["members"].get(who)
                if status == "accepted":
                    if target.get("update"):
                        if current and current["grant"] == target["grant"] and target["grant"] not in ended:
                            current["roles"] = list(dict.fromkeys([*current["roles"], *target["added"]]))
                    elif grant not in ended:
                        state["members"][who] = {"roles": list(target["roles"]), "grant": grant, "last_counted": None}
                        held[who] = grant
                        state["removed"].pop(who, None)
                elif status in ("stopped", "declined") and who != founder and current \
                        and current["grant"] == (target["grant"] if target.get("update") else grant):
                    ended.add(current["grant"])
                    remove(who, block["state"].get("last_counted"))
            elif updated and admin(block):
                grant = next((h for h in updated if h in invitations), None)
                if not grant or grant in ended:
                    continue
                who = next((m for m in state["members"] if state["members"][m]["grant"] == grant), None)
                if is_stop(block):
                    # An invitation not yet answered simply ends.
                    if not who:
                        ended.add(grant)
                        continue
                    if who == founder:
                        continue
                    # Removing an admin takes `state.removal.needed` other admins (default 1); a member, one admin.
                    agreeing = agreed.setdefault(grant, [])
                    if block["refs"].get("author") not in agreeing:
                        agreeing.append(block["refs"].get("author"))
                    if "admin" in state["members"][who]["roles"] and len([by for by in agreeing if by != who]) < needed:
                        continue
                    # Crossing removals of admins: the one whose admin grant is earlier wins; if neither is, both stand.
                    remover = block["refs"].get("author")
                    rival = next((other for other in stops if other["refs"].get("author") == who and held.get(remover) in _list(other["refs"].get("updates"))
                                  and not sees(other, block, by_hash) and not sees(block, other, by_hash)), None)
                    if rival and remover != founder and earlier(held.get(who), held.get(remover)):
                        continue
                    ended.add(grant)
                    remove(who, block["state"].get("last_counted"))
                elif truthy(block["state"].get("roles")) and who:
                    before, after = state["members"][who]["roles"], block["state"]["roles"]
                    state["members"][who]["roles"] = [role for role in before if role in after]
                    updates[block["hash"]] = {"update": True, "grant": grant, "to": who, "added": [role for role in after if role not in before]}
        return state

    if within is not None:
        return past_fold(by_hash.get(_hash_of(within)) or within)
    return fold(related)


def holders_of(state, role) -> list:
    """The holders of a role in a circle (the members holding it), sorted."""
    return sorted(who for who, member in ((state or {}).get("members") or {}).items() if role in member["roles"])


def may_act_as(block, circle, blocks, role=None) -> bool:
    """Whether a block may be signed as a circle: its author holds, in the fold of its causal past, `role` if one is
    named, else a role the circle actor lists in `state.signers` (default [admin])."""
    state = circle_state(circle, blocks, within=block)
    root = read_as(index_of(blocks).get(_hash_of(circle)) or circle)
    member = ((state or {}).get("members") or {}).get(_get(block, "refs", "author"))
    roles = [role] if role else (_get(root, "state", "signers") or PROTOCOL["circle"]["signers_default"])
    return bool(member and any(held in roles for held in member["roles"]))


# ---- Audience: members then ----
def members_then(block, recipient, blocks) -> list:
    """Who a circle (or `circle#role`) in a block's audience means: the members (or holders) in the fold of the circle's
    grants within that block's causal past."""
    circle, *rest = _js.string(recipient).split("#")
    role = rest[0] if rest else None
    by_hash = index_of(blocks)
    if circle not in by_hash:
        return []
    state = circle_state(circle, by_hash, within=block)
    return holders_of(state, role) if role else sorted(state["members"])


# ---- Things: who owns an instance, and where it is now ----
def ownership(instance, blocks) -> dict:
    """Who owns an instance: the `to_owner` of its last counted ownership transfer, else its maker. A transfer of
    ownership counts only if signed by the owner the previous counted transfer named (or the maker, for the first),
    with that transfer in its causal past. A part (state.amount) leaves ownership where it is. Two that do not see each
    other prove a lie: { owner, transfers, conflict }."""
    by_hash = _read_all(_with_first(instance, blocks))
    thing = by_hash[_hash_of(instance)]
    owner, last = thing["refs"].get("author"), None

    # A transfer to a named receiver moves ownership once the receiver answers it accepted; to an open receiver (a
    # count), on the owner's own signature, to nobody named.
    def accepted(transfer):
        return any(block.get("type") == "transfer" and _get(block, "state", "status") == "accepted" and _counts(block, by_hash) and transfer["hash"] in _list(_get(block, "refs", "answers"))
                   and _get(block, "refs", "author") in _list(transfer["refs"].get("to_owner")) for block in by_hash.values())

    transfers = []
    candidates = [block for block in by_hash.values() if block.get("type") == "transfer" and _counts(block, by_hash) and _get(block, "state", "status") is None
                  and thing["hash"] in _list(_get(block, "refs", "what")) and _get(block, "state", "amount") is None
                  and (accepted(block) if truthy(_get(block, "refs", "to_owner")) else _get(block, "state", "count") is not None)]
    while True:
        following = _earliest([block for block in candidates if block["hash"] not in transfers
                               and (block["refs"].get("author") == owner or block["refs"].get("as") == owner)
                               and (not last or sees(block, last, by_hash))], by_hash)
        if len(following) > 1:
            return {"owner": owner, "transfers": transfers, "conflict": sorted(block["hash"] for block in following)}
        if not following:
            return {"owner": owner, "transfers": transfers, "conflict": None}
        last = following[0]
        transfers.append(last["hash"])
        owner = (_list(last["refs"].get("to_owner")) or [None])[0] or None
        if not owner:
            return {"owner": owner, "transfers": transfers, "conflict": None}


def owner_of(instance, blocks):
    return ownership(instance, blocks)["owner"]


def receiver_of(promise, blocks):
    """Who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to itself."""
    by_hash, to = index_of(blocks), _get(promise, "refs", "to")
    held = by_hash.get(to) if isinstance(to, str) else None
    return owner_of(held, by_hash) if held and held.get("type") == "thing" else (to or None)


def where_now(thing, blocks, _seen=None) -> list:
    """Where a thing is now: the `to_place` of its latest counted move (by its owner, or a holder its owner named), else
    its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves that do not
    see each other give both places. Returns a sorted list of hashes."""
    seen = _seen if _seen is not None else set()
    by_hash = index_of(blocks)
    me = read_as(by_hash.get(_hash_of(thing)) or thing)
    if me["hash"] in seen:
        return [me["hash"]]
    seen.add(me["hash"])
    owner = owner_of(me, by_hash)
    read = _read_all(by_hash)
    moving = [block for block in read.values() if block.get("type") == "transfer" and _get(block, "state", "status") is None
              and me["hash"] in _list(_get(block, "refs", "what")) and _counts(block, read)]
    holders = {owner, *[h for block in moving if block["refs"].get("author") == owner for h in _list(block["refs"].get("to_holder"))]}
    moves = [block for block in moving if truthy(block["refs"].get("to_place")) and block["refs"].get("author") in holders]
    places = list(dict.fromkeys(p for block in heads_among(moves) for p in _list(block["refs"].get("to_place")))) if moves else _list(me["refs"].get("place"))
    if not places:
        return []
    out = []
    for place in places:
        at = by_hash.get(place)
        if not at or read_as(at).get("type") != "thing":
            out.append(place)
            continue
        further = where_now(at, by_hash, seen)
        out += further if further else [place]
    return sorted(set(out))


# ---- A successor's trigger (§7) ----
def successor_state(grant, blocks, now=None, arrived_at=None) -> dict:
    """Where a successor grant's trigger stands: the needed witnesses' event observes (each a witness's observe naming
    the grant in refs.under), less those the person (a live key, or the recovery key) defeats before it fires. It fires
    `wait` after the needed-th event arrived on this node (`arrived_at`), on the reader's own clock (`now`); no author's
    clock is read. Returns { events, cancelled, since, fires, fired }."""
    from .identity import signed_by_author
    by_hash, person = index_of(blocks), grant["refs"].get("author")
    witnesses = grant["state"].get("witnesses") or []
    events = [block for block in by_hash.values() if block.get("type") == "observe" and _get(block, "refs", "under") == grant["hash"]
              and _get(block, "refs", "author") in witnesses and _counts(block, by_hash)]

    def arrived(block):
        return (arrived_at(block["hash"]) if arrived_at else None) or None

    defeats = [block for block in by_hash.values() if _get(block, "refs", "author") == person and _list(_get(block, "refs", "defeats"))
               and signed_by_author(block, by_hash)]

    def read(until):
        cancelled, standing, since, fires = [], [], None, None
        for event in sorted(events, key=lambda e: _js.string(arrived(e)) if arrived(e) is not None else "null"):
            if any(event["hash"] in _list(block["refs"].get("defeats")) and (not until or not arrived(block) or arrived(block) < until) for block in defeats):
                cancelled.append(event["hash"])
                continue
            if not any(other["refs"].get("author") == event["refs"].get("author") for other in standing):
                standing.append(event)
            if len(standing) == grant["state"].get("needed") and not since:
                since = arrived(event)
                fires = add_duration(since, grant["state"].get("wait")) if since else None
        return {"cancelled": cancelled, "standing": standing, "since": since, "fires": fires}

    state = read(None)
    for _ in range(len(events) + 1):
        following = read(state["fires"])
        if following["fires"] == state["fires"]:
            state = following
            break
        state = following
    fires = state["fires"]
    return {"events": sorted(event["hash"] for event in state["standing"]), "cancelled": sorted(state["cancelled"]),
            "since": state["since"], "fires": fires, "fired": bool(fires and now and now >= fires)}


# ---- A circle's key, by epoch (§8) ----
def circle_key(circle, blocks) -> dict:
    """A circle's encryption key now: the key grants signed as the circle by an admin (in the fold of each grant's causal
    past), each with state.epoch one higher. Two rekeys in one epoch both open; the next settles. Returns { epoch, keys,
    grants } (epoch 0 is the key in the circle's actor)."""
    by_hash = _read_all(blocks)
    root = by_hash[_hash_of(circle)]
    rekeys = [block for block in by_hash.values() if block.get("type") == "grant" and _get(block, "state", "kind") == "key"
              and _get(block, "refs", "as") == root["hash"] and _js.is_int(_get(block, "state", "epoch"))
              and truthy(_get(block, "state", "public_key_encrypt")) and _counts(block, by_hash) and may_act_as(block, root, by_hash, "admin")]
    epoch, current = 0, [{"hash": root["hash"], "key": root["state"].get("public_key_encrypt")}]
    step = 1
    while True:
        # Epoch n names epoch n-1 in after (epoch 0 is the circle itself).
        these = [block for block in rekeys if block["state"]["epoch"] == step and any(one["hash"] in _list(block["refs"].get("after")) for one in current)]
        if not these:
            break
        epoch, current = step, [{"hash": block["hash"], "key": block["state"]["public_key_encrypt"]} for block in these]
        step += 1
    return {"epoch": epoch, "keys": sorted(one["key"] for one in current), "grants": sorted(one["hash"] for one in current)}


# ---- A secret ballot (§8) ----
def counted_in(result, commitment, counter) -> bool:
    """Whether a voter's commitment is among those the named counter signed as counted (`state.counted`)."""
    return bool(result and _get(result, "refs", "author") == counter and commitment in _list(_get(result, "state", "counted")))


def sequencer_of(record) -> dict:
    """A record's sequencer: { key } named by its first block's state.sequencer, else { author } (the key that signed it)."""
    key = _get(record, "state", "sequencer")
    return {"key": key} if truthy(key) else {"author": _get(record, "refs", "author")}

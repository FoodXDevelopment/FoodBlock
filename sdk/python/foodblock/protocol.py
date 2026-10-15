"""The write check (protocol.md §1, Refusals): `refusals(type, state, refs)` says what is wrong with a block as every
node checks it before writing: [{code, detail}], one entry per rule found, in the order of protocol.json's
`refusals.codes.block` ([] when it is a well-formed 1.6 block). The code carries the meaning; the detail is free text
for people. `check` gives the details alone. Every list and grammar it reads comes from protocol.json (spec.py); none
is written here. Older shapes are read, never re-checked (aliases.py). `amount`, `money`, `confidence` and `terms`
build the shapes so callers never hand-write them."""

import re
import unicodedata

from . import _js
from .canonical import canonical
from .grant import scope_refusals
from .spec import (PROTOCOL, TYPES, VERBS, REF_KEYS, VERSION, ANSWERS, STOPS, GRANT_KINDS, GENESIS, GENESIS_OPTIONAL, TERMS, SCOPE,
                   LIMITS, INTEGERS, matches)

# The base fields of each type until the base schemas are published (§3): every block's, then the type's own.
FIELDS = {type_: PROTOCOL["fields"][type_] for type_ in TYPES}
EVERY = PROTOCOL["fields"]["every"]
SHAPES = PROTOCOL["shapes"]
TIME_FIELDS = set(PROTOCOL["time_fields"])
DATE_FIELDS = set(PROTOCOL["date_fields"])
CODES = PROTOCOL["refusals"]["codes"]
SCHEMA_FIELDS = PROTOCOL["schema"]
# The RRULE value grammar (RFC 5545), as the reference reads it.
RRULE = re.compile(r"FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,:+-]+)*")
_CURRENCY = re.compile(r"[A-Z]{3}")

truthy = _js.truthy


def _obj(value):
    return isinstance(value, dict)


def _get(value, *path):
    for key in path:
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _days_in(year, month):
    if month == 2:
        return 29 if (year % 4 == 0 and year % 100 != 0) or year % 400 == 0 else 28
    return 30 if month in (4, 6, 9, 11) else 31


def _real_calendar(text):
    """A real calendar value: a month that exists, a day within it, an hour 00 to 23, a minute and second 00 to 59
    (never Date.parse, which rolls 30 February into March and reads 24:00 as the next day)."""
    year, month, day, hour, minute, second = ([int(n) for n in re.findall(r"[0-9]+", text)] + [0, 0, 0])[:6]
    return 1 <= month <= 12 and 1 <= day <= _days_in(year, month) and hour <= 23 and minute <= 59 and second <= 59


def is_time(value):
    return matches("time", value) and _real_calendar(value)


def is_date(value):
    return matches("date", value) and _real_calendar(value)


def _hashes(value):
    return value if isinstance(value, list) else [value]


def _within(value, allowed):
    return all(key in allowed for key in value)


def _js_sorted_unique(values):
    seen = []
    for v in values:
        if not any(_js.strict_eq(v, s) or (v is None and s is None) for s in seen):
            seen.append(v)
    present = sorted((v for v in seen if v is not None), key=_js.string)
    return present + [None] * (len(seen) - len(present))


def _same_set(a, b):
    return b is not None and _js_sorted_unique(a) == _js_sorted_unique(_hashes(b))


def w(code, detail):
    """One finding: a code from protocol.json (`refusals.codes`) and free text for people."""
    return {"code": code, "detail": detail}


def ordered(found, codes=None) -> list:
    """Findings as a refusal list: one entry per code, in the order of `codes` (a group of protocol.json's
    refusals.codes, `block` by default), the details of one code joined with "; " (each once)."""
    order = list((CODES["block"] if codes is None else codes).keys())
    by = {}
    for one in found:
        details = by.setdefault(one["code"], [])
        if one["detail"] not in details:
            details.append(one["detail"])
    rank = lambda code: order.index(code) if code in order else -1  # noqa: E731 (JS indexOf: an unknown code is -1)
    return [{"code": code, "detail": "; ".join(details)} for code, details in sorted(by.items(), key=lambda item: rank(item[0]))]


# ---- Shapes (protocol.json `shapes`), recognised by their keys wherever they sit in state ----
def _amount(value, name):
    if value is None:
        return []
    if not (_obj(value) and _within(value, SHAPES["amount"]) and isinstance(value.get("value"), str)
            and isinstance(value.get("unit"), str) and value["unit"].strip() != ""):
        return [w("shape", f"{name} is an amount: {{ value (a decimal string), unit (UCUM or a pack) }}")]
    return [] if matches("decimal", value["value"]) else [w("decimal", f"{name}.value is a decimal string (-?(0|[1-9][0-9]*)(.[0-9]+)?)")]


def _money(value, name):
    if value is None:
        return []
    ok = _obj(value) and _within(value, SHAPES["money"]) and _js.is_int(value.get("minor")) \
        and _CURRENCY.fullmatch(_js.string(value.get("currency"))) is not None
    return [] if ok else [w("shape", f"{name} is money: {{ minor (whole minor units), currency (ISO 4217) }}")]


def _calendar(value, name, grammar, words):
    """A time or date in the right shape that is not a real calendar instant is `calendar`; any other, `time`."""
    if value is None:
        return []
    if matches(grammar, value):
        return [] if _real_calendar(value) else [w("calendar", f"{name} is not a real calendar {'date' if words == 'a date' else 'instant'}")]
    return [w("time", f"{name} is {words}")]


def _time(value, name):
    return _calendar(value, name, "time", "a UTC time, exactly YYYY-MM-DDTHH:MM:SS.sssZ")


def _date(value, name):
    return _calendar(value, name, "date", "a date")


def _duration(value, name):
    return [] if value is None or matches("duration", value) else [w("time", f"{name} is an ISO 8601 duration (P30D)")]


def _hash(value, name):
    return [] if value is None or matches("hash", value) else [w("grammar", f"{name} is a hash")]


def _hash_list(value, name):
    ok = value is None or (isinstance(value, list) and len(value) > 0 and all(matches("hash", item) for item in value))
    return [] if ok else [w("grammar", f"{name} is a set of hashes")]


def _whole(value, name, low=0):
    ok = value is None or (_js.is_int(value) and value >= low)
    return [] if ok else [w("shape", f"{name} is a whole number{f' from {low}' if low else ''}")]


def _when(value, name="state.when"):
    if value is None or isinstance(value, str):
        return _time(value, name)
    if not (_obj(value) and _within(value, SHAPES["when"]) and value.get("from") is not None and value.get("to") is not None):
        return [w("shape", f"{name} is a time, or {{ from, to }}")]
    wrong = _time(value["from"], f"{name}.from") + _time(value["to"], f"{name}.to")
    return wrong if wrong or value["from"] <= value["to"] else [w("shape", f"{name}.from is after its to")]


def _decimal_in(value, low, high):
    return matches("decimal", value) and low <= _js.number(value) <= high


def _where(value):
    ok = value is None or (_obj(value) and _within(value, SHAPES["where"]["area"]) and _decimal_in(value.get("lat"), -90, 90)
                           and _decimal_in(value.get("lon"), -180, 180)
                           and (value.get("radius") is None or (not _amount(value["radius"], "radius") and value["radius"].get("unit") == "m")))
    return [] if ok else [w("shape", "state.where is a point { lat, lon } (WGS84 degrees, decimal strings), or an area: a point with radius (an amount in m)")]


def _marks(value, name):
    ok = value is None or (isinstance(value, list) and all(_obj(mark) and _within(mark, SHAPES["mark"]) and isinstance(mark.get("scheme"), str)
                                                          and isinstance(mark.get("value"), str) for mark in value))
    return [] if ok else [w("shape", f"{name} lists exact marks: [{{ scheme, value }}]")]


def _per_unit(value):
    return _obj(value) and "per" in value


def _price(value, name):
    """A price is money, money per unit ({ money, per }), or a share of something measured ({ share, of })."""
    if _per_unit(value):
        return ([] if _within(value, SHAPES["price_per"]) else [w("shape", f"{name} per unit is {{ money, per }}")]) \
            + ([w("shape", f"{name}.money is the price")] if value.get("money") is None else _money(value["money"], f"{name}.money")) \
            + _amount(value.get("per"), f"{name}.per")
    if _obj(value) and "share" in value:
        if not (_within(value, SHAPES["price_share"]) and isinstance(value.get("share"), str) and matches("hash", value.get("of") or "")):
            return [w("shape", f"{name} as a share is {{ share (a decimal string), of (the schema saying what is measured) }}")]
        return [] if matches("decimal", value["share"]) else [w("decimal", f"{name}.share is a decimal string")]
    return _money(value, name)


def _quantity(value, price, name):
    """A quantity is an amount; under a per-unit price it may be a range { min, max } the answer chooses within."""
    if not (_obj(value) and ("min" in value or "max" in value)):
        return _amount(value, name)
    low, high = value.get("min"), value.get("max")
    return ([] if _per_unit(price) else [w("shape", f"{name} is a range only under a per-unit price")]) \
        + ([] if _within(value, SHAPES["range"]) else [w("shape", f"{name} as a range is {{ min, max }}")]) \
        + _amount(low, f"{name}.min") + _amount(high, f"{name}.max") \
        + ([w("shape", f"{name}.min is above its max")] if truthy(low) and truthy(high) and _obj(low) and _obj(high) and low.get("unit") == high.get("unit")
           and _js.number(low.get("value")) > _js.number(high.get("value")) else [])


def _stop(stop):
    ok = stop in STOPS[:2] if isinstance(stop, str) else (
        _obj(stop) and _within(stop, ["occurrences"]) and isinstance(stop.get("occurrences"), list) and all(is_time(t) for t in stop["occurrences"]))
    return [] if ok else [w("bad_status", f"state.stop is {' or '.join(STOPS[:2])}, or {{ occurrences: [start times] }}")]


def _numbers(value, path):
    """Numbers in signed content are integers within protocol.json's bounds; never floats (§13 Numbers). Keys are
    written in NFC; a key that is not is refused (canonical.md Rule 4)."""
    if _js.is_number(value):
        if not _js.is_int(value):
            return [w("float", f"{path} is a float; write a decimal string, money {{ minor, currency }} or an amount {{ value, unit }}")]
        if value < INTEGERS["min"] or value > INTEGERS["max"]:
            return [w("integer_range", f"{path} is outside the whole numbers a block may hold (±(2^53 - 1))")]
        return []
    if isinstance(value, list):
        return [wrong for i, item in enumerate(value) for wrong in _numbers(item, f"{path}[{i}]")]
    if not _obj(value):
        return []
    out = [w("not_canonical", f"{path} has a key not written in NFC ({_quote(key)})") for key in value if key != unicodedata.normalize("NFC", key)]
    for key in value:
        out += _numbers(value[key], f"{path}.{key}")
    return out


def _quote(text):
    import json
    return json.dumps(text, ensure_ascii=False)


def _shapes_in(value, path):
    """Every amount and money object, wherever it sits in state."""
    if isinstance(value, list):
        return [wrong for i, item in enumerate(value) for wrong in _shapes_in(item, f"{path}[{i}]")]
    if not _obj(value):
        return []
    own = _amount(value, path) if "unit" in value and _within(value, SHAPES["amount"]) \
        else _money(value, path) if "minor" in value and _within(value, SHAPES["money"]) else []
    for key in value:
        own = own + _shapes_in(value[key], f"{path}.{key}")
    return own


def _times_in(value, path):
    """The time and date fields (protocol.json `time_fields`, `date_fields`) where 1.6 names them: in state, its terms
    and lines, and its scope."""
    if not _obj(value):
        return []
    out = []
    for key, item in value.items():
        if key == "when":
            out += _when(item, f"{path}.{key}")
        elif key in TIME_FIELDS:
            out += _time(item, f"{path}.{key}")
        elif key in DATE_FIELDS:
            out += _date(item, f"{path}.{key}")
    return out


def _terms(terms, refs, state):
    if terms is None:
        return []
    if not _obj(terms):
        return [w("shape", "state.terms is { price, quantity, lines, ... }")]
    lines = terms.get("lines")
    out = [w("undeclared_field", f"terms.{key} is not a 1.6 term ({', '.join(TERMS)})") for key in terms if key not in TERMS]
    out += [] if terms.get("price") is None else _price(terms["price"], "terms.price")
    out += _quantity(terms.get("quantity"), terms.get("price"), "terms.quantity")
    out += _times_in(terms, "terms")
    out += _hash(terms.get("text"), "terms.text") + _hash(terms.get("settled_by"), "terms.settled_by")
    repeat = terms.get("repeat")
    if not (repeat is None or (isinstance(repeat, str) and RRULE.fullmatch(repeat))):
        out.append(w("grammar", "terms.repeat is an RFC 5545 RRULE value (FREQ=WEEKLY;BYDAY=FR)"))
    if repeat is not None and state.get("when") is None:
        out.append(w("shape", "a repeating promise counts its occurrences from state.when"))
    if not (terms.get("needs") is None or isinstance(terms["needs"], (dict, list))):
        out.append(w("shape", "terms.needs is data from a schema, never a name"))
    if lines is None:
        return out
    if not isinstance(lines, list) or not lines:
        return out + [w("lines", "terms.lines lists { id, what, quantity, price }")]
    for i, line in enumerate(lines):
        line_id, what = _get(line, "id"), _get(line, "what")
        out += [] if _obj(line) and _within(line, PROTOCOL["line"]) else [w("lines", f"terms.lines[{i}] is {{ {', '.join(PROTOCOL['line'])} }}")]
        out += [] if isinstance(line_id, str) and line_id else [w("lines", f"terms.lines[{i}].id names the line")]
        out += [] if matches("hash", what or "") else [w("lines", f"terms.lines[{i}].what is a thing's hash")]
        out += _times_in(line, f"terms.lines[{i}]") + _quantity(_get(line, "quantity"), _get(line, "price"), f"terms.lines[{i}].quantity")
        out += [] if _get(line, "price") is None else _price(line["price"], f"terms.lines[{i}].price")
    if len(_js_sorted_unique([_get(line, "id") for line in lines])) != len(lines):
        out.append(w("lines", "each line id is unique in the promise"))
    if not (terms.get("price") is None and terms.get("quantity") is None):
        out.append(w("lines", "with lines, the price and quantity are on each line"))
    if not _same_set([_get(line, "what") for line in lines], refs.get("what")):
        out.append(w("lines", "refs.what is the set of every line's what"))
    return out


def _scope(scope, kind):
    if not _obj(scope):
        return [w("shape", f"state.scope is {{ {', '.join(SCOPE)} }}")]
    out = [w("undeclared_field", f"scope.{key} is not part of a 1.6 scope ({', '.join(SCOPE)})") for key in scope if key not in SCOPE]
    # A grant of one's own (key, member, successor, operator) carries no until; one others act under always does.
    if kind in GRANT_KINDS:
        out += [] if scope.get("until") is None else [w("scope_until", f"a {kind} grant carries no scope.until")]
    else:
        out += [w("scope_until", "a grant others act under carries scope.until (a UTC time)")] if scope.get("until") is None else []
    out += _times_in(scope, "scope")
    acts, parties = scope.get("acts"), scope.get("parties")
    out += [] if acts is None or (isinstance(acts, list) and all(isinstance(a, str) for a in acts)) else [w("shape", "scope.acts lists acts")]
    out += [] if parties is None or (isinstance(parties, list) and all(matches("hash", p) for p in parties)) else [w("grammar", "scope.parties lists hashes (left out, it is everyone)")]
    return out + _money(scope.get("limit"), "scope.limit") + _duration(scope.get("per"), "scope.per") + _duration(scope.get("notice"), "scope.notice")


def _audience(state):
    audience = state.get("audience")
    if audience == "public":
        return []
    if not isinstance(audience, list) or not audience or not all(matches("hash", who) for who in audience):
        return [w("audience", 'state.audience is "public" or a list of commitments (salted hashes)')]
    out = [] if all(i == 0 or audience[i - 1] < who for i, who in enumerate(audience)) else [w("audience", "state.audience commitments are sorted, each once")]
    return out + ([] if matches("nonce", state.get("nonce")) else [w("audience", "a private block carries state.nonce (16 random bytes, hex)")])


def _genesis(state, refs):
    """The genesis (§2): the one block with no author, prev, after or seq; public, naming its own keys and its recovery.
    An encryption key is optional (genesis_optional): a micro that only signs leaves it out and adds one by a key grant.
    What is missing or extra is `bad_genesis`; what is there but malformed is its grammar's code."""
    out = [w("bad_genesis", f"a genesis has no refs (refs.{key})") for key in refs]
    out += [w("bad_genesis", f"a genesis names only {', '.join(GENESIS)}, and {', '.join(GENESIS_OPTIONAL)} if it has one (state.{key})")
            for key in state if key not in GENESIS and key not in GENESIS_OPTIONAL]
    out += [] if truthy(state.get("kind")) else [w("bad_genesis", "state.kind says what they are")]
    out += [w("bad_genesis", "state.at is when it was said")] if state.get("at") is None else _time(state["at"], "state.at")
    out += [] if state.get("audience") == "public" else [w("bad_genesis", "a genesis is public: anyone checks signatures against its key")]
    out += [w("bad_genesis", "state.public_key_sign names its signing key")] if state.get("public_key_sign") is None \
        else [] if matches("sign_key", state["public_key_sign"]) else [w("grammar", "state.public_key_sign is an Ed25519 key, SPKI DER hex")]
    out += [] if state.get("public_key_encrypt") is None or matches("encrypt_key", state["public_key_encrypt"]) else [w("grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")]
    out += [w("bad_genesis", "state.recovery_key_hash names the recovery key")] if state.get("recovery_key_hash") is None \
        else [] if matches("hash", state["recovery_key_hash"]) else [w("grammar", "state.recovery_key_hash is the hash of the recovery key")]
    out += [w("bad_genesis", "state.recovery_reach says how far back the recovery key may reach")] if state.get("recovery_reach") is None \
        else _duration(state["recovery_reach"], "state.recovery_reach")
    return out


def is_genesis_shape(type_, state, refs):
    return type_ == "actor" and not truthy(refs.get("author")) and state.get("seq") is None


def speaks_for(refs, side):
    """A side signs for itself, or a member signs as it (refs.as), or an agent under its grant (refs.under)."""
    return side is not None and (_js.strict_eq(refs.get("author"), side) or _js.strict_eq(refs.get("as"), side) or truthy(refs.get("under")))


def _status(state, refs):
    if state.get("status") is None:
        return [] if state.get("stop") is None else [w("bad_status", "state.stop goes with status stopped")]
    out = [] if truthy(refs.get("answers")) or truthy(refs.get("updates")) else [w("status_not_answer", "only an answer (refs.answers) or the author stopping their own (refs.updates) carries a status")]
    out += [] if state["status"] in ANSWERS else [w("bad_status", f"state.status is one of {', '.join(ANSWERS)}")]
    if state["status"] == "stopped":
        return out + _stop(state.get("stop"))
    return out + ([] if state.get("stop") is None else [w("bad_status", "state.stop goes with status stopped")])


# What each type needs beyond what every block needs. An answer has the type of what it answers; the type's other
# required fields do not apply to it (§6).
def _actor(state, refs):
    out = [] if truthy(state.get("kind")) else [w("shape", "state.kind says what it is: a person, an agent, a circle, a contact")]
    out += [w("undeclared_field", f"only a genesis names state.{key}; a key comes in by a key grant") for key in ("public_key_sign", "recovery_key_hash", "recovery_reach") if state.get(key) is not None]
    out += [w("undeclared_field", "a contact has no keys")] if state.get("kind") == "contact" and state.get("public_key_encrypt") is not None else []
    signers, removal = state.get("signers"), state.get("removal")
    out += [] if signers is None or (isinstance(signers, list) and signers and all(isinstance(r, str) and r for r in signers)) else [w("shape", "state.signers lists the roles that may sign as the circle")]
    out += [] if removal is None or (_obj(removal) and _within(removal, PROTOCOL["circle"]["removal"]) and _js.is_int(removal.get("needed")) and removal["needed"] >= 1) \
        else [w("shape", "state.removal is { needed: N }, how many other admins must agree to remove an admin")]
    out += [] if state.get("public_key_encrypt") is None or matches("encrypt_key", state["public_key_encrypt"]) else [w("grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")]
    return out


def _thing(state, refs):
    out = [] if truthy(state.get("kind")) or truthy(refs.get("kind")) else [w("shape", "a thing is a kind (state.kind) or one of a kind (refs.kind)")]
    out += _marks(state.get("marks"), "state.marks")
    out += [] if state.get("words") is None or isinstance(state["words"], str) else [w("shape", "state.words are the words printed on it, as read")]
    if state.get("kind") == "schema":
        return out + _schema(state)
    return out + [w("undeclared_field", f"state.{key} belongs to a schema (a thing of kind schema)") for key in SCHEMA_FIELDS if state.get(key) is not None]


def _transform(state, refs):
    shares = state.get("shares")
    inputs = _hashes(refs.get("derives_from") or [])
    ok = shares is None or (isinstance(shares, list) and all(_obj(item) and _within(item, SHAPES["share"]) and item.get("from") in inputs
                                                             and matches("decimal", item.get("share")) for item in shares))
    return [] if ok else [w("shape", "state.shares lists { from (an input it derives_from), share (a decimal string) }")]


def _transfer(state, refs):
    out = [] if truthy(refs.get("answers")) or truthy(refs.get("to_owner")) or truthy(refs.get("to_holder")) or truthy(refs.get("to_place")) or state.get("count") is not None \
        else [w("shape", "a transfer says what changed (refs.to_owner, to_holder, to_place), or how many received (state.count)")]
    out += _whole(state.get("count"), "state.count", 1) + _marks(state.get("marks"), "state.marks")
    split = state.get("split")
    if split is None:
        return out
    if not isinstance(split, list) or not split:
        return out + [w("shape", "state.split lists { for, line, money }")]
    targets = _hashes(refs.get("for") or [])
    for i, part in enumerate(split):
        out += [] if _obj(part) and _within(part, SHAPES["split"]) and part.get("for") in targets else [w("shape", f"state.split[{i}].for is one of what it is for (refs.for)")]
        out += [w("shape", f"state.split[{i}].money says how much")] if _get(part, "money") is None else []
        out += [] if _get(part, "line") is None or isinstance(part["line"], str) else [w("shape", f"state.split[{i}].line is a line id")]
    return out


def _observe(state, refs):
    out = [w("shape", "a confirm or a same_as carries a confidence")] if (truthy(refs.get("confirms")) or truthy(refs.get("same_as"))) and state.get("confidence") is None else []
    dkim = state.get("dkim")
    out += [] if dkim is None or (_obj(dkim) and isinstance(dkim.get("domain"), str) and isinstance(dkim.get("pass"), bool)) else [w("shape", "state.dkim is { domain, pass }")]
    return out


def _promise(state, refs):
    answer = truthy(refs.get("answers")) and state.get("status") is not None
    stopping = truthy(refs.get("updates")) and state.get("status") is not None
    asked = speaks_for(refs, refs.get("to")) and not speaks_for(refs, refs.get("from"))
    out = _status(state, refs)
    out += [] if answer or stopping or speaks_for(refs, refs.get("from")) or speaks_for(refs, refs.get("to")) \
        else [w("not_a_side", "a promise is signed by a side: from (an offer) or to (an ask), as it, or under its grant")]
    out += [w("ask_without_expires", "every ask carries terms.expires")] if not answer and not stopping and asked and not is_time(_get(state, "terms", "expires")) else []
    out += [w("deal_not_named", "an answer or a counter names its deal in refs.for (the first promise)")] if truthy(refs.get("answers")) and not truthy(refs.get("for")) else []
    out += [] if state.get("not") is None or state["not"] is True else [w("shape", "state.not is true (a promise not to do the step), or left out")]
    out += [] if state.get("what") is None or isinstance(state["what"], (str, dict)) else [w("shape", "state.what describes time or a job (text, or data under a schema)")]
    return out + _terms(state.get("terms"), refs, state)


def _grant(state, refs):
    ending = (truthy(refs.get("answers")) or truthy(refs.get("updates"))) and state.get("status") is not None
    kind = state.get("kind")
    out = [] if truthy(kind) else [w("shape", "state.kind says what authority it gives")]
    out += _status(state, refs) + _whole(state.get("depth"), "state.depth")
    out += [] if state.get("scope") is None else _scope(state["scope"], kind)
    if not (ending or truthy(refs.get("answers"))):
        if kind == "key":
            out += _key_grant(state, refs)
        elif kind == "member":
            out += _member(state, refs)
        elif kind == "successor":
            out += _successor(state, refs)
        elif kind == "operator":
            out += [] if truthy(refs.get("to")) else [w("shape", "an operator grant names the agent or machine it answers for (refs.to)")]
    return out + _hash(state.get("last_counted"), "state.last_counted")


def _key_grant(state, refs):
    out = [] if truthy(refs.get("subject")) else [w("shape", "a key grant names the id it is for (refs.subject)")]
    out += [] if any(state.get(k) is not None for k in ("public_key_sign", "public_key_encrypt", "recovery_key_hash")) \
        else [w("shape", "a key grant names the new key (state.public_key_sign or public_key_encrypt)")]
    out += [] if state.get("public_key_sign") is None or matches("sign_key", state["public_key_sign"]) else [w("grammar", "state.public_key_sign is an Ed25519 key, SPKI DER hex")]
    out += [] if state.get("public_key_encrypt") is None or matches("encrypt_key", state["public_key_encrypt"]) else [w("grammar", "state.public_key_encrypt is an X25519 key, 32 bytes hex")]
    out += [] if (state.get("replaces") is None) == (state.get("last_good") is None) else [w("shape", "a rotation names both the key it replaces and that key's last good block")]
    out += [] if state.get("replaces") is None or matches("sign_key", state["replaces"]) else [w("grammar", "state.replaces is the key it replaces")]
    out += _hash(state.get("last_good"), "state.last_good")
    out += [] if state.get("recovery_key") is None or matches("sign_key", state["recovery_key"]) else [w("grammar", "state.recovery_key is the recovery key that signed it")]
    out += [] if (state.get("recovery_key_hash") is None) == (state.get("recovery_reach") is None) else [w("shape", "adding recovery names both recovery_key_hash and recovery_reach")]
    out += _hash(state.get("recovery_key_hash"), "state.recovery_key_hash") + _duration(state.get("recovery_reach"), "state.recovery_reach")
    out += _whole(state.get("epoch"), "state.epoch", 1)
    out += [w("shape", "a rekey (state.epoch) is signed as the circle (refs.as)")] if state.get("epoch") is not None and not truthy(refs.get("as")) else []
    out += [w("shape", "a rekey holds the new private key sealed to each member (state.keys) and names epoch n-1 in refs.after")] \
        if state.get("epoch") is not None and (state.get("keys") is None or not truthy(refs.get("after"))) else []
    return out


def _member(state, refs):
    out = [] if truthy(refs.get("subject")) else [w("shape", "a member grant names the circle (refs.subject)")]
    out += [] if _js.strict_eq(refs.get("as"), refs.get("subject")) else [w("shape", "a member grant is signed as the circle (refs.as)")]
    roles = state.get("roles")
    out += [] if roles is None or (isinstance(roles, list) and all(isinstance(r, str) and r for r in roles)) else [w("shape", "state.roles lists the roles it gives (words)")]
    return out


def _successor(state, refs):
    witnesses, needed = state.get("witnesses"), state.get("needed")
    out = [] if truthy(refs.get("to")) else [w("shape", "a successor grant names the successor (refs.to)")]
    out += [w("shape", "state.witnesses names who may record the event")] if witnesses is None else _hash_list(witnesses, "state.witnesses")
    count = len(witnesses) if isinstance(witnesses, (list, str)) else 0
    out += [] if _js.is_int(needed) and 1 <= needed <= count else [w("shape", "state.needed is how many witnesses must record it (1 to their number)")]
    out += [w("shape", "state.wait is how long the trigger waits (a duration)")] if state.get("wait") is None else _duration(state["wait"], "state.wait")
    out += [] if state.get("public_key_sign") is None else [w("undeclared_field", "a successor gets decryption keys only, never signing keys")]
    return out


def _schema(state):
    type_, *kind = _js.string(state.get("target") or "").split(".")
    out = [] if type_ in TYPES and (not kind or ".".join(kind)) else [w("shape", f"a schema names its target: a type ({', '.join(TYPES)}) or type.kind")]
    fields, roles, grounds = state.get("fields"), state.get("roles"), state.get("grounds")
    out += [] if fields is None or (_obj(fields) and all(f in PROTOCOL["field_types"] for f in fields.values())) \
        else [w("shape", f"state.fields maps each field to a field type ({', '.join(PROTOCOL['field_types'])})")]
    out += [] if roles is None or (isinstance(roles, list) and all(isinstance(r, str) for r in roles)) else [w("shape", "state.roles lists the ref keys it declares")]
    out += [] if grounds is None or (_obj(grounds) and _within(grounds, PROTOCOL["grounds"])) else [w("shape", f"state.grounds is {{ {', '.join(PROTOCOL['grounds'])} }}")]
    confirmers = _get(grounds, "confirmers")
    out += [] if confirmers is None or (isinstance(confirmers, list) and all(matches("hash", c) or matches("role_ref", c) for c in confirmers)) \
        else [w("grammar", "state.grounds.confirmers lists ids or circle#role")]
    return out


RULES = {"actor": _actor, "thing": _thing, "transform": _transform, "transfer": _transfer, "observe": _observe,
         "promise": _promise, "grant": _grant}


def _lookup(store, key):
    if not store:
        return None
    if callable(store):
        return store(key)
    return store.get(key) if isinstance(store, dict) else None


def _declared(type_, refs, schemas):
    """The fields and roles a block may name: the base, and what its schema declares (when the reader holds it)."""
    schema = _lookup(schemas, refs["schema"]) if truthy(refs.get("schema")) and schemas else None
    if truthy(refs.get("schema")) and not schema:
        return None
    return {"fields": EVERY + FIELDS[type_] + list((_get(schema, "state", "fields") or {}).keys()),
            "roles": REF_KEYS + list(_get(schema, "state", "roles") or [])}


def _findings(type_, state, refs, schemas=None, held=None) -> list:
    """Every finding, in the order found."""
    if not isinstance(type_, str) or type_ not in RULES:
        return [w("unknown_type", f"{_js.string(type_)} is not a FoodBlock 1.6 type ({', '.join(TYPES)})")]
    if not _obj(state) or not _obj(refs):
        return [w("shape", "state and refs are objects")]
    wrong = []
    try:
        if len(canonical(type_, state, refs).encode("utf-8")) > LIMITS["block_bytes"]:
            wrong.append(w("size_limit", f"a block's canonical body is at most {LIMITS['block_bytes']} bytes; link larger content by its hash"))
    except (ValueError, TypeError) as error:
        return [w("not_canonical", str(error))]
    for key, value in refs.items():
        if key == "prev":
            if not matches("hash", value):
                wrong.append(w("grammar", "refs.prev is one hash"))
        elif not _hashes(value) or not all(matches("hash", h) for h in _hashes(value)):
            wrong.append(w("grammar", f"refs.{key} is a hash or a set of hashes (64 lowercase hex)"))
    wrong += _numbers(state, "state") + _numbers(refs, "refs")
    if is_genesis_shape(type_, state, refs):
        return wrong + _genesis(state, refs)
    if not truthy(refs.get("author")):
        wrong.append(w("chain", "refs.author names who said it"))
    if not (_js.is_int(state.get("seq")) and state["seq"] >= 1):
        wrong.append(w("chain", "state.seq is its place in its signing key's chain (1, 2, 3...)"))
    if not truthy(refs.get("prev")):
        wrong.append(w("chain", "refs.prev names the key's previous block (or the block that brought the key in)"))
    if state.get("at") is None:
        wrong.append(w("time", "state.at is when it was said"))
    wrong += _times_in(state, "state") + _audience(state) + _where(state.get("where")) + _shapes_in(state, "state")
    confidence = state.get("confidence")
    wrong += [] if confidence is None or matches("confidence", confidence) else [w("grammar", "state.confidence is a decimal string from 0 to 1")]
    wrong += [] if state.get("sequencer") is None or matches("sign_key", state["sequencer"]) else [w("grammar", "state.sequencer is the signing key that orders the record")]
    wrong += _hash_list(state.get("manifest"), "state.manifest") + _hash_list(state.get("counted"), "state.counted")
    wrong += [] if state.get("line") is None or isinstance(state["line"], str) else [w("shape", "state.line is a line id")]
    after = refs.get("after")
    if after is not None and len(_hashes(after)) > LIMITS["after_heads"]:
        wrong.append(w("after_limit", f"refs.after names at most {LIMITS['after_heads']} heads"))
    if held and after is not None and is_time(state.get("at")):
        for h in _hashes(after):
            seen = _lookup(held, h)
            seen_at = _get(seen, "state", "at")
            if is_time(seen_at) and seen_at > state["at"]:
                wrong.append(w("at_before_after", f"state.at is earlier than {h}, which it names as seen"))
    if held and type_ == "grant" and truthy(refs.get("parent")):
        parent = _lookup(held, refs["parent"])
        if parent:
            wrong += scope_refusals({"state": state, "refs": refs}, parent)
    names = _declared(type_, refs, schemas)
    if not names and schemas:
        wrong.append(w("undeclared_ref", "refs.schema names a schema this node does not hold: ask for it"))
    if names:
        wrong += [w("undeclared_ref", f"refs.{key} is not declared (the shared refs, or the schema's roles)") for key in refs if key not in names["roles"]]
        wrong += [w("undeclared_field", f"state.{key} is not declared for {type_} (its base fields, or the schema's)") for key in state if key not in names["fields"]]
    return wrong + RULES[type_](state, refs)


def refusals(type_, state=None, refs=None, schemas=None, held=None) -> list:
    """What is wrong with a FoodBlock 1.6 block: [{code, detail}], one entry per rule found, in the order of
    protocol.json's `refusals.codes.block`. `schemas` (hash -> schema block: a dict or a function) so a named schema's
    fields and roles count as declared (a schema not among them is refused); `held` (hash -> block) so `at` is checked
    against what refs.after names and a child grant against its parent."""
    return ordered(_findings(type_, {} if state is None else state, {} if refs is None else refs, schemas=schemas, held=held))


def check(type_, state=None, refs=None, schemas=None, held=None) -> list:
    """What is wrong with a FoodBlock 1.6 block, in plain words (each finding's detail); [] when it passes."""
    return [one["detail"] for one in _findings(type_, {} if state is None else state, {} if refs is None else refs, schemas=schemas, held=held)]


def amount(value, unit) -> dict:
    """An amount: amount('2.5', 'kg'). The value is a decimal string."""
    return {"value": _js.string(value), "unit": unit}


def money(minor, currency) -> dict:
    """Money in whole minor units: money(420, 'GBP') is £4.20."""
    return {"minor": minor, "currency": currency}


def confidence(value) -> str:
    """A confidence from 0 to 1, as the decimal string 1.6 signs: confidence(0.8) is '0.8'."""
    text = value if isinstance(value, str) else _js.string(value)
    if not matches("confidence", text):
        raise ValueError("protocol: a confidence is from 0 to 1")
    return text


def terms(given: dict = None, **more) -> dict:
    """Terms on a promise (a dict, or keywords); only the 1.6 terms given are kept."""
    given = {**(given or {}), **more}
    return {key: value for key, value in given.items() if value is not None and key in TERMS}


__all__ = ["VERSION", "TYPES", "VERBS", "REF_KEYS", "FIELDS", "CODES", "check", "refusals", "ordered", "is_time", "is_date", "is_genesis_shape",
           "speaks_for", "amount", "money", "confidence", "terms"]

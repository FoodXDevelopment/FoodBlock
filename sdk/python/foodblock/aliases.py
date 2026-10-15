"""Reading older blocks (protocol.md: strict writing, generous reading; Encoding: Aliases). Every earlier shape is read
as its 1.6 form through the one table, aliases.json, in the order protocol.json gives: type names, then the shape rules
for the block's type.kind and type (then `*`, every type), then the shared ref renames, then `outside`. It applies to
every block, with or without seq, and reads every row. Reading never changes a block or its hash: what read_as adds
beside the content (readFrom, settles, outside, retired) is a reader's mark, never signed."""

import copy
import json

from . import _js
from .spec import ALIASES, PROTOCOL, TYPES

ORDER = PROTOCOL["aliases"]["order"]
if ORDER != ["types", "shapes", "refs", "outside"]:
    raise RuntimeError(f"aliases: this reader follows the order types, shapes, refs, outside; protocol.json says {', '.join(ORDER)}")
_IS_TYPE = set(TYPES)


def _get(block, path):
    value = block
    for key in path.split("."):
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _holds(block, when):
    for path, value in (when or {}).items():
        here = _get(block, path)
        if value == "*":
            if here is None:
                return False
        elif value is None:
            if here is not None:
                return False
        elif not _js.strict_eq(here, value):
            return False
    return True


def _put(block, path, value, force):
    """Paths are `state.x.y` or `refs.x`; a block is copied before it changes."""
    keys = path.split(".")
    last, node = keys.pop(), block
    for key in keys:
        if not isinstance(node.get(key), dict):
            node[key] = {}
        node = node[key]
    if force or node.get(last) is None:
        node[last] = value


def _remove(block, path):
    keys = path.split(".")
    last, node = keys.pop(), block
    for key in keys:
        node = node.get(key) if isinstance(node, dict) else None
    if isinstance(node, dict):
        node.pop(last, None)


def _type_of(name):
    """The 1.6 type and kind an old type name reads as. Any other old `base.kind` reads as its base's type, with that kind."""
    if name in _IS_TYPE:
        return {"type": name}
    if isinstance(name, str) and name in ALIASES["types"]:
        return ALIASES["types"][name]
    base, *rest = _js.string(name).split(".")
    found = {"type": base} if base in _IS_TYPE else ALIASES["types"].get(base)
    if found and not found.get("retired") and rest:
        return {**found, "kind": ".".join(rest)}
    # A type the shapes still read (the draft name `schema`).
    return {"type": name} if name != "*" and isinstance(name, str) and ALIASES["shapes"].get(name) else None


def _apply(read, rule, marks):
    """One shape rule applied to a block as read so far (a copy, changed in place)."""
    force = bool(rule.get("force"))
    for old, new in (rule.get("refs") or {}).items():
        value = read["refs"].get(old)
        if value is not None:
            del read["refs"][old]
            _put(read, f"refs.{new}", value, force)
    for old, new in (rule.get("move") or {}).items():
        value = _get(read, old)
        if value is not None:
            _remove(read, old)
            _put(read, new, value, force)
    for to, source in (rule.get("copy") or {}).items():
        value = _get(read, source)
        if value is not None:
            _put(read, to, copy.deepcopy(value), force)
    for to, sources in (rule.get("join") or {}).items():
        found = [part for part in (_get(read, path) for path in sources) if part is not None]
        if found:
            _put(read, to, ".".join(_js.string(part) for part in found), True)
    for path in rule.get("drop") or []:
        _remove(read, path)
    for path, value in (rule.get("set") or {}).items():
        _put(read, path, copy.deepcopy(value), force)
    if rule.get("type"):
        read["type"] = rule["type"]
    if rule.get("kind"):
        read["state"]["kind"] = rule["kind"]
    if rule.get("settles"):
        marks["settles"] = read["refs"].get(rule["settles"])


def _label(read):
    return f"{_js.string(read['type'])}.{_js.string(read['state'].get('kind'))}"


def _shapes_of(read):
    """Per-type rows (type.kind, then type), then the every-type rows (`*`)."""
    shapes = ALIASES["shapes"]
    return list(shapes.get(_label(read)) or []) + list(shapes.get(read["type"]) or []) + list(shapes.get("*") or [])


def read_as(block):
    """A block of any earlier shape, read as FoodBlock 1.6; a block that needs no reading comes back as itself."""
    if not block or not isinstance(block, dict):
        return block
    alias = _type_of(block.get("type"))
    if not alias:
        return block
    if alias.get("retired"):
        return {**block, "retired": True}
    defaults = {k: v for k, v in alias.items() if k not in ("type", "fields", "retired", "outside")}
    state = dict(block.get("state") or {})
    for old, new in (alias.get("fields") or {}).items():
        if old in state:
            state[new] = state.pop(old)
    read = copy.deepcopy({"type": alias["type"], "state": {**defaults, **state}, "refs": dict(block.get("refs") or {})})
    marks = {}
    seen = set()
    while _label(read) not in seen:
        seen.add(_label(read))
        for rule in _shapes_of(read):
            if _holds(read, rule.get("when")):
                _apply(read, rule, marks)
    refs = {}
    prefix = ALIASES["outside"]
    for old, value in read["refs"].items():
        role = ALIASES["refs"].get(old) or old
        # A ref naming someone with no record (`outside:Plenish`) is an open side: the name is kept beside, never a ref.
        if isinstance(value, str) and value.startswith(prefix):
            marks.setdefault("outside", {})[role] = value[len(prefix):]
        else:
            refs[role] = value
    read["refs"] = refs
    if read["type"] == block.get("type") and _same(read, block) and not marks:
        return block
    return {**block, **read, **{k: v for k, v in marks.items() if v is not None}, "readFrom": block.get("type")}


def _same(read, block):
    as_json = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    return as_json([read["state"], read["refs"]]) == as_json([block.get("state") or {}, block.get("refs") or {}])


def is_a(block, type_, kind=None) -> bool:
    """Whether a block, old or new, is of this 1.6 type (and kind, when named): the one test every reader uses."""
    read = read_as(block)
    return bool(read and not read.get("retired") and read.get("type") == type_ and (kind is None or (read.get("state") or {}).get("kind") == kind))

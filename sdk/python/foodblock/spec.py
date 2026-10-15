"""The protocol's lists and grammars: protocol.json and aliases.json, carried by the Rust core and read through it."""

from ._core import call

_SPEC = call("spec")
PROTOCOL = _SPEC["protocol"]
ALIASES = _SPEC["aliases"]
VERSION = PROTOCOL["version"]
TYPES = list(PROTOCOL["types"].keys())
VERBS = PROTOCOL["verbs"]
REF_KEYS = PROTOCOL["refs"]["who_and_where"] + PROTOCOL["refs"]["what_and_which"] + PROTOCOL["refs"]["verbs"]
PROFILES = PROTOCOL["profiles"]
FIELDS = {type_: PROTOCOL["fields"][type_] for type_ in TYPES}
CODES = PROTOCOL["refusals"]["codes"]

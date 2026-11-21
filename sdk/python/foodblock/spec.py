"""The protocol's lists and grammars: protocol.json, carried by the Rust core and read through it. There is no alias
table: year zero."""

from . import _door as door

PROTOCOL = door.spec()["protocol"]
# conventions.json: a node's conventions and the lists of readings and tools (peers, messages, cbor, profiles); no word reads it.
CONVENTIONS = door.spec()["conventions"]
VERSION = door.version()  # the core's number (a label: protocol.json names no version; a rule set is named by its hash, core.md section 11)
TYPES = list(PROTOCOL["types"].keys())
VERBS = PROTOCOL["verbs"]
REF_KEYS = PROTOCOL["refs"]["who_and_where"] + PROTOCOL["refs"]["what_and_which"] + PROTOCOL["verbs"] + PROTOCOL["causal"]
SUITES = [name for name, one in PROTOCOL["suites"].items() if isinstance(one, dict) and one.get("hash")]
PEERS = CONVENTIONS["peers"]
STATUSES = PROTOCOL["statuses"]
FIELDS = {type_: door.base_fields(type_) for type_ in TYPES}
CODES = PROTOCOL["refusals"]["codes"]

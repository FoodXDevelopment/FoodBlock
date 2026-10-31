"""The protocol's lists and grammars: protocol.json, carried by the Rust core and read through it. There is no alias
table: year zero."""

from . import _door as door

PROTOCOL = door.spec()["protocol"]
VERSION = PROTOCOL["version"]
TYPES = list(PROTOCOL["types"].keys())
VERBS = PROTOCOL["verbs"]
REF_KEYS = PROTOCOL["refs"]["who_and_where"] + PROTOCOL["refs"]["what_and_which"] + PROTOCOL["verbs"] + PROTOCOL["causal"]
SUITES = [name for name, one in PROTOCOL["suites"].items() if isinstance(one, dict) and one.get("hash")]
PEERS = PROTOCOL["peers"]
STATUSES = PROTOCOL["statuses"]
POWERS = PROTOCOL["powers"]
FIELDS = {type_: door.base_fields(type_) for type_ in TYPES}
CODES = PROTOCOL["refusals"]["codes"]

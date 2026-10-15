"""The one source (spec/protocol.md, "One source for lists"): every closed list and grammar is read from
protocol.json, and every older shape from aliases.json, exactly as written there. The package carries an exact copy
of both (foodblock/spec/, made by test/sync-spec.cjs from the repository's spec/). No list is copied into code."""

import json
import os
import re

_HERE = os.path.join(os.path.dirname(__file__), "spec")


def _load(name):
    with open(os.path.join(_HERE, name), encoding="utf-8") as f:
        return json.load(f)


PROTOCOL = _load("protocol.json")
ALIASES = _load("aliases.json")

# Every grammar is anchored (^...$); fullmatch keeps `$` from matching before a final newline, as JavaScript's does not.
GRAMMAR = {name: re.compile(pattern) for name, pattern in PROTOCOL["grammar"].items()}
TYPES = list(PROTOCOL["types"].keys())
REF_KEYS = PROTOCOL["refs"]["who_and_where"] + PROTOCOL["refs"]["what_and_which"] + PROTOCOL["refs"]["verbs"]
VERSION = PROTOCOL["version"]
VERBS = PROTOCOL["verbs"]
ANSWERS = PROTOCOL["answers"]
STOPS = list(PROTOCOL["stop"].keys())
GRANT_KINDS = PROTOCOL["grant_kinds"]
ROLES = PROTOCOL["roles"]
GENESIS = PROTOCOL["genesis"]
GENESIS_OPTIONAL = PROTOCOL["genesis_optional"]
TERMS = PROTOCOL["terms"]
SCOPE = PROTOCOL["scope"]
LIMITS = PROTOCOL["limits"]
INTEGERS = PROTOCOL["integers"]
PROFILES = PROTOCOL["profiles"]


def matches(name, value):
    """Whether a value matches one of protocol.json's grammars (a non-string never does)."""
    return isinstance(value, str) and GRAMMAR[name].fullmatch(value) is not None

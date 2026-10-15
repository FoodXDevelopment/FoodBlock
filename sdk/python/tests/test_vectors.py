"""Conformance: every section of spec/vectors.json, spec/canonical-vectors.json and test/vectors.json, run exactly as
spec/run-vectors.cjs runs them against the reference SDK. No section is skipped: a section the file does not hold
fails `test_every_section_is_run`, so a new section must be run here too."""

import json
import os
import unittest

import foodblock as fb

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")


def load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


V = load("spec", "vectors.json")
ADVERSARIAL = load("spec", "canonical-vectors.json")["vectors"]
OLDER = load("test", "vectors.json")
FOLDS = V.get("folds", {})
REFUSALS = V.get("refusals", {})
READS = V.get("reads", {})
SEALED = V.get("sealed", {})

# The sections this suite runs (every top-level key of vectors.json but `keys`, the key material, and `$comment`).
RUN = {"cbor", "hashes", "canonical", "audience", "signatures", "bad_signatures", "envelopes", "identities", "deals", "circles",
       "folds", "refusals", "reads", "sealed", "headers", "messages"}
RUN_FOLDS = {"promises", "circles", "audience", "things", "successors", "rekeys", "ballots"}


def pub(signer):
    return V["keys"][signer]["public_key_sign"]


def blocks_of(items):
    return [{"hash": b["hash"], **b["block"], "signature": b["signature"]} for b in items]


def find(held, h):
    return next(b for b in held if b["hash"] == h)


def codes_of(found):
    """The codes a refusal list carries, once each, in protocol.json's order."""
    return list(dict.fromkeys(one["code"] for one in found))


def codes(b, **options):
    return codes_of(fb.refusals(b["type"], b["state"], b["refs"], **options))


def subset(got, want):
    return all(got.get(key) == value for key, value in want.items())


BY_HASH = {v["hash"]: v["block"] for v in V.get("hashes", [])}


def stories():
    out = [("identity", v["name"], v["blocks"]) for v in V.get("identities", [])]
    out += [("deal", v["name"], v["blocks"]) for v in V.get("deals", [])]
    out += [("circle", v["name"], v["blocks"]) for v in V.get("circles", [])]
    for group, label in (("promises", "promise fold"), ("circles", "circle fold"), ("audience", "audience fold"), ("things", "thing fold"),
                         ("successors", "successor fold"), ("rekeys", "rekey fold"), ("ballots", "ballot fold")):
        out += [(label, v["name"], v["blocks"]) for v in FOLDS.get(group, [])]
    out.append(("refusal", "stories", REFUSALS.get("blocks", [])))
    out += [("refusal", c["name"], c["blocks"]) for c in REFUSALS.get("cases", []) if c.get("blocks")]
    out.append(("sealed", "stories", SEALED.get("blocks", [])))
    return out


STORIES = stories()
for _, _, items in STORIES:
    for b in items:
        BY_HASH[b["hash"]] = b["block"]


class Sections(unittest.TestCase):
    def test_every_section_is_run(self):
        held = set(V) - {"keys", "$comment", "comment"}
        self.assertEqual(held - RUN, set(), "vectors.json has a section this suite does not run")
        self.assertEqual(set(FOLDS) - RUN_FOLDS, set(), "vectors.json has a fold this suite does not run")
        self.assertTrue(RUN <= held | {"canonical"}, f"sections expected but missing: {RUN - held}")


class Canonical(unittest.TestCase):
    def test_adversarial(self):
        for v in ADVERSARIAL:
            with self.subTest(v["name"]):
                b = v["block"]
                h = lambda x: fb.hash(x["type"], x["state"], x["refs"])  # noqa: E731
                if "same_as" in v:
                    self.assertEqual(h(b), h(v["same_as"]))
                if "not_same_as" in v:
                    self.assertNotEqual(h(b), h(v["not_same_as"]))
                if "canonical_contains" in v:
                    self.assertIn(v["canonical_contains"], fb.canonical(b["type"], b["state"], b["refs"]))

    def test_canonical(self):
        for v in V.get("canonical", []):
            with self.subTest(v["name"]):
                b = v["block"]
                self.assertEqual(fb.canonical(b["type"], b["state"], b["refs"]), v["canonical"])
                self.assertEqual(fb.hash(b["type"], b["state"], b["refs"]), v["hash"])

    def test_utf16_order(self):
        """canonical.md Rule 1: keys and refs string arrays sort by UTF-16 code units, as JavaScript sorts."""
        state = {"\U0001F35E": 1, "｡": 2, "a": 3}
        refs = {"\U0001F35E": "x", "｡": "y", "sees": ["\U0001F35E bread", "｡ dot", "a"]}
        self.assertEqual(fb.canonical("t.a", state, refs),
                         '{"refs":{"sees":["a","\U0001F35E bread","｡ dot"],"\U0001F35E":"x","｡":"y"},'
                         '"state":{"a":3,"\U0001F35E":1,"｡":2},"type":"t.a"}')
        self.assertEqual(fb.hash("t.a", state, refs), "7ae546cb1398d598d07c4e7873a9547775b5fb7eb53ea7b3e739215a32bb630f")


class Hashes(unittest.TestCase):
    def test_hash_and_write_check(self):
        """A block in an earlier shape hashes like any other; the strict check refuses it with the codes named."""
        for v in V["hashes"]:
            with self.subTest(v["name"]):
                b = v["block"]
                self.assertEqual(fb.canonical(b["type"], b["state"], b["refs"]), v["canonical"])
                self.assertEqual(fb.hash(b["type"], b["state"], b["refs"]), v["hash"])
                if not v.get("refused"):
                    self.assertEqual(fb.check(b["type"], b["state"], b["refs"]), [])
                    continue
                self.assertEqual(codes(b), v["refused"])

    def test_each_author_one_chain(self):
        authors = dict.fromkeys(v["block"]["refs"]["author"] for v in V["hashes"] if v["block"]["refs"].get("author"))
        for author in authors:
            with self.subTest(author[:8]):
                mine = [{"hash": v["hash"], **v["block"]} for v in V["hashes"] if v["block"]["refs"].get("author") == author]
                self.assertTrue(fb.check_chain(mine, author)["ok"])

    def test_audience(self):
        for v in V["audience"]:
            with self.subTest(v["name"]):
                self.assertEqual(fb.salted_hash(v["salt"], v["recipient"]), v["commitment"])


class Stories(unittest.TestCase):
    def test_every_story_block_hashes_verifies_and_passes(self):
        for group, name, items in STORIES:
            with self.subTest(f"{group}: {name}"):
                for b in items:
                    blk = b["block"]
                    self.assertEqual(fb.hash(blk["type"], blk["state"], blk["refs"]), b["hash"], b["name"])
                    self.assertTrue(fb.verify(blk, b["signature"], pub(b["signer"])), b["name"])
                    if "seq" in blk["state"]:
                        self.assertEqual(fb.check(blk["type"], blk["state"], blk["refs"]), [], b["name"])


class Signatures(unittest.TestCase):
    def test_keys_rebuild(self):
        for name, k in V["keys"].items():
            with self.subTest(name):
                if "ed25519_seed" in k:
                    pair = fb.keypair_from_seed(k["ed25519_seed"])
                    self.assertEqual(pair["public_key_sign"], k["public_key_sign"])
                    if "private_key" in k:
                        self.assertEqual(pair["private_key"], k["private_key"])
                if "x25519_private" in k:
                    self.assertEqual(fb.encryption_key_of(k["x25519_private"]), k["public_key_encrypt"])
                if "hash" in k:
                    self.assertEqual(fb.identity.recovery_key_hash(k["public_key_sign"]), k["hash"])

    def test_signatures(self):
        for v in V["signatures"]:
            with self.subTest(v["name"]):
                block = BY_HASH[v["hash"]]
                self.assertTrue(fb.verify(block, v["signature"], pub(v["signer"])))
                self.assertEqual(fb.sign(block, V["keys"][v["signer"]]["private_key"]), v["signature"])  # Ed25519 is deterministic

    def test_bad_signatures(self):
        for v in V["bad_signatures"]:
            with self.subTest(v["name"]):
                self.assertFalse(v["hash"] in BY_HASH and fb.verify(BY_HASH[v["hash"]], v["signature"], pub(v["signer"])))


class Envelopes(unittest.TestCase):
    def test_envelopes(self):
        for v in V["envelopes"]:
            with self.subTest(v["name"]):
                m = fb.unwrap(fb.open(v["envelope"], V["keys"][v["recipient"]]["x25519_private"]))
                self.assertEqual([m["hash"], m["signature"], m["version"]], [v["opens_to"]["hash"], v["opens_to"]["signature"], v["opens_to"]["version"]])

    def test_sealed(self):
        for v in SEALED["cases"]:
            with self.subTest(v["name"]):
                m = fb.open_copy(v["message"], V["keys"][v["recipient"]]["x25519_private"])
                self.assertEqual([m["hash"], m["signature"], m["reveals"]], [v["opens_to"]["hash"], v["opens_to"]["signature"], v["opens_to"]["reveals"]])
                self.assertTrue(fb.header_signed_by(v["message"], pub(v["signer"])))

    def test_headers(self):
        for v in V["headers"]:
            with self.subTest(v["name"]):
                self.assertEqual(fb.header({"hash": v["hash"], **BY_HASH[v["hash"]]}), v["header"])
                self.assertTrue(fb.verify_message({**v["header"], "signature": v["header_signature"]}, pub(v["signer"])))


class Identities(unittest.TestCase):
    def test_identities(self):
        for v in V["identities"]:
            held = blocks_of(v["blocks"])
            arrivals = v.get("arrivals")
            arrived = (lambda h, a=arrivals: a.get(h)) if arrivals else None
            names = {b["hash"]: b["name"] for b in v["blocks"]}
            for b in held:
                if b["hash"] in v.get("signed_by_author", {}):
                    with self.subTest(f"{v['name']}: {names[b['hash']]}"):
                        self.assertEqual(fb.identity.signed_by_author(b, held, arrived), v["signed_by_author"][b["hash"]])
            if "keys" in v:
                with self.subTest(f"{v['name']}: the keys that speak"):
                    self.assertEqual(sorted(fb.identity.keys_of(v["id"], held, arrived)), v["keys"])
            if "frozen" in v:
                with self.subTest(f"{v['name']}: the frozen keys"):
                    self.assertEqual(sorted(k["key"] for k in fb.identity.key_timeline(v["id"], held) if k["frozen"]), v["frozen"])
            if "operators" in v:
                with self.subTest(f"{v['name']}: its operators"):
                    self.assertEqual(fb.grant.operators_of(v["id"], held), v["operators"])
            if v.get("history"):
                with self.subTest(f"{v['name']}: the identity fold (signed_by_author, keys, frozen, history)"):
                    state = fb.identity_state(v["id"], held, arrived)
                    self.assertEqual(state["history"], v["history"])
                    self.assertEqual(state["keys"], v["keys"])
                    if v.get("frozen"):
                        self.assertEqual(state["frozen"], v["frozen"])
                    for h, ok in v["signed_by_author"].items():
                        self.assertIs(state["signed_by_author"].get(h), ok, h)
            for h, ok in (v.get("under") or {}).items():
                with self.subTest(f"{v['name']}: under"):
                    self.assertEqual(not fb.grant.why_not_under(find(held, h), held), ok)


def stage_of(v):
    held = blocks_of(v["blocks"])
    return fb.promise_stage(find(held, v["first"]), held, now=v.get("now"))


class Folds(unittest.TestCase):
    def test_promises(self):
        for v in [*V.get("deals", []), *FOLDS.get("promises", [])]:
            with self.subTest(f"{v['name']}: {v['expected']['stage']}"):
                got = stage_of(v)
                self.assertTrue(subset(got, v["expected"]), f"got {got}")

    def test_circles(self):
        for v in [*V.get("circles", []), *FOLDS.get("circles", [])]:
            with self.subTest(v["name"]):
                held = blocks_of(v["blocks"])
                state = fb.circle_state(v["circle"], held)
                want = v["expected"]["members"]
                members = sorted(state["members"]) if isinstance(want, list) else {who: sorted(m["roles"]) for who, m in state["members"].items()}
                self.assertEqual(members, want)
                self.assertEqual(sorted(state["removed"]), v["expected"]["removed"])
                for who, h in v["expected"].get("counted_to", {}).items():
                    self.assertEqual(state["removed"][who], h)
                for h, ok in (v.get("may_act") or {}).items():
                    self.assertEqual(fb.fold.may_act_as(find(held, h), v["circle"], held), ok)

    def test_audience(self):
        for v in FOLDS.get("audience", []):
            held = blocks_of(v["blocks"])
            for c in v["cases"]:
                with self.subTest(c["name"]):
                    self.assertEqual(fb.members_then(find(held, c["block"]), c["recipient"], held), c["members"])

    def test_things(self):
        for v in FOLDS.get("things", []):
            held = blocks_of(v["blocks"])
            for c in v.get("where", []):
                with self.subTest(f"where now: {c['name']}"):
                    self.assertEqual(fb.where_now(find(held, c["thing"]), held), c["places"])
            for c in v.get("owners", []):
                with self.subTest(f"owner: {c['name']}"):
                    got = fb.fold.ownership(find(held, c["thing"]), held)
                    self.assertEqual([got["owner"], got["conflict"]], [c["owner"], c["conflict"]])

    def test_successors(self):
        for v in FOLDS.get("successors", []):
            with self.subTest(v["name"]):
                held = blocks_of(v["blocks"])
                got = fb.fold.successor_state(find(held, v["grant"]), held, now=v.get("now"), arrived_at=lambda h, a=v.get("arrivals", {}): a.get(h))
                self.assertTrue(subset(got, v["expected"]), f"got {got}")

    def test_ballots(self):
        for v in FOLDS.get("ballots", []):
            held = blocks_of(v["blocks"])
            for c in v["cases"]:
                with self.subTest(c["name"]):
                    self.assertEqual(fb.fold.counted_in(find(held, c["result"]), c["commitment"], c["counter"]), c["counted"])

    def test_rekeys(self):
        for v in FOLDS.get("rekeys", []):
            with self.subTest(v["name"]):
                got = fb.fold.circle_key(v["circle"], blocks_of(v["blocks"]))
                self.assertTrue(subset(got, v["expected"]), f"got {got}")


class Refusals(unittest.TestCase):
    def test_refusals(self):
        pool = {b["hash"]: b for b in blocks_of([*REFUSALS.get("blocks", []), *[b for _, _, items in STORIES for b in items]])}
        for c in REFUSALS.get("cases", []):
            with self.subTest(f"refused ({c['by']}): {c['name']}"):
                if c["by"] == "check":
                    held = {h: pool.get(h) for h in c.get("held", [])}
                    b = c["block"]
                    self.assertEqual(codes(b, held=held or None), c["codes"])
                elif c["by"] == "accept":
                    got = fb.sync.accept([pool[h] for h in c["incoming"]], [pool[h] for h in c["held"]])
                    if c.get("equivocations"):
                        # The second of a pair is neither taken nor refused: it is listed in its pair.
                        self.assertEqual([b["hash"] for b in got["taken"]], c["taken"])
                        self.assertEqual(got["refused"], [])
                        self.assertEqual(got["equivocations"], c["equivocations"])
                        continue
                    refused = [r["hash"] for r in got["refused"]]
                    self.assertTrue(all(h in refused for h in c["incoming"]), got["refused"])
                    self.assertEqual(codes_of(got["refused"]), c["codes"])
                elif c["by"] == "fold":
                    self.assertTrue(subset(stage_of(c), c["expected"]))
                elif c["by"] == "open":
                    with self.assertRaises(Exception) as raised:
                        fb.open_copy(c["message"], V["keys"][c["recipient"]]["x25519_private"])
                    self.assertEqual([getattr(raised.exception, "code", None)], c["codes"])
                else:
                    self.fail(f"a refusal by {c['by']} this suite does not know")


def marks(read):
    out = {"type": read["type"], "state": read["state"], "refs": read["refs"]}
    for key in ("settles", "outside"):
        if read.get(key):
            out[key] = read[key]
    if read.get("retired"):
        out["retired"] = True
    return out


class Reads(unittest.TestCase):
    def test_cases(self):
        for v in READS.get("cases", []):
            with self.subTest(v["name"]):
                b = v["block"]
                self.assertEqual(marks(fb.read_as(fb.create(b["type"], b["state"], b["refs"]))), v["reads_as"])


class Messages(unittest.TestCase):
    def test_messages(self):
        M = V["messages"]
        node_key = pub(M["node_signer"])
        pull = M["signed_pull"]
        signer = [pub(pull["signer"])]
        self.assertEqual(fb.sync.pull_errors(pull["message"], node=M["node"], now=pull["now"], keys=signer), [])
        self.assertTrue(fb.sync.pull_errors(pull["message"], node=M["node"], now=pull["now"], keys=signer, seen=lambda n: True))
        self.assertTrue(fb.sync.pull_errors({**pull["message"], "node": "0" * 64}, node=M["node"], now=pull["now"], keys=signer))
        self.assertIn(node_key, fb.identity.keys_of(M["node"], blocks_of(SEALED["blocks"])))
        self.assertTrue(fb.sync.answer_signed_by(M["pull_answer"]["message"], node_key))
        self.assertEqual(len(M["pull_answer"]["message"]["blocks"]), M["pull_answer"]["matches"])
        self.assertTrue(fb.sync.answer_signed_by(M["push_answer"]["message"], node_key))
        # Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair
        # sorted. Rebuilt from its parts by the node's key, it is the same message, byte for byte.
        P = M["push_answer"]["message"]
        known = {code for group in fb.CODES.values() for code in group}
        self.assertEqual(list(P), fb.PROTOCOL["messages"]["push_answer"])
        self.assertTrue(all(list(r) == fb.PROTOCOL["messages"]["refusal"] and r["code"] in known for r in P["refused"]))
        self.assertTrue(all(pair == sorted(pair) for pair in P["equivocations"]))
        self.assertEqual(fb.sync.push_answer(P, node=P["node"], private_key=V["keys"][M["node_signer"]]["private_key"]), P)
        self.assertFalse(fb.sync.answer_signed_by({**M["push_answer"]["message"], "taken": []}, node_key))
        self.assertEqual(fb.sync.well_known_errors(M["discovery"]), [])
        self.assertEqual(fb.sync.announcement(M["discovery"]), M["announcement"])


class Older(unittest.TestCase):
    """test/vectors.json: the older cross-language vectors. Same canonical form and hash; a legacy-read shape is refused
    on write."""

    def test_older(self):
        self.assertGreater(len(OLDER), 0)
        for v in OLDER:
            with self.subTest(v["name"]):
                self.assertEqual(fb.canonical(v["type"], v["state"], v["refs"]), v["expected_canonical"])
                self.assertEqual(fb.hash(v["type"], v["state"], v["refs"]), v["expected_hash"])
                if v.get("section") == "legacy-read":
                    self.assertTrue(fb.check(v["type"], v["state"], v["refs"]))


class Package(unittest.TestCase):
    def test_core_carries_the_spec(self):
        """The Rust core carries protocol.json and aliases.json; they equal the repository's spec/ files."""
        for name, mine in (("protocol.json", fb.PROTOCOL), ("aliases.json", fb.ALIASES)):
            self.assertEqual(mine, load("spec", name), f"{name}: the core's built-in copy differs from spec/")

    def test_version(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "pyproject.toml"), encoding="utf-8") as f:
            line = next(line for line in f if line.startswith("version"))
        self.assertTrue(line.split('"')[1].startswith(fb.VERSION + "."))


class Older(unittest.TestCase):
    """test/vectors.json: the older cross-language vectors. Same canonical form and hash; a legacy-read shape is refused
    on write."""

    def test_older(self):
        self.assertGreater(len(OLDER), 0)
        for v in OLDER:
            with self.subTest(v["name"]):
                self.assertEqual(fb.canonical(v["type"], v["state"], v["refs"]), v["expected_canonical"])
                self.assertEqual(fb.hash(v["type"], v["state"], v["refs"]), v["expected_hash"])
                if v.get("section") == "legacy-read":
                    self.assertTrue(fb.check(v["type"], v["state"], v["refs"]))


class Package(unittest.TestCase):
    def test_core_carries_the_spec(self):
        """The Rust core carries protocol.json and aliases.json; they equal the repository's spec/ files."""
        for name, mine in (("protocol.json", fb.PROTOCOL), ("aliases.json", fb.ALIASES)):
            self.assertEqual(mine, load("spec", name), f"{name}: the core's built-in copy differs from spec/")

    def test_version(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "pyproject.toml"), encoding="utf-8") as f:
            line = next(line for line in f if line.startswith("version"))
        self.assertTrue(line.split('"')[1].startswith(fb.VERSION + "."))


if __name__ == "__main__":
    unittest.main()


class Older(unittest.TestCase):
    def test_older_message_words(self):
        """A signed pull's asker and a signed push's pusher read as signer."""
        M = V["messages"]
        for kind, check in (("signed_pull", fb.sync.pull_errors), ("signed_push", fb.sync.push_errors)):
            o = M["older"][kind]
            self.assertEqual(check(o["message"], node=M["node"], now=o["now"], keys=[pub(o["signer"])]), [])
            self.assertTrue(check(o["message"], node="0" * 64, now=o["now"], keys=[pub(o["signer"])]))


class Cbor(unittest.TestCase):
    def test_compact_form(self):
        C = V["cbor"]
        signed = lambda c: {"hash": c["hash"], **c["block"], "signature": c["signature"]}
        for c in C["cases"]:
            with self.subTest(c["name"]):
                b = signed(c)
                self.assertEqual(fb.cbor.encode(b).hex(), c["cbor"])
                self.assertEqual(fb.cbor.encode(b, short=True).hex(), c["cbor_short"])
                self.assertEqual(fb.cbor.decode(bytes.fromhex(c["cbor"])), b)
                self.assertEqual(fb.cbor.decode(bytes.fromhex(c["cbor_short"])), b)
        self.assertEqual(fb.cbor.decode(bytes.fromhex(C["loose"]["cbor"]))["hash"], C["loose"]["hash"])
        blocks = [signed(next(c for c in C["cases"] if c["hash"] == h)) for h in C["push"]["hashes"]]
        self.assertEqual(fb.cbor.encode_push(blocks).hex(), C["push"]["cbor"])
        self.assertEqual(fb.cbor.decode_push(bytes.fromhex(C["push"]["cbor_short"])), blocks)
        for h in C["headers"]:
            self.assertEqual(fb.cbor.encode_header(h["header"]).hex(), h["cbor"])
            self.assertEqual(fb.cbor.decode_header(bytes.fromhex(h["cbor_short"])), h["header"])
        for r in C["refused"]:
            with self.subTest(r["name"]):
                with self.assertRaises(fb.FoodBlockError):
                    fb.cbor.decode(bytes.fromhex(r["cbor"]))





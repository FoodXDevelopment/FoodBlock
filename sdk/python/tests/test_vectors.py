"""Conformance: every section of spec/vectors.json and spec/canonical-vectors.json, run exactly as spec/run-vectors.cjs
runs them against the reference SDK. No section is skipped: a section the file holds that this suite does not run fails
`test_every_section_is_run`, so a new section must be run here too."""

import json
import os
import unittest

import foodblock as fb
from foodblock._core import call, FoodBlockError

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")


def load(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


V = load("spec", "vectors.json")
ADVERSARIAL = load("spec", "canonical-vectors.json")["vectors"]
FOLDS = V["folds"]
REFUSALS = V["refusals"]
SEALED = V["sealed"]
MS = V["messages"]

# The sections this suite runs (every top-level key of vectors.json but `$comment`).
RUN = {"keys", "canonical", "hashes", "ledger", "audience", "signatures", "bad_signatures", "envelopes", "sealed", "headers",
       "identities", "deals", "circles", "folds", "refusals", "messages", "cbor", "door"}
RUN_FOLDS = {"promises", "circles", "audience", "things", "successors", "rekeys", "ballots"}


def pub(signer):
    return V["keys"][signer]["public_key_sign"]


def full(b):
    return {"hash": b["hash"], **b["block"], **({"suite": b["suite"]} if b.get("suite") else {}), "signature": b["signature"]}


def blocks_of(items):
    return [full(b) for b in items]


def find(held, h):
    return next(b for b in held if b["hash"] == h)


def codes_of(found):
    """The codes a refusal list carries, once each, in order."""
    return list(dict.fromkeys(one["code"] for one in found))


def subset(got, want):
    """Every key given must match; arrays of the same length elementwise."""
    if isinstance(want, list):
        return isinstance(got, list) and len(got) == len(want) and all(subset(g, w) for g, w in zip(got, want))
    if isinstance(want, dict):
        return isinstance(got, dict) and all(subset(got.get(k), v) for k, v in want.items())
    return got == want and type(got) is type(want) or (isinstance(got, (int, float)) and not isinstance(got, bool) and got == want)


LEDGER = [*V["ledger"]["genesis"], *V["hashes"]]
BY_HASH = {v["hash"]: v for v in LEDGER}


def stories():
    out = [("identity", v["name"], v["blocks"]) for v in V["identities"]]
    out += [("deal", v["name"], v["blocks"]) for v in V["deals"]]
    out += [("circle", v["name"], v["blocks"]) for v in V["circles"]]
    for group, label in (("promises", "promise fold"), ("circles", "circle fold"), ("audience", "audience fold"), ("things", "thing fold"),
                         ("successors", "successor fold"), ("rekeys", "rekey fold"), ("ballots", "ballot fold")):
        out += [(label, v["name"], v["blocks"]) for v in FOLDS[group]]
    out.append(("refusal", "stories", REFUSALS["blocks"]))
    out += [("refusal", c["name"], c["blocks"]) for c in REFUSALS["cases"] if c.get("blocks")]
    out.append(("sealed", "stories", SEALED["blocks"]))
    return out


STORIES = stories()
for _, _, _items in STORIES:
    for _b in _items:
        BY_HASH[_b["hash"]] = _b


class Sections(unittest.TestCase):
    def test_every_section_is_run(self):
        held = set(V) - {"$comment", "comment"}
        self.assertEqual(held - RUN, set(), "vectors.json has a section this suite does not run")
        self.assertEqual(set(FOLDS) - RUN_FOLDS, set(), "vectors.json has a fold this suite does not run")
        self.assertEqual(RUN - held, set(), "sections expected but missing")


class Canonical(unittest.TestCase):
    def test_adversarial(self):
        for v in ADVERSARIAL:
            with self.subTest(v["name"]):
                b = v["block"]
                h = lambda x: fb.hash(x["type"], x["state"], x["refs"])  # noqa: E731
                c = lambda x: fb.canonical(x["type"], x["state"], x["refs"])  # noqa: E731
                if "same_as" in v:
                    self.assertEqual(h(b), h(v["same_as"]))
                if "not_same_as" in v:
                    self.assertNotEqual(h(b), h(v["not_same_as"]))
                if "canonical_contains" in v:
                    self.assertIn(v["canonical_contains"], c(b))
                if "canonical" in v:
                    self.assertEqual(c(b), v["canonical"])
                if "refused" in v:
                    got = codes_of(fb.refusals(b["type"], b["state"], b["refs"]))
                    self.assertTrue(all(code in got for code in v["refused"]), got)

    def test_canonical(self):
        for v in V["canonical"]:
            with self.subTest(v["name"]):
                b = v["block"]
                self.assertEqual(fb.canonical(b["type"], b["state"], b["refs"]), v["canonical"])
                self.assertEqual(fb.hash(b["type"], b["state"], b["refs"]), v["hash"])

    def test_utf16_order(self):
        """canonical.md Rule 1: object keys sort by UTF-16 code units, as JavaScript sorts. A set is written sorted, never sorted for you."""
        state = {"\U0001F35E": 1, "｡": 2, "a": 3}
        refs = {"\U0001F35E": "x", "｡": "y", "sees": ["a", "\U0001F35E bread", "｡ dot"]}
        self.assertEqual(fb.canonical("t.a", state, refs),
                         '{"refs":{"sees":["a","\U0001F35E bread","｡ dot"],"\U0001F35E":"x","｡":"y"},'
                         '"state":{"a":3,"\U0001F35E":1,"｡":2},"type":"t.a"}')


class Hashes(unittest.TestCase):
    def test_ledger(self):
        """One block of every type, each valid against the blocks before it, its signature opens."""
        before = []
        for v in LEDGER:
            with self.subTest(v["name"]):
                b, block = v["block"], full(v)
                if v.get("canonical"):
                    self.assertEqual(fb.canonical(b["type"], b["state"], b["refs"]), v["canonical"])
                self.assertEqual(fb.hash(b["type"], b["state"], b["refs"]), v["hash"])
                self.assertTrue(fb.verify(block, v["signature"], pub(v["signer"])))
                self.assertEqual(fb.valid(block, before), [])
                before.append(block)

    def test_each_author_one_chain(self):
        for author in dict.fromkeys(v["block"]["refs"]["author"] for v in V["hashes"]):
            with self.subTest(author[:8]):
                mine = blocks_of([v for v in V["hashes"] if v["block"]["refs"]["author"] == author])
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
                    self.assertEqual(fb.hash(blk["type"], blk["state"], blk["refs"], b.get("suite", "std")), b["hash"], b["name"])
                    self.assertTrue(fb.verify(full(b), b["signature"], pub(b["signer"])), b["name"])
                    self.assertEqual(V["keys"][b["signer"]].get("suite", "std"), b.get("suite", "std"), b["name"])
                    self.assertEqual(fb.refusals(blk["type"], blk["state"], blk["refs"]), [], b["name"])


class Signatures(unittest.TestCase):
    def test_keys_rebuild(self):
        for name, k in V["keys"].items():
            with self.subTest(name):
                suite = k.get("suite", "std")
                pair = fb.keypair_from_seed(k["seed"], suite)
                self.assertEqual(pair["public_key_sign"], k["public_key_sign"])
                self.assertEqual(pair["private_key"], k["private_key"])
                self.assertEqual(fb.suite_of_key(k["public_key_sign"]), suite)
                if "x25519_private" in k:
                    self.assertEqual(fb.encryption_key_of(k["x25519_private"], suite), k["public_key_encrypt"])

    def test_signatures(self):
        for v in V["signatures"]:
            with self.subTest(v["name"]):
                self.assertIn(v["hash"], BY_HASH)
                self.assertTrue(fb.verify(full(BY_HASH[v["hash"]]), v["signature"], pub(v["signer"])))

    def test_bad_signatures(self):
        for v in V["bad_signatures"]:
            with self.subTest(v["name"]):
                self.assertFalse(v["hash"] in BY_HASH and fb.verify(full(BY_HASH[v["hash"]]), v["signature"], pub(v["signer"])))


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
                self.assertEqual(fb.header({"hash": v["hash"], **BY_HASH[v["hash"]]["block"]}), v["header"])
                self.assertTrue(fb.verify_message({**v["header"], "signature": v["header_signature"]}, pub(v["signer"])))


class Identities(unittest.TestCase):
    def test_identities(self):
        for v in V["identities"]:
            held = blocks_of(v["blocks"])
            arrivals = v.get("arrivals")
            names = {b["hash"]: b["name"] for b in v["blocks"]}
            for b in held:
                if b["hash"] in v["signed_by_author"]:
                    with self.subTest(f"{v['name']}: {names[b['hash']]}"):
                        self.assertEqual(fb.identity.signed_by_author(b, held, arrivals), v["signed_by_author"][b["hash"]])
            if "keys" in v:
                with self.subTest(f"{v['name']}: the keys that speak"):
                    self.assertEqual(sorted(fb.identity.keys_of(v["id"], held, arrivals)), v["keys"])
            if "frozen" in v:
                with self.subTest(f"{v['name']}: the frozen keys"):
                    self.assertEqual(sorted(k["key"] for k in fb.identity.key_timeline(v["id"], held) if k["frozen"]), v["frozen"])
            if "operators" in v:
                with self.subTest(f"{v['name']}: its operators"):
                    self.assertEqual(fb.grant.operators_of(v["id"], held), v["operators"])
            with self.subTest(f"{v['name']}: the identity fold"):
                state = fb.identity_state(v["id"], held, arrivals)
                self.assertEqual(state["history"], "none")
                self.assertEqual(state["keys"], v["keys"])
                if v.get("frozen"):
                    self.assertEqual(state["frozen"], v["frozen"])
                for h, ok in v["signed_by_author"].items():
                    if h in state["signed_by_author"]:
                        self.assertIs(state["signed_by_author"][h], ok, h)
            if v.get("fence"):
                f = v["fence"]
                limit, grant = find(held, f["block"]), find(held, f["grant"])
                with self.subTest(f"{v['name']}: sealed to the agent alone"):
                    self.assertTrue(limit["refs"]["for"] == f["grant"] and limit["state"]["kind"] == "limit" and limit["state"]["limit"] == f["limit"]
                                    and fb.finds_self(limit, f["agent"], f["salt"]) and not fb.finds_self(limit, f["principal"], f["salt"])
                                    and len(limit["state"]["audience"]) == 1)
                with self.subTest(f"{v['name']}: the grant check never reads the limit"):
                    rest = [b for b in held if b is not limit]
                    self.assertIsNone(grant["state"]["scope"].get("limit"))
                    for h in v["under"]:
                        self.assertEqual(fb.grant.why_not_under(find(held, h), held), fb.grant.why_not_under(find(held, h), rest))
                with self.subTest(f"{v['name']}: the principal's node checks the limit"):
                    for c in f["within"]:
                        self.assertEqual(fb.grant.within_limit(limit, c["money"], c["spent"]), c["within"])
            for h, ok in (v.get("under") or {}).items():
                with self.subTest(f"{v['name']}: a block under the grant speaks for its grantor"):
                    self.assertEqual(not fb.grant.why_not_under(find(held, h), held), ok)


def stage_of(v):
    held = blocks_of(v["blocks"])
    return fb.promise_stage(find(held, v["first"]), held)


class Folds(unittest.TestCase):
    def test_promises(self):
        for v in [*V["deals"], *FOLDS["promises"]]:
            with self.subTest(f"{v['name']}: {v['expected']['stage']}"):
                got = stage_of(v)
                self.assertTrue(subset(got, v["expected"]), f"got {got}")

    def test_circles(self):
        for v in [*V["circles"], *FOLDS["circles"]]:
            with self.subTest(v["name"]):
                held = blocks_of(v["blocks"])
                state = fb.circle_state(v["circle"], held)
                want = v["expected"]["members"]
                members = sorted(state["members"]) if isinstance(want, list) else {who: sorted(m["roles"]) for who, m in state["members"].items()}
                self.assertEqual(members, want)
                self.assertEqual(sorted(state["removed"]), v["expected"]["removed"])
                if v["expected"].get("counted_to"):
                    self.assertEqual(state["removed"], v["expected"]["counted_to"])
                for h, ok in (v.get("may_act") or {}).items():
                    self.assertEqual(fb.fold.may_act_as(find(held, h), v["circle"], held), ok)

    def test_audience(self):
        for v in FOLDS["audience"]:
            held = blocks_of(v["blocks"])
            for c in v["cases"]:
                with self.subTest(c["name"]):
                    self.assertEqual(fb.members_then(find(held, c["block"]), c["recipient"], held), c["members"])

    def test_things(self):
        for v in FOLDS["things"]:
            held = blocks_of(v["blocks"])
            for c in v["where"]:
                with self.subTest(f"where now: {c['name']}"):
                    self.assertEqual(fb.where_now(find(held, c["thing"]), held), c["places"])
            for c in v["owners"]:
                with self.subTest(f"owner: {c['name']}"):
                    got = fb.fold.ownership(find(held, c["thing"]), held)
                    self.assertEqual([got["owner"], got["conflict"]], [c["owner"], c["conflict"]])

    def test_successors(self):
        for v in FOLDS["successors"]:
            with self.subTest(v["name"]):
                held = blocks_of(v["blocks"])
                got = fb.fold.successor_view(find(held, v["grant"]), held, now=v.get("now"), arrived_at=v["arrivals"])
                self.assertTrue(subset(got, v["expected"]), f"got {got}")

    def test_ballots(self):
        for v in FOLDS["ballots"]:
            held = blocks_of(v["blocks"])
            for c in v["cases"]:
                with self.subTest(c["name"]):
                    self.assertEqual(fb.fold.counted_in(find(held, c["result"]), c["commitment"], c["counter"]), c["counted"])

    def test_rekeys(self):
        for v in FOLDS["rekeys"]:
            with self.subTest(v["name"]):
                got = fb.fold.circle_key(v["circle"], blocks_of(v["blocks"]))
                self.assertTrue(subset(got, v["expected"]), f"got {got}")


class Refusals(unittest.TestCase):
    def test_refusals(self):
        pool = {b["hash"]: full(b) for _, _, items in STORIES for b in items}
        for c in REFUSALS["cases"]:
            with self.subTest(f"refused ({c['by']}): {c['name']}"):
                held = [pool[h] for h in c["held"]] if isinstance(c.get("held"), list) else []
                if c["by"] == "check":
                    b = c["block"]
                    self.assertEqual(codes_of(fb.refusals(b["type"], b["state"], b["refs"], held=held)), c["codes"])
                elif c["by"] == "valid":
                    self.assertEqual(codes_of(fb.valid(c["block"], held)), c["codes"])
                elif c["by"] == "accept":
                    incoming = c.get("inline") or [pool[h] for h in c["incoming"]]
                    got = fb.sync.accept(incoming, held)
                    if c.get("equivocations"):
                        # The second of a pair is neither taken nor refused: it is listed in its pair.
                        self.assertEqual([b["hash"] for b in got["taken"]], c["taken"])
                        self.assertEqual(got["refused"], [])
                        self.assertEqual(got["equivocations"], c["equivocations"])
                    elif c.get("waiting"):
                        self.assertEqual([w["hash"] for w in got["waiting"]], c["waiting"])
                        self.assertEqual(got["refused"], [])
                    elif c.get("taken"):
                        self.assertEqual([b["hash"] for b in got["taken"]], c["taken"])
                    else:
                        refused = [r["hash"] for r in got["refused"]]
                        self.assertTrue(all(h in refused for h in c["incoming"]), got["refused"])
                        self.assertEqual(codes_of(got["refused"]), c["codes"])
                elif c["by"] == "fold":
                    self.assertTrue(subset(stage_of(c), c["expected"]))
                elif c["by"] == "may_act_as":
                    blocks = blocks_of(c["blocks"])
                    self.assertEqual(fb.fold.may_act_as(find(blocks, c["block"]), c["circle"], blocks), c["ok"])
                elif c["by"] == "under":
                    self.assertEqual(not fb.grant.why_not_under(pool[c["block"]], list(pool.values())), c["live"])
                elif c["by"] == "open":
                    with self.assertRaises(FoodBlockError) as raised:
                        fb.open_copy(c["message"], V["keys"][c["recipient"]]["x25519_private"])
                    self.assertEqual([raised.exception.code], c["codes"])
                else:
                    self.fail(f"a refusal by {c['by']} this suite does not know")


class Messages(unittest.TestCase):
    """Every answer signed by the node; a signed request carries a counter or a challenge, no time."""

    def test_signed_requests(self):
        node = MS["node"]
        p, c, jem = MS["signed_pull"], MS["signed_pull_challenge"], pub(MS["signed_pull"]["signer"])
        pull = fb.sync.pull_refusals
        self.assertEqual(pull(p["message"], node=node, keys=[jem], highest=p["highest"]), [])
        self.assertNotIn("at", p["message"])
        self.assertEqual(codes_of(pull(p["message"], node=node, keys=[jem], highest=p["message"]["counter"])), ["replay"])
        self.assertEqual(pull(c["message"], node=node, keys=[jem], issued=[c["challenge"]]), [])
        self.assertEqual(codes_of(pull(c["message"], node=node, keys=[jem], issued=[])), ["replay"])
        self.assertEqual(codes_of(pull(p["message"], node="0" * 64, keys=[jem], highest=p["highest"])), ["wrong_node"])
        self.assertEqual(codes_of(pull({**p["message"], "since": 1}, node=node, keys=[jem], highest=p["highest"])), ["bad_signature"])
        push = MS["signed_push"]
        self.assertEqual(fb.sync.push_refusals(push["message"], node=node, keys=[pub(push["signer"])], highest=push["highest"]), [])

    def test_answers(self):
        node_key = pub(MS["node_signer"])
        self.assertIn(node_key, fb.identity.keys_of(MS["node"], blocks_of(SEALED["blocks"])))
        self.assertTrue(fb.sync.answer_signed_by(MS["pull_answer"]["message"], node_key))
        self.assertEqual(len(MS["pull_answer"]["message"]["blocks"]), MS["pull_answer"]["matches"])
        self.assertTrue(fb.sync.answer_signed_by(MS["push_answer"]["message"], node_key))
        # Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair sorted.
        P = MS["push_answer"]["message"]
        known = {code for group in fb.CODES.values() for code in group}
        self.assertEqual(list(P), fb.PROTOCOL["messages"]["push_answer"])
        self.assertTrue(all(list(r) == fb.PROTOCOL["messages"]["refusal"] and r["code"] in known for r in P["refused"]))
        self.assertTrue(all(pair == sorted(pair) for pair in P["equivocations"]))
        self.assertEqual(fb.sync.push_answer(P, node=P["node"], private_key=V["keys"][MS["node_signer"]]["private_key"]), P)
        Q = MS["push"]
        self.assertEqual(fb.sync.push_request(Q["request"]["messages"], Q["request"]["for"]), Q["request"])
        self.assertEqual(Q["request"]["for"][Q["hash"]], Q["recipients"])
        self.assertEqual(len(Q["recipients"]), 2)
        self.assertFalse(fb.sync.answer_signed_by({**MS["push_answer"]["message"], "taken": []}, node_key))

    def test_discovery(self):
        self.assertEqual(fb.sync.well_known_errors(MS["discovery"]), [])
        self.assertEqual(fb.sync.announcement(MS["discovery"]), MS["announcement"])
        self.assertIn("challenge", MS["discovery"]["endpoints"])


class Cbor(unittest.TestCase):
    def test_compact_form(self):
        C = V["cbor"]
        signed = lambda c: {"hash": c["hash"], **c["block"], "signature": c["signature"]}  # noqa: E731
        for c in C["cases"]:
            with self.subTest(c["name"]):
                b = signed(c)
                self.assertEqual(fb.cbor.encode(b).hex(), c["cbor"])
                self.assertEqual(fb.cbor.encode(b, short=True).hex(), c["cbor_short"])
                self.assertEqual(fb.cbor.decode(bytes.fromhex(c["cbor"])), b)
                self.assertEqual(fb.cbor.decode(bytes.fromhex(c["cbor_short"])), b)
                blk = c["block"]
                self.assertEqual(fb.hash(blk["type"], blk["state"], blk["refs"]), c["hash"])
                self.assertEqual(len(fb.canonical(blk["type"], blk["state"], blk["refs"]).encode("utf-8")), c["canonical_bytes"])
        self.assertEqual(fb.cbor.decode(bytes.fromhex(C["loose"]["cbor"]))["hash"], C["loose"]["hash"])
        blocks = [signed(next(c for c in C["cases"] if c["hash"] == h)) for h in C["push"]["hashes"]]
        self.assertEqual(fb.cbor.encode_push(blocks).hex(), C["push"]["cbor"])
        self.assertEqual(fb.cbor.decode_push(bytes.fromhex(C["push"]["cbor_short"])), blocks)
        for h in C["headers"]:
            with self.subTest(h["name"]):
                self.assertEqual(fb.cbor.encode_header(h["header"]).hex(), h["cbor"])
                self.assertEqual(fb.cbor.decode_header(bytes.fromhex(h["cbor_short"])), h["header"])
        for r in C["refused"]:
            with self.subTest(r["name"]):
                with self.assertRaises(FoodBlockError):
                    fb.cbor.decode(bytes.fromhex(r["cbor"]))


class Door(unittest.TestCase):
    """One case per rule: call the op with `args`; `expect` is a subset match (exact: true, deep equality); `codes`
    compares the refusal codes of the returned list; `error` means the call must fail."""

    def test_door(self):
        for d in V["door"]:
            with self.subTest(d["name"]):
                try:
                    got = call(d["op"], *d["args"])
                except FoodBlockError as error:
                    want = d.get("error")
                    self.assertTrue(want, f"failed: {error}")
                    if want.get("code"):
                        self.assertEqual(error.code, want["code"])
                    if want.get("kind"):
                        self.assertEqual(error.kind, want["kind"])
                    continue
                self.assertFalse(d.get("error"), "the call must fail")
                if "codes" in d:
                    self.assertEqual(codes_of(got), d["codes"])
                elif d.get("exact"):
                    self.assertEqual(got, d["expect"])
                else:
                    self.assertTrue(subset(got, d["expect"]), f"got {got}")


class Package(unittest.TestCase):
    def test_core_carries_the_spec(self):
        """The Rust core carries protocol.json; it equals the repository's spec/ file. No other spec copy exists."""
        self.assertEqual(fb.PROTOCOL, load("spec", "protocol.json"), "the core's built-in copy differs from spec/")

    def test_version(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "pyproject.toml"), encoding="utf-8") as f:
            line = next(line for line in f if line.startswith("version"))
        self.assertTrue(line.split('"')[1].startswith(fb.VERSION + "."))


if __name__ == "__main__":
    unittest.main()

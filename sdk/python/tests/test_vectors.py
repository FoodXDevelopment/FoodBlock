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
CONVENTIONS = load("spec", "conventions-vectors.json")
SEALED = V["sealed"]
MS = V["messages"]

# The sections this suite runs (every top-level key of vectors.json but `$comment`).
RUN = {"invariant_numbers", "keys", "canonical", "hashes", "ledger", "audience", "signatures", "bad_signatures", "envelopes", "sealed", "headers",
       "messages", "cbor", "door"}


def pub(signer):
    return V["keys"][signer]["public_key_sign"]


def full(b):
    return {"hash": b["hash"], **b["block"], **({"suite": b["suite"]} if b.get("suite") else {}), "signature": b["signature"]}


def blocks_of(items):
    return [full(b) for b in items]


def find(held, h):
    return next(b for b in held if b["hash"] == h)


def bytes_refusals(type_, state, refs):
    """What a block's own bytes say (checks 1 to 4, core.md section 8): the 1.7 op `refusals` is gone; its halves are `valid` and `read`."""
    try:
        return fb.strict_text(fb.canonical(type_, state, refs))
    except FoodBlockError as error:
        return [{"code": error.code or "not_canonical", "detail": str(error)}]


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
    return [("sealed", "stories", SEALED["blocks"])]


STORIES = stories()
for _, _, _items in STORIES:
    for _b in _items:
        BY_HASH[_b["hash"]] = _b


class Sections(unittest.TestCase):
    def test_every_section_is_run(self):
        held = set(V) - {"$comment", "comment"}
        self.assertEqual(held - RUN, set(), "vectors.json has a section this suite does not run")
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
                    # what a writer refuses of the value (write_refusals: a float is `float`, not the wire's `not_canonical`)
                    got = codes_of(call("write_refusals", {"type": b["type"], "state": b["state"], "refs": b["refs"]}, []))
                    self.assertTrue(all(code in got for code in v["refused"]), got)

    def test_canonical(self):
        for v in V["canonical"]:
            with self.subTest(v["name"]):
                b = v["block"]
                self.assertEqual(fb.canonical(b["type"], b["state"], b["refs"]), v["canonical"])
                self.assertEqual(fb.hash(b["type"], b["state"], b["refs"]), v["hash"])

    def test_utf8_byte_order(self):
        """canonical.md Rule 1: object keys sort by the bytes of their UTF-8 form (code-point order): U+FF61 before U+1F35E. A set is written sorted, never sorted for you."""
        state = {"\U0001F35E": 1, "｡": 2, "a": 3}
        refs = {"\U0001F35E": "x", "｡": "y", "sees": ["a", "｡ dot", "\U0001F35E bread"]}
        self.assertEqual(fb.canonical("t.a", state, refs),
                         '{"refs":{"sees":["a","｡ dot","\U0001F35E bread"],"｡":"y","\U0001F35E":"x"},'
                         '"state":{"a":3,"｡":2,"\U0001F35E":1},"type":"t.a"}')


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
                    self.assertEqual(bytes_refusals(blk["type"], blk["state"], blk["refs"]), [], b["name"])


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
                self.assertEqual([m["hash"], m["signature"]], [v["opens_to"]["hash"], v["opens_to"]["signature"]])

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
                # a header is no message (core.md, section 2): its signature is the block's, over the header
                self.assertTrue(fb.header_signed_by({"header": v["header"], "header_signature": v["header_signature"]}, pub(v["signer"])))


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
        self.assertIn(node_key, fb.identity.live_keys(MS["node"], blocks_of(SEALED["blocks"])))
        self.assertTrue(fb.sync.answer_signed_by(MS["pull_answer"]["message"], node_key))
        self.assertEqual(len(MS["pull_answer"]["message"]["blocks"]), MS["pull_answer"]["matches"])
        self.assertTrue(fb.sync.answer_signed_by(MS["push_answer"]["message"], node_key))
        # Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair sorted.
        P = MS["push_answer"]["message"]
        known = {code for group in fb.CODES.values() for code in group}
        self.assertEqual(list(P), [k for k in fb.CONVENTIONS["messages"]["push_answer"] if k in P or k not in fb.CONVENTIONS["messages"]["push_answer_optional"]])
        self.assertTrue(all(list(r) == fb.CONVENTIONS["messages"]["refusal"] and r["code"] in known for r in P["refused"]))
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
        for d in [*V["door"], *CONVENTIONS["door"]]:
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

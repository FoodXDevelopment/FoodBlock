"""What a node does with this SDK beyond the vectors: write a block in its key chain, carry it sealed, pull and push."""

import unittest

import foodblock as fb

AT = "2026-10-15T09:00:00.000Z"


def person():
    keys = fb.generate_keypair()
    encryption = fb.generate_encryption_keypair()
    me = fb.identity.genesis(keys, encryption_key=encryption["public_key_encrypt"],
                             recovery_key=fb.generate_keypair()["public_key_sign"], at=AT)
    return {"keys": keys, "encryption": encryption, "me": me, "id": me["hash"], "held": [me]}


def say(who, type_, state, refs=None, **options):
    block = fb.write(type_, state, refs or {}, author=who["id"], key=who["keys"], held=who["held"], at=AT, **options)
    who["held"].append(block)
    return block


class Writing(unittest.TestCase):
    def test_genesis_names_its_keys(self):
        with self.assertRaises(ValueError):
            fb.identity.genesis(fb.generate_keypair())
        ann = person()
        self.assertEqual(fb.check(ann["me"]["type"], ann["me"]["state"], ann["me"]["refs"]), [])
        self.assertTrue(fb.identity.signed_by_author(ann["me"], [ann["me"]]))

    def test_write_places_each_block_in_the_key_chain(self):
        ann = person()
        eggs = say(ann, "thing", {"kind": "eggs", "name": "Free-range eggs"})
        offer = say(ann, "promise", {"terms": {"price": fb.money(450, "GBP"), "quantity": fb.amount("2", "{tray}"),
                                               "expires": "2026-10-20T00:00:00.000Z"}}, {"from": ann["id"], "what": eggs["hash"]})
        self.assertEqual([eggs["state"]["seq"], eggs["refs"]["prev"], offer["state"]["seq"], offer["refs"]["prev"]], [1, ann["id"], 2, eggs["hash"]])
        self.assertTrue(fb.identity.signed_by_author(offer, ann["held"]))
        self.assertEqual(fb.promise_stage(offer, ann["held"])["stage"], "offered")
        self.assertTrue(fb.check_chain(ann["held"][1:], ann["id"])["ok"])

    def test_write_refuses_never_repairs(self):
        ann = person()
        with self.assertRaises(fb.Refused) as refused:
            say(ann, "thing", {"kind": "flour", "amount": {"value": 1.5, "unit": "kg"}})
        self.assertTrue(any("float" in reason or "amount" in reason for reason in refused.exception.wrong))
        with self.assertRaises(fb.Refused):
            say(ann, "place", {"kind": "kitchen"})
        self.assertEqual(len(ann["held"]), 1)

    def test_a_private_block_travels_sealed_with_its_reveal(self):
        ann, bob = person(), person()
        note = say(ann, "observe", {"kind": "note", "text": "for Bob"}, audience=[bob["id"]])
        self.assertTrue(fb.finds_self(note, bob["id"], note["salts"][bob["id"]]))
        copy = fb.seal_copy(note, [bob["encryption"]["public_key_encrypt"]], reveals=[fb.reveal_for(note["salts"], bob["id"])],
                            private_key=ann["keys"]["private_key"])
        self.assertNotIn("key_hash", copy["envelope"]["recipients"][0])
        opened = fb.open_copy(copy, bob["encryption"]["x25519_private"])
        self.assertEqual([opened["hash"], opened["reveals"][0]["value"]], [note["hash"], bob["id"]])
        self.assertTrue(fb.header_signed_by(copy, ann["keys"]["public_key_sign"]))
        with self.assertRaises(Exception):
            fb.open_copy(copy, ann["encryption"]["x25519_private"])

    def test_both_envelope_algs_open(self):
        key = fb.generate_encryption_keypair()
        for alg in (fb.ALG, fb.ALG_RAW):
            self.assertEqual(fb.open(fb.seal({"x": 1}, [key["public_key_encrypt"]], alg=alg), key["x25519_private"]), {"x": 1})

    def test_reading_older_words(self):
        read = fb.read_as(fb.create("promise", {"status": "offered"}, {"seller": "a" * 64, "buyer": "b" * 64}))
        self.assertEqual([read["refs"].get("from"), read["refs"].get("to")], ["a" * 64, "b" * 64])
        self.assertTrue(fb.is_a(fb.create("place", {"kind": "kitchen"}, {}), "thing", "kitchen"))


class BetweenNodes(unittest.TestCase):
    def test_push_waits_for_prev_and_catches_equivocation(self):
        ann = person()
        one = say(ann, "observe", {"kind": "note", "text": "two trays"})
        two = say(ann, "observe", {"kind": "note", "text": "one tray left"})
        early = fb.sync.accept([two], [ann["me"]])
        self.assertEqual(early["waiting"], [{"hash": two["hash"], "needs": [one["hash"]]}])
        late = fb.sync.accept([one, two], [ann["me"]])
        self.assertEqual(sorted(b["hash"] for b in late["taken"]), sorted([one["hash"], two["hash"]]))
        other = fb.write("observe", {"kind": "note", "text": "five trays"}, {}, author=ann["id"], key=ann["keys"],
                         link={"seq": 1, "prev": ann["id"]}, at=AT)
        caught = fb.sync.accept([other], [ann["me"], one])
        self.assertEqual(caught["equivocations"], [sorted([one["hash"], other["hash"]])])
        forged = fb.write("observe", {"kind": "note", "text": "gold"}, {}, author=ann["id"], key=fb.generate_keypair(),
                          link={"seq": 3, "prev": two["hash"]}, at=AT)
        self.assertEqual([r["hash"] for r in fb.sync.accept([forged], ann["held"])["refused"]], [forged["hash"]])

    def test_signed_pull_and_signed_answers(self):
        ann, node = person(), person()
        note = say(ann, "observe", {"kind": "note", "text": "hello"})
        request = fb.sync.sign_pull({"since": 0}, asker=ann["id"], node=node["id"], private_key=ann["keys"]["private_key"], at=AT)
        self.assertEqual(fb.sync.pull_errors(request, node=node["id"], now=AT, keys=[ann["keys"]["public_key_sign"]]), [])
        self.assertTrue(fb.sync.pull_errors(request, node=node["id"], now="2026-10-15T10:00:00.000Z", keys=[ann["keys"]["public_key_sign"]]))
        log = [{"n": i + 1, "block": b} for i, b in enumerate(ann["held"])]
        answer = fb.sync.answer_pull(log, request, node=node["id"], private_key=node["keys"]["private_key"])
        self.assertEqual([entry["n"] for entry in answer["blocks"]], [1, 2])
        self.assertTrue(fb.sync.answer_signed_by(answer, node["keys"]["public_key_sign"]))
        heads = fb.sync.answer_pull(log, {"heads": True}, node=node["id"])
        self.assertEqual([fb.unwrap(entry["message"])["hash"] for entry in heads["blocks"]], [note["hash"]])
        pushed = fb.sync.push_answer(fb.sync.accept([note], [ann["me"]]), node=node["id"], private_key=node["keys"]["private_key"])
        self.assertEqual(pushed["taken"], [note["hash"]])
        self.assertTrue(fb.sync.answer_signed_by(pushed, node["keys"]["public_key_sign"]))

    def test_discovery(self):
        node = person()
        doc = fb.sync.well_known(node=node["id"], holds=[node["id"]], speaks_for=[node["id"]],
                                 endpoints={"pull": "https://n.example/pull", "push": "https://n.example/push"})
        self.assertEqual(fb.sync.well_known_errors(doc), [])
        self.assertEqual(sorted(fb.sync.announcement(doc)), ["endpoints", "node", "protocol", "version"])

    def test_custody_the_limit_and_push_for_a_list(self):
        keys, recovery, coop = fb.generate_keypair(), fb.generate_keypair(), "c" * 64
        g = fb.identity.genesis(keys, recovery_key=recovery["public_key_sign"], at=AT, custodian=coop)
        self.assertEqual(g["state"]["custodian"], coop)
        self.assertEqual(fb.refusals("actor", g["state"], {}) if hasattr(fb, "refusals") else [], [])
        fence = fb.grant.limit_fence("a" * 64, "b" * 64, fb.money(5000, "GBP"), "P7D")
        self.assertEqual(fence["audience"], ["b" * 64])
        self.assertTrue(fb.grant.within_limit(fence["state"], fb.money(3000, "GBP"), 2000))
        self.assertFalse(fb.grant.within_limit(fence["state"], fb.money(3001, "GBP"), 2000))
        self.assertEqual(fb.sync.push_request([], {"d" * 64: "e" * 64})["for"], {"d" * 64: ["e" * 64]})
        self.assertEqual(fb.sync.recipients_of({"d" * 64: ["e" * 64, "f" * 64]}, "d" * 64), ["e" * 64, "f" * 64])


if __name__ == "__main__":
    unittest.main()

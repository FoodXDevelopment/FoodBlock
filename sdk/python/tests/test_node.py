"""What a node does with this SDK beyond the vectors: write a block in its key chain, carry it sealed, pull and push."""

import unittest

import foodblock as fb

AT = "2026-10-15T09:00:00.000Z"


def person():
    keys = fb.generate_keypair()
    encryption = fb.generate_encryption_keypair()
    me = fb.identity.genesis(keys, kind="person", at=AT, audience="public", encryption_key=encryption["public_key_encrypt"],
                             recovery_key=fb.generate_keypair()["public_key_sign"], reach="P30D")
    return {"keys": keys, "encryption": encryption, "me": me, "id": me["hash"], "held": [me]}


def say(who, type_, state, refs=None, audience="public", **options):
    block = fb.write(type_, state, refs or {}, author=who["id"], key=who["keys"], held=who["held"], at=AT, audience=audience, **options)
    who["held"].append(block)
    return block


class Writing(unittest.TestCase):
    def test_genesis_names_its_keys(self):
        keys = fb.generate_keypair()
        self.assertEqual(fb.identity.genesis(keys, kind="person", at=AT, audience="public")["state"]["audience"], "public")  # kind, at, audience and the key are enough
        listed = fb.identity.genesis(keys, kind="person", at=AT, audience=["a" * 64])  # a list audience carries its salts
        self.assertIn("salts", listed)
        with self.assertRaises(ValueError):  # the recovery key and its reach come as a pair
            fb.identity.genesis(keys, kind="person", at=AT, audience="public", recovery_key=fb.generate_keypair()["public_key_sign"])
        for missing in ("kind", "at", "audience"):  # nothing is filled in
            given = {"kind": "person", "at": AT, "audience": "public"}
            del given[missing]
            with self.assertRaises(fb.FoodBlockError, msg=missing):
                fb.identity.genesis(keys, **given)
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

    def test_write_and_compose_fill_nothing(self):
        ann = person()
        for given in ({"at": AT}, {"audience": "public"}, {"audience": [], "at": AT}):  # no audience, no at, an empty audience
            with self.assertRaises(fb.FoodBlockError, msg=str(given)):
                fb.write("observe", {"kind": "note", "text": "x"}, {}, author=ann["id"], key=ann["keys"], held=ann["held"], **given)
            with self.assertRaises(fb.FoodBlockError, msg=str(given)):
                fb.compose("observe", {"kind": "note", "text": "x"}, {}, author=ann["id"], **given)
        self.assertNotIn("version", fb.wrap(say(ann, "observe", {"kind": "note", "text": "y"})))

    def test_key_grant_needs_its_time(self):
        keys, new = fb.generate_keypair(), fb.generate_keypair()
        g = fb.identity.genesis(keys, kind="person", at=AT, audience="public")
        signer = {"private_key": keys["private_key"], "last": None, "brought_in": g["hash"]}
        with self.assertRaises(fb.FoodBlockError):
            fb.identity.key_grant(g["hash"], new["public_key_sign"], signer)

    def test_arrivals_need_the_readers_choice(self):
        ann = person()
        arrivals = {ann["id"]: AT}
        with self.assertRaises(fb.FoodBlockError):
            fb.identity.keys_of(ann["id"], ann["held"], arrivals)
        self.assertEqual(fb.identity.keys_of(ann["id"], ann["held"], arrivals, "inside"), [ann["keys"]["public_key_sign"]])

    def test_write_refuses_never_repairs(self):
        ann = person()
        with self.assertRaises(fb.Refused) as refused:
            say(ann, "thing", {"kind": "flour", "amount": {"value": 1.5, "unit": "kg"}})
        self.assertTrue(any("float" in reason or "amount" in reason for reason in refused.exception.wrong))
        with self.assertRaises(fb.Refused):
            say(ann, "thing", {"kind": "kitchen", "note": None})
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

    def test_a_passkey_challenge_is_the_blocks_id(self):
        import base64
        keys = fb.generate_keypair("p256")
        block = fb.create("thing", {"kind": "eggs"}, {}, "p256")
        want = base64.urlsafe_b64encode(bytes.fromhex(block["hash"])).decode().rstrip("=")
        self.assertEqual(fb.passkey_challenge(block), want)
        with self.assertRaises(Exception):
            fb.passkey_signature("zz", "00", "00")
        self.assertFalse(fb.verify(block, "00" * 64 + "0025" + "00" * 200, keys["public_key_sign"]))

    def test_every_suite_signs_seals_and_hashes(self):
        for suite in fb.SUITES:
            with self.subTest(suite):
                keys, enc = fb.generate_keypair(suite), fb.generate_encryption_keypair(suite)
                self.assertEqual(fb.suite_of_key(keys["public_key_sign"]), suite)
                block = fb.create("thing", {"kind": "eggs"}, {}, suite)
                self.assertEqual(block["hash"], fb.hash("thing", {"kind": "eggs"}, {}, suite))
                self.assertTrue(fb.verify(block, fb.sign(block, keys["private_key"], suite), keys["public_key_sign"]))
                self.assertEqual(fb.open(fb.seal({"x": 1}, [enc["public_key_encrypt"]], suite), enc["x25519_private"]), {"x": 1})

    def test_year_zero_has_no_old_readers(self):
        for gone in ("read_as", "is_a", "ALIASES", "ALG_RAW", "PROFILES"):
            self.assertFalse(hasattr(fb, gone), gone)
        self.assertIn("micro", fb.PEERS)


class BetweenNodes(unittest.TestCase):
    def test_push_waits_for_prev_and_catches_equivocation(self):
        ann = person()
        one = say(ann, "observe", {"kind": "note", "text": "two trays"})
        two = say(ann, "observe", {"kind": "note", "text": "one tray left"})
        early = fb.sync.accept([two], [ann["me"]], False)
        self.assertEqual(early["waiting"], [{"hash": two["hash"], "needs": [one["hash"]]}])
        late = fb.sync.accept([one, two], [ann["me"]], False)
        self.assertEqual(sorted(b["hash"] for b in late["taken"]), sorted([one["hash"], two["hash"]]))
        other = fb.write("observe", {"kind": "note", "text": "five trays"}, {}, author=ann["id"], key=ann["keys"],
                         link={"seq": 1, "prev": ann["id"]}, at=AT, audience="public")
        caught = fb.sync.accept([other], [ann["me"], one], False)
        self.assertEqual(caught["equivocations"], [sorted([one["hash"], other["hash"]])])
        forged = fb.write("observe", {"kind": "note", "text": "gold"}, {}, author=ann["id"], key=fb.generate_keypair(),
                          link={"seq": 3, "prev": two["hash"]}, at=AT, audience="public")
        self.assertEqual([r["hash"] for r in fb.sync.accept([forged], ann["held"], False)["refused"]], [forged["hash"]])

    def test_a_node_states_its_choices(self):
        ann, node = person(), person()
        note = say(ann, "observe", {"kind": "note", "text": "hi"})
        other = fb.write("observe", {"kind": "note", "text": "other"}, {}, author=ann["id"], key=ann["keys"],
                         link={"seq": 1, "prev": ann["id"]}, at=AT, audience="public")
        pair = [note, other]
        self.assertEqual(fb.sync.accept(pair, [ann["me"]], False)["taken"], [])
        self.assertEqual(len(fb.sync.accept(pair, [ann["me"]], True)["taken"]), 2)
        with self.assertRaises(TypeError):  # takes_pairs is not filled in
            fb.sync.accept(pair, [ann["me"]])
        with self.assertRaises(fb.FoodBlockError):
            fb.sync.accept(pair, [ann["me"]], None)
        log = [{"n": 1, "block": note}]
        for cap, pairs in ((None, True), (0, True), (500, None)):
            with self.assertRaises(fb.FoodBlockError, msg=str((cap, pairs))):
                fb.sync.answer_pull(log, {"since": 0}, node["id"], None, cap, pairs)
        with self.assertRaises(fb.FoodBlockError):  # accept_sealed refuses a missing choice too
            fb.sync.accept_sealed([], [], None)
        with self.assertRaises(TypeError):
            fb.sync.admission_refusals(note, ann["id"], [])
        with self.assertRaises(fb.FoodBlockError):  # admission null is stated; strangers_today missing is not
            fb.sync.admission_refusals(note, ann["id"], [], None, None)

    def test_signed_pull_and_signed_answers(self):
        ann, node = person(), person()
        note = say(ann, "observe", {"kind": "note", "text": "hello"})
        key = [ann["keys"]["public_key_sign"]]
        request = fb.sync.sign_pull({"since": 0}, signer=ann["id"], node=node["id"], private_key=ann["keys"]["private_key"], counter=5)
        self.assertNotIn("at", request)
        self.assertEqual(fb.sync.pull_refusals(request, node=node["id"], keys=key, highest=4), [])
        self.assertTrue(fb.sync.pull_refusals(request, node=node["id"], keys=key, highest=5))
        challenge = fb.sync.new_challenge()
        asked = fb.sync.sign_pull({"since": 0}, signer=ann["id"], node=node["id"], private_key=ann["keys"]["private_key"], challenge=challenge)
        self.assertEqual(fb.sync.pull_refusals(asked, node=node["id"], keys=key, issued=[challenge]), [])
        self.assertTrue(fb.sync.pull_refusals(asked, node=node["id"], keys=key, issued=[]))
        log = [{"n": i + 1, "block": b} for i, b in enumerate(ann["held"])]
        answer = fb.sync.answer_pull(log, request, node=node["id"], private_key=node["keys"]["private_key"], cap=500, serves_pairs=True)
        self.assertEqual([entry["n"] for entry in answer["blocks"]], [1, 2])
        self.assertTrue(fb.sync.answer_signed_by(answer, node["keys"]["public_key_sign"]))
        heads = fb.sync.answer_pull(log, {"heads": True}, node["id"], None, 500, True)
        self.assertEqual([fb.unwrap(entry["message"])["hash"] for entry in heads["blocks"]], [note["hash"]])
        pushed = fb.sync.push_answer(fb.sync.accept([note], [ann["me"]], False), node=node["id"], private_key=node["keys"]["private_key"])
        self.assertEqual(pushed["taken"], [note["hash"]])
        self.assertTrue(fb.sync.answer_signed_by(pushed, node["keys"]["public_key_sign"]))

    def test_discovery(self):
        node = person()
        doc = fb.sync.well_known(node=node["id"], holds=[node["id"]], speaks_for=[node["id"]], admission=None,
                                 endpoints={"pull": "https://n.example/pull", "push": "https://n.example/push"})
        self.assertEqual(fb.sync.well_known_errors(doc), [])
        self.assertEqual(sorted(fb.sync.announcement(doc)), ["endpoints", "node", "protocol", "version"])

    def test_custody_the_limit_and_push_for_a_list(self):
        keys, recovery, coop = fb.generate_keypair(), fb.generate_keypair(), "c" * 64
        g = fb.identity.genesis(keys, kind="person", at=AT, audience="public", recovery_key=recovery["public_key_sign"], reach="P30D", custodian=coop)
        self.assertEqual(g["state"]["custodian"], coop)
        self.assertEqual(fb.refusals("actor", g["state"], {}), [])
        fence = fb.grant.limit_fence("a" * 64, "b" * 64, fb.money(5000, "GBP"), "P7D")
        self.assertEqual(fence["audience"], ["b" * 64])
        self.assertTrue(fb.grant.within_limit(fence["state"], fb.money(3000, "GBP"), 2000))
        self.assertFalse(fb.grant.within_limit(fence["state"], fb.money(3001, "GBP"), 2000))
        # a sealed limit: the grant carries the commitment, the observe carries the salt that opens it
        salt = "ab" * 16
        commitment = fb.grant.limit_commitment(fb.money(5000, "GBP"), "P7D", salt)
        grant = fb.write("grant", {"kind": "authority", "scope": {"acts": ["transfer"], "limit_commitment": commitment, "until": "2027-01-01T00:00:00.000Z"}}, {"to": "b" * 64}, author=g["hash"], key=keys, held=[g], at=AT, audience="public")
        sealed = fb.grant.limit_fence(grant["hash"], "b" * 64, fb.money(5000, "GBP"), "P7D", salt)
        observe = {"hash": "c" * 64, "type": "observe", "state": sealed["state"], "refs": sealed["refs"]}
        self.assertTrue(fb.grant.limit_opens(grant, observe))
        self.assertFalse(fb.grant.limit_opens(grant, {**observe, "state": {**observe["state"], "limit": fb.money(9000, "GBP")}}))
        self.assertEqual(fb.sync.push_request([], {"d" * 64: ["e" * 64]})["for"], {"d" * 64: ["e" * 64]})
        self.assertEqual(fb.sync.recipients_of({"d" * 64: ["e" * 64, "f" * 64]}, "d" * 64), ["e" * 64, "f" * 64])

    def test_large_content_merkle(self):
        chunks = [x * 8 for x in ["00", "11", "22", "33", "44"]]
        root = fb.merkle.root(chunks)
        block = {"type": "thing", "state": {"kind": "stream", "marks": [{"scheme": "merkle", "value": root}], "chunks": 5}, "refs": {}}
        self.assertTrue(fb.merkle.verify(block, chunks[4], 4, fb.merkle.proof(chunks, 4)))
        self.assertFalse(fb.merkle.verify({**block, "state": {**block["state"], "chunks": 6}}, chunks[4], 4, fb.merkle.proof(chunks, 4)))


if __name__ == "__main__":
    unittest.main()

"""Tests for all implementation fixes in the Python SDK."""

import pytest
import asyncio
from foodblock import (
    create, update, merge_update, compute_hash, canonical,
    generate_keypair, sign, verify,
    chain, head,
    encrypt, decrypt, generate_encryption_keypair,
    create_agent, create_draft, approve_draft, load_agent,
    tombstone,
    PROTOCOL_VERSION,
)


# ============================================================
# Fix 2: Cross-language signing (raw 32-byte Ed25519 keys)
# ============================================================
class TestFix2RawKeys:
    def test_keypair_returns_32_byte_hex(self):
        keys = generate_keypair()
        assert len(keys["public_key"]) == 64   # 32 bytes = 64 hex chars
        assert len(keys["private_key"]) == 64

    def test_sign_verify_roundtrip(self):
        keys = generate_keypair()
        block = create("test", {"data": "hello"})
        actor = create("actor.foodie", {"name": "User"})

        wrapper = sign(block, actor["hash"], keys["private_key"])
        assert verify(wrapper, keys["public_key"])

    def test_reject_tampered(self):
        keys = generate_keypair()
        block = create("test", {"data": "hello"})
        wrapper = sign(block, "author_hash", keys["private_key"])

        wrapper["foodblock"] = create("test", {"data": "tampered"})
        assert not verify(wrapper, keys["public_key"])

    def test_reject_wrong_key(self):
        keys1 = generate_keypair()
        keys2 = generate_keypair()
        block = create("test", {"x": 1})
        wrapper = sign(block, "author", keys1["private_key"])
        assert not verify(wrapper, keys2["public_key"])


# ============================================================
# Fix 12: head() cycle detection and depth limit
# ============================================================
class TestFix12HeadCycleDetection:
    def test_head_of_genesis(self):
        v1 = create("test", {"v": 1})

        async def resolve_forward(h):
            return []

        result = asyncio.run(head(v1["hash"], resolve_forward))
        assert result == v1["hash"]

    def test_finds_head_of_chain(self):
        v1 = create("test", {"v": 1})
        v2 = create("test", {"v": 2}, {"updates": v1["hash"]})
        v3 = create("test", {"v": 3}, {"updates": v2["hash"]})

        forward = {}
        for b in [v1, v2, v3]:
            upd = b.get("refs", {}).get("updates")
            if upd:
                forward.setdefault(upd, []).append(b)

        async def resolve_forward(h):
            return forward.get(h, [])

        result = asyncio.run(head(v1["hash"], resolve_forward))
        assert result == v3["hash"]

    def test_respects_max_depth(self):
        blocks = [create("test", {"v": 0})]
        for i in range(1, 11):
            blocks.append(create("test", {"v": i}, {"updates": blocks[-1]["hash"]}))

        forward = {}
        for b in blocks:
            upd = b.get("refs", {}).get("updates")
            if upd:
                forward.setdefault(upd, []).append(b)

        async def resolve_forward(h):
            return forward.get(h, [])

        result = asyncio.run(head(blocks[0]["hash"], resolve_forward, max_depth=3))
        assert result == blocks[3]["hash"]

    def test_cycle_detection(self):
        a = {"hash": "aaa", "type": "test", "state": {}, "refs": {}}
        b = {"hash": "bbb", "type": "test", "state": {}, "refs": {"updates": "aaa"}}

        async def resolve_forward(h):
            if h == "aaa":
                return [b]
            if h == "bbb":
                return [{"hash": "aaa", "type": "test", "state": {}, "refs": {"updates": "bbb"}}]
            return []

        # Should terminate, not hang
        result = asyncio.run(head("aaa", resolve_forward))
        assert result in ("aaa", "bbb")


# ============================================================
# Fix 10: merge_update
# ============================================================
class TestFix10MergeUpdate:
    def test_merges_state_changes(self):
        original = create("substance.product", {"name": "Bread", "price": 4.0, "organic": True})
        updated = merge_update(original, {"price": 5.0})

        assert updated["state"]["name"] == "Bread"
        assert updated["state"]["price"] == 5.0
        assert updated["state"]["organic"] is True
        assert updated["refs"]["updates"] == original["hash"]

    def test_new_fields_override(self):
        original = create("test", {"a": 1, "b": 2})
        updated = merge_update(original, {"b": 99, "c": 3})

        assert updated["state"]["a"] == 1
        assert updated["state"]["b"] == 99
        assert updated["state"]["c"] == 3

    def test_preserves_additional_refs(self):
        original = create("test", {"x": 1}, {"author": "abc"})
        updated = merge_update(original, {"x": 2}, {"reviewer": "def"})

        assert updated["refs"]["updates"] == original["hash"]
        assert updated["refs"]["reviewer"] == "def"

    def test_raises_on_missing_block(self):
        with pytest.raises(ValueError, match="previous_block"):
            merge_update(None)

        with pytest.raises(ValueError, match="previous_block"):
            merge_update({})


# ============================================================
# Fix 4: omitNulls handles arrays
# ============================================================
class TestFix4OmitNullsArrays:
    def test_strips_none_from_state(self):
        block = create("test", {"a": 1, "b": None})
        assert "b" not in block["state"]

    def test_strips_none_from_nested(self):
        block = create("test", {
            "detected": [
                {"item": "Eggs", "spoiled": None},
                {"item": "Milk", "freshness": 0.9}
            ]
        })
        assert "spoiled" not in block["state"]["detected"][0]
        assert block["state"]["detected"][1]["freshness"] == 0.9


# ============================================================
# Fix 14: Encryption
# ============================================================
class TestFix14Encryption:
    def test_keypair_returns_32_byte_hex(self):
        keys = generate_encryption_keypair()
        assert len(keys["public_key"]) == 64
        assert len(keys["private_key"]) == 64

    def test_encrypt_decrypt_roundtrip(self):
        keys = generate_encryption_keypair()
        secret = {"ingredient": "Secret Sauce", "recipe_id": 42}

        envelope = encrypt(secret, [keys["public_key"]])

        assert envelope["alg"] == "x25519-aes-256-gcm"
        assert len(envelope["recipients"]) == 1
        assert envelope["ciphertext"]
        assert envelope["nonce"]
        assert len(envelope["ephemeral_key"]) == 64

        decrypted = decrypt(envelope, keys["private_key"], keys["public_key"])
        assert decrypted == secret

    def test_multiple_recipients(self):
        keys1 = generate_encryption_keypair()
        keys2 = generate_encryption_keypair()

        data = {"secret": "shared"}
        envelope = encrypt(data, [keys1["public_key"], keys2["public_key"]])

        assert len(envelope["recipients"]) == 2

        d1 = decrypt(envelope, keys1["private_key"], keys1["public_key"])
        d2 = decrypt(envelope, keys2["private_key"], keys2["public_key"])
        assert d1 == data
        assert d2 == data

    def test_wrong_key_cannot_decrypt(self):
        keys1 = generate_encryption_keypair()
        keys2 = generate_encryption_keypair()

        envelope = encrypt({"x": 1}, [keys1["public_key"]])
        with pytest.raises(ValueError, match="no matching recipient"):
            decrypt(envelope, keys2["private_key"], keys2["public_key"])

    def test_various_value_types(self):
        keys = generate_encryption_keypair()

        # String
        e1 = encrypt("hello", [keys["public_key"]])
        assert decrypt(e1, keys["private_key"], keys["public_key"]) == "hello"

        # Number
        e2 = encrypt(42, [keys["public_key"]])
        assert decrypt(e2, keys["private_key"], keys["public_key"]) == 42

        # Array
        e3 = encrypt([1, 2, 3], [keys["public_key"]])
        assert decrypt(e3, keys["private_key"], keys["public_key"]) == [1, 2, 3]


# ============================================================
# Fix 3: Canonical number edge cases
# ============================================================
class TestFix3CanonicalNumbers:
    def test_minus_zero(self):
        c = canonical("test", {"val": -0.0}, {})
        assert ":0" in c or ":0.0" in c
        assert "-0" not in c

    def test_integer(self):
        c = canonical("test", {"val": 42}, {})
        assert "42" in c

    def test_float(self):
        c = canonical("test", {"val": 3.14}, {})
        assert "3.14" in c

    def test_large_integer(self):
        c = canonical("test", {"val": 999999999999}, {})
        assert "999999999999" in c


# ============================================================
# Tombstone
# ============================================================
class TestTombstone:
    def test_creates_tombstone(self):
        target = create("substance.product", {"name": "Bread"})
        t = tombstone(target["hash"], "user_abc", "gdpr_erasure")

        assert t["type"] == "observe.tombstone"
        assert t["refs"]["target"] == target["hash"]
        assert t["refs"]["updates"] == target["hash"]
        assert t["state"]["reason"] == "gdpr_erasure"
        assert t["state"]["requested_by"] == "user_abc"


# ============================================================
# Protocol version
# ============================================================
class TestProtocolVersion:
    def test_version_format(self):
        assert PROTOCOL_VERSION.startswith("0.4")


# ============================================================
# Chain traversal
# ============================================================
class TestChainTraversal:
    def test_chain_traversal(self):
        v1 = create("test", {"v": 1})
        v2 = update(v1["hash"], "test", {"v": 2})
        v3 = update(v2["hash"], "test", {"v": 3})

        store = {v1["hash"]: v1, v2["hash"]: v2, v3["hash"]: v3}

        async def resolve(h):
            return store.get(h)

        result = asyncio.run(chain(v3["hash"], resolve))
        assert len(result) == 3
        assert result[0]["hash"] == v3["hash"]
        assert result[2]["hash"] == v1["hash"]

    def test_chain_max_depth(self):
        blocks = [create("test", {"v": 0})]
        for i in range(1, 11):
            blocks.append(update(blocks[-1]["hash"], "test", {"v": i}))

        store = {b["hash"]: b for b in blocks}

        async def resolve(h):
            return store.get(h)

        result = asyncio.run(chain(blocks[-1]["hash"], resolve, max_depth=5))
        assert len(result) == 5

"""Test FoodBlock Python SDK against cross-language test vectors."""

import json
import os
import pytest
from foodblock import create, update, compute_hash, canonical, generate_keypair, sign, verify


VECTORS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "test", "vectors.json")


def load_vectors():
    with open(VECTORS_PATH) as f:
        return json.load(f)


class TestCanonical:
    def test_sorts_keys(self):
        result = canonical("test", {"b": 2, "a": 1}, {})
        assert result.index('"a"') < result.index('"b"')

    def test_sorts_refs_arrays(self):
        result = canonical("test", {}, {"inputs": ["zzz", "aaa", "mmm"]})
        assert result.index('"aaa"') < result.index('"mmm"')
        assert result.index('"mmm"') < result.index('"zzz"')

    def test_preserves_state_arrays(self):
        result = canonical("test", {"items": ["zzz", "aaa"]}, {})
        assert result.index('"zzz"') < result.index('"aaa"')

    def test_no_whitespace(self):
        result = canonical("test", {"a": 1, "b": "hello"}, {"c": "ref"})
        assert " " not in result
        assert "\n" not in result

    def test_omits_nulls(self):
        result = canonical("test", {"a": 1, "b": None}, {})
        assert '"b"' not in result


class TestCreate:
    def test_genesis_block(self):
        block = create("actor.producer", {"name": "Test Farm"})
        assert block["type"] == "actor.producer"
        assert block["state"] == {"name": "Test Farm"}
        assert block["refs"] == {}
        assert len(block["hash"]) == 64

    def test_deterministic(self):
        a = create("substance.product", {"name": "Bread", "price": 4.5}, {"seller": "abc"})
        b = create("substance.product", {"name": "Bread", "price": 4.5}, {"seller": "abc"})
        assert a["hash"] == b["hash"]

    def test_different_content_different_hash(self):
        a = create("substance.product", {"name": "Bread"})
        b = create("substance.product", {"name": "Cake"})
        assert a["hash"] != b["hash"]

    def test_key_order_independence(self):
        a = create("test", {"a": 1, "b": 2})
        b = create("test", {"b": 2, "a": 1})
        assert a["hash"] == b["hash"]

    def test_refs_array_order_independence(self):
        fixed_id = "fixed-id-for-test"
        a = create("transform.process", {"instance_id": fixed_id}, {"inputs": ["abc", "def"]})
        b = create("transform.process", {"instance_id": fixed_id}, {"inputs": ["def", "abc"]})
        assert a["hash"] == b["hash"]

    def test_state_array_order_matters(self):
        a = create("observe.post", {"content_order": ["abc", "def"]})
        b = create("observe.post", {"content_order": ["def", "abc"]})
        assert a["hash"] != b["hash"]

    def test_all_base_types(self):
        types = [
            ("actor.producer", {"name": "Farm"}),
            ("place.farm", {"name": "Field"}),
            ("substance.product", {"name": "Bread"}),
            ("transform.process", {"name": "Baking"}),
            ("transfer.order", {"quantity": 2}),
            ("observe.review", {"rating": 5}),
        ]
        for type_, state in types:
            block = create(type_, state)
            assert len(block["hash"]) == 64


class TestUpdate:
    def test_creates_update_ref(self):
        original = create("substance.product", {"name": "Bread", "price": 4.5})
        updated = update(original["hash"], "substance.product", {"name": "Bread", "price": 5.0})
        assert updated["refs"]["updates"] == original["hash"]
        assert updated["hash"] != original["hash"]


class TestSignVerify:
    def test_sign_and_verify(self):
        keys = generate_keypair()
        block = create("substance.product", {"name": "Test"})
        actor = create("actor.foodie", {"name": "User"})

        wrapper = sign(block, actor["hash"], keys["private_key"])
        assert verify(wrapper, keys["public_key"])

    def test_reject_tampered(self):
        keys = generate_keypair()
        block = create("substance.product", {"name": "Test"})
        actor = create("actor.foodie", {"name": "User"})

        wrapper = sign(block, actor["hash"], keys["private_key"])
        wrapper["foodblock"] = create("substance.product", {"name": "Tampered"})
        assert not verify(wrapper, keys["public_key"])


class TestVectors:
    """Cross-language compatibility: Python must produce same hashes as JavaScript."""

    def test_all_vectors(self):
        vectors = load_vectors()
        for v in vectors:
            block = create(v["type"], v["state"], v["refs"])
            assert block["hash"] == v["expected_hash"], (
                f"Vector '{v['name']}' failed: expected {v['expected_hash']}, got {block['hash']}"
            )

    def test_all_canonical_forms(self):
        vectors = load_vectors()
        for v in vectors:
            result = canonical(v["type"], v["state"], v["refs"])
            assert result == v["expected_canonical"], (
                f"Canonical '{v['name']}' failed: expected {v['expected_canonical']}, got {result}"
            )

"""Tests for advanced FoodBlock Python SDK modules.

Covers: vocabulary, merge, merkle, snapshot, attestation, template, federation.
"""

import pytest

from foodblock import (
    create,
    create_vocabulary, map_fields, VOCABULARIES,
    detect_conflict, merge, auto_merge,
    merkleize, selective_disclose, verify_proof,
    create_snapshot, verify_snapshot, summarize,
    attest, dispute, trace_attestations, trust_score,
    create_template, from_template, TEMPLATES,
    well_known,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_store(*blocks):
    """Build an in-memory hash -> block lookup from a list of blocks."""
    index = {b["hash"]: b for b in blocks}
    return lambda h: index.get(h)


# ---------------------------------------------------------------------------
# Vocabulary tests
# ---------------------------------------------------------------------------

class TestVocabulary:
    def test_vocabularies_has_fourteen_entries(self):
        assert len(VOCABULARIES) == 14
        expected_keys = {
            "bakery", "restaurant", "farm", "retail", "lot", "units", "workflow",
            "distributor", "processor", "market", "catering", "fishery", "dairy", "butcher",
        }
        assert set(VOCABULARIES.keys()) == expected_keys

    def test_create_vocabulary(self):
        vocab = create_vocabulary("bakery", ["substance.product"], {
            "name": {
                "type": "string",
                "required": True,
                "aliases": ["called", "named"],
                "description": "Product name",
            },
            "price": {
                "type": "number",
                "required": False,
                "aliases": ["costs", "priced at", "$"],
                "description": "Price",
            },
        })
        assert vocab["type"] == "observe.vocabulary"
        assert vocab["state"]["domain"] == "bakery"
        assert "name" in vocab["state"]["fields"]
        assert "price" in vocab["state"]["fields"]
        assert len(vocab["hash"]) == 64

    def test_map_fields_extracts_fields(self):
        vocab = create_vocabulary("bakery", ["substance.product"], {
            "name": {
                "type": "string",
                "required": True,
                "aliases": ["called", "named"],
                "description": "Product name",
            },
            "price": {
                "type": "number",
                "required": False,
                "aliases": ["costs", "priced at", "$"],
                "description": "Price",
            },
        })
        result = map_fields("sourdough bread priced at 4.50", vocab)
        assert "price" in result["matched"]
        assert result["matched"]["price"] == 4.5


# ---------------------------------------------------------------------------
# Merge tests
# ---------------------------------------------------------------------------

class TestMerge:
    def _make_fork(self):
        """Create a forked chain: original -> (v_a, v_b)."""
        original = create("substance.product", {"name": "Bread", "price": 4.0})
        # Two independent updates from the same ancestor
        from foodblock import update
        v_a = update(original["hash"], "substance.product", {"name": "Bread", "price": 5.0})
        v_b = update(original["hash"], "substance.product", {"name": "Bread", "price": 6.0})
        store = _make_store(original, v_a, v_b)
        return original, v_a, v_b, store

    def test_detect_conflict_finds_fork(self):
        original, v_a, v_b, store = self._make_fork()
        result = detect_conflict(v_a["hash"], v_b["hash"], store)
        assert result["is_conflict"] is True
        assert result["common_ancestor"] == original["hash"]

    def test_merge_manual_strategy(self):
        original, v_a, v_b, store = self._make_fork()
        merged = merge(
            v_a["hash"], v_b["hash"], store,
            state={"name": "Bread", "price": 5.5},
            strategy="manual",
        )
        assert merged["type"] == "observe.merge"
        assert merged["state"]["name"] == "Bread"
        assert merged["state"]["price"] == 5.5
        assert merged["refs"]["merge_a"] == v_a["hash"]
        assert merged["refs"]["merge_b"] == v_b["hash"]

    def test_merge_a_wins(self):
        original, v_a, v_b, store = self._make_fork()
        merged = merge(v_a["hash"], v_b["hash"], store, strategy="a_wins")
        assert merged["state"]["price"] == 5.0

    def test_auto_merge_lww(self):
        """auto_merge without vocabulary falls back to A-wins-on-conflict."""
        original, v_a, v_b, store = self._make_fork()
        merged = auto_merge(v_a["hash"], v_b["hash"], store)
        assert merged["type"] == "observe.merge"
        # A wins for conflicting keys
        assert merged["state"]["price"] == 5.0


# ---------------------------------------------------------------------------
# Merkle tests
# ---------------------------------------------------------------------------

class TestMerkle:
    def test_merkleize_creates_tree(self):
        state = {"name": "Bread", "price": 4.5, "organic": True}
        tree = merkleize(state)
        assert "root" in tree
        assert len(tree["root"]) == 64
        assert "leaves" in tree
        assert set(tree["leaves"].keys()) == {"name", "price", "organic"}
        assert len(tree["tree"]) >= 2  # at least leaves layer + root layer

    def test_selective_disclose_returns_fields_and_proof(self):
        state = {"name": "Bread", "price": 4.5, "organic": True}
        result = selective_disclose(state, ["name", "price"])
        assert result["disclosed"] == {"name": "Bread", "price": 4.5}
        assert isinstance(result["proof"], list)
        assert len(result["root"]) == 64

    def test_verify_proof_valid(self):
        state = {"name": "Bread", "price": 4.5, "organic": True}
        result = selective_disclose(state, ["name"])
        assert verify_proof(result["disclosed"], result["proof"], result["root"]) is True

    def test_verify_proof_invalid(self):
        state = {"name": "Bread", "price": 4.5, "organic": True}
        result = selective_disclose(state, ["name"])
        # Tamper with the disclosed data
        tampered = {"name": "Cake"}
        assert verify_proof(tampered, result["proof"], result["root"]) is False


# ---------------------------------------------------------------------------
# Snapshot tests
# ---------------------------------------------------------------------------

class TestSnapshot:
    def _sample_blocks(self):
        return [
            create("substance.product", {"name": "Bread"}),
            create("substance.product", {"name": "Cake"}),
            create("actor.producer", {"name": "Bakery"}),
        ]

    def test_create_snapshot(self):
        blocks = self._sample_blocks()
        snap = create_snapshot(blocks, summary="Weekly bakery batch")
        assert snap["type"] == "observe.snapshot"
        assert snap["state"]["block_count"] == 3
        assert snap["state"]["summary"] == "Weekly bakery batch"
        assert len(snap["state"]["merkle_root"]) == 64

    def test_verify_snapshot_valid(self):
        blocks = self._sample_blocks()
        snap = create_snapshot(blocks)
        result = verify_snapshot(snap, blocks)
        assert result["valid"] is True
        assert result["missing"] == []

    def test_summarize_counts_by_type(self):
        blocks = self._sample_blocks()
        stats = summarize(blocks)
        assert stats["total"] == 3
        assert stats["by_type"]["substance.product"] == 2
        assert stats["by_type"]["actor.producer"] == 1


# ---------------------------------------------------------------------------
# Attestation tests
# ---------------------------------------------------------------------------

class TestAttestation:
    def _setup(self):
        bread = create("substance.product", {"name": "Bread"})
        inspector = create("actor.authority", {"name": "Inspector"})
        whistleblower = create("actor.foodie", {"name": "Whistleblower"})
        return bread, inspector, whistleblower

    def test_attest_creates_attestation(self):
        bread, inspector, _ = self._setup()
        a = attest(bread["hash"], inspector["hash"], confidence="verified", method="visual_inspection")
        assert a["type"] == "observe.attestation"
        assert a["state"]["confidence"] == "verified"
        assert a["state"]["method"] == "visual_inspection"
        assert a["refs"]["confirms"] == bread["hash"]
        assert a["refs"]["attestor"] == inspector["hash"]

    def test_dispute_creates_dispute(self):
        bread, _, whistleblower = self._setup()
        d = dispute(bread["hash"], whistleblower["hash"], reason="Mislabeled organic status")
        assert d["type"] == "observe.dispute"
        assert d["state"]["reason"] == "Mislabeled organic status"
        assert d["refs"]["challenges"] == bread["hash"]
        assert d["refs"]["disputor"] == whistleblower["hash"]

    def test_trace_attestations_finds_both(self):
        bread, inspector, whistleblower = self._setup()
        a = attest(bread["hash"], inspector["hash"], confidence="verified")
        d = dispute(bread["hash"], whistleblower["hash"], reason="Bad")
        all_blocks = [bread, inspector, whistleblower, a, d]
        result = trace_attestations(bread["hash"], all_blocks)
        assert len(result["attestations"]) == 1
        assert len(result["disputes"]) == 1

    def test_trust_score_net(self):
        bread, inspector, whistleblower = self._setup()
        a = attest(bread["hash"], inspector["hash"], confidence="verified")  # +3
        d = dispute(bread["hash"], whistleblower["hash"], reason="Bad")      # -2 (default)
        all_blocks = [bread, inspector, whistleblower, a, d]
        score = trust_score(bread["hash"], all_blocks)
        assert score == 1  # 3 - 2


# ---------------------------------------------------------------------------
# Template tests
# ---------------------------------------------------------------------------

class TestTemplate:
    def test_templates_has_nine_entries(self):
        assert len(TEMPLATES) == 9
        expected_keys = {
            "supply-chain", "review", "certification",
            "surplus-rescue", "agent-reorder", "restaurant-sourcing",
            "food-safety-audit", "market-day", "cold-chain",
        }
        assert set(TEMPLATES.keys()) == expected_keys

    def test_from_template_generates_blocks(self):
        template_def = {
            "state": TEMPLATES["supply-chain"],
        }
        blocks = from_template(template_def, {
            "farm": {"state": {"name": "Green Acres"}},
            "crop": {"state": {"name": "Wheat"}},
            "processing": {"state": {"name": "Milling"}},
            "product": {"state": {"name": "Flour"}},
            "sale": {"state": {"quantity": 100}},
        })
        assert len(blocks) == 5
        assert blocks[0]["type"] == "actor.producer"
        assert blocks[0]["state"]["name"] == "Green Acres"
        # The crop block should reference the farm
        assert blocks[1]["refs"]["source"] == blocks[0]["hash"]

    def test_create_template(self):
        t = create_template("My Template", "A custom workflow", [
            {"type": "actor.producer", "alias": "farm"},
            {"type": "substance.product", "alias": "product", "refs": {"source": "@farm"}},
        ])
        assert t["type"] == "observe.template"
        assert t["state"]["name"] == "My Template"
        assert len(t["state"]["steps"]) == 2
        assert len(t["hash"]) == 64


# ---------------------------------------------------------------------------
# Federation tests
# ---------------------------------------------------------------------------

class TestFederation:
    def test_well_known_generates_document(self):
        doc = well_known({
            "name": "Test Server",
            "version": "0.4.0",
            "count": 42,
            "types": ["substance.product", "actor.producer"],
        })
        assert doc["protocol"] == "foodblock"
        assert doc["version"] == "0.4.0"
        assert doc["name"] == "Test Server"
        assert doc["count"] == 42
        assert "substance.product" in doc["types"]
        assert "endpoints" in doc
        assert doc["endpoints"]["blocks"] == "/blocks"

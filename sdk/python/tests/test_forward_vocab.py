"""Tests for forward traversal and vocabulary helpers.

Covers:
    - forward.forward() — find blocks referencing a hash
    - forward.recall() — BFS downstream traversal
    - forward.downstream() — convenience wrapper for substance types
    - vocabulary.quantity() — quantity object creation and validation
    - vocabulary.transition() — workflow state transition validation
    - vocabulary.next_statuses() — list valid next statuses
    - vocabulary.localize() — locale-specific text extraction
"""

import asyncio
import pytest
from foodblock import create
from foodblock.forward import forward, recall, downstream
from foodblock.vocabulary import quantity, transition, next_statuses, localize


# ---------------------------------------------------------------------------
# Helpers: mock store and resolve_forward
# ---------------------------------------------------------------------------

def build_store(*blocks):
    """Build a dict mapping hash -> block for a set of blocks."""
    return {b["hash"]: b for b in blocks}


def make_resolve_forward(store):
    """
    Create an async resolve_forward function.
    Given a hash, return all blocks in the store whose refs contain that hash.
    """
    async def resolve_forward_fn(hash_val):
        results = []
        for block in store.values():
            refs = block.get("refs", {})
            for _role, ref in refs.items():
                hashes = ref if isinstance(ref, list) else [ref]
                if hash_val in hashes:
                    results.append(block)
                    break  # avoid duplicating the same block
        return results
    return resolve_forward_fn


# ---------------------------------------------------------------------------
# forward() tests
# ---------------------------------------------------------------------------

class TestForward:
    """Tests for forward() — single-hop forward lookup."""

    def test_finds_single_referencing_block(self):
        flour = create("substance.ingredient", {"name": "Flour"})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        store = build_store(flour, bread)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(flour["hash"], resolver))
        assert result["count"] == 1
        assert len(result["referencing"]) == 1
        assert result["referencing"][0]["block"]["hash"] == bread["hash"]
        assert result["referencing"][0]["role"] == "inputs"

    def test_finds_multiple_referencing_blocks(self):
        flour = create("substance.ingredient", {"name": "Flour"})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        cake = create("substance.product", {"name": "Cake"}, {"inputs": flour["hash"]})
        store = build_store(flour, bread, cake)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(flour["hash"], resolver))
        assert result["count"] == 2
        hashes = {r["block"]["hash"] for r in result["referencing"]}
        assert bread["hash"] in hashes
        assert cake["hash"] in hashes

    def test_returns_correct_role(self):
        farm = create("actor.producer", {"name": "Valley Farm"})
        cert = create("observe.certification", {"standard": "organic"}, {"certifies": farm["hash"]})
        store = build_store(farm, cert)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(farm["hash"], resolver))
        assert result["count"] == 1
        assert result["referencing"][0]["role"] == "certifies"

    def test_empty_when_no_references(self):
        flour = create("substance.ingredient", {"name": "Flour"})
        store = build_store(flour)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(flour["hash"], resolver))
        assert result["count"] == 0
        assert result["referencing"] == []

    def test_hash_in_array_ref(self):
        flour = create("substance.ingredient", {"name": "Flour"})
        sugar = create("substance.ingredient", {"name": "Sugar"})
        cake = create("substance.product", {"name": "Cake"}, {
            "inputs": [flour["hash"], sugar["hash"]]
        })
        store = build_store(flour, sugar, cake)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(flour["hash"], resolver))
        assert result["count"] == 1
        assert result["referencing"][0]["block"]["hash"] == cake["hash"]

    def test_multiple_roles_same_block(self):
        """A block can reference a hash in multiple ref roles."""
        flour = create("substance.ingredient", {"name": "Flour"})
        # A block that references flour in two different roles
        process = create("transform.process", {"name": "Mix"}, {
            "inputs": flour["hash"],
            "source": flour["hash"],
        })
        store = build_store(flour, process)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(flour["hash"], resolver))
        # forward() iterates over all refs, so both roles should appear
        assert result["count"] == 2
        roles = {r["role"] for r in result["referencing"]}
        assert "inputs" in roles
        assert "source" in roles

    def test_does_not_find_unrelated_blocks(self):
        flour = create("substance.ingredient", {"name": "Flour"})
        sugar = create("substance.ingredient", {"name": "Sugar"})
        candy = create("substance.product", {"name": "Candy"}, {"inputs": sugar["hash"]})
        store = build_store(flour, sugar, candy)
        resolver = make_resolve_forward(store)

        result = asyncio.run(forward(flour["hash"], resolver))
        assert result["count"] == 0


# ---------------------------------------------------------------------------
# recall() tests
# ---------------------------------------------------------------------------

class TestRecall:
    """Tests for recall() — multi-hop BFS traversal."""

    def test_single_depth_recall(self):
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        store = build_store(wheat, flour)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(wheat["hash"], resolver))
        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == flour["hash"]
        assert result["depth"] == 1

    def test_multi_depth_recall(self):
        """wheat -> flour -> bread should find both flour and bread."""
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        store = build_store(wheat, flour, bread)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(wheat["hash"], resolver))
        assert len(result["affected"]) == 2
        affected_hashes = {b["hash"] for b in result["affected"]}
        assert flour["hash"] in affected_hashes
        assert bread["hash"] in affected_hashes
        assert result["depth"] == 2

    def test_paths_are_recorded(self):
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        store = build_store(wheat, flour, bread)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(wheat["hash"], resolver))
        assert len(result["paths"]) == 2
        # Path to flour should be [wheat_hash, flour_hash]
        flour_path = [p for p in result["paths"] if p[-1] == flour["hash"]]
        assert len(flour_path) == 1
        assert flour_path[0] == [wheat["hash"], flour["hash"]]
        # Path to bread should be [wheat_hash, flour_hash, bread_hash]
        bread_path = [p for p in result["paths"] if p[-1] == bread["hash"]]
        assert len(bread_path) == 1
        assert bread_path[0] == [wheat["hash"], flour["hash"], bread["hash"]]

    def test_branching_graph(self):
        """One ingredient used in two products."""
        flour = create("substance.ingredient", {"name": "Flour"})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        pasta = create("substance.product", {"name": "Pasta"}, {"inputs": flour["hash"]})
        store = build_store(flour, bread, pasta)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(flour["hash"], resolver))
        assert len(result["affected"]) == 2
        affected_hashes = {b["hash"] for b in result["affected"]}
        assert bread["hash"] in affected_hashes
        assert pasta["hash"] in affected_hashes

    def test_max_depth_limits_traversal(self):
        """With max_depth=1, should only find first level."""
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        store = build_store(wheat, flour, bread)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(wheat["hash"], resolver, max_depth=1))
        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == flour["hash"]

    def test_no_cycles(self):
        """BFS should not revisit nodes even if the graph has potential for loops."""
        a = create("substance.ingredient", {"name": "A"})
        b = create("substance.product", {"name": "B"}, {"inputs": a["hash"]})
        # c references both a and b
        c = create("substance.product", {"name": "C"}, {
            "inputs": [a["hash"], b["hash"]]
        })
        store = build_store(a, b, c)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(a["hash"], resolver))
        # b and c should each appear exactly once
        affected_hashes = [bl["hash"] for bl in result["affected"]]
        assert len(affected_hashes) == len(set(affected_hashes))
        assert b["hash"] in affected_hashes
        assert c["hash"] in affected_hashes

    def test_empty_recall(self):
        flour = create("substance.ingredient", {"name": "Flour"})
        store = build_store(flour)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(flour["hash"], resolver))
        assert result["affected"] == []
        assert result["depth"] == 0
        assert result["paths"] == []

    def test_type_filter(self):
        """Type filter should only include matching blocks but still traverse through non-matching."""
        wheat = create("substance.ingredient", {"name": "Wheat"})
        # A process block (not substance) that uses wheat
        milling = create("transform.process", {"name": "Milling"}, {"inputs": wheat["hash"]})
        # A substance block that uses the milling output
        flour = create("substance.product", {"name": "Flour"}, {"inputs": milling["hash"]})
        store = build_store(wheat, milling, flour)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(wheat["hash"], resolver, types=["substance"]))
        # Only flour should be in affected (milling is traversed but not included)
        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == flour["hash"]

    def test_role_filter(self):
        """Role filter should only follow specific ref roles."""
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        cert = create("observe.certification", {"standard": "organic"}, {"certifies": wheat["hash"]})
        store = build_store(wheat, flour, cert)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(wheat["hash"], resolver, roles=["inputs"]))
        affected_hashes = {b["hash"] for b in result["affected"]}
        assert flour["hash"] in affected_hashes
        assert cert["hash"] not in affected_hashes

    def test_deep_chain(self):
        """Test traversal through a deep linear chain."""
        blocks = [create("substance.ingredient", {"name": "Step0"})]
        for i in range(1, 6):
            b = create("substance.product", {"name": f"Step{i}"}, {"inputs": blocks[-1]["hash"]})
            blocks.append(b)
        store = build_store(*blocks)
        resolver = make_resolve_forward(store)

        result = asyncio.run(recall(blocks[0]["hash"], resolver))
        assert len(result["affected"]) == 5
        assert result["depth"] == 5


# ---------------------------------------------------------------------------
# downstream() tests
# ---------------------------------------------------------------------------

class TestDownstream:
    """Tests for downstream() — substance-filtered recall."""

    def test_returns_only_substance_blocks(self):
        wheat = create("substance.ingredient", {"name": "Wheat"})
        milling = create("transform.process", {"name": "Milling"}, {"inputs": wheat["hash"]})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": milling["hash"]})
        store = build_store(wheat, milling, flour)
        resolver = make_resolve_forward(store)

        result = asyncio.run(downstream(wheat["hash"], resolver))
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["hash"] == flour["hash"]

    def test_returns_empty_list_when_no_substance_downstream(self):
        wheat = create("substance.ingredient", {"name": "Wheat"})
        cert = create("observe.certification", {"standard": "organic"}, {"certifies": wheat["hash"]})
        store = build_store(wheat, cert)
        resolver = make_resolve_forward(store)

        result = asyncio.run(downstream(wheat["hash"], resolver))
        assert result == []

    def test_finds_multiple_substance_blocks(self):
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        store = build_store(wheat, flour, bread)
        resolver = make_resolve_forward(store)

        result = asyncio.run(downstream(wheat["hash"], resolver))
        result_hashes = {b["hash"] for b in result}
        assert flour["hash"] in result_hashes
        assert bread["hash"] in result_hashes

    def test_max_depth_parameter(self):
        wheat = create("substance.ingredient", {"name": "Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        store = build_store(wheat, flour, bread)
        resolver = make_resolve_forward(store)

        result = asyncio.run(downstream(wheat["hash"], resolver, max_depth=1))
        assert len(result) == 1
        assert result[0]["hash"] == flour["hash"]


# ---------------------------------------------------------------------------
# quantity() tests
# ---------------------------------------------------------------------------

class TestQuantity:
    """Tests for vocabulary.quantity() — quantity object creation."""

    def test_basic_quantity(self):
        q = quantity(100, "kg")
        assert q == {"value": 100, "unit": "kg"}

    def test_float_value(self):
        q = quantity(3.14, "ml")
        assert q == {"value": 3.14, "unit": "ml"}

    def test_zero_value(self):
        q = quantity(0, "g")
        assert q == {"value": 0, "unit": "g"}

    def test_negative_value(self):
        q = quantity(-10, "celsius")
        assert q == {"value": -10, "unit": "celsius"}

    def test_validates_unit_against_type(self):
        q = quantity(5, "kg", measurement_type="weight")
        assert q == {"value": 5, "unit": "kg"}

    def test_rejects_invalid_unit_for_type(self):
        with pytest.raises(ValueError, match="invalid unit"):
            quantity(5, "kg", measurement_type="volume")

    def test_rejects_invalid_unit_for_temperature(self):
        with pytest.raises(ValueError, match="invalid unit"):
            quantity(100, "ml", measurement_type="temperature")

    def test_valid_temperature_units(self):
        for unit in ["celsius", "fahrenheit", "kelvin"]:
            q = quantity(20, unit, measurement_type="temperature")
            assert q["unit"] == unit

    def test_valid_volume_units(self):
        for unit in ["ml", "l", "fl_oz", "gal", "cup", "tbsp", "tsp"]:
            q = quantity(1, unit, measurement_type="volume")
            assert q["unit"] == unit

    def test_valid_weight_units(self):
        for unit in ["g", "kg", "oz", "lb", "ton", "mg"]:
            q = quantity(1, unit, measurement_type="weight")
            assert q["unit"] == unit

    def test_valid_currency_units(self):
        for unit in ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"]:
            q = quantity(9.99, unit, measurement_type="currency")
            assert q["unit"] == unit

    def test_rejects_non_numeric_value(self):
        with pytest.raises(ValueError, match="must be a number"):
            quantity("five", "kg")

    def test_rejects_none_value(self):
        with pytest.raises(ValueError, match="must be a number"):
            quantity(None, "kg")

    def test_rejects_empty_unit(self):
        with pytest.raises(ValueError, match="unit is required"):
            quantity(5, "")

    def test_rejects_none_unit(self):
        with pytest.raises(ValueError, match="unit is required"):
            quantity(5, None)

    def test_no_type_validation_when_type_not_given(self):
        # Arbitrary unit should be accepted when no measurement_type given
        q = quantity(42, "bushels")
        assert q == {"value": 42, "unit": "bushels"}


# ---------------------------------------------------------------------------
# transition() tests
# ---------------------------------------------------------------------------

class TestTransition:
    """Tests for vocabulary.transition() — workflow state machine."""

    # Valid transitions
    def test_draft_to_quote(self):
        assert transition("draft", "quote") is True

    def test_draft_to_order(self):
        assert transition("draft", "order") is True

    def test_draft_to_cancelled(self):
        assert transition("draft", "cancelled") is True

    def test_quote_to_order(self):
        assert transition("quote", "order") is True

    def test_quote_to_cancelled(self):
        assert transition("quote", "cancelled") is True

    def test_order_to_confirmed(self):
        assert transition("order", "confirmed") is True

    def test_order_to_cancelled(self):
        assert transition("order", "cancelled") is True

    def test_confirmed_to_processing(self):
        assert transition("confirmed", "processing") is True

    def test_confirmed_to_cancelled(self):
        assert transition("confirmed", "cancelled") is True

    def test_processing_to_shipped(self):
        assert transition("processing", "shipped") is True

    def test_processing_to_cancelled(self):
        assert transition("processing", "cancelled") is True

    def test_shipped_to_delivered(self):
        assert transition("shipped", "delivered") is True

    def test_shipped_to_returned(self):
        assert transition("shipped", "returned") is True

    def test_delivered_to_paid(self):
        assert transition("delivered", "paid") is True

    def test_delivered_to_returned(self):
        assert transition("delivered", "returned") is True

    def test_returned_to_order(self):
        assert transition("returned", "order") is True

    # Invalid transitions
    def test_draft_to_delivered_invalid(self):
        assert transition("draft", "delivered") is False

    def test_quote_to_shipped_invalid(self):
        assert transition("quote", "shipped") is False

    def test_paid_to_anything_invalid(self):
        assert transition("paid", "draft") is False
        assert transition("paid", "order") is False
        assert transition("paid", "cancelled") is False

    def test_cancelled_to_anything_invalid(self):
        assert transition("cancelled", "draft") is False
        assert transition("cancelled", "order") is False

    def test_shipped_to_processing_invalid(self):
        assert transition("shipped", "processing") is False

    def test_delivered_to_shipped_invalid(self):
        assert transition("delivered", "shipped") is False

    def test_unknown_status_returns_false(self):
        assert transition("nonexistent", "draft") is False

    def test_processing_to_delivered_invalid(self):
        assert transition("processing", "delivered") is False

    def test_order_to_shipped_invalid(self):
        """Must go through confirmed and processing first."""
        assert transition("order", "shipped") is False


# ---------------------------------------------------------------------------
# next_statuses() tests
# ---------------------------------------------------------------------------

class TestNextStatuses:
    """Tests for vocabulary.next_statuses() — list valid transitions."""

    def test_draft_next(self):
        assert set(next_statuses("draft")) == {"quote", "order", "cancelled"}

    def test_quote_next(self):
        assert set(next_statuses("quote")) == {"order", "cancelled"}

    def test_order_next(self):
        assert set(next_statuses("order")) == {"confirmed", "cancelled"}

    def test_confirmed_next(self):
        assert set(next_statuses("confirmed")) == {"processing", "cancelled"}

    def test_processing_next(self):
        assert set(next_statuses("processing")) == {"shipped", "cancelled"}

    def test_shipped_next(self):
        assert set(next_statuses("shipped")) == {"delivered", "returned"}

    def test_delivered_next(self):
        assert set(next_statuses("delivered")) == {"paid", "returned"}

    def test_paid_is_terminal(self):
        assert next_statuses("paid") == []

    def test_cancelled_is_terminal(self):
        assert next_statuses("cancelled") == []

    def test_returned_next(self):
        assert next_statuses("returned") == ["order"]

    def test_unknown_status_returns_empty(self):
        assert next_statuses("nonexistent") == []


# ---------------------------------------------------------------------------
# localize() tests
# ---------------------------------------------------------------------------

class TestLocalize:
    """Tests for vocabulary.localize() — locale extraction from blocks."""

    def test_extracts_requested_locale(self):
        block = create("substance.product", {
            "name": {"en": "Bread", "fr": "Pain", "de": "Brot"},
            "price": 4.50,
        })
        localized = localize(block, "fr")
        assert localized["state"]["name"] == "Pain"
        assert localized["state"]["price"] == 4.50

    def test_falls_back_to_english(self):
        block = create("substance.product", {
            "name": {"en": "Bread", "fr": "Pain"},
        })
        localized = localize(block, "de")
        assert localized["state"]["name"] == "Bread"

    def test_custom_fallback_locale(self):
        block = create("substance.product", {
            "name": {"fr": "Pain", "de": "Brot"},
        })
        localized = localize(block, "es", fallback="de")
        assert localized["state"]["name"] == "Brot"

    def test_non_locale_dicts_unchanged(self):
        """Dicts that don't look like locale maps should be left as-is."""
        block = create("substance.product", {
            "name": "Bread",
            "nutrition": {"calories": 250, "fat": 3},
        })
        localized = localize(block, "en")
        assert localized["state"]["nutrition"] == {"calories": 250, "fat": 3}

    def test_scalar_fields_unchanged(self):
        block = create("substance.product", {
            "name": {"en": "Bread"},
            "price": 4.50,
            "organic": True,
        })
        localized = localize(block, "en")
        assert localized["state"]["name"] == "Bread"
        assert localized["state"]["price"] == 4.50
        assert localized["state"]["organic"] is True

    def test_returns_block_if_no_state(self):
        block = {"hash": "abc", "type": "test"}
        result = localize(block, "en")
        assert result == block

    def test_returns_none_block_unchanged(self):
        result = localize(None, "en")
        assert result is None

    def test_multiple_locale_fields(self):
        block = create("substance.product", {
            "name": {"en": "Bread", "fr": "Pain"},
            "description": {"en": "Fresh bread", "fr": "Pain frais"},
            "price": 4.50,
        })
        localized = localize(block, "fr")
        assert localized["state"]["name"] == "Pain"
        assert localized["state"]["description"] == "Pain frais"
        assert localized["state"]["price"] == 4.50

    def test_localize_does_not_mutate_original(self):
        block = create("substance.product", {
            "name": {"en": "Bread", "fr": "Pain"},
        })
        original_state = dict(block["state"])
        localize(block, "fr")
        assert block["state"] == original_state

    def test_fallback_chain_uses_first_available(self):
        """When neither locale nor fallback exists, should use the first key."""
        block = create("substance.product", {
            "name": {"ja": "Pan"},
        })
        localized = localize(block, "en", fallback="fr")
        # Neither en nor fr exist, so it should fall back to first available (ja)
        assert localized["state"]["name"] == "Pan"

    def test_locale_with_region_code(self):
        """Locale codes like 'en-US' should be recognized as locale objects."""
        block = create("substance.product", {
            "name": {"en-US": "Bread", "en-GB": "Bread"},
        })
        localized = localize(block, "en-US")
        assert localized["state"]["name"] == "Bread"

    def test_list_fields_unchanged(self):
        block = create("substance.product", {
            "name": {"en": "Bread"},
            "tags": ["organic", "fresh"],
        })
        localized = localize(block, "en")
        assert localized["state"]["tags"] == ["organic", "fresh"]


# ---------------------------------------------------------------------------
# Integration: forward + vocabulary combined scenario
# ---------------------------------------------------------------------------

class TestRecallScenario:
    """Integration test: contamination recall through a realistic supply chain."""

    def test_contamination_recall_flow(self):
        """
        Scenario: contaminated wheat traced through supply chain.
        wheat -> flour -> bread
        wheat -> flour -> pasta
        wheat -> feed (non-substance, should be excluded by downstream())
        """
        wheat = create("substance.ingredient", {"name": "Contaminated Wheat"})
        flour = create("substance.product", {"name": "Flour"}, {"inputs": wheat["hash"]})
        bread = create("substance.product", {"name": "Bread"}, {"inputs": flour["hash"]})
        pasta = create("substance.product", {"name": "Pasta"}, {"inputs": flour["hash"]})
        feed = create("transform.process", {"name": "Animal Feed Processing"}, {"inputs": wheat["hash"]})

        store = build_store(wheat, flour, bread, pasta, feed)
        resolver = make_resolve_forward(store)

        # recall() should find everything
        recall_result = asyncio.run(recall(wheat["hash"], resolver))
        all_hashes = {b["hash"] for b in recall_result["affected"]}
        assert flour["hash"] in all_hashes
        assert bread["hash"] in all_hashes
        assert pasta["hash"] in all_hashes
        assert feed["hash"] in all_hashes

        # downstream() should only find substance blocks
        downstream_result = asyncio.run(downstream(wheat["hash"], resolver))
        downstream_hashes = {b["hash"] for b in downstream_result}
        assert flour["hash"] in downstream_hashes
        assert bread["hash"] in downstream_hashes
        assert pasta["hash"] in downstream_hashes
        assert feed["hash"] not in downstream_hashes

    def test_workflow_with_localized_products(self):
        """Combine transition validation with localized product blocks."""
        product = create("substance.product", {
            "name": {"en": "Organic Bread", "fr": "Pain Bio"},
            "price": 5.50,
        })

        # Walk through the workflow
        status = "draft"
        path = ["draft"]
        while next_statuses(status):
            ns = next_statuses(status)
            # Pick the first non-cancelled next status
            next_status = ns[0] if ns[0] != "cancelled" else (ns[1] if len(ns) > 1 else ns[0])
            assert transition(status, next_status) is True
            status = next_status
            path.append(status)

        # Verify we went through the full happy path
        assert "paid" in path or "cancelled" in path

        # Verify localization still works on the product
        localized = localize(product, "fr")
        assert localized["state"]["name"] == "Pain Bio"

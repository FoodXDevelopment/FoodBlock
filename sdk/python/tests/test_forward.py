"""Tests for forward traversal: forward(), recall(), downstream()."""

import asyncio
import pytest
from foodblock.forward import forward, recall, downstream


# ============================================================
# Helpers — build mock graphs for testing
# ============================================================

def make_block(hash_val, block_type, state=None, refs=None):
    """Create a minimal block dict for testing."""
    return {
        "hash": hash_val,
        "type": block_type,
        "state": state or {},
        "refs": refs or {},
    }


def build_forward_index(blocks):
    """
    Build a forward lookup: for each hash mentioned in any ref,
    map it to the list of blocks that reference it.
    """
    index = {}
    for block in blocks:
        for role, ref in block.get("refs", {}).items():
            hashes = ref if isinstance(ref, list) else [ref]
            for h in hashes:
                index.setdefault(h, []).append(block)
    return index


def make_resolver(index):
    """Return an async resolve_forward function backed by the given index."""
    async def resolve_forward(h):
        return index.get(h, [])
    return resolve_forward


# ============================================================
# forward() tests
# ============================================================
class TestForward:
    def test_basic_lookup(self):
        """forward() returns blocks referencing the given hash with their roles."""
        ingredient = make_block("ing_hash", "substance.ingredient", {"name": "Flour"})
        product = make_block("prod_hash", "substance.product", {"name": "Bread"}, {
            "inputs": ["ing_hash"],
        })

        index = build_forward_index([product])
        resolver = make_resolver(index)

        result = asyncio.run(forward("ing_hash", resolver))

        assert result["count"] == 1
        assert len(result["referencing"]) == 1
        assert result["referencing"][0]["block"] == product
        assert result["referencing"][0]["role"] == "inputs"

    def test_no_results(self):
        """forward() returns empty list and count 0 when no blocks reference the hash."""
        resolver = make_resolver({})

        result = asyncio.run(forward("orphan_hash", resolver))

        assert result["count"] == 0
        assert result["referencing"] == []

    def test_multiple_referencing_blocks(self):
        """forward() returns all blocks referencing the hash."""
        source = "source_hash"
        b1 = make_block("b1", "substance.product", {}, {"inputs": [source]})
        b2 = make_block("b2", "transform.process", {}, {"inputs": [source]})
        b3 = make_block("b3", "observe.review", {}, {"subject": source})

        index = build_forward_index([b1, b2, b3])
        resolver = make_resolver(index)

        result = asyncio.run(forward(source, resolver))

        assert result["count"] == 3
        roles = {r["role"] for r in result["referencing"]}
        assert "inputs" in roles
        assert "subject" in roles

    def test_scalar_ref(self):
        """forward() works when a ref is a scalar string, not a list."""
        b = make_block("b1", "substance.product", {}, {"updates": "prev_hash"})

        index = build_forward_index([b])
        resolver = make_resolver(index)

        result = asyncio.run(forward("prev_hash", resolver))

        assert result["count"] == 1
        assert result["referencing"][0]["role"] == "updates"

    def test_block_with_multiple_roles_matching(self):
        """forward() can return the same block with different roles if it references
        the hash in multiple ref fields."""
        b = make_block("b1", "transform.process", {}, {
            "inputs": ["target_hash"],
            "source": "target_hash",
        })

        # Use a custom resolver that returns the block exactly once,
        # so forward() scans its refs and finds both matching roles.
        async def resolver(h):
            if h == "target_hash":
                return [b]
            return []

        result = asyncio.run(forward("target_hash", resolver))

        assert result["count"] == 2
        roles = [r["role"] for r in result["referencing"]]
        assert "inputs" in roles
        assert "source" in roles


# ============================================================
# recall() tests
# ============================================================
class TestRecall:
    def test_single_hop(self):
        """recall() finds directly referencing blocks."""
        source = make_block("src", "substance.ingredient", {"name": "Wheat"})
        child = make_block("child1", "substance.product", {"name": "Flour"}, {
            "inputs": ["src"],
        })

        index = build_forward_index([child])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver))

        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == "child1"
        assert result["depth"] == 1

    def test_multi_hop_traversal(self):
        """recall() traverses multiple hops via BFS."""
        # src -> mid -> leaf
        mid = make_block("mid", "substance.product", {"name": "Flour"}, {
            "inputs": ["src"],
        })
        leaf = make_block("leaf", "substance.product", {"name": "Bread"}, {
            "inputs": ["mid"],
        })

        index = build_forward_index([mid, leaf])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver))

        assert len(result["affected"]) == 2
        affected_hashes = [b["hash"] for b in result["affected"]]
        assert "mid" in affected_hashes
        assert "leaf" in affected_hashes
        assert result["depth"] == 2

    def test_max_depth_limiting(self):
        """recall() stops traversal at max_depth."""
        # Chain: src -> a -> b -> c -> d
        a = make_block("a", "substance.product", {}, {"inputs": ["src"]})
        b = make_block("b", "substance.product", {}, {"inputs": ["a"]})
        c = make_block("c", "substance.product", {}, {"inputs": ["b"]})
        d = make_block("d", "substance.product", {}, {"inputs": ["c"]})

        index = build_forward_index([a, b, c, d])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver, max_depth=2))

        affected_hashes = [b["hash"] for b in result["affected"]]
        assert "a" in affected_hashes
        assert "b" in affected_hashes
        # c and d should NOT be found (depth 3 and 4)
        assert "c" not in affected_hashes
        assert "d" not in affected_hashes

    def test_type_filtering(self):
        """recall() only includes blocks matching the type prefix filter in affected."""
        # src -> transform_block -> substance_block
        transform = make_block("t1", "transform.process", {"name": "Milling"}, {
            "inputs": ["src"],
        })
        substance = make_block("s1", "substance.flour", {"name": "White Flour"}, {
            "inputs": ["t1"],
        })

        index = build_forward_index([transform, substance])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver, types=["substance"]))

        # Only the substance block should be in affected, though transform was traversed
        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == "s1"

    def test_role_filtering(self):
        """recall() only follows edges matching the specified roles."""
        # src is referenced by two blocks with different roles
        via_inputs = make_block("inp_child", "substance.product", {}, {
            "inputs": ["src"],
        })
        via_updates = make_block("upd_child", "substance.product", {}, {
            "updates": "src",
        })

        index = build_forward_index([via_inputs, via_updates])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver, roles=["inputs"]))

        affected_hashes = [b["hash"] for b in result["affected"]]
        assert "inp_child" in affected_hashes
        assert "upd_child" not in affected_hashes

    def test_path_tracking(self):
        """recall() tracks the full path from source to each affected block."""
        # src -> mid -> leaf
        mid = make_block("mid", "substance.product", {}, {"inputs": ["src"]})
        leaf = make_block("leaf", "substance.product", {}, {"inputs": ["mid"]})

        index = build_forward_index([mid, leaf])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver))

        assert len(result["paths"]) == 2
        # Path to mid: [src, mid]
        # Path to leaf: [src, mid, leaf]
        paths_sorted = sorted(result["paths"], key=len)
        assert paths_sorted[0] == ["src", "mid"]
        assert paths_sorted[1] == ["src", "mid", "leaf"]

    def test_avoids_revisiting_nodes(self):
        """recall() does not revisit already-visited nodes (cycle safety)."""
        # Diamond: src -> a, src -> b, a -> c, b -> c
        a = make_block("a", "substance.product", {}, {"inputs": ["src"]})
        b = make_block("b", "substance.product", {}, {"inputs": ["src"]})
        c = make_block("c", "substance.product", {}, {"inputs": ["a", "b"]})

        index = build_forward_index([a, b, c])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver))

        affected_hashes = [block["hash"] for block in result["affected"]]
        # c should appear exactly once
        assert affected_hashes.count("c") == 1
        assert len(result["affected"]) == 3  # a, b, c

    def test_empty_graph(self):
        """recall() returns empty results when no blocks reference the source."""
        resolver = make_resolver({})

        result = asyncio.run(recall("lonely_hash", resolver))

        assert result["affected"] == []
        assert result["depth"] == 0
        assert result["paths"] == []

    def test_type_filter_traverses_through_non_matching(self):
        """recall() traverses through non-matching type blocks to find matching ones deeper."""
        # src -> transform (non-matching) -> substance (matching)
        transform = make_block("t1", "transform.process", {}, {"inputs": ["src"]})
        substance = make_block("s1", "substance.flour", {}, {"inputs": ["t1"]})

        index = build_forward_index([transform, substance])
        resolver = make_resolver(index)

        result = asyncio.run(recall("src", resolver, types=["substance"]))

        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == "s1"
        # The path should go through the transform node
        assert result["paths"][0] == ["src", "t1", "s1"]

    def test_blocks_without_hash_are_skipped(self):
        """recall() skips blocks that lack a hash field."""
        bad_block = {"type": "substance.product", "state": {}, "refs": {"inputs": ["src"]}}
        good_block = make_block("good", "substance.product", {}, {"inputs": ["src"]})

        async def resolver(h):
            if h == "src":
                return [bad_block, good_block]
            return []

        result = asyncio.run(recall("src", resolver))

        assert len(result["affected"]) == 1
        assert result["affected"][0]["hash"] == "good"


# ============================================================
# downstream() tests
# ============================================================
class TestDownstream:
    def test_filters_to_substance_types(self):
        """downstream() returns only substance.* blocks."""
        # ingredient -> transform -> substance_product
        transform = make_block("t1", "transform.process", {"name": "Baking"}, {
            "inputs": ["ingredient_hash"],
        })
        product = make_block("p1", "substance.bread", {"name": "Sourdough"}, {
            "inputs": ["t1"],
        })

        index = build_forward_index([transform, product])
        resolver = make_resolver(index)

        result = asyncio.run(downstream("ingredient_hash", resolver))

        assert len(result) == 1
        assert result[0]["hash"] == "p1"
        assert result[0]["type"] == "substance.bread"

    def test_no_substance_types(self):
        """downstream() returns empty list when no substance.* blocks are downstream."""
        transform = make_block("t1", "transform.process", {}, {
            "inputs": ["ingredient_hash"],
        })
        observation = make_block("o1", "observe.reading", {}, {
            "subject": "t1",
        })

        index = build_forward_index([transform, observation])
        resolver = make_resolver(index)

        result = asyncio.run(downstream("ingredient_hash", resolver))

        assert result == []

    def test_multiple_substance_types(self):
        """downstream() returns all substance.* subtypes."""
        s1 = make_block("s1", "substance.flour", {}, {"inputs": ["src"]})
        s2 = make_block("s2", "substance.bread", {}, {"inputs": ["s1"]})
        s3 = make_block("s3", "substance.product", {}, {"inputs": ["s2"]})

        index = build_forward_index([s1, s2, s3])
        resolver = make_resolver(index)

        result = asyncio.run(downstream("src", resolver))

        assert len(result) == 3
        types = {b["type"] for b in result}
        assert "substance.flour" in types
        assert "substance.bread" in types
        assert "substance.product" in types

    def test_respects_max_depth(self):
        """downstream() passes max_depth to recall()."""
        s1 = make_block("s1", "substance.flour", {}, {"inputs": ["src"]})
        s2 = make_block("s2", "substance.bread", {}, {"inputs": ["s1"]})

        index = build_forward_index([s1, s2])
        resolver = make_resolver(index)

        result = asyncio.run(downstream("src", resolver, max_depth=1))

        assert len(result) == 1
        assert result[0]["hash"] == "s1"

    def test_empty_graph(self):
        """downstream() returns empty list when nothing references the ingredient."""
        resolver = make_resolver({})

        result = asyncio.run(downstream("no_children_hash", resolver))

        assert result == []

"""Tests for fb() -- the natural language entry point to FoodBlock."""

import pytest
from foodblock.fb import fb


class TestFbProduct:
    """Test product intent detection."""

    def test_sourdough_bread_with_price_and_organic(self):
        result = fb("Sourdough bread, $4.50, organic")
        assert result['type'] == 'substance.product'
        assert result['state']['name'] == 'Sourdough'
        assert result['state']['price'] == {'value': 4.50, 'unit': 'USD'}
        assert result['state']['organic'] is True
        assert result['text'] == "Sourdough bread, $4.50, organic"
        assert len(result['blocks']) >= 1
        assert result['primary'] is result['blocks'][0]
        assert result['primary']['type'] == 'substance.product'


class TestFbReview:
    """Test review intent detection."""

    def test_five_stars_amazing_pizza(self):
        result = fb("5 stars amazing pizza at Luigi's")
        assert result['type'] == 'observe.review'
        assert result['state']['rating'] == 5.0
        assert result['state']['name'] == "Luigi's"
        assert result['state']['text'] == "5 stars amazing pizza at Luigi's"
        assert result['primary']['type'] == 'observe.review'


class TestFbFarm:
    """Test farm/producer intent detection."""

    def test_green_acres_farm(self):
        result = fb("Green Acres Farm, 200 acres, organic wheat in Oregon")
        assert result['type'] == 'actor.producer'
        assert result['state']['name'] == 'Green Acres Farm'
        assert result['state']['acreage'] == 200.0
        assert result['state']['organic'] is True
        assert result['state']['region'] == 'Oregon'
        assert result['primary']['type'] == 'actor.producer'


class TestFbReading:
    """Test reading/measurement intent detection."""

    def test_walk_in_cooler_temperature(self):
        result = fb("Walk-in cooler temperature 4 celsius")
        assert result['type'] == 'observe.reading'
        assert result['state']['temperature'] == {'value': 4.0, 'unit': 'celsius'}
        assert result['primary']['type'] == 'observe.reading'


class TestFbOrder:
    """Test order intent detection."""

    def test_ordered_flour(self):
        result = fb("Ordered 50kg flour")
        assert result['type'] == 'transfer.order'
        assert result['state']['weight'] == {'value': 50.0, 'unit': 'kg'}
        assert result['primary']['type'] == 'transfer.order'


class TestFbVenue:
    """Test venue intent detection."""

    def test_joes_bakery(self):
        result = fb("Joe's Bakery on Main Street")
        assert result['type'] == 'actor.venue'
        assert "Joe" in result['state']['name'] or "Bakery" in result['state']['name']
        assert result['primary']['type'] == 'actor.venue'


class TestFbReturnShape:
    """Test the return format of fb()."""

    def test_return_has_required_keys(self):
        result = fb("bread")
        assert 'blocks' in result
        assert 'primary' in result
        assert 'type' in result
        assert 'state' in result
        assert 'text' in result

    def test_blocks_is_list(self):
        result = fb("bread")
        assert isinstance(result['blocks'], list)
        assert len(result['blocks']) >= 1

    def test_primary_is_first_block(self):
        result = fb("bread")
        assert result['primary'] is result['blocks'][0]

    def test_block_has_hash(self):
        result = fb("bread")
        assert 'hash' in result['primary']
        assert isinstance(result['primary']['hash'], str)
        assert len(result['primary']['hash']) == 64  # SHA-256 hex

    def test_text_preserved(self):
        result = fb("organic sourdough bread")
        assert result['text'] == "organic sourdough bread"


class TestFbValidation:
    """Test input validation."""

    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match='fb\\(\\) needs text'):
            fb("")

    def test_none_raises(self):
        with pytest.raises(ValueError, match='fb\\(\\) needs text'):
            fb(None)

    def test_non_string_raises(self):
        with pytest.raises(ValueError, match='fb\\(\\) needs text'):
            fb(42)


class TestFbQuantityExtraction:
    """Test number/unit extraction patterns."""

    def test_price_extraction(self):
        result = fb("bread $4.50")
        assert result['state']['price'] == {'value': 4.50, 'unit': 'USD'}

    def test_weight_extraction(self):
        result = fb("ordered 200g chocolate")
        assert result['state']['weight'] == {'value': 200.0, 'unit': 'g'}

    def test_temperature_extraction(self):
        result = fb("freezer temperature 18 fahrenheit")
        assert result['state']['temperature'] == {'value': 18.0, 'unit': 'fahrenheit'}

    def test_rating_extraction(self):
        result = fb("rated 4.5 stars amazing")
        assert result['state']['rating'] == 4.5

    def test_acreage_extraction(self):
        result = fb("farm 100 acres harvest")
        assert result['state']['acreage'] == 100.0


class TestFbRelationships:
    """Test relationship extraction from prepositions."""

    def test_from_creates_related_block(self):
        result = fb("Ordered flour from Stone Mill")
        assert len(result['blocks']) >= 2
        entity_names = [b['state'].get('name') for b in result['blocks'][1:]]
        assert any('Stone Mill' in n for n in entity_names if n)

    def test_infer_entity_type_farm(self):
        result = fb("Ordered wheat from Green Valley Farm")
        entity_blocks = result['blocks'][1:]
        assert any(b['type'] == 'actor.producer' for b in entity_blocks)

    def test_infer_entity_type_bakery(self):
        result = fb("Ordered bread from Downtown Bakery")
        entity_blocks = result['blocks'][1:]
        assert any(b['type'] == 'actor.venue' for b in entity_blocks)

"""
FoodBlock Vocabulary — shared field definitions bridging natural language and protocol.

Vocabularies define the fields that matter for a domain, including their types,
aliases (for natural language matching), and whether they are required.

Usage:
    vocab = create_vocabulary('bakery', ['substance.product'], {
        'name': {'type': 'string', 'required': True, 'aliases': ['called', 'named'], 'description': 'Product name'},
        'price': {'type': 'number', 'required': False, 'aliases': ['costs', 'priced at', '$'], 'description': 'Price'},
    })
    matched = map_fields("sourdough bread priced at 4.50", vocab)
    # {'matched': {'name': 'sourdough bread', 'price': 4.50}, 'unmatched': []}
"""

import re
from .block import create


def create_vocabulary(domain, for_types, fields, author=None):
    """
    Create an observe.vocabulary block.

    Args:
        domain: str like "bakery", "restaurant", "farm"
        for_types: list of type strings this vocabulary applies to
        fields: dict mapping field names to field definitions:
            {
                'type': 'string' | 'number' | 'boolean',
                'required': bool,
                'aliases': [str, ...],
                'description': str
            }
        author: optional author hash for refs

    Returns:
        A FoodBlock dict with type 'observe.vocabulary'
    """
    if not domain or not isinstance(domain, str):
        raise ValueError("FoodBlock: domain is required and must be a string")
    if not for_types or not isinstance(for_types, list):
        raise ValueError("FoodBlock: for_types is required and must be a list")
    if not fields or not isinstance(fields, dict):
        raise ValueError("FoodBlock: fields is required and must be a dict")

    refs = {}
    if author:
        refs['author'] = author

    return create('observe.vocabulary', {
        'domain': domain,
        'for_types': for_types,
        'fields': fields,
    }, refs)


def map_fields(text, vocabulary):
    """
    Given natural language text and a vocabulary block, extract field values.

    Uses vocabulary['state']['fields'][name]['aliases'] to match words in text.
    Simple keyword matcher: finds aliases in text, then extracts adjacent
    numbers or booleans as values.

    Args:
        text: natural language string to parse
        vocabulary: a vocabulary block dict (must have state.fields)

    Returns:
        {'matched': {field: value, ...}, 'unmatched': [remaining_terms]}
    """
    if not text or not isinstance(text, str):
        return {'matched': {}, 'unmatched': []}

    fields = vocabulary.get('state', vocabulary).get('fields', {})
    matched = {}
    consumed_spans = []
    lower_text = text.lower()

    for field_name, field_def in fields.items():
        aliases = field_def.get('aliases', [])
        field_type = field_def.get('type', 'string')

        for alias in aliases:
            alias_lower = alias.lower()
            idx = lower_text.find(alias_lower)
            if idx == -1:
                continue

            alias_end = idx + len(alias_lower)
            consumed_spans.append((idx, alias_end))

            # Extract value based on field type
            if field_type == 'number':
                value = _extract_number(text, alias_end)
                if value is not None:
                    matched[field_name] = value
                    # Mark the number span as consumed
                    num_match = re.search(r'\s*\$?\s*([\d]+\.?\d*)', text[alias_end:])
                    if num_match:
                        consumed_spans.append((alias_end + num_match.start(), alias_end + num_match.end()))
                    break
            elif field_type in ('boolean', 'flag'):
                # Support invert_aliases: aliases that set the boolean to false
                invert_aliases = [a.lower() for a in field_def.get('invert_aliases', [])]
                value = False if alias_lower in invert_aliases else True
                matched[field_name] = value
                # Don't break — keep scanning for longer/more-specific aliases
                # (e.g. "unpasteurized" should override "pasteurized")
            elif field_type == 'compound':
                # Compound fields: collect aliases as keys in an object
                if not isinstance(matched.get(field_name), dict):
                    matched[field_name] = {}
                matched[field_name][alias_lower] = True
                # Don't break — keep scanning for more aliases of this compound field
            else:
                # For string fields, the alias presence itself is meaningful
                # Try to extract adjacent text as the value
                value = _extract_string(text, idx, alias_end)
                if value:
                    matched[field_name] = value
                    break

    # Compute unmatched terms
    unmatched = _compute_unmatched(text, consumed_spans)

    return {'matched': matched, 'unmatched': unmatched}


def _extract_number(text, after_pos):
    """Extract a number from text after the given position."""
    remainder = text[after_pos:]
    match = re.search(r'\$?\s*([\d]+\.?\d*)', remainder)
    if match:
        raw = match.group(1)
        try:
            val = float(raw)
            return int(val) if val == int(val) else val
        except ValueError:
            return None
    return None


def _extract_boolean(text, after_pos):
    """Extract a boolean from text after the given position."""
    remainder = text[after_pos:].strip().lower()
    if remainder.startswith(('yes', 'true', '1')):
        return True
    if remainder.startswith(('no', 'false', '0')):
        return False
    # If alias matched, default to True (presence = true)
    return True


def _extract_string(text, alias_start, alias_end):
    """Extract text before the alias as the string value."""
    before = text[:alias_start].strip()
    if before:
        # Take the last meaningful segment before the alias
        # Split on common delimiters and take the last chunk
        parts = re.split(r'[,;]', before)
        return parts[-1].strip()
    return None


def _compute_unmatched(text, consumed_spans):
    """Compute remaining text segments not covered by consumed spans."""
    if not consumed_spans:
        words = text.split()
        return words if words else []

    # Merge overlapping spans
    spans = sorted(consumed_spans)
    merged = [spans[0]]
    for start, end in spans[1:]:
        if start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    # Collect text outside consumed spans
    remaining = []
    pos = 0
    for start, end in merged:
        segment = text[pos:start].strip()
        if segment:
            remaining.extend(segment.split())
        pos = end
    tail = text[pos:].strip()
    if tail:
        remaining.extend(tail.split())

    return remaining


VOCABULARIES = {
    'bakery': {
        'domain': 'bakery',
        'for_types': ['substance.product', 'transform.process', 'actor.producer'],
        'fields': {
            'name': {
                'type': 'string',
                'required': True,
                'aliases': ['called', 'named', 'name'],
                'description': 'Product or item name',
            },
            'price': {
                'type': 'number',
                'required': False,
                'aliases': ['costs', 'priced at', 'price', '$'],
                'description': 'Price in local currency',
            },
            'organic': {
                'type': 'boolean',
                'required': False,
                'aliases': ['organic', 'organically grown'],
                'description': 'Whether the item is organic',
            },
            'weight': {
                'type': 'number',
                'required': False,
                'aliases': ['weighs', 'weight', 'grams', 'oz'],
                'description': 'Weight of the product',
            },
        },
    },
    'restaurant': {
        'domain': 'restaurant',
        'for_types': ['substance.product', 'actor.venue', 'observe.review'],
        'fields': {
            'name': {
                'type': 'string',
                'required': True,
                'aliases': ['called', 'named', 'name'],
                'description': 'Dish or venue name',
            },
            'price': {
                'type': 'number',
                'required': False,
                'aliases': ['costs', 'priced at', 'price', '$'],
                'description': 'Menu price',
            },
            'rating': {
                'type': 'number',
                'required': False,
                'aliases': ['rated', 'rating', 'stars', 'score'],
                'description': 'Rating out of 5',
            },
            'cuisine': {
                'type': 'string',
                'required': False,
                'aliases': ['cuisine', 'style', 'type of food'],
                'description': 'Cuisine type',
            },
        },
    },
    'farm': {
        'domain': 'farm',
        'for_types': ['substance.ingredient', 'actor.producer', 'observe.certification'],
        'fields': {
            'name': {
                'type': 'string',
                'required': True,
                'aliases': ['called', 'named', 'name'],
                'description': 'Farm or crop name',
            },
            'organic': {
                'type': 'boolean',
                'required': False,
                'aliases': ['organic', 'organically grown', 'certified organic'],
                'description': 'Organic certification status',
            },
            'harvest_date': {
                'type': 'string',
                'required': False,
                'aliases': ['harvested', 'picked', 'harvest date'],
                'description': 'Date of harvest',
            },
            'quantity': {
                'type': 'number',
                'required': False,
                'aliases': ['quantity', 'amount', 'bushels', 'kg', 'lbs'],
                'description': 'Quantity produced',
            },
        },
    },
    'retail': {
        'domain': 'retail',
        'for_types': ['substance.product', 'actor.venue', 'transfer.order'],
        'fields': {
            'name': {
                'type': 'string',
                'required': True,
                'aliases': ['called', 'named', 'name'],
                'description': 'Product name',
            },
            'price': {
                'type': 'number',
                'required': False,
                'aliases': ['costs', 'priced at', 'price', '$', 'retail price'],
                'description': 'Retail price',
            },
            'sku': {
                'type': 'string',
                'required': False,
                'aliases': ['sku', 'product code', 'item number'],
                'description': 'Stock keeping unit',
            },
            'in_stock': {
                'type': 'boolean',
                'required': False,
                'aliases': ['in stock', 'available', 'in-stock'],
                'description': 'Whether the product is in stock',
            },
        },
    },
    'lot': {
        'domain': 'lot',
        'for_types': ['substance.product', 'substance.ingredient', 'transform.process'],
        'fields': {
            'lot_id': {
                'type': 'string',
                'required': True,
                'aliases': ['lot', 'lot number', 'lot id', 'batch'],
                'description': 'Lot or batch identifier',
            },
            'batch_id': {
                'type': 'string',
                'aliases': ['batch', 'batch number', 'batch id'],
                'description': 'Batch identifier (alias for lot_id in some systems)',
            },
            'production_date': {
                'type': 'string',
                'aliases': ['produced', 'manufactured', 'made on', 'production date'],
                'description': 'Date of production (ISO 8601)',
            },
            'expiry_date': {
                'type': 'string',
                'aliases': ['expires', 'expiry', 'best before', 'use by', 'sell by'],
                'description': 'Expiry or best-before date (ISO 8601)',
            },
            'lot_size': {
                'type': 'number',
                'aliases': ['lot size', 'batch size', 'quantity produced'],
                'description': 'Number of units in the lot',
            },
            'facility': {
                'type': 'string',
                'aliases': ['facility', 'plant', 'factory', 'site'],
                'description': 'Production facility identifier',
            },
        },
    },
    'units': {
        'domain': 'units',
        'for_types': ['substance.product', 'substance.ingredient', 'transfer.order', 'observe.reading'],
        'fields': {
            'weight': {
                'type': 'quantity',
                'aliases': ['weight', 'weighs', 'mass'],
                'valid_units': ['g', 'kg', 'oz', 'lb', 'ton', 'mg'],
                'description': 'Weight/mass measurement',
            },
            'volume': {
                'type': 'quantity',
                'aliases': ['volume', 'capacity', 'amount'],
                'valid_units': ['ml', 'l', 'fl_oz', 'gal', 'cup', 'tbsp', 'tsp'],
                'description': 'Volume measurement',
            },
            'temperature': {
                'type': 'quantity',
                'aliases': ['temperature', 'temp', 'degrees'],
                'valid_units': ['celsius', 'fahrenheit', 'kelvin'],
                'description': 'Temperature reading',
            },
            'length': {
                'type': 'quantity',
                'aliases': ['length', 'height', 'width', 'depth', 'distance'],
                'valid_units': ['mm', 'cm', 'm', 'km', 'in', 'ft'],
                'description': 'Length/distance measurement',
            },
            'currency': {
                'type': 'quantity',
                'aliases': ['price', 'cost', 'total', 'amount'],
                'valid_units': ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'],
                'description': 'Monetary amount',
            },
        },
    },
    'workflow': {
        'domain': 'workflow',
        'for_types': ['transfer.order', 'transfer.shipment', 'transfer.booking'],
        'fields': {
            'status': {
                'type': 'string',
                'required': True,
                'aliases': ['status', 'state', 'stage'],
                'valid_values': ['draft', 'quote', 'order', 'confirmed', 'processing', 'shipped', 'delivered', 'paid', 'cancelled', 'returned'],
                'description': 'Current workflow status',
            },
            'previous_status': {
                'type': 'string',
                'aliases': ['was', 'previously', 'changed from'],
                'description': 'Previous status before transition',
            },
            'reason': {
                'type': 'string',
                'aliases': ['reason', 'because', 'note'],
                'description': 'Reason for status change',
            },
        },
        'transitions': {
            'draft': ['quote', 'order', 'cancelled'],
            'quote': ['order', 'cancelled'],
            'order': ['confirmed', 'cancelled'],
            'confirmed': ['processing', 'cancelled'],
            'processing': ['shipped', 'cancelled'],
            'shipped': ['delivered', 'returned'],
            'delivered': ['paid', 'returned'],
            'paid': [],
            'cancelled': [],
            'returned': ['order'],
        },
    },
    'distributor': {
        'domain': 'distributor',
        'for_types': ['actor.distributor', 'transfer.delivery'],
        'fields': {
            'vehicle_type': {
                'type': 'string',
                'aliases': ['van', 'truck', 'lorry', 'reefer', 'refrigerated'],
                'description': 'Type of delivery vehicle',
            },
            'temperature_range': {
                'type': 'object',
                'aliases': ['chilled', 'frozen', 'ambient', 'cold chain'],
                'description': 'Required temperature range for transport',
            },
            'delivery_zone': {
                'type': 'string',
                'aliases': ['zone', 'area', 'region', 'route', 'coverage'],
                'description': 'Delivery coverage zone or route',
            },
            'fleet_size': {
                'type': 'number',
                'aliases': ['fleet', 'vehicles'],
                'description': 'Number of vehicles in the fleet',
            },
            'cold_chain_certified': {
                'type': 'boolean',
                'aliases': ['cold chain certified', 'temperature controlled', 'cold chain'],
                'description': 'Whether the distributor is cold chain certified',
            },
            'transit_time': {
                'type': 'object',
                'aliases': ['transit', 'delivery time', 'lead time'],
                'description': 'Expected transit or delivery time',
            },
        },
    },
    'processor': {
        'domain': 'processor',
        'for_types': ['transform.process', 'actor.processor'],
        'fields': {
            'process_type': {
                'type': 'string',
                'aliases': ['milling', 'pressing', 'extraction', 'refining', 'pasteurizing', 'fermenting', 'smoking', 'curing'],
                'description': 'Type of processing operation',
            },
            'extraction_rate': {
                'type': 'number',
                'aliases': ['extraction rate', 'yield', 'recovery'],
                'description': 'Extraction or yield rate',
            },
            'batch_size': {
                'type': 'number',
                'aliases': ['batch', 'batch size', 'run size'],
                'description': 'Size of a processing batch',
            },
            'equipment': {
                'type': 'string',
                'aliases': ['mill', 'press', 'vat', 'oven', 'kiln', 'smoker', 'pasteurizer'],
                'description': 'Processing equipment used',
            },
            'quality_grade': {
                'type': 'string',
                'aliases': ['grade', 'quality', 'grade a', 'grade b', 'premium', 'standard'],
                'description': 'Quality grade of the output',
            },
            'shelf_life': {
                'type': 'object',
                'aliases': ['shelf life', 'best before', 'use by', 'expiry'],
                'description': 'Expected shelf life of the product',
            },
        },
    },
    'market': {
        'domain': 'market',
        'for_types': ['place.market', 'actor.vendor'],
        'fields': {
            'stall_number': {
                'type': 'string',
                'aliases': ['stall', 'pitch', 'stand', 'booth'],
                'description': 'Stall or pitch number',
            },
            'market_day': {
                'type': 'string',
                'aliases': ['saturday', 'sunday', 'weekday', 'daily', 'weekly'],
                'description': 'Day or frequency the market operates',
            },
            'seasonal': {
                'type': 'boolean',
                'aliases': ['seasonal', 'summer only', 'winter market'],
                'description': 'Whether the market is seasonal',
            },
            'pitch_fee': {
                'type': 'number',
                'aliases': ['pitch fee', 'stall fee', 'rent'],
                'description': 'Fee for a market pitch or stall',
            },
            'market_name': {
                'type': 'string',
                'aliases': ['market', 'farmers market', 'street market', 'food market'],
                'description': 'Name or type of the market',
            },
        },
    },
    'catering': {
        'domain': 'catering',
        'for_types': ['transfer.catering', 'actor.caterer'],
        'fields': {
            'event_type': {
                'type': 'string',
                'aliases': ['wedding', 'corporate', 'party', 'banquet', 'conference', 'reception', 'private event'],
                'description': 'Type of event being catered',
            },
            'covers': {
                'type': 'number',
                'aliases': ['covers', 'guests', 'people', 'servings', 'portions', 'pax'],
                'description': 'Number of covers or guests',
            },
            'dietary_options': {
                'type': 'compound',
                'aliases': ['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'nut-free', 'dairy-free'],
                'description': 'Available dietary options',
            },
            'service_style': {
                'type': 'string',
                'aliases': ['buffet', 'plated', 'canape', 'family style', 'food truck'],
                'description': 'Style of catering service',
            },
            'per_head_price': {
                'type': 'number',
                'aliases': ['per head', 'per person', 'per cover', 'pp'],
                'description': 'Price per person',
            },
        },
    },
    'fishery': {
        'domain': 'fishery',
        'for_types': ['substance.seafood', 'actor.fishery'],
        'fields': {
            'catch_method': {
                'type': 'string',
                'aliases': ['line caught', 'net', 'trawl', 'pot', 'dredge', 'longline', 'hand dive', 'rod and line'],
                'description': 'Method used to catch fish',
            },
            'vessel': {
                'type': 'string',
                'aliases': ['vessel', 'boat', 'trawler', 'seiner'],
                'description': 'Fishing vessel name or type',
            },
            'landing_port': {
                'type': 'string',
                'aliases': ['landed', 'landing port', 'port', 'harbour'],
                'description': 'Port where the catch was landed',
            },
            'species': {
                'type': 'string',
                'aliases': ['cod', 'salmon', 'haddock', 'mackerel', 'tuna', 'sea bass', 'crab', 'lobster', 'prawns', 'oyster', 'mussels'],
                'description': 'Fish or seafood species',
            },
            'msc_certified': {
                'type': 'boolean',
                'aliases': ['msc', 'msc certified', 'marine stewardship', 'sustainable'],
                'description': 'Whether the fishery is MSC certified',
            },
            'catch_date': {
                'type': 'string',
                'aliases': ['caught', 'landed', 'catch date'],
                'description': 'Date the catch was made',
            },
            'fishing_zone': {
                'type': 'string',
                'aliases': ['zone', 'area', 'ices area', 'fao area', 'fishing ground'],
                'description': 'Fishing zone or area designation',
            },
        },
    },
    'dairy': {
        'domain': 'dairy',
        'for_types': ['substance.dairy', 'actor.dairy'],
        'fields': {
            'milk_type': {
                'type': 'string',
                'aliases': ['cow', 'goat', 'sheep', 'buffalo', 'oat', 'almond', 'soy'],
                'description': 'Type of milk used',
            },
            'pasteurized': {
                'type': 'boolean',
                'aliases': ['pasteurized', 'pasteurised', 'raw', 'unpasteurized'],
                'invert_aliases': ['raw', 'unpasteurized'],
                'description': 'Whether the product is pasteurized (raw/unpasteurized = false)',
            },
            'fat_content': {
                'type': 'number',
                'aliases': ['fat', 'fat content', 'butterfat', 'cream'],
                'description': 'Fat content percentage',
            },
            'culture': {
                'type': 'string',
                'aliases': ['culture', 'starter', 'rennet', 'aged', 'cave aged'],
                'description': 'Culture or aging method used',
            },
            'aging_days': {
                'type': 'number',
                'aliases': ['aged', 'matured', 'days', 'months'],
                'description': 'Number of days the product has been aged',
            },
            'animal_breed': {
                'type': 'string',
                'aliases': ['jersey', 'holstein', 'friesian', 'guernsey', 'brown swiss', 'saanen'],
                'description': 'Breed of the dairy animal',
            },
        },
    },
    'butcher': {
        'domain': 'butcher',
        'for_types': ['substance.meat', 'actor.butcher'],
        'fields': {
            'cut': {
                'type': 'string',
                'aliases': ['sirloin', 'ribeye', 'fillet', 'rump', 'brisket', 'chuck', 'loin', 'shoulder', 'leg', 'rack', 'chop', 'mince'],
                'description': 'Cut of meat',
            },
            'animal': {
                'type': 'string',
                'aliases': ['beef', 'pork', 'lamb', 'chicken', 'duck', 'venison', 'rabbit', 'turkey', 'goose'],
                'description': 'Type of animal',
            },
            'breed': {
                'type': 'string',
                'aliases': ['angus', 'hereford', 'wagyu', 'berkshire', 'duroc', 'suffolk', 'texel'],
                'description': 'Breed of the animal',
            },
            'hanging_days': {
                'type': 'number',
                'aliases': ['hung', 'dry aged', 'aged', 'hanging days', 'matured'],
                'description': 'Number of days the meat has been hung',
            },
            'slaughter_method': {
                'type': 'string',
                'aliases': ['slaughter', 'abattoir'],
                'description': 'Method of slaughter',
            },
            'halal': {
                'type': 'boolean',
                'aliases': ['halal', 'halal certified'],
                'description': 'Whether the meat is halal',
            },
            'kosher': {
                'type': 'boolean',
                'aliases': ['kosher', 'kosher certified', 'glatt'],
                'description': 'Whether the meat is kosher',
            },
        },
    },
}


def quantity(value, unit, measurement_type=None):
    """
    Create a quantity object with value and unit.
    Convention: all measurable values should use {'value': v, 'unit': u} format.

    Args:
        value: numeric value
        unit: unit string (e.g. 'kg', 'celsius', 'USD')
        measurement_type: optional type for validation ('weight', 'volume', etc.)

    Returns:
        {'value': value, 'unit': unit}
    """
    if not isinstance(value, (int, float)):
        raise ValueError("FoodBlock: quantity value must be a number")
    if not unit or not isinstance(unit, str):
        raise ValueError("FoodBlock: quantity unit is required")

    if measurement_type and 'units' in VOCABULARIES:
        field_def = VOCABULARIES['units']['fields'].get(measurement_type)
        if field_def and 'valid_units' in field_def:
            if unit not in field_def['valid_units']:
                valid = ', '.join(field_def['valid_units'])
                raise ValueError(f"FoodBlock: invalid unit '{unit}' for {measurement_type}. Valid: {valid}")

    return {'value': value, 'unit': unit}


def transition(from_status, to_status):
    """
    Validate a workflow state transition.

    Args:
        from_status: current status
        to_status: target status

    Returns:
        True if the transition is valid
    """
    transitions = VOCABULARIES['workflow']['transitions']
    if from_status not in transitions:
        return False
    return to_status in transitions[from_status]


def next_statuses(status):
    """
    Get valid next statuses for a given status.

    Args:
        status: current status

    Returns:
        list of valid next statuses
    """
    transitions = VOCABULARIES['workflow']['transitions']
    return transitions.get(status, [])


def localize(block, locale, fallback='en'):
    """
    Localize a block's state fields for a specific locale.
    Convention: multilingual fields use nested dicts: {'en': '...', 'fr': '...'}.

    Args:
        block: a FoodBlock dict
        locale: locale code (e.g. 'en', 'fr', 'de')
        fallback: fallback locale if requested not found (default 'en')

    Returns:
        Copy of block with localized state
    """
    if not block or 'state' not in block:
        return block

    import re
    localized = {**block, 'state': {}}

    for key, value in block['state'].items():
        if isinstance(value, dict) and not isinstance(value, list):
            keys = list(value.keys())
            is_locale_obj = len(keys) > 0 and all(
                re.match(r'^[a-z]{2}(-[A-Z]{2})?$', k) for k in keys
            )
            if is_locale_obj:
                localized['state'][key] = value.get(locale) or value.get(fallback) or value.get(keys[0]) or value
            else:
                localized['state'][key] = value
        else:
            localized['state'][key] = value

    return localized

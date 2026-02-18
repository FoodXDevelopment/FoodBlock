"""
fb() -- The single natural language entry point to FoodBlock.

Takes any food-related text. Returns blocks.

    result = fb("Sourdough bread, $4.50, organic, contains gluten")
    result = fb("Joe's Bakery on Main Street sells bread and croissants")
    result = fb("Amazing pizza at Luigi's, 5 stars")
    result = fb("Ordered 50kg flour from Stone Mill")
    result = fb("Walk-in cooler temperature 4 celsius")
    result = fb("Green Acres Farm, 200 acres, grows organic wheat in Oregon")
    result = fb("3 loaves left over today, were £4 each, selling for £1.50, collect by 8pm")
    result = fb("We stone-mill the wheat into wholemeal flour, 85% extraction rate")
    result = fb("Joe's Bakery sells sourdough for £4.50 and croissants for £2.80")
    result = fb("Green Acres Farm is Soil Association organic certified until June 2026")
    result = fb("Set up an agent that handles ordering and inventory")
"""

import re
from .block import create
from .vocabulary import VOCABULARIES


# -- Intent signals --------------------------------------------------------
# Each intent maps to a block type. Patterns are tested against the input.
INTENTS = [
    # Agent setup (must be very early -- "set up an agent" is not a product)
    {
        'type': 'actor.agent',
        'signals': [
            'set up an agent', 'create an agent', 'register an agent', 'new agent',
            'agent for', 'agent that handles', 'agent to handle',
        ],
        'weight': 5,
    },
    # Surplus / leftover food
    {
        'type': 'substance.surplus',
        'signals': [
            'left over', 'leftover', 'surplus', 'reduced', 'reduced to',
            'selling for', 'collect by', 'pick up by', 'use by today',
            'going spare', 'end of day', 'waste', 'about to expire',
        ],
        'weight': 4,
    },
    # Reviews / ratings (must come before product -- "5 stars at X" is a review)
    {
        'type': 'observe.review',
        'signals': [
            'stars', 'star', 'rated', 'rating', 'review', 'amazing', 'terrible',
            'loved', 'hated', 'best', 'worst', 'delicious', 'disgusting',
            'fantastic', 'awful', 'great', 'horrible', 'recommend', 'overrated',
            'underrated', 'disappointing', 'outstanding', 'mediocre',
            'tried', 'visited', 'went to', 'ate at', 'dined at',
        ],
        'weight': 2,
    },
    # Certifications / inspections
    {
        'type': 'observe.certification',
        'signals': [
            'certified', 'certification', 'inspection', 'inspected', 'passed',
            'failed', 'audit', 'audited', 'compliance', 'approved', 'accredited',
            'usda', 'fda', 'haccp', 'iso', 'organic certified', 'grade',
            'soil association',
        ],
        'weight': 3,
    },
    # Readings / measurements
    {
        'type': 'observe.reading',
        'signals': [
            'temperature', 'temp', 'celsius', 'fahrenheit', 'humidity', 'ph',
            'reading', 'measured', 'sensor', 'cooler', 'freezer', 'thermometer',
            'fridge', 'oven', 'cold room', 'hot hold', 'probe',
        ],
        'weight': 3,
    },
    # Orders / transactions
    {
        'type': 'transfer.order',
        'signals': [
            'ordered', 'order', 'purchased', 'bought', 'sold', 'invoice',
            'shipped', 'delivered', 'shipment', 'payment', 'receipt', 'transaction',
        ],
        'weight': 2,
    },
    # Processes / transforms (before farms -- "mill the wheat" is a transform)
    {
        'type': 'transform.process',
        'signals': [
            'baked', 'cooked', 'fried', 'grilled', 'roasted', 'fermented',
            'brewed', 'distilled', 'processed', 'mixed', 'blended', 'milled',
            'smoked', 'cured', 'pickled', 'recipe', 'preparation',
            'stone-mill', 'stone mill', 'extraction rate',
            'into', 'transform', 'converted',
        ],
        'weight': 2,
    },
    # Farms / producers
    {
        'type': 'actor.producer',
        'signals': [
            'farm', 'ranch', 'orchard', 'vineyard', 'grows', 'cultivates',
            'harvested', 'harvest', 'planted', 'acres', 'hectares', 'acreage',
            'seasonal', 'producer', 'grower', 'farmer', 'variety',
        ],
        'weight': 2,
    },
    # Venues / businesses
    {
        'type': 'actor.venue',
        'signals': [
            'restaurant', 'bakery', 'cafe', 'shop', 'store', 'market', 'bar',
            'deli', 'diner', 'bistro', 'pizzeria', 'taqueria', 'patisserie',
            'on', 'street', 'avenue', 'located', 'downtown', 'opens', 'closes',
        ],
        'weight': 1,
    },
    # Ingredients
    {
        'type': 'substance.ingredient',
        'signals': [
            'ingredient', 'flour', 'sugar', 'salt', 'butter', 'milk', 'eggs',
            'yeast', 'water', 'oil', 'spice', 'herb', 'raw material', 'grain',
            'wheat', 'rice', 'corn', 'barley', 'oats',
        ],
        'weight': 1,
    },
    # Products (broadest -- catches what nothing else does)
    {
        'type': 'substance.product',
        'signals': [
            'bread', 'cake', 'pizza', 'pasta', 'cheese', 'wine', 'beer',
            'chocolate', 'coffee', 'tea', 'juice', 'sauce', 'jam',
            'product', 'item', 'sells', 'menu', 'dish', '$',
            'croissant', 'bagel', 'muffin', 'cookie', 'pie', 'tart',
            'sourdough', 'loaf',
        ],
        'weight': 1,
    },
]


# -- Currency detection ----------------------------------------------------
CURRENCY_SYMBOLS = {'\u00a3': 'GBP', '$': 'USD', '\u20ac': 'EUR'}
CURRENCY_WORDS = {
    'pounds': 'GBP', 'gbp': 'GBP',
    'dollars': 'USD', 'usd': 'USD',
    'euros': 'EUR', 'eur': 'EUR',
}


def _detect_currency(text):
    """Detect currency from text. Returns 'USD' as default."""
    for sym, code in CURRENCY_SYMBOLS.items():
        if sym in text:
            return code
    lower = text.lower()
    for word, code in CURRENCY_WORDS.items():
        if word in lower:
            return code
    return 'USD'


def _detect_segment_currency(segment, fallback):
    """Detect currency from a text segment (checks for symbol in the segment itself)."""
    for sym, code in CURRENCY_SYMBOLS.items():
        if sym in segment:
            return code
    return fallback


# -- Number + unit extraction ----------------------------------------------
NUM_PATTERNS = [
    # Price: $4.50, GBP12, EUR8.99 (currency auto-detected)
    {'pattern': r'[$\u00a3\u20ac]\s*([\d,.]+)', 'field': 'price', 'currency_auto': True},
    # Weight: 50kg, 200g, 5lb
    {'pattern': r'([\d,.]+)\s*(kg|g|oz|lb|mg|ton)\b', 'field': 'weight', 'unit_group': 2, 'flags': re.IGNORECASE},
    # Volume: 500ml, 2l, 1gal
    {'pattern': r'([\d,.]+)\s*(ml|l|fl_oz|gal|cup|tbsp|tsp)\b', 'field': 'volume', 'unit_group': 2, 'flags': re.IGNORECASE},
    # Temperature: 4 celsius, 72 fahrenheit, 350 F
    {'pattern': r'([\d,.]+)\s*\u00b0?\s*(celsius|fahrenheit|kelvin|[CFK])\b', 'field': 'temperature', 'unit_group': 2, 'flags': re.IGNORECASE},
    # Acreage: 200 acres, 50 hectares
    {'pattern': r'([\d,.]+)\s*(acres?|hectares?)\b', 'field': 'acreage', 'flags': re.IGNORECASE},
    # Rating: 5 stars, rated 4.5, 3/5 stars
    {'pattern': r'([\d.]+)\s*(?:/5\s*)?(?:stars?|star)\b', 'field': 'rating', 'flags': re.IGNORECASE},
    {'pattern': r'\brated?\s*([\d.]+)', 'field': 'rating', 'flags': re.IGNORECASE},
    # Percentage: 85% extraction rate
    {'pattern': r'([\d.]+)\s*%', 'field': '_percent'},
    # Generic number near "score": score 95
    {'pattern': r'\bscore\s*([\d.]+)', 'field': 'score', 'flags': re.IGNORECASE},
    # Lot size: 500 units, batch of 1000
    {'pattern': r'([\d,]+)\s*units?\b', 'field': 'lot_size', 'flags': re.IGNORECASE},
]


# -- Unit normalization ----------------------------------------------------
UNIT_NORMALIZE = {
    'c': 'celsius',
    'f': 'fahrenheit',
    'k': 'kelvin',
    'acre': 'acres',
    'hectare': 'hectares',
}


# -- Relationship patterns -------------------------------------------------
REL_PATTERNS = [
    {'pattern': r'\bfrom\s+([A-Z][A-Za-z\s\'.-]+)', 'role': 'source'},
    {'pattern': r'\bat\s+([A-Z][A-Za-z\s\'.-]+)', 'role': 'subject'},
    {'pattern': r'\bby\s+([A-Z][A-Za-z\s\'.-]+)', 'role': 'author'},
]


# -- Surplus patterns ------------------------------------------------------
SURPLUS_QUANTITY_PATTERN = re.compile(
    r'(\d+)\s*(loaves?|items?|portions?|servings?|pieces?|bags?|boxes?|trays?|units?|kg|g)\b',
    re.IGNORECASE,
)
SURPLUS_ORIGINAL_PRICE = re.compile(
    r'(?:were|was|originally?|rrp)\s*[$\u00a3\u20ac]\s*([\d,.]+)',
    re.IGNORECASE,
)
SURPLUS_REDUCED_PRICE = re.compile(
    r'(?:selling\s+for|reduced\s+to|now)\s*[$\u00a3\u20ac]\s*([\d,.]+)',
    re.IGNORECASE,
)
SURPLUS_COLLECT_BY = re.compile(
    r'(?:collect|pick\s*up|use)\s+by\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?)',
    re.IGNORECASE,
)

# -- Transform patterns ----------------------------------------------------
TRANSFORM_INTO_PATTERN = re.compile(
    r'\b(?:the\s+)?(\w+(?:\s+\w+)?)\s+into\s+(\w+(?:\s+\w+)?)(?:\s*[,.]|$)',
    re.IGNORECASE,
)
TRANSFORM_FROM_TO_PATTERN = re.compile(
    r'from\s+(\w[\w\s-]*?)\s+to\s+(\w[\w\s-]*?)(?:\s*[,.]|$)',
    re.IGNORECASE,
)
TRANSFORM_PROCESS_PATTERN = re.compile(
    r'\b(stone[- ]mill|mill|bake|cook|fry|grill|roast|ferment|brew|distill|smoke|cure|pickle|blend|mix|process)\w*\b',
    re.IGNORECASE,
)
EXTRACTION_RATE_PATTERN = re.compile(
    r'([\d.]+)\s*%\s*extraction\s+rate',
    re.IGNORECASE,
)

# -- Certification patterns ------------------------------------------------
CERT_EXPIRY_PATTERN = re.compile(
    r'(?:until|expires?|valid\s+until|through)\s+([A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})',
    re.IGNORECASE,
)
CERT_NAME_PATTERN = re.compile(r'\bis\s+(.+?)\s+certified', re.IGNORECASE)
CERT_NAME_PATTERN_FALLBACK = re.compile(r'(.+?)\s+certified', re.IGNORECASE)

# -- Sells X and Y ---------------------------------------------------------
SELLS_PATTERN = re.compile(r'\bsells?\s+(.+)', re.IGNORECASE)
PRODUCT_PRICE_PATTERN = re.compile(r'(.+?)\s+(?:for|at)\s+[$\u00a3\u20ac]\s*([\d,.]+)', re.IGNORECASE)

# -- Agent language --------------------------------------------------------
AGENT_CAPABILITIES_PATTERN = re.compile(r'\b(?:handles?|manages?|does|for)\s+(.+)', re.IGNORECASE)

# -- Compound entity: "X from Y" ------------------------------------------
FROM_ENTITY_PATTERN = re.compile(r'\bfrom\s+([A-Z][A-Za-z\s\'.-]+?)(?:\s+in\s+|\s*[,.]|$)', re.IGNORECASE)
IN_LOCATION_PATTERN = re.compile(r'\bin\s+([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)')
VARIETY_PATTERN = re.compile(r'\b([A-Z][A-Za-z\s]+?)\s+variety\b', re.IGNORECASE)
HARVESTED_PATTERN = re.compile(r'\bharvested?\s+([A-Za-z]+\s+\d{4}|\d{4})', re.IGNORECASE)


def fb(text):
    """
    Describe food in plain English, get FoodBlocks back.

    Args:
        text: any food-related natural language

    Returns:
        dict with keys: blocks, primary, type, state, refs, text, confidence
    """
    if not text or not isinstance(text, str):
        raise ValueError('fb() needs text')

    lower = text.lower()
    currency = _detect_currency(text)

    # 1. Score intents
    scores = []
    for intent in INTENTS:
        score = 0
        match_count = 0
        for signal in intent['signals']:
            if signal in lower:
                score += intent['weight']
                match_count += 1
        if score > 0:
            scores.append({'type': intent['type'], 'score': score, 'match_count': match_count})

    scores.sort(key=lambda s: s['score'], reverse=True)
    top_score = scores[0] if scores else None
    primary_type = top_score['type'] if top_score else 'substance.product'

    # Calculate confidence
    if not top_score:
        confidence = 0.4
    elif top_score['match_count'] >= 3:
        confidence = 1.0
    elif top_score['match_count'] >= 2:
        confidence = 0.8
    else:
        confidence = 0.6

    # -- Special-case: "sells X and Y" -> venue + products --
    sells_match = SELLS_PATTERN.search(text)
    is_venue_selling = (
        sells_match
        and (
            primary_type == 'actor.venue'
            or bool(re.search(r'bakery|cafe|restaurant|shop|store|market|deli|diner|bar|bistro|pizzeria', text, re.IGNORECASE))
        )
    )

    if is_venue_selling:
        return _handle_venue_sells(text, lower, sells_match.group(1), currency, confidence)

    # -- Special-case: surplus language --
    if primary_type == 'substance.surplus':
        return _handle_surplus(text, lower, currency, confidence)

    # -- Special-case: transform language --
    if primary_type == 'transform.process':
        return _handle_transform(text, lower, currency, confidence)

    # -- Special-case: certification with subject --
    if primary_type == 'observe.certification':
        return _handle_certification(text, lower, currency, confidence)

    # -- Special-case: agent language --
    if primary_type == 'actor.agent':
        return _handle_agent(text, lower, confidence)

    # -- Special-case: order with "from X" -> order + entity --
    if primary_type == 'transfer.order':
        return _handle_order(text, lower, currency, confidence)

    # -- Special-case: compound ingredient with "from X" --
    if primary_type == 'actor.producer' and re.search(r'\bfrom\s+[A-Z]', text):
        has_ingredient = any(s['type'] == 'substance.ingredient' and s['score'] > 0 for s in scores)
        if has_ingredient:
            primary_type = 'substance.ingredient'

    if primary_type in ('substance.ingredient', 'actor.producer'):
        return _handle_compound_entity(text, lower, primary_type, currency, confidence)

    # -- General path --
    name = _extract_name(text, primary_type)
    quantities = _extract_quantities(text, currency)
    flags = _extract_flags(lower)
    state = _build_state(name, quantities, flags)

    # Type-specific enrichment
    _enrich_state(state, primary_type, text, lower, quantities)

    # Extract relationship entities
    entity_blocks, refs = _extract_relationships(text, primary_type)

    # Create primary block with refs
    primary = create(primary_type, state, refs)
    blocks = [primary] + entity_blocks

    return {
        'blocks': blocks,
        'primary': primary,
        'type': primary_type,
        'state': state,
        'refs': refs,
        'text': text,
        'confidence': confidence,
    }


# -- Handler: Venue sells products -----------------------------------------
def _handle_venue_sells(text, lower, sells_text, currency, confidence):
    blocks = []

    # Extract venue name
    venue_name = _extract_name(text, 'actor.venue')
    venue_state = {'name': venue_name} if venue_name else {}
    venue_flags = _extract_flags(lower)
    venue_state.update(venue_flags)

    venue_block = create('actor.venue', venue_state)
    blocks.append(venue_block)

    # Parse "sourdough for £4.50 and croissants for £2.80"
    # Split on " and " or ", "
    product_segments = [s.strip() for s in re.split(r'\s+and\s+|\s*,\s*', sells_text) if s.strip()]

    for segment in product_segments:
        price_match = PRODUCT_PRICE_PATTERN.search(segment)
        product_state = {}

        if price_match:
            product_state['name'] = _clean_product_name(price_match.group(1).strip())
            price_val = _parse_float(price_match.group(2))
            if price_val is not None:
                seg_currency = _detect_segment_currency(segment, currency)
                product_state['price'] = {'value': price_val, 'unit': seg_currency}
        else:
            product_state['name'] = _clean_product_name(segment)

        # Also pick up any standalone price in the segment
        if 'price' not in product_state:
            standalone_price = re.search(r'[$\u00a3\u20ac]\s*([\d,.]+)', segment)
            if standalone_price:
                val = _parse_float(standalone_price.group(1))
                if val is not None:
                    seg_currency = _detect_segment_currency(segment, currency)
                    product_state['price'] = {'value': val, 'unit': seg_currency}

        if product_state.get('name'):
            product_block = create('substance.product', product_state, {'seller': venue_block['hash']})
            blocks.append(product_block)

    return {
        'blocks': blocks,
        'primary': blocks[0],
        'type': 'actor.venue',
        'state': venue_state,
        'refs': {},
        'text': text,
        'confidence': max(confidence, 0.8),
    }


# -- Handler: Surplus food -------------------------------------------------
def _handle_surplus(text, lower, currency, confidence):
    blocks = []
    state = {}

    # Extract product name
    name = _extract_name(text, 'substance.surplus')
    if name:
        state['name'] = name

    # Extract quantity: "3 loaves"
    qty_match = SURPLUS_QUANTITY_PATTERN.search(text)
    if qty_match:
        state['quantity'] = {'value': int(qty_match.group(1)), 'unit': qty_match.group(2).lower()}

    # Original price: "were £4 each"
    orig_match = SURPLUS_ORIGINAL_PRICE.search(text)
    if orig_match:
        val = _parse_float(orig_match.group(1))
        if val is not None:
            state['original_price'] = {'value': val, 'unit': currency}

    # Surplus price: "selling for £1.50"
    surplus_match = SURPLUS_REDUCED_PRICE.search(text)
    if surplus_match:
        val = _parse_float(surplus_match.group(1))
        if val is not None:
            state['surplus_price'] = {'value': val, 'unit': currency}

    # Collect by: "collect by 8pm"
    collect_match = SURPLUS_COLLECT_BY.search(text)
    if collect_match:
        state['expiry_time'] = collect_match.group(1).strip()

    # Boolean flags
    flags = _extract_flags(lower)
    state.update(flags)

    primary = create('substance.surplus', state)
    blocks.append(primary)

    return {
        'blocks': blocks,
        'primary': primary,
        'type': 'substance.surplus',
        'state': state,
        'refs': {},
        'text': text,
        'confidence': confidence,
    }


# -- Handler: Transform process --------------------------------------------
def _handle_transform(text, lower, currency, confidence):
    blocks = []
    state = {}

    # Extract process name
    process_match = TRANSFORM_PROCESS_PATTERN.search(text)
    if process_match:
        state['process'] = process_match.group(1).strip()

    # "X into Y" pattern
    into_match = TRANSFORM_INTO_PATTERN.search(text)
    if into_match:
        state['inputs'] = [_clean_product_name(into_match.group(1).strip())]
        state['outputs'] = [_clean_product_name(into_match.group(2).strip())]

    # "from X to Y" pattern
    if not into_match:
        from_to_match = TRANSFORM_FROM_TO_PATTERN.search(text)
        if from_to_match:
            state['inputs'] = [_clean_product_name(from_to_match.group(1).strip())]
            state['outputs'] = [_clean_product_name(from_to_match.group(2).strip())]

    # Extraction rate: "85% extraction rate"
    extraction_match = EXTRACTION_RATE_PATTERN.search(text)
    if extraction_match:
        state['extraction_rate'] = float(extraction_match.group(1))

    # Name extraction
    name = _extract_name(text, 'transform.process')
    if name and 'process' not in state:
        state['name'] = name
    if 'process' in state:
        state['name'] = state['process']

    flags = _extract_flags(lower)
    state.update(flags)

    primary = create('transform.process', state)
    blocks.append(primary)

    return {
        'blocks': blocks,
        'primary': primary,
        'type': 'transform.process',
        'state': state,
        'refs': {},
        'text': text,
        'confidence': confidence,
    }


# -- Handler: Certification ------------------------------------------------
def _handle_certification(text, lower, currency, confidence):
    blocks = []
    state = {}
    refs = {}

    # Extract certification name: "is Soil Association organic certified"
    cert_name_match = CERT_NAME_PATTERN.search(text)
    if cert_name_match:
        state['name'] = cert_name_match.group(1).strip()
    else:
        fallback_match = CERT_NAME_PATTERN_FALLBACK.search(text)
        if fallback_match:
            state['name'] = fallback_match.group(1).strip()
        else:
            state['name'] = _extract_name(text, 'observe.certification')

    # Extract expiry: "until June 2026"
    expiry_match = CERT_EXPIRY_PATTERN.search(text)
    if expiry_match:
        state['valid_until'] = expiry_match.group(1).strip()

    # Is there a subject entity? "Green Acres Farm is..."
    subject_match = re.match(r'^([A-Z][A-Za-z\s\'.-]+?)\s+(?:is|has|was|are)\s+', text, re.IGNORECASE)
    if subject_match:
        subject_name = subject_match.group(1).strip()
        subject_type = _infer_entity_type(subject_name)
        subject_state = {'name': subject_name}

        # Extract region for farms
        region_match = IN_LOCATION_PATTERN.search(text)
        if region_match and subject_type == 'actor.producer':
            subject_state['region'] = region_match.group(1).strip()

        subject_block = create(subject_type, subject_state)
        blocks.append(subject_block)
        refs['subject'] = subject_block['hash']

    flags = _extract_flags(lower)
    state.update(flags)

    primary = create('observe.certification', state, refs)
    # primary goes first
    blocks.insert(0, primary)

    return {
        'blocks': blocks,
        'primary': primary,
        'type': 'observe.certification',
        'state': state,
        'refs': refs,
        'text': text,
        'confidence': confidence,
    }


# -- Handler: Agent --------------------------------------------------------
def _handle_agent(text, lower, confidence):
    state = {}

    # Extract name
    name_match = re.search(r'agent\s+(?:called|named)\s+["\']?([^"\',]+)["\']?', text, re.IGNORECASE)
    if name_match:
        state['name'] = name_match.group(1).strip()
    else:
        state['name'] = 'agent'

    # Extract capabilities: "handles ordering and inventory"
    cap_match = AGENT_CAPABILITIES_PATTERN.search(text)
    if cap_match:
        cap_text = cap_match.group(1)
        capabilities = [c.strip().lower() for c in re.split(r'\s+and\s+|\s*,\s*', cap_text) if c.strip() and len(c.strip()) > 1]
        if capabilities:
            state['capabilities'] = capabilities

    primary = create('actor.agent', state)

    return {
        'blocks': [primary],
        'primary': primary,
        'type': 'actor.agent',
        'state': state,
        'refs': {},
        'text': text,
        'confidence': confidence,
    }


# -- Handler: Order with "from X" -----------------------------------------
def _handle_order(text, lower, currency, confidence):
    blocks = []
    refs = {}

    name = _extract_name(text, 'transfer.order')
    quantities = _extract_quantities(text, currency)
    flags = _extract_flags(lower)
    state = _build_state(name, quantities, flags)

    # Extract the "from X" entity and create a block for it
    from_match = FROM_ENTITY_PATTERN.search(text)
    if from_match:
        entity_name = from_match.group(1).strip().rstrip(',. ')
        if len(entity_name) >= 2:
            entity_type = _infer_entity_type(entity_name)
            entity_block = create(entity_type, {'name': entity_name})
            blocks.append(entity_block)
            refs['seller'] = entity_block['hash']

    primary = create('transfer.order', state, refs)
    blocks.insert(0, primary)

    return {
        'blocks': blocks,
        'primary': primary,
        'type': 'transfer.order',
        'state': state,
        'refs': refs,
        'text': text,
        'confidence': confidence,
    }


# -- Handler: Compound entity (ingredient / producer) ----------------------
def _handle_compound_entity(text, lower, detected_type, currency, confidence):
    blocks = []
    refs = {}

    quantities = _extract_quantities(text, currency)
    flags = _extract_flags(lower)

    # Determine the primary type and entities
    from_match = FROM_ENTITY_PATTERN.search(text)
    location_match = IN_LOCATION_PATTERN.search(text)
    variety_match = VARIETY_PATTERN.search(text)
    harvested_match = HARVESTED_PATTERN.search(text)

    # If "from Farm" -> ingredient is primary, farm is secondary
    if from_match and detected_type == 'substance.ingredient':
        # Create farm block
        farm_name = from_match.group(1).strip().rstrip(',. ')
        farm_state = {'name': farm_name}
        if location_match:
            farm_state['region'] = location_match.group(1).strip()
        farm_block = create(_infer_entity_type(farm_name), farm_state)
        blocks.append(farm_block)
        refs['source'] = farm_block['hash']

        # Build ingredient state -- name is everything before "from"
        before_from = re.split(r'\s+from\s+', text, flags=re.IGNORECASE)[0].strip()
        name = before_from.rstrip(',. ') or _extract_name(text, 'substance.ingredient')
        state = _build_state(name, quantities, flags)
        if variety_match:
            state['variety'] = variety_match.group(1).strip()
        if harvested_match:
            state['harvested'] = harvested_match.group(1).strip()

        primary = create('substance.ingredient', state, refs)
        blocks.insert(0, primary)

        return {
            'blocks': blocks,
            'primary': primary,
            'type': 'substance.ingredient',
            'state': state,
            'refs': refs,
            'text': text,
            'confidence': confidence,
        }

    # If producer is primary, build normally but also extract crop etc.
    if detected_type == 'actor.producer':
        name = _extract_name(text, 'actor.producer')
        state = _build_state(name, quantities, flags)
        _enrich_state(state, 'actor.producer', text, lower, quantities)
        if variety_match:
            state['variety'] = variety_match.group(1).strip()
        if harvested_match:
            state['harvested'] = harvested_match.group(1).strip()

        primary = create('actor.producer', state, refs)
        blocks.insert(0, primary)

        return {
            'blocks': blocks,
            'primary': primary,
            'type': 'actor.producer',
            'state': state,
            'refs': refs,
            'text': text,
            'confidence': confidence,
        }

    # Fallback to general path
    name = _extract_name(text, detected_type)
    state = _build_state(name, quantities, flags)
    _enrich_state(state, detected_type, text, lower, quantities)

    primary = create(detected_type, state, refs)
    blocks.insert(0, primary)

    return {
        'blocks': blocks,
        'primary': primary,
        'type': detected_type,
        'state': state,
        'refs': refs,
        'text': text,
        'confidence': confidence,
    }


# -- Shared helpers --------------------------------------------------------

def _extract_quantities(text, currency):
    """Extract quantities from text."""
    quantities = {}
    for np in NUM_PATTERNS:
        flags = np.get('flags', 0)
        for match in re.finditer(np['pattern'], text, flags):
            raw = match.group(1).replace(',', '')
            try:
                value = float(raw)
            except ValueError:
                continue

            if np.get('currency_auto'):
                quantities[np['field']] = {'value': value, 'unit': currency}
            elif 'unit_group' in np and match.group(np['unit_group']):
                raw_unit = match.group(np['unit_group']).lower()
                quantities[np['field']] = {
                    'value': value,
                    'unit': UNIT_NORMALIZE.get(raw_unit, raw_unit),
                }
            else:
                quantities[np['field']] = value
    return quantities


def _extract_flags(lower):
    """Extract boolean flags from all vocabularies."""
    flags = {}
    for vocab in VOCABULARIES.values():
        for field_name, field_def in vocab.get('fields', {}).items():
            field_type = field_def.get('type')

            if field_type == 'boolean':
                for alias in field_def.get('aliases', []):
                    if alias.lower() in lower:
                        flags[field_name] = True

            if field_type == 'compound':
                for alias in field_def.get('aliases', []):
                    if alias.lower() in lower:
                        if field_name not in flags:
                            flags[field_name] = {}
                        flags[field_name][alias.lower()] = True
    return flags


def _build_state(name, quantities, flags):
    """Build state from name, quantities, and flags."""
    state = {}
    if name:
        state['name'] = name
    for field, val in quantities.items():
        if field.startswith('_'):
            continue  # skip internal fields like _percent
        state[field] = val
    for field, val in flags.items():
        state[field] = val
    return state


def _enrich_state(state, type_, text, lower, quantities):
    """Enrich state with type-specific fields."""
    if type_ == 'observe.review':
        if 'rating' not in state and 'rating' in quantities:
            state['rating'] = quantities['rating']
        state['text'] = text

    if type_ == 'observe.reading':
        if 'temperature' in quantities:
            state['temperature'] = quantities['temperature']
        if 'humidity' in quantities:
            state['humidity'] = quantities['humidity']
        location_match = re.search(r'\b(?:in|at)\s+(?:the\s+)?(.+?)(?:\s*[,.]|$)', text, re.IGNORECASE)
        if location_match:
            loc = location_match.group(1).strip()
            if 1 < len(loc) < 50:
                state['location'] = loc

    if type_ == 'actor.producer':
        grows_match = re.search(
            r'\b(?:grows?|cultivates?|produces?)\s+(.+?)(?:\s*[,.]|\s+in\s+|\s+on\s+|$)',
            text, re.IGNORECASE,
        )
        if grows_match:
            state['crop'] = grows_match.group(1).strip()

        if 'acreage' in quantities:
            acreage_val = quantities['acreage']
            state['acreage'] = acreage_val['value'] if isinstance(acreage_val, dict) else acreage_val

        region_match = re.search(r'\bin\s+([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)', text)
        if region_match:
            state['region'] = region_match.group(1).strip()


def _extract_relationships(text, primary_type):
    """Extract relationships and create entity blocks.

    Returns:
        tuple of (entity_blocks, refs)
    """
    entity_blocks = []
    refs = {}

    for rp in REL_PATTERNS:
        for match in re.finditer(rp['pattern'], text):
            entity_name = match.group(1).strip().rstrip(',. ')
            if len(entity_name) < 2:
                continue

            entity_type = _infer_entity_type(entity_name)
            entity_block = create(entity_type, {'name': entity_name})
            entity_blocks.append(entity_block)

            if rp['role'] in refs:
                existing = refs[rp['role']]
                if isinstance(existing, list):
                    refs[rp['role']] = existing + [entity_block['hash']]
                else:
                    refs[rp['role']] = [existing, entity_block['hash']]
            else:
                refs[rp['role']] = entity_block['hash']

    return entity_blocks, refs


def _extract_name(text, type_):
    """Extract the most likely 'name' from natural language text."""
    # For reviews, extract the subject name ("Amazing pizza at Luigi's" -> "Luigi's")
    if type_ == 'observe.review':
        at_match = re.search(r'\bat\s+([A-Z][A-Za-z\s\']+)', text, re.IGNORECASE)
        if at_match:
            return at_match.group(1).strip().rstrip(',. ')

    # For readings, don't extract a name
    if type_ == 'observe.reading':
        return None

    # Try to find a proper noun phrase (capitalized words)
    proper_match = re.search(r"([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+)*(?:'s)?)", text)
    if proper_match:
        candidate = proper_match.group(1).strip()
        if len(candidate) > 2 and text.index(candidate) > 0:
            return candidate
        if len(candidate) > 2:
            return candidate

    # Fall back to first segment before comma, dollar sign, or common delimiters
    first_segment = re.split(r'[,$\u00a3\u20ac\u2022\-\u2014|]', text)[0].strip()
    if first_segment and len(first_segment) < 80:
        return re.sub(
            r'^(a|an|the|my|our|i\'m|we\'re|i am|we are)\s+',
            '', first_segment, flags=re.IGNORECASE,
        ).strip()

    return text[:50].strip()


def _infer_entity_type(name):
    """Infer a block type from an entity name."""
    lower = name.lower()
    if re.search(r'farm|ranch|orchard|vineyard|grove', lower):
        return 'actor.producer'
    if re.search(r'bakery|restaurant|cafe|shop|store|market|deli|diner|bar|bistro', lower):
        return 'actor.venue'
    if re.search(r'mill|factory|plant|brewery|winery|dairy', lower):
        return 'actor.producer'
    return 'actor.venue'


def _clean_product_name(name):
    """Clean a product name - strip trailing prepositions, articles, etc."""
    name = re.sub(r'\s+(for|at|on|in|from|to|by|with)\s*$', '', name, flags=re.IGNORECASE)
    return name.strip()


def _parse_float(s):
    """Parse a float from a string, returning None on failure."""
    try:
        return float(s.replace(',', ''))
    except (ValueError, AttributeError):
        return None

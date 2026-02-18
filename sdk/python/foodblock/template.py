"""
FoodBlock Templates — reusable patterns for common workflows.
Templates are FoodBlocks (observe.template) describing block sequences.

Usage:
    t = create_template('Supply Chain', 'Farm to table', steps)
    blocks = from_template(t, {'farm': {'state': {'name': 'Green Acres'}}})
"""

from .block import create


def create_template(name, description, steps, author=None):
    """Create a template block."""
    refs = {}
    if author:
        refs['author'] = author
    return create('observe.template', {
        'name': name,
        'description': description,
        'steps': steps
    }, refs)


def from_template(template, values=None):
    """
    Instantiate a template into real blocks.

    Args:
        template: A template block (or its state)
        values: Dict mapping step alias to {'state': {...}, 'refs': {...}} overrides

    Returns:
        List of created blocks in dependency order
    """
    values = values or {}
    state = template.get('state', template) if isinstance(template, dict) else template
    steps = state.get('steps', [])
    if not steps:
        raise ValueError('FoodBlock: template must have steps array')

    aliases = {}
    blocks = []

    for step in steps:
        alias = step.get('alias', step['type'])
        overrides = values.get(alias, {})

        # Build state
        block_state = dict(step.get('default_state', {}))
        if overrides.get('state'):
            block_state.update(overrides['state'])

        # Build refs, resolving @aliases
        block_refs = {}
        for role, target in (step.get('refs') or {}).items():
            if isinstance(target, str) and target.startswith('@'):
                ref_alias = target[1:]
                if ref_alias in aliases:
                    block_refs[role] = aliases[ref_alias]
            else:
                block_refs[role] = target

        # Override refs from values
        for role, target in (overrides.get('refs') or {}).items():
            if isinstance(target, str) and target.startswith('@'):
                ref_alias = target[1:]
                if ref_alias in aliases:
                    block_refs[role] = aliases[ref_alias]
            else:
                block_refs[role] = target

        block = create(step['type'], block_state, block_refs)
        aliases[alias] = block['hash']
        blocks.append(block)

    return blocks


TEMPLATES = {
    'supply-chain': {
        'name': 'Farm-to-Table Supply Chain',
        'description': 'A complete provenance chain from primary producer to retail',
        'steps': [
            {'type': 'actor.producer', 'alias': 'farm', 'required': ['name']},
            {'type': 'substance.ingredient', 'alias': 'crop', 'refs': {'source': '@farm'}, 'required': ['name']},
            {'type': 'transform.process', 'alias': 'processing', 'refs': {'input': '@crop'}, 'required': ['name']},
            {'type': 'substance.product', 'alias': 'product', 'refs': {'origin': '@processing'}, 'required': ['name']},
            {'type': 'transfer.order', 'alias': 'sale', 'refs': {'item': '@product'}}
        ]
    },
    'review': {
        'name': 'Product Review',
        'description': 'A consumer review of a food product',
        'steps': [
            {'type': 'actor.venue', 'alias': 'venue', 'required': ['name']},
            {'type': 'substance.product', 'alias': 'product', 'refs': {'seller': '@venue'}, 'required': ['name']},
            {'type': 'observe.review', 'alias': 'review', 'refs': {'subject': '@product'}, 'required': ['rating']}
        ]
    },
    'certification': {
        'name': 'Product Certification',
        'description': 'An authority certifying a producer or product',
        'steps': [
            {'type': 'actor.authority', 'alias': 'authority', 'required': ['name']},
            {'type': 'actor.producer', 'alias': 'producer', 'required': ['name']},
            {'type': 'observe.certification', 'alias': 'cert', 'refs': {'authority': '@authority', 'subject': '@producer'}, 'required': ['name']}
        ]
    },
    'surplus-rescue': {
        'name': 'Surplus Rescue',
        'description': 'Food business posts surplus, sustainer collects, donation recorded',
        'steps': [
            {'type': 'actor.venue', 'alias': 'donor', 'required': True, 'default_state': {'name': 'Food Business'}},
            {'type': 'substance.surplus', 'alias': 'surplus', 'refs': {'seller': '@donor'}, 'required': True, 'default_state': {'name': 'Surplus Food', 'status': 'available'}},
            {'type': 'transfer.donation', 'alias': 'donation', 'refs': {'source': '@donor', 'item': '@surplus'}, 'required': True, 'default_state': {'status': 'collected'}}
        ]
    },
    'agent-reorder': {
        'name': 'Agent Reorder',
        'description': 'Inventory check \u2192 low stock \u2192 draft order \u2192 approve \u2192 order placed',
        'steps': [
            {'type': 'actor.venue', 'alias': 'business', 'required': True, 'default_state': {'name': 'Business'}},
            {'type': 'observe.reading', 'alias': 'inventory-check', 'refs': {'subject': '@business'}, 'required': True, 'default_state': {'name': 'Inventory Check', 'reading_type': 'stock_level'}},
            {'type': 'actor.agent', 'alias': 'agent', 'refs': {'operator': '@business'}, 'required': True, 'default_state': {'name': 'Reorder Agent', 'capabilities': ['ordering']}},
            {'type': 'transfer.order', 'alias': 'draft-order', 'refs': {'buyer': '@business', 'agent': '@agent'}, 'required': True, 'default_state': {'status': 'draft', 'draft': True}},
            {'type': 'transfer.order', 'alias': 'confirmed-order', 'refs': {'buyer': '@business', 'updates': '@draft-order'}, 'required': True, 'default_state': {'status': 'confirmed'}}
        ]
    },
    'restaurant-sourcing': {
        'name': 'Restaurant Sourcing',
        'description': 'Restaurant needs ingredient \u2192 discovery \u2192 supplier offer \u2192 accept \u2192 order \u2192 delivery',
        'steps': [
            {'type': 'actor.venue', 'alias': 'restaurant', 'required': True, 'default_state': {'name': 'Restaurant'}},
            {'type': 'substance.ingredient', 'alias': 'needed', 'refs': {}, 'required': True, 'default_state': {'name': 'Ingredient Needed'}},
            {'type': 'actor.producer', 'alias': 'supplier', 'required': True, 'default_state': {'name': 'Supplier'}},
            {'type': 'transfer.offer', 'alias': 'offer', 'refs': {'seller': '@supplier', 'item': '@needed', 'buyer': '@restaurant'}, 'required': True, 'default_state': {'status': 'offered'}},
            {'type': 'transfer.order', 'alias': 'order', 'refs': {'buyer': '@restaurant', 'seller': '@supplier', 'item': '@needed'}, 'required': True, 'default_state': {'status': 'confirmed'}},
            {'type': 'transfer.delivery', 'alias': 'delivery', 'refs': {'order': '@order', 'seller': '@supplier', 'buyer': '@restaurant'}, 'required': True, 'default_state': {'status': 'delivered'}}
        ]
    },
    'food-safety-audit': {
        'name': 'Food Safety Audit',
        'description': 'Inspector visits \u2192 readings taken \u2192 report \u2192 certification \u2192 attestation',
        'steps': [
            {'type': 'actor.venue', 'alias': 'premises', 'required': True, 'default_state': {'name': 'Food Premises'}},
            {'type': 'actor.producer', 'alias': 'inspector', 'required': True, 'default_state': {'name': 'Food Safety Inspector'}},
            {'type': 'observe.reading', 'alias': 'readings', 'refs': {'subject': '@premises', 'author': '@inspector'}, 'required': True, 'default_state': {'name': 'Safety Readings'}},
            {'type': 'observe.certification', 'alias': 'certificate', 'refs': {'subject': '@premises', 'authority': '@inspector'}, 'required': True, 'default_state': {'name': 'Food Safety Certificate'}},
            {'type': 'observe.attestation', 'alias': 'attestation', 'refs': {'confirms': '@certificate', 'attestor': '@inspector'}, 'required': True, 'default_state': {'confidence': 'verified'}}
        ]
    },
    'market-day': {
        'name': 'Market Day',
        'description': 'Producer brings stock \u2192 stall setup \u2192 sales \u2192 end-of-day surplus \u2192 donation',
        'steps': [
            {'type': 'actor.producer', 'alias': 'producer', 'required': True, 'default_state': {'name': 'Market Producer'}},
            {'type': 'place.market', 'alias': 'market', 'required': True, 'default_state': {'name': 'Farmers Market'}},
            {'type': 'substance.product', 'alias': 'stock', 'refs': {'seller': '@producer'}, 'required': True, 'default_state': {'name': 'Market Stock'}},
            {'type': 'transfer.order', 'alias': 'sales', 'refs': {'seller': '@producer', 'item': '@stock'}, 'required': False, 'default_state': {'status': 'completed'}},
            {'type': 'substance.surplus', 'alias': 'leftover', 'refs': {'seller': '@producer', 'source': '@stock'}, 'required': False, 'default_state': {'name': 'End of Day Surplus', 'status': 'available'}}
        ]
    },
    'cold-chain': {
        'name': 'Cold Chain',
        'description': 'Shipment departs \u2192 temperature readings \u2192 delivery \u2192 chain verified',
        'steps': [
            {'type': 'actor.distributor', 'alias': 'carrier', 'required': True, 'default_state': {'name': 'Cold Chain Carrier'}},
            {'type': 'transfer.delivery', 'alias': 'shipment', 'refs': {'carrier': '@carrier'}, 'required': True, 'default_state': {'status': 'in_transit'}},
            {'type': 'observe.reading', 'alias': 'temp-log', 'refs': {'subject': '@shipment'}, 'required': True, 'default_state': {'name': 'Temperature Log', 'reading_type': 'temperature'}},
            {'type': 'observe.attestation', 'alias': 'chain-verified', 'refs': {'confirms': '@shipment', 'attestor': '@carrier'}, 'required': True, 'default_state': {'confidence': 'verified', 'method': 'continuous_monitoring'}}
        ]
    }
}

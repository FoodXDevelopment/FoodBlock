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
    }
}

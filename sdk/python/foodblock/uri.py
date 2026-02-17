"""
FoodBlock URI scheme: fb:<hash> or fb:<type>/<alias>

Usage:
    to_uri(block) => 'fb:a1b2c3...'
    to_uri(block, alias='sourdough') => 'fb:substance.product/sourdough'
    from_uri('fb:a1b2c3...') => {'hash': 'a1b2c3...'}
    from_uri('fb:substance.product/sourdough') => {'type': 'substance.product', 'alias': 'sourdough'}
"""

URI_PREFIX = 'fb:'


def to_uri(block_or_hash, alias=None):
    """Convert a block or hash to a FoodBlock URI."""
    if alias:
        block_type = block_or_hash.get('type') if isinstance(block_or_hash, dict) else None
        if block_type:
            return f'{URI_PREFIX}{block_type}/{alias}'

    hash_val = block_or_hash if isinstance(block_or_hash, str) else block_or_hash.get('hash', '')
    return f'{URI_PREFIX}{hash_val}'


def from_uri(uri):
    """Parse a FoodBlock URI."""
    if not uri.startswith(URI_PREFIX):
        raise ValueError(f'FoodBlock: invalid URI, must start with "{URI_PREFIX}"')

    body = uri[len(URI_PREFIX):]

    slash_idx = body.find('/')
    dot_idx = body.find('.')
    if slash_idx != -1 and dot_idx != -1 and dot_idx < slash_idx:
        return {
            'type': body[:slash_idx],
            'alias': body[slash_idx + 1:]
        }

    return {'hash': body}

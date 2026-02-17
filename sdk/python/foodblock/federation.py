"""
FoodBlock Federation — multi-server discovery and cross-server resolution.

Usage:
    info = await discover('https://farm.example.com')
    resolve = federated_resolver(['http://localhost:3111', 'https://farm.example.com'])
    block = await resolve('a1b2c3...')
"""


async def discover(server_url, session=None):
    """
    Discover a FoodBlock server's capabilities.

    Args:
        server_url: Base URL of the server
        session: Optional aiohttp.ClientSession or compatible
    """
    url = f"{server_url.rstrip('/')}/.well-known/foodblock"

    if session:
        async with session.get(url) as resp:
            resp.raise_for_status()
            return await resp.json()

    # Fallback to synchronous requests
    try:
        import requests
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except ImportError:
        raise ImportError("Install 'requests' or 'aiohttp' for federation support")


def federated_resolver(servers, session=None, cache=True):
    """
    Create a resolver that tries multiple servers.

    Args:
        servers: List of server URLs in priority order
        session: Optional HTTP session
        cache: Whether to cache resolved blocks

    Returns:
        async (hash) -> block or None
    """
    _cache = {} if cache else None

    async def resolve(hash_val):
        if _cache is not None and hash_val in _cache:
            return _cache[hash_val]

        for server in servers:
            try:
                url = f"{server.rstrip('/')}/blocks/{hash_val}"

                if session and hasattr(session, 'get'):
                    # aiohttp style
                    async with session.get(url) as resp:
                        if resp.status == 200:
                            block = await resp.json()
                            if block and 'error' not in block:
                                if _cache is not None:
                                    _cache[hash_val] = block
                                return block
                else:
                    # Sync fallback
                    try:
                        import requests
                        resp = requests.get(url, timeout=10)
                        if resp.status_code == 200:
                            block = resp.json()
                            if block and 'error' not in block:
                                if _cache is not None:
                                    _cache[hash_val] = block
                                return block
                    except ImportError:
                        continue
            except Exception:
                continue

        return None

    return resolve


def well_known(info):
    """Generate the well-known discovery document for a server."""
    return {
        'protocol': 'foodblock',
        'version': info.get('version', '0.4.0'),
        'name': info.get('name', 'FoodBlock Server'),
        'types': info.get('types', []),
        'count': info.get('count', 0),
        'schemas': info.get('schemas', []),
        'templates': info.get('templates', []),
        'peers': info.get('peers', []),
        'endpoints': {
            'blocks': '/blocks',
            'batch': '/blocks/batch',
            'chain': '/chain',
            'heads': '/heads'
        }
    }

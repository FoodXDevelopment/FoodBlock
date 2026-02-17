"""
Offline queue for creating FoodBlocks without network connectivity.
Blocks are stored locally and synced when connectivity is restored.

See Section 5.5 of the whitepaper.
"""

import json
from .block import create, update


class OfflineQueue:
    """Offline queue that stores blocks locally for later batch sync."""

    def __init__(self):
        self._blocks = []

    def create(self, type, state=None, refs=None):
        """Create a block and add it to the offline queue."""
        block = create(type, state or {}, refs or {})
        self._blocks.append(block)
        return block

    def update(self, previous_hash, type, state=None, refs=None):
        """Create an update block and add it to the offline queue."""
        block = update(previous_hash, type, state or {}, refs or {})
        self._blocks.append(block)
        return block

    @property
    def blocks(self):
        """Get all queued blocks (copy)."""
        return list(self._blocks)

    @property
    def length(self):
        """Number of queued blocks."""
        return len(self._blocks)

    def clear(self):
        """Clear the queue (e.g. after successful sync)."""
        self._blocks = []

    def sorted(self):
        """
        Sort blocks in dependency order for sync.
        Blocks that reference other blocks in the queue are placed after their dependencies.
        """
        hashes = {b['hash'] for b in self._blocks}
        graph = {}

        for block in self._blocks:
            deps = []
            refs = block.get('refs', {})
            for ref in refs.values():
                ref_hashes = ref if isinstance(ref, list) else [ref]
                for h in ref_hashes:
                    if h in hashes:
                        deps.append(h)
            graph[block['hash']] = deps

        # Topological sort
        visited = set()
        result = []

        def visit(h):
            if h in visited:
                return
            visited.add(h)
            for dep in graph.get(h, []):
                visit(dep)
            block = next((b for b in self._blocks if b['hash'] == h), None)
            if block:
                result.append(block)

        for block in self._blocks:
            visit(block['hash'])

        return result

    def sync(self, url, session=None):
        """
        Sync queued blocks to a remote server.

        Args:
            url: The FoodBlock server URL (e.g. 'http://localhost:3111')
            session: Optional requests.Session or compatible HTTP client.
                     Must have a .post(url, json=...) method.

        Returns:
            dict with inserted, skipped, failed arrays

        Raises:
            ImportError if requests is not installed and no session provided
            Exception on HTTP errors
        """
        if session is None:
            try:
                import requests
                session = requests.Session()
            except ImportError:
                raise ImportError(
                    "Install 'requests' for sync support: pip install requests"
                )

        sorted_blocks = self.sorted()
        response = session.post(
            f"{url}/blocks/batch",
            json={"blocks": sorted_blocks}
        )
        response.raise_for_status()
        result = response.json()
        self.clear()
        return result


def offline_queue():
    """Create a new offline queue."""
    return OfflineQueue()

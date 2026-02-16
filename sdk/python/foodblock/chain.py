"""Provenance chain traversal."""

from typing import Callable, Optional
import asyncio


async def chain(start_hash: str, resolve: Callable, max_depth: int = 100) -> list:
    """
    Follow the update chain backwards from a block.
    resolve: async (hash) -> block or None
    Returns list of blocks from newest to oldest.
    """
    visited = set()
    result = []
    current = start_hash
    depth = 0

    while current and depth < max_depth:
        if current in visited:
            break
        visited.add(current)

        block = await resolve(current)
        if not block:
            break

        result.append(block)

        refs = block.get("refs", {})
        updates = refs.get("updates")
        if isinstance(updates, list):
            current = updates[0] if updates else None
        else:
            current = updates

        depth += 1

    return result


async def tree(start_hash: str, resolve: Callable, max_depth: int = 20) -> Optional[dict]:
    """
    Follow ALL refs recursively to build the full provenance tree.
    Returns { block, ancestors: { role: subtree } }
    """
    visited = set()

    async def build(hash_: str, depth: int):
        if not hash_ or depth >= max_depth or hash_ in visited:
            return None
        visited.add(hash_)

        block = await resolve(hash_)
        if not block:
            return None

        ancestors = {}
        refs = block.get("refs", {})
        for role, ref in refs.items():
            hashes = ref if isinstance(ref, list) else [ref]
            subtrees = []
            for h in hashes:
                subtree = await build(h, depth + 1)
                if subtree:
                    subtrees.append(subtree)
            if len(subtrees) == 1:
                ancestors[role] = subtrees[0]
            elif len(subtrees) > 1:
                ancestors[role] = subtrees

        return {"block": block, "ancestors": ancestors}

    return await build(start_hash, 0)


async def head(start_hash: str, resolve_forward: Callable) -> str:
    """
    Find the head (latest version) of an update chain.

    Takes any hash in the chain and walks forward to the latest version.
    resolve_forward: async (hash) -> list of blocks that reference this hash via refs.updates

    Returns the hash of the head block.
    """
    current = start_hash

    while True:
        children = await resolve_forward(current)
        updater = None
        for child in children:
            refs = child.get("refs", {})
            updates = refs.get("updates")
            if isinstance(updates, list):
                if current in updates:
                    updater = child
                    break
            elif updates == current:
                updater = child
                break

        if not updater:
            break
        current = updater.get("hash", updater.get("hash"))

    return current

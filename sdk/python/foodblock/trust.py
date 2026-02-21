"""FoodBlock Trust Computation (Section 6.3).

Computes a trust score for an actor from five inputs derived
from the FoodBlock graph. Supports custom trust policies.
"""

from datetime import datetime, timezone
from .block import create

DEFAULT_WEIGHTS = {
    'authority_certs': 3.0,
    'peer_reviews': 1.0,
    'chain_depth': 2.0,
    'verified_orders': 1.5,
    'account_age': 0.5,
}


def compute_trust(actor_hash, blocks, policy=None):
    """Compute trust score for an actor.

    Args:
        actor_hash: Hash of the actor to score
        blocks: List of all known blocks (or relevant subset)
        policy: Optional trust policy override (weights, required_authorities, min_score)

    Returns:
        dict with score, inputs, meets_minimum
    """
    if not actor_hash or not isinstance(actor_hash, str):
        raise ValueError('FoodBlock: actor_hash is required')
    if not isinstance(blocks, list):
        raise ValueError('FoodBlock: blocks must be a list')

    policy = policy or {}
    weights = {**DEFAULT_WEIGHTS, **(policy.get('weights') or {})}
    now = datetime.now(timezone.utc)

    peer = _compute_peer_reviews(actor_hash, blocks)
    inputs = {
        'authority_certs': _count_authority_certs(actor_hash, blocks),
        'peer_reviews': peer,
        'chain_depth': _compute_chain_depth(actor_hash, blocks),
        'verified_orders': _count_verified_orders(actor_hash, blocks),
        'account_age': _compute_account_age(actor_hash, blocks, now),
    }

    score = (
        inputs['authority_certs'] * weights['authority_certs']
        + peer['weighted_score'] * weights['peer_reviews']
        + inputs['chain_depth'] * weights['chain_depth']
        + inputs['verified_orders'] * weights['verified_orders']
        + inputs['account_age'] * weights['account_age']
    )

    min_score = policy.get('min_score', 0)
    return {'score': score, 'inputs': inputs, 'meets_minimum': score >= min_score}


def _count_authority_certs(actor_hash, blocks):
    count = 0
    now = datetime.now(timezone.utc)
    for b in blocks:
        if b.get('type') != 'observe.certification':
            continue
        refs = b.get('refs') or {}
        if refs.get('subject') != actor_hash:
            continue
        valid_until = (b.get('state') or {}).get('valid_until')
        if valid_until:
            try:
                parsed = datetime.fromisoformat(valid_until.replace('Z', '+00:00'))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                if parsed < now:
                    continue
            except (ValueError, AttributeError):
                pass
        count += 1
    return count


def _compute_peer_reviews(actor_hash, blocks):
    reviews = []
    for b in blocks:
        if b.get('type') != 'observe.review':
            continue
        refs = b.get('refs') or {}
        if refs.get('subject') != actor_hash:
            continue
        state = b.get('state') or {}
        if not isinstance(state.get('rating'), (int, float)):
            continue
        reviews.append(b)

    if not reviews:
        return {'count': 0, 'avg_score': 0, 'weighted_score': 0}

    total_weighted = 0
    total_weight = 0

    for review in reviews:
        refs = review.get('refs') or {}
        reviewer_hash = refs.get('author') or review.get('author_hash')
        density = connection_density(reviewer_hash, actor_hash, blocks)
        weight = 1 - density
        total_weighted += (review['state']['rating'] / 5.0) * weight
        total_weight += weight

    avg_score = sum(r['state']['rating'] for r in reviews) / len(reviews)
    weighted_score = (total_weighted / total_weight * len(reviews)) if total_weight > 0 else 0

    return {'count': len(reviews), 'avg_score': avg_score, 'weighted_score': weighted_score}


def _compute_chain_depth(actor_hash, blocks):
    authors = set()
    for b in blocks:
        refs = b.get('refs')
        if not refs:
            continue
        refs_actor = any(
            v == actor_hash or (isinstance(v, list) and actor_hash in v)
            for v in refs.values()
        )
        if refs_actor and b.get('author_hash'):
            authors.add(b['author_hash'])
    return len(authors)


def _count_verified_orders(actor_hash, blocks):
    count = 0
    for b in blocks:
        typ = b.get('type', '')
        if not typ.startswith('transfer.order'):
            continue
        refs = b.get('refs') or {}
        if refs.get('buyer') != actor_hash and refs.get('seller') != actor_hash:
            continue
        state = b.get('state') or {}
        if state.get('adapter_ref') or state.get('payment_ref'):
            count += 1
    return count


def _compute_account_age(actor_hash, blocks, now):
    for b in blocks:
        if b.get('hash') == actor_hash and b.get('created_at'):
            try:
                created = datetime.fromisoformat(b['created_at'].replace('Z', '+00:00'))
                days = (now - created).total_seconds() / 86400
                return min(days, 365)
            except (ValueError, AttributeError):
                pass
    return 0


def connection_density(actor_a, actor_b, blocks):
    """Measure connection density between two actors (Section 6.3 sybil resistance).

    Returns 0..1 where 0 = no shared refs, 1 = fully connected.
    """
    if not actor_a or not actor_b:
        return 0

    refs_a = set()
    refs_b = set()

    for b in blocks:
        refs = b.get('refs')
        if not refs:
            continue
        vals = []
        for v in refs.values():
            if isinstance(v, list):
                vals.extend(v)
            else:
                vals.append(v)

        if actor_a in vals:
            for v in vals:
                if v != actor_a:
                    refs_a.add(v)
        if actor_b in vals:
            for v in vals:
                if v != actor_b:
                    refs_b.add(v)

    if not refs_a or not refs_b:
        return 0

    shared = len(refs_a & refs_b)
    union = len(refs_a | refs_b)
    return shared / union if union > 0 else 0


def create_trust_policy(name, weights, required_authorities=None, min_score=None, author=None):
    """Create a trust policy block.

    Args:
        name: Policy name
        weights: Custom weights dict
        required_authorities: List of required authority hashes
        min_score: Minimum trust score
        author: Author hash

    Returns:
        The trust policy FoodBlock
    """
    state = {'name': name, 'weights': weights}
    if required_authorities is not None:
        state['required_authorities'] = required_authorities
    if min_score is not None:
        state['min_score'] = min_score

    refs = {}
    if author:
        refs['author'] = author

    return create('observe.trust_policy', state, refs)

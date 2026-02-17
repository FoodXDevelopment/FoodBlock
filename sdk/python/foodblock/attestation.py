"""
FoodBlock Attestation — multi-party trust.

Attestations let actors vouch for the accuracy of blocks. Disputes let them
challenge blocks. Together they form a trust graph that can be scored.

Usage:
    a = attest(bread_hash, inspector_hash, confidence='verified', method='visual_inspection')
    d = dispute(bread_hash, whistleblower_hash, reason='Mislabeled organic status')
    info = trace_attestations(bread_hash, all_blocks)
    score = trust_score(bread_hash, all_blocks)
"""

from datetime import datetime, timezone

from .block import create


def attest(target_hash, attestor_hash, confidence='verified', method=None):
    """
    Create an observe.attestation block vouching for a target block.

    Args:
        target_hash: hash of the block being attested to
        attestor_hash: hash of the actor block making the attestation
        confidence: level of confidence, e.g. 'verified', 'witnessed', 'reported', 'uncertain'
        method: optional description of verification method

    Returns:
        An observe.attestation FoodBlock dict
    """
    if not target_hash:
        raise ValueError("FoodBlock: target_hash is required")
    if not attestor_hash:
        raise ValueError("FoodBlock: attestor_hash is required")

    state = {'confidence': confidence}
    if method:
        state['method'] = method

    return create('observe.attestation', state, {
        'confirms': target_hash,
        'attestor': attestor_hash,
    })


def dispute(target_hash, disputor_hash, reason, **kwargs):
    """
    Create an observe.dispute block challenging a target block.

    Args:
        target_hash: hash of the block being disputed
        disputor_hash: hash of the actor block raising the dispute
        reason: human-readable reason for the dispute
        **kwargs: additional state fields (e.g. evidence, severity)

    Returns:
        An observe.dispute FoodBlock dict
    """
    if not target_hash:
        raise ValueError("FoodBlock: target_hash is required")
    if not disputor_hash:
        raise ValueError("FoodBlock: disputor_hash is required")
    if not reason:
        raise ValueError("FoodBlock: reason is required")

    state = {'reason': reason}
    state.update(kwargs)

    return create('observe.dispute', state, {
        'challenges': target_hash,
        'disputor': disputor_hash,
    })


def trace_attestations(hash_val, all_blocks):
    """
    Find all attestations and disputes for a given block hash.

    Scans all_blocks for observe.attestation and observe.dispute blocks
    whose refs.target matches hash_val.

    Args:
        hash_val: hash of the block to trace
        all_blocks: list of all known block dicts

    Returns:
        {
            'attestations': [attestation_blocks],
            'disputes': [dispute_blocks],
            'score': int (net trust score),
        }
    """
    attestations = []
    disputes = []

    for block in all_blocks:
        refs = block.get('refs', {})

        if refs.get('confirms') == hash_val and block.get('type') == 'observe.attestation':
            attestations.append(block)
        elif refs.get('challenges') == hash_val and block.get('type') == 'observe.dispute':
            disputes.append(block)

    score = _compute_score(attestations, disputes)

    return {
        'attestations': attestations,
        'disputes': disputes,
        'score': score,
    }


def trust_score(hash_val, all_blocks):
    """
    Compute the net trust score for a block.

    Each attestation adds points based on confidence level.
    Each dispute subtracts points.

    Args:
        hash_val: hash of the block to score
        all_blocks: list of all known block dicts

    Returns:
        int trust score (can be negative)
    """
    result = trace_attestations(hash_val, all_blocks)
    return result['score']


# Confidence level weights for scoring
_CONFIDENCE_WEIGHTS = {
    'verified': 3,
    'witnessed': 2,
    'reported': 1,
    'uncertain': 0,
}

# Dispute severity weights
_DISPUTE_WEIGHTS = {
    'critical': -5,
    'major': -3,
    'minor': -1,
}

_DEFAULT_DISPUTE_WEIGHT = -2


def _compute_score(attestations, disputes):
    """Compute a net trust score from attestations and disputes."""
    score = 0

    for att in attestations:
        confidence = att.get('state', {}).get('confidence', 'reported')
        score += _CONFIDENCE_WEIGHTS.get(confidence, 1)

    for disp in disputes:
        severity = disp.get('state', {}).get('severity')
        if severity and severity in _DISPUTE_WEIGHTS:
            score += _DISPUTE_WEIGHTS[severity]
        else:
            score += _DEFAULT_DISPUTE_WEIGHT

    return score

"""Tombstone block creation for content erasure (Section 5.4)."""
import uuid
from datetime import datetime, timezone
from .block import create

def tombstone(target_hash: str, requested_by: str, reason: str = "erasure_request") -> dict:
    """Create a tombstone block that marks a target for content erasure."""
    if not target_hash:
        raise ValueError("FoodBlock: target_hash is required")
    if not requested_by:
        raise ValueError("FoodBlock: requested_by is required")
    return create("observe.tombstone", {
        "instance_id": str(uuid.uuid4()),
        "reason": reason,
        "requested_by": requested_by,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }, {
        "target": target_hash,
        "updates": target_hash,
    })

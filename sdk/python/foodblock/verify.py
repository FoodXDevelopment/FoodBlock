"""Ed25519 signing and verification for FoodBlocks."""

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from .canonical import canonical


def generate_keypair() -> dict:
    """Generate a new Ed25519 keypair. Returns { public_key, private_key } as hex."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    return {
        "public_key": public_key.public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw
        ).hex(),
        "private_key": private_key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption()
        ).hex()
    }


def sign(block: dict, author_hash: str, private_key_hex: str) -> dict:
    """Sign a FoodBlock. Returns { foodblock, author_hash, signature }."""
    private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(private_key_hex))
    content = canonical(block["type"], block["state"], block["refs"])
    signature = private_key.sign(content.encode("utf-8"))

    return {
        "foodblock": block,
        "author_hash": author_hash,
        "signature": signature.hex(),
        "protocol_version": "0.4.0"
    }


def verify(wrapper: dict, public_key_hex: str) -> bool:
    """Verify a signed FoodBlock wrapper. Returns True if valid."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    public_key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
    block = wrapper["foodblock"]
    content = canonical(block["type"], block["state"], block["refs"])

    try:
        public_key.verify(
            bytes.fromhex(wrapper["signature"]),
            content.encode("utf-8")
        )
        return True
    except Exception:
        return False

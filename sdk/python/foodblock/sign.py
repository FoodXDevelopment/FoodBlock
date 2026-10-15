"""Signing (protocol.md, Encoding): Ed25519 over the canonical UTF-8 string of { type, state, refs }. A signing key is
its SPKI DER bytes in lowercase hex; a private key its PKCS#8 DER bytes in hex (a raw 32-byte seed is read too); a
signature the 64-byte signature in lowercase hex. `sign` signs; `seal` (envelope.py) encrypts. A signed message part
is signed over its canonical JSON without its `signature` key."""

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .canonical import canonical, canonical_json

PKCS8_ED25519 = "302e020100300506032b657004220420"
SPKI_ED25519 = "302a300506032b6570032100"


def keypair_from_seed(seed_hex: str) -> dict:
    """The signing key a 32-byte seed (hex) gives: { public_key_sign, private_key }. How the vectors' keys are rebuilt."""
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(seed_hex))
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    return {"public_key_sign": SPKI_ED25519 + public, "private_key": PKCS8_ED25519 + seed_hex.lower()}


def generate_keypair() -> dict:
    """A new signing key: { public_key_sign, private_key } (hex)."""
    seed = Ed25519PrivateKey.generate().private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                                                      serialization.NoEncryption())
    return keypair_from_seed(seed.hex())


def _private(private_key_hex: str) -> Ed25519PrivateKey:
    key = str(private_key_hex).lower()
    if key.startswith(PKCS8_ED25519) and len(key) == 96:
        key = key[len(PKCS8_ED25519):]
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(key))


def _public(public_key_hex: str) -> Ed25519PublicKey:
    key = str(public_key_hex).lower()
    if key.startswith(SPKI_ED25519) and len(key) == 88:
        key = key[len(SPKI_ED25519):]
    return Ed25519PublicKey.from_public_bytes(bytes.fromhex(key))


def _bytes(block: dict) -> bytes:
    return canonical(block["type"], block.get("state") or {}, block.get("refs") or {}).encode("utf-8")


def sign(block: dict, private_key_hex: str) -> str:
    """The author's signature over a block's canonical form: hex. (The write check is `check`; `write` does both.)"""
    return _private(private_key_hex).sign(_bytes(block)).hex()


def verify(block: dict, signature_hex, public_key_sign) -> bool:
    """Whether a signature is this key's over exactly this block. Never raises."""
    try:
        _public(public_key_sign).verify(bytes.fromhex(str(signature_hex)), _bytes(block))
        return True
    except Exception:
        return False


def sign_message(part: dict, private_key_hex: str) -> dict:
    """A message part, signed: the part with `signature` added (over its canonical JSON without `signature`)."""
    rest = {k: v for k, v in part.items() if k != "signature"}
    return {**rest, "signature": _private(private_key_hex).sign(canonical_json(rest).encode("utf-8")).hex()}


def verify_message(part, public_key_hex) -> bool:
    """Whether a signed message part's `signature` is this key's. Never raises."""
    try:
        rest = {k: v for k, v in (part or {}).items() if k != "signature"}
        _public(public_key_hex).verify(bytes.fromhex(str((part or {}).get("signature"))), canonical_json(rest).encode("utf-8"))
        return True
    except Exception:
        return False

"""
Envelope encryption for FoodBlock visibility fields.

Uses X25519 key agreement + AES-256-GCM symmetric encryption.
Keys are raw 32-byte format (hex), cross-language compatible with JS SDK.

See Section 7.2 of the whitepaper.
"""

import json
import os
import hashlib
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64


def generate_encryption_keypair() -> dict:
    """Generate an X25519 keypair for encryption.
    Returns { public_key, private_key } as hex strings (raw 32-byte)."""
    from cryptography.hazmat.primitives import serialization

    private_key = X25519PrivateKey.generate()
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


def encrypt(value, recipient_public_keys: list) -> dict:
    """Encrypt a value for multiple recipients using envelope encryption.

    Args:
        value: The value to encrypt (will be JSON-serialized)
        recipient_public_keys: List of recipient X25519 public keys (hex, raw 32-byte)

    Returns:
        Encryption envelope per Section 7.2
    """
    if not recipient_public_keys:
        raise ValueError("FoodBlock: at least one recipient public key is required")

    plaintext = json.dumps(value).encode("utf-8")

    # Generate random content key and nonce
    content_key = os.urandom(32)
    nonce = os.urandom(12)

    # Encrypt the value with the content key (AES-256-GCM)
    aesgcm = AESGCM(content_key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    ciphertext_b64 = base64.b64encode(ciphertext).decode("ascii")

    # Generate ephemeral X25519 keypair for ECDH
    from cryptography.hazmat.primitives import serialization
    eph_private = X25519PrivateKey.generate()
    eph_public = eph_private.public_key()
    eph_public_hex = eph_public.public_bytes(
        serialization.Encoding.Raw,
        serialization.PublicFormat.Raw
    ).hex()

    recipients = []
    for pub_key_hex in recipient_public_keys:
        recipient_key = X25519PublicKey.from_public_bytes(bytes.fromhex(pub_key_hex))

        # Derive shared secret via ECDH
        shared_secret = eph_private.exchange(recipient_key)

        # Use shared secret to encrypt the content key
        key_nonce = os.urandom(12)
        key_aesgcm = AESGCM(shared_secret)
        encrypted_key = key_aesgcm.encrypt(key_nonce, content_key, None)

        # Append key_nonce to encrypted_key for transport
        encrypted_key_with_nonce = encrypted_key + key_nonce
        encrypted_key_b64 = base64.b64encode(encrypted_key_with_nonce).decode("ascii")

        key_hash = hashlib.sha256(bytes.fromhex(pub_key_hex)).hexdigest()

        recipients.append({
            "key_hash": key_hash,
            "encrypted_key": encrypted_key_b64
        })

    return {
        "alg": "x25519-aes-256-gcm",
        "ephemeral_key": eph_public_hex,
        "recipients": recipients,
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": ciphertext_b64
    }


def decrypt(envelope: dict, private_key_hex: str, public_key_hex: str):
    """Decrypt an encryption envelope.

    Args:
        envelope: The encryption envelope
        private_key_hex: Recipient's X25519 private key (hex, raw 32-byte)
        public_key_hex: Recipient's X25519 public key (hex, for key_hash matching)

    Returns:
        The decrypted value (JSON-parsed)
    """
    key_hash = hashlib.sha256(bytes.fromhex(public_key_hex)).hexdigest()

    recipient = next((r for r in envelope["recipients"] if r["key_hash"] == key_hash), None)
    if recipient is None:
        raise ValueError("FoodBlock: no matching recipient entry found for this key")

    # Reconstruct ephemeral public key
    eph_public = X25519PublicKey.from_public_bytes(bytes.fromhex(envelope["ephemeral_key"]))
    private_key = X25519PrivateKey.from_private_bytes(bytes.fromhex(private_key_hex))

    # Derive shared secret
    shared_secret = private_key.exchange(eph_public)

    # Decrypt the content key
    encrypted_key_with_nonce = base64.b64decode(recipient["encrypted_key"])
    key_nonce = encrypted_key_with_nonce[-12:]
    encrypted_key = encrypted_key_with_nonce[:-12]

    key_aesgcm = AESGCM(shared_secret)
    content_key = key_aesgcm.decrypt(key_nonce, encrypted_key, None)

    # Decrypt the ciphertext
    ciphertext = base64.b64decode(envelope["ciphertext"])
    content_nonce = base64.b64decode(envelope["nonce"])

    aesgcm = AESGCM(content_key)
    plaintext = aesgcm.decrypt(content_nonce, ciphertext, None)

    return json.loads(plaintext.decode("utf-8"))

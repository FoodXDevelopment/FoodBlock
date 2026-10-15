"""The envelope (protocol.md, Encoding): a sealed copy's plaintext is encrypted with AES-256-GCM under a random 32-byte
content key and a 12-byte nonce, no additional data. A fresh X25519 key per envelope agrees a secret with each
recipient's key; HKDF-SHA256 (salted with the ephemeral public key's bytes then the recipient's, info from
protocol.json) turns it into the key that seals the content key, with its own 12-byte nonce. The envelope names no
recipient: each recipient tries every entry. `seal` encrypts; `sign` (sign.py) signs.
  ALG      written now (protocol.json envelope.write)
  ALG_RAW  read forever: the agreed secret itself sealed the content key
An older envelope's `key_hash` is ignored (aliases.json `envelope`)."""

import base64
import json
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .spec import PROTOCOL

ALG, ALG_RAW = PROTOCOL["envelope"]["read"][0], PROTOCOL["envelope"]["read"][1]
if PROTOCOL["envelope"]["write"] != ALG:
    raise RuntimeError("envelope: protocol.json writes the first alg it reads")
HKDF_INFO = PROTOCOL["envelope"]["hkdf_info"].encode("utf-8")


def _raw(hex_text, length, what) -> bytes:
    data = bytes.fromhex(str(hex_text))
    if len(data) != length:
        raise ValueError(f"envelope: {what} is {length} bytes")
    return data


def _public_bytes(private: X25519PrivateKey) -> bytes:
    return private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def generate_encryption_keypair() -> dict:
    """A new encryption key: { public_key_encrypt, x25519_private } (raw 32 bytes, hex)."""
    key = X25519PrivateKey.generate()
    private = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    return {"public_key_encrypt": _public_bytes(key).hex(), "x25519_private": private.hex()}


def encryption_key_of(private_hex: str) -> str:
    """The public encryption key of an X25519 private key (hex)."""
    return _public_bytes(X25519PrivateKey.from_private_bytes(_raw(private_hex, 32, "an X25519 private key"))).hex()


def _sealing_key(alg, secret, ephemeral_hex, recipient_hex) -> bytes:
    if alg == ALG_RAW:
        return secret
    if alg != ALG:
        raise ValueError(f"envelope: unknown alg {alg}")
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=bytes.fromhex(ephemeral_hex) + bytes.fromhex(recipient_hex),
                info=HKDF_INFO).derive(secret)


def seal(value, recipient_keys, alg: str = ALG, fixed: dict = None) -> dict:
    """Encrypt a value (JSON) to recipients' encryption keys: { alg, ephemeral_key, nonce, ciphertext, recipients:
    [{ encrypted_key }] }. `fixed` ({ ephemeral, contentKey, nonce, keyNonces }) exists only to reproduce a vector."""
    if not recipient_keys:
        raise ValueError("envelope: at least one recipient key")
    fixed = fixed or {}
    content_key = bytes.fromhex(fixed["contentKey"]) if fixed.get("contentKey") else os.urandom(32)
    nonce = bytes.fromhex(fixed["nonce"]) if fixed.get("nonce") else os.urandom(12)
    ephemeral = (X25519PrivateKey.from_private_bytes(_raw(fixed["ephemeral"], 32, "an X25519 private key"))
                 if fixed.get("ephemeral") else X25519PrivateKey.generate())
    ephemeral_hex = _public_bytes(ephemeral).hex()
    key_nonces = fixed.get("keyNonces") or []
    recipients = []
    for i, key in enumerate(recipient_keys):
        key_nonce = bytes.fromhex(key_nonces[i]) if i < len(key_nonces) and key_nonces[i] else os.urandom(12)
        secret = ephemeral.exchange(X25519PublicKey.from_public_bytes(_raw(key, 32, "an X25519 public key")))
        sealed = AESGCM(_sealing_key(alg, secret, ephemeral_hex, key)).encrypt(key_nonce, content_key, None)
        recipients.append({"encrypted_key": base64.b64encode(sealed + key_nonce).decode("ascii")})
    plaintext = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return {"alg": alg, "ephemeral_key": ephemeral_hex, "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(AESGCM(content_key).encrypt(nonce, plaintext, None)).decode("ascii"),
            "recipients": recipients}


def open(envelope: dict, private_hex: str):  # noqa: A001 (the protocol's word)
    """Open an envelope with a recipient's X25519 private key: the value inside. Every entry is tried; none names its
    recipient."""
    private = X25519PrivateKey.from_private_bytes(_raw(private_hex, 32, "an X25519 private key"))
    mine = _public_bytes(private).hex()
    secret = private.exchange(X25519PublicKey.from_public_bytes(_raw(envelope["ephemeral_key"], 32, "an X25519 public key")))
    key = _sealing_key(envelope.get("alg") or ALG_RAW, secret, envelope["ephemeral_key"], mine)
    for entry in envelope.get("recipients") or []:
        sealed = base64.b64decode(entry["encrypted_key"])
        try:
            content_key = AESGCM(key).decrypt(sealed[-12:], sealed[:-12], None)
        except (InvalidTag, ValueError):
            continue
        plaintext = AESGCM(content_key).decrypt(base64.b64decode(envelope["nonce"]), base64.b64decode(envelope["ciphertext"]), None)
        return json.loads(plaintext.decode("utf-8"))
    raise ValueError("envelope: no entry opens with this key")

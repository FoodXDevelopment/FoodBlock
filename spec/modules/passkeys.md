# Passkeys

A passkey is a FoodBlock key. The phone's own sign-in, a fingerprint or a face, signs the block. No seed phrase, no key file, no app to install. This page is the one signature form that makes it so. It belongs to the `p256` suite (encoding.md, Other suites).

**The idea.** A passkey is a P-256 key that never leaves the person's device. To use it, a program asks the device to sign a *challenge*. The device signs a small package (WebAuthn, the browser standard for passkeys) that holds the challenge. FoodBlock sets the challenge to the hash of the block. So the signature on the package is a signature on the block, and anyone can check it with the key and the block alone.

## The key

The key is an ordinary `p256` signing key (encoding.md, Other suites): `state.public_key_sign` in the genesis or a key grant, `state.suite: "p256"`. WebAuthn gives it as SPKI DER (`getPublicKey()` with algorithm ES256, -7), which is the same bytes. From a COSE key (`x`, `y`, 32 bytes each) it is the suite's SPKI prefix, then `04`, `x`, `y`. Nothing marks a key as a passkey: the same key signs either way. A passkey that signed the genesis is the identity.

## The signature

The signature (hex) is these bytes, in this order:

| Part | Bytes |
|---|---|
| `r` then `s` | 64. The ECDSA signature the device made, as the raw numbers (a device gives them as ASN.1 DER; the signer converts) |
| length of `authenticatorData` | 2, big-endian |
| `authenticatorData` | as long as the length says, at least 37 |
| `clientDataJSON` | all the rest, at least 1 |

A signature of exactly 64 bytes is the plain form (encoding.md, Other suites). One of more is the passkey form. It travels where a signature travels: in the message `signature`, in the CBOR byte string, in the store. No other field travels with the block, and a reader needs nothing but the block, the signature and the key.

## What was signed, and the challenge

For the bytes `M` a signature covers (a block's canonical bytes; for a signed message part, canonical.md's bytes without `signature`):

- **the challenge** is `base64url(SHA-256(M))`: URL-safe alphabet (`-` and `_`), no `=` padding, 43 characters. For a block, `SHA-256(M)` is its id (p256 hashes with SHA-256), so the challenge is the id in base64url.
- **the device signs** `authenticatorData || SHA-256(clientDataJSON)` with ECDSA P-256 and SHA-256 (WebAuthn's ES256). So the verifier checks the ECDSA signature over exactly those bytes.

## The check

`verify(M, signature, key)` is true when all of these hold; otherwise false, with no reason given:

1. The key is a P-256 key (encoding.md, Other suites) and the signature is longer than 64 bytes and parses as the table says.
2. Bit 0 of the flags byte of `authenticatorData` (byte 32) is set: the user was present (`UP`).
3. `clientDataJSON` is UTF-8 JSON, an object, with no key repeated at any depth. Its `type` is the text `webauthn.get` and its `challenge` is the text above, byte for byte. No other member is read.
4. The ECDSA signature `r`, `s` opens over `authenticatorData || SHA-256(clientDataJSON)` with the key.

## What is deliberately not checked

The rule is: only what strangers must agree on. A stranger needs to know that the key held by the author approved these bytes. These parts of WebAuthn answer other questions, between the device and the site it works for, so the verifier ignores them:

- **`rpIdHash` and `origin`.** They say which website asked. The block names no website, a stranger cannot know which one the author meant, and the device itself already refuses to use a passkey for a site that does not own it. A key that signed is the proof.
- **The counter.** It exists so one site can notice a cloned key. The chain does it better: no two blocks of a key may name one `prev` (core.md, invariant 3). Synced passkeys keep it at 0.
- **`UV`** (the user was verified, by fingerprint or PIN), `BE`, `BS`, extensions, and `crossOrigin`. Whether to demand `UV` is the author's policy for their own device and stays on their node.
- **The attestation** made when the passkey was created. It says who made the device. The key alone is what a genesis carries.

`rpId` and the credential id are what a client needs to *ask* the device. They are the author's business and stay on their node. Losing them loses nothing a reader needs.

## Recovery

A passkey can be lost with its device. That is what the recovery key is for (identity.md). A key grant adds a second passkey on another device, and a rotation retires a lost one.

## Invariant

28. A passkey signature opens only for the key that made it, over the block it was asked to sign: it carries its own challenge, and a reader checks nothing but the block.

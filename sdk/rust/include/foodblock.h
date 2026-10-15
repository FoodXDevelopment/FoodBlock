/*
 * foodblock.h: the FoodBlock 1.6 C ABI (the Rust crate `foodblock`, built with --features ffi).
 *
 * JSON in, JSON out, as NUL-terminated UTF-8. Every function returns a status (FB_OK is 0). On success *out holds
 * the answer; on failure it holds the reason in plain words (for FB_ERR_REFUSED, a JSON array of refusals). Either
 * way, free *out with fb_free. No call keeps a pointer you gave it. Every call is safe from any thread.
 *
 * A block is JSON: { "hash", "type", "state", "refs", "signature" } (and "suite" when it is not std). Keys are hex:
 * a std signing key is Ed25519 SPKI DER (88 hex characters), a private key PKCS#8 DER (96) or its 32-byte seed (64),
 * an encryption key raw X25519 (64). The suites p256 and sm have longer keys (protocol.json "suites"); use fb_call.
 *
 * Build:  cargo rustc --release --features ffi --crate-type staticlib   (target/release/libfoodblock.a)
 * Link:   -lfoodblock, plus on Linux -lpthread -ldl -lm, on macOS -framework Security -framework CoreFoundation.
 * MIT licence.
 */
#ifndef FOODBLOCK_H
#define FOODBLOCK_H

#ifdef __cplusplus
extern "C" {
#endif

#define FB_OK 0
#define FB_ERR_ARGUMENT 1 /* a pointer was null, or text was not UTF-8 */
#define FB_ERR_JSON 2     /* the JSON could not be read */
#define FB_ERR_REFUSED 3  /* the write check refused the block: *out is [{ code, detail }] */
#define FB_ERR_CRYPTO 4   /* a key, signature, envelope or time was wrong */
#define FB_ERR_INTERNAL 5 /* a bug: the call stopped before it finished */

/* Free text this library returned. Null is fine. */
void fb_free(char *s);

/* The protocol version this library writes ("1.6"). */
int fb_version(char **out);

/* The canonical string of a block { type, state, refs } (spec/canonical.md). */
int fb_canonical(const char *block_json, char **out);

/* A block's id: SHA-256 of its canonical form, 64 hex characters (the std suite). */
int fb_hash(const char *block_json, char **out);

/* The signing key a 32-byte seed (hex) gives: { "public_key_sign", "private_key" }. A null seed makes a new key. */
int fb_keypair(const char *seed_hex, char **out);

/* A genesis, signed: who a person, agent or machine is. keys_json { public_key_sign, private_key };
 * options_json { kind, at, encryption_key, recovery_key (the offline key's public signing key), reach }: the recovery
 * fields come as a pair or not at all. */
int fb_genesis(const char *keys_json, const char *options_json, char **out);

/* The author's signature over a block's canonical form, 128 hex characters. */
int fb_sign(const char *block_json, const char *private_key, char **out);

/* Whether a signature is this key's over exactly this block: *out is "true" or "false". */
int fb_verify(const char *block_json, const char *signature, const char *public_key, char **out);

/* The write check: *out is a JSON array of reasons, "[]" when the block is well-formed 1.6.
 * options_json may be null, or { "held": [blocks], "schemas": [schema blocks] }. */
int fb_check(const char *block_json, const char *options_json, char **out);

/* Why every node refuses a block: *out is [{ code, detail }], one entry per rule found, codes from protocol.json
 * refusals.codes.block in its order ("[]" when well-formed). options_json as for fb_check. */
int fb_refusals(const char *block_json, const char *options_json, char **out);

/* Where a key's next block goes: { "seq", "prev" }. last_json is the key's latest block, or null; then
 * brought_in is the hash of the genesis or key grant that brought the key in. */
int fb_next_link(const char *last_json, const char *brought_in, char **out);

/* The one way to write: compose, check, sign, chain. options_json:
 * { author, key: { public_key_sign, private_key }, held: [the author's genesis, key grants and blocks], at,
 *   audience: [recipients], after: [heads seen], link: { seq, prev }, salts, nonce }.
 * *out is the signed block; FB_ERR_REFUSED gives the refusals, [{ code, detail }]. */
int fb_write(const char *type, const char *state_json, const char *refs_json, const char *options_json, char **out);

/* Encrypt a JSON value to recipients' X25519 keys (keys_json: a JSON array of hex keys): the envelope. */
int fb_seal(const char *value_json, const char *keys_json, char **out);

/* Open an envelope with a recipient's X25519 private key (hex): the JSON value inside. */
int fb_open(const char *envelope_json, const char *x25519_private, char **out);

/* The one JSON door, the same call Kotlin uses (src/door.rs). op is an operation name ("hash", "write", "promise_stage",
 * ...), args_json a JSON array of its arguments. *out is always the answer: {"ok": value} or {"error": kind, "message",
 * "code", "reasons", "refusals"}, kind one of argument, json, refused, crypto, profile, internal. Returns FB_OK whenever
 * an answer was made. Every language binding (Python, Swift, Go) is a thin layer over this one function. */
int fb_call(const char *op, const char *args_json, char **out);

#ifdef __cplusplus
}
#endif

#endif /* FOODBLOCK_H */

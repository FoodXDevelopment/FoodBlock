/*
 * foodblock.h: the FoodBlock C ABI (the Rust crate `foodblock`, built with --features ffi).
 *
 * JSON in, JSON out, as NUL-terminated UTF-8. Every function returns a status (FB_OK is 0). On success *out holds
 * the answer; on failure it holds the reason in plain words. Either
 * way, free *out with fb_free. No call keeps a pointer you gave it. Every call is safe from any thread.
 *
 * A block is JSON: { "hash", "type", "state", "refs", "signature" } (and "suite" when it is not std). Keys are hex:
 * a std signing key is Ed25519 SPKI DER (88 hex characters), a private key PKCS#8 DER (96) or its 32-byte seed (64),
 * an encryption key raw X25519 (64). The suites p256 and sm have longer keys (protocol.json "suites"); use fb_call.
 *
 * Build:  cargo rustc --release --features ffi --crate-type staticlib   (target/release/libfoodblock.a)
 * Link:   -lfoodblock, plus on Linux -lpthread -ldl -lm, on macOS -framework Security -framework CoreFoundation.
 * Public domain (CC0 1.0).
 */
#ifndef FOODBLOCK_H
#define FOODBLOCK_H

#ifdef __cplusplus
extern "C" {
#endif

#define FB_OK 0
#define FB_ERR_ARGUMENT 1 /* a pointer was null, or text was not UTF-8 */
#define FB_ERR_INTERNAL 5 /* a bug: the call stopped before it finished */

/* Free text this library returned. Null is fine. */
void fb_free(char *s);

/* The protocol version this library writes (protocol.json `version`). */
int fb_version(char **out);

/* The one JSON door, the same call Kotlin uses (src/door.rs). op is an operation name ("hash", "write", "promise_stage",
 * ...), args_json a JSON array of its arguments. *out is always the answer: {"ok": value} or {"error": kind, "message",
 * "code", "reasons", "refusals"}, kind one of argument, json, refused, crypto, profile, internal. Returns FB_OK whenever
 * an answer was made. Every operation is this one function ("canonical", "hash", "keypair", "genesis", "sign", "verify", "check", "refusals",
 * "next_link", "write", "seal", "open", ...); a block goes whole as one argument. Every language binding is a thin layer over it. */
int fb_call(const char *op, const char *args_json, char **out);

#ifdef __cplusplus
}
#endif

#endif /* FOODBLOCK_H */

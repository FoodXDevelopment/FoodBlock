# foodblock (Rust, C, C++)

FoodBlock 1.6 for machines: robots, vehicles, fridges, scales, sensors, and the computers that run them.

A **block** is a small signed message: `{ type, state, refs }`, signed by its author's key. Its id is the hash of its
canonical form (RFC 8785), in the hash of the signing key's suite, so any two peers agree on it byte for byte. This crate lets a device make its own
identity, sign what it measures or does, keep its own chain of blocks, check every block before it sends it, and
(on bigger devices) open sealed blocks and work out where a deal stands.

The rules come from the repository's `spec/` folder: `spec/core.md` and `spec/modules/` (normative) and
`spec/protocol.json` (every list and grammar). The crate builds the JSON in, and you can hand it your own copy at
runtime (`Spec::from_json`). No list is copied into code. There is no earlier version in the protocol: the feature
`legacy` adds the one-time converter (`legacy::convert`), which reads `spec/legacy/aliases-0.x.json`.

MIT licence.

## The three peers

The protocol names three sizes of peer (`peers` in protocol.json). Pick one with a Cargo feature.

| Profile | Feature | What it adds | Who |
|---|---|---|---|
| micro | `micro` | canonical form, SHA-256, Ed25519, `valid`, its own chain, the grant check | a sensor, a scale, an oven, a robot's body |
| edge | `edge` | the folds (a deal's stage, circles, who owns a thing, where it is) and Pull, Push, discovery | the computer at a farm, kitchen, shop or vehicle |
| node | `node` (default) | envelopes (X25519, HKDF-SHA256, AES-256-GCM) and sealed copies | a person's or machine's always-on node |

More features: `suites` (the suites `p256` and `sm` beside `std`: ECDSA and ECDH on P-256; SM2, SM3 and SM4), the
optional profiles `successor`, `ballots`, `rekeys`, `deposits`, `door` (the JSON door, in the default build), `legacy`
(the converter), and the doors `ffi`, `jni` and `wasm`. A suite not built in is refused with `unknown_suite`.

The micro core is `no_std` + `alloc`: build it with `--no-default-features --features micro`. Without the `std`
feature it has no clock and no randomness of its own, so you pass `at`, salts and nonces in (every option that needs
them takes them). With `std`, it uses the system clock and OS randomness.

Dependencies, all well known: `serde_json`, `indexmap`, `sha2`, `ed25519-dalek`, `unicode-normalization`,
`once_cell`, and only on `std` `getrandom`, only on `envelope` `x25519-dalek`, `aes-gcm`, `hkdf`, and only on `suites`
the RustCrypto crates `p256`, `ecdsa`, `elliptic-curve`, `sm2`, `sm3`, `sm4`, `hmac`. The grammar in
protocol.json runs on a small built-in regex engine, so there is no regex dependency.

## Rust

```rust
use foodblock::identity::{genesis, GenesisOptions};
use foodblock::{amount, keypair_from_seed, write, ComposeOptions, WriteOptions};
use serde_json::json;

let keys = foodblock::generate_keypair()?;              // made once, on the device
let me = genesis(&keys, &GenesisOptions { kind: "sensor", at: foodblock::time::now(),
    encryption_key: &my_x25519_public, recovery_key: &offline_recovery_public, reach: "P30D", ..Default::default() })?;
let id = me["hash"].as_str().unwrap().to_string();

// The one write path: compose, check, sign, chain. A reading is a decimal string, never a float.
let held = [me.clone()];
let reading = write("observe", &json!({ "kind": "reading", "amount": amount("3.9", "Cel") }),
    &json!({ "subject": id }),
    &WriteOptions { compose: ComposeOptions { author: id.clone(), ..Default::default() }, key: Some(&keys), held: &held, schemas: None })?;
let message = foodblock::wrap(&reading);                // { version, block, signature }: send this
```

`write` refuses a block that breaks a rule and returns every refusal (`err.refusals`: `{ code, detail }`, codes from
protocol.json `refusals.codes`; `err.reasons` the details alone); it never repairs. Other names
follow the JavaScript reference SDK: `canonical`, `hash`, `sign`, `verify`, `refusals`, `check`, `valid::valid`,
`next_link`, `check_chain`, `seal`, `open`, `seal_copy`, `open_copy`, `identity::*`, `grant::*`, `fold::*`
(`promise_stage`, `circle_state`, `members_then`, `where_now`, `ownership`, `successor_state`, `circle_key`), `views::*`
(`promise_view`, `live_grant`, `due`, `recovery_reach`, `withdrawal_seen`), `strangers::*` (`consent`, `receipt_code`,
`admission_refusals`), and
`sync::*` (signed pull and push, `accept`, signed answers, `.well-known` discovery, the local announcement and the
mDNS service `_foodblock._tcp`).

The smallest program is `examples/micro.rs`:

```bash
cargo run --example micro --profile micro --no-default-features --features std,micro
```

## WebAssembly (the JavaScript SDK)

`sdk/javascript` is a thin layer over this crate built for the browser and Node:
`node sdk/javascript/scripts/build-wasm.cjs` runs `cargo rustc --profile wasm --target wasm32-unknown-unknown --features wasm`
and ships the result as `sdk/javascript/core/foodblock.wasm`. It exports the same JSON door (`src/wasm.rs`: `fb_call`,
`fb_alloc`, `fb_dealloc`, `fb_out_len`); the host gives it `fb_random` and `fb_now_ms`.

## C

Build the static library with the C ABI, then include `include/foodblock.h`:

```bash
cargo rustc --release --features ffi --crate-type staticlib     # target/release/libfoodblock.a
```

Every function takes JSON text and gives JSON text back. It returns a status (`FB_OK` is 0); `*out` is the answer
or the reason, and you free it with `fb_free`.

```c
char *out = NULL;
if (fb_hash("{\"type\":\"thing\",\"state\":{\"kind\":\"eggs\"},\"refs\":{}}", &out) == FB_OK) puts(out);
fb_free(out);
```

The surface: `fb_version`, `fb_canonical`, `fb_hash`, `fb_keypair`, `fb_genesis`, `fb_sign`, `fb_verify`,
`fb_check`, `fb_next_link`, `fb_write`, `fb_seal`, `fb_open`, `fb_free`. Link with `-lfoodblock`
(macOS adds `-framework Security -framework CoreFoundation`; Linux adds `-lpthread -ldl -lm`).

### The one JSON door

`fb_call(op, args_json, &out)` is every operation in one function, the same call Kotlin makes through JNI
(`src/door.rs` is the one op table; `src/jni.rs` and `fb_call` are two doors onto it). `op` is a name (`"hash"`,
`"write"`, `"promise_stage"`, ...), `args_json` a JSON array, and `*out` is `{"ok": value}` or `{"error": kind,
"message", "code", "reasons", "refusals"}`. Python (`ctypes`), Swift (a SwiftPM system library) and Go (`cgo`) are thin
layers over this one function, so every rule lives here once. Build the shared library for Python with
`cargo rustc --release --features ffi --crate-type cdylib`.

## C++

`include/foodblock.hpp` is header-only, C++17: `std::string` in and out, RAII frees every buffer, and a failed
call throws `foodblock::Error` (with `code()`, and `refused()` / `reasons()` when the write check said no). For
code that avoids exceptions, `foodblock::attempt(...)` gives an expected-style `Result`.

`examples/cpp/sensor.cpp` is a fridge sensor as a micro peer: it makes its identity, signs a reading at seq 1 of its
own chain, checks the hash, the signature and the write check, and shows a refusal.

```bash
cargo rustc --release --features ffi --crate-type staticlib
clang++ -std=c++17 -Iinclude examples/cpp/sensor.cpp target/release/libfoodblock.a \
  -framework Security -framework CoreFoundation -o target/sensor && ./target/sensor     # macOS
# or: cmake -S examples/cpp -B target/cpp && cmake --build target/cpp && ./target/cpp/sensor
```

### From a ROS 2 node

Nothing in ROS 2 changes. Link the static library into your package and call the C++ layer from a callback:

```cmake
# CMakeLists.txt of your ament_cmake package
add_library(foodblock STATIC IMPORTED)
set_target_properties(foodblock PROPERTIES
  IMPORTED_LOCATION /path/to/sdk/rust/target/release/libfoodblock.a
  INTERFACE_INCLUDE_DIRECTORIES /path/to/sdk/rust/include)
target_link_libraries(my_node foodblock pthread dl m)
```

```cpp
// In the node: sign each sensor message as a FoodBlock observe, check it, publish it as text.
void on_temperature(const sensor_msgs::msg::Temperature& t) {
  auto state = R"({"kind":"reading","amount":{"value":")" + decimal(t.temperature) + R"(","unit":"Cel"}})";
  auto block = foodblock::write("observe", state, refs_, options_with_held_blocks_);   // throws if refused
  publisher_->publish(std_msgs::msg::String().set__data(block));                      // or push it to a node
}
```

Keep the private key on the robot, write a decimal string for each number (`std::to_chars` with a fixed precision,
never a float in the JSON), and keep the last block you wrote: it is the `held` the next write needs, so the chain
stays one line. Before an act that cannot be undone (cutting, dispensing, driving off), check that every grant you
act under is still live (`grant::why_not_live` in Rust).

## How it is tested

```bash
cargo test                                                    # node profile: every section
cargo test --no-default-features --features std,micro         # micro: says which sections it leaves out
cargo test --features ffi                                     # with the C ABI compiled in
```

`tests/vectors.rs` runs every section of `spec/vectors.json` and `spec/canonical-vectors.json` through the JSON door
the way `spec/run-vectors.cjs` runs the reference SDK: canonical strings and hashes, `valid`, chains, audience
commitments, signatures, headers, envelopes and sealed copies, identities (rotations, recovery reach, frozen and void
keys, operators), every fold and view, refusals (their codes, exactly), the messages between nodes, the compact form
and the `door` section (suites, strict writing, skips, forks, consent, roles, relative time, tasks). `tests/legacy.rs`
tests the converter against the old 0.x examples in `tests/fixtures/`. `tests/api.rs` checks the suites, the
envelopes and the canonical example.

## The compact form, algorithms and money

`cbor::encode_message` / `decode_message` (and the push and header forms) write a signed public block as CBOR
(`application/foodblock+cbor`, RFC 8949): deterministic bytes, ids and keys as byte strings, times as milliseconds,
and the short-key table when asked. The id is always the hash of the canonical JSON the receiver rebuilds. Readers
refuse floats, tags, null, indefinite lengths and duplicate keys. Door ops: `cbor_encode`, `cbor_decode`,
`cbor_encode_push`, `cbor_decode_push`, `cbor_encode_header`, `cbor_decode_header`.

A key names its suite (`state.suite`; default `std`, from protocol.json `suites`); an unknown one is refused
(`unknown_suite`). `p256` and `sm` are built (feature `suites`); the SM4 key is the first 16 bytes of the 32-byte key the
spec derives. Money is `{ minor, currency }` with an ISO 4217 code
or an issuer's `{ issuer, unit, decimals }`, and the folds count only the price's own currency. A micro with no clock
sets `ComposeOptions::clockless` and leaves out `at` on an observe, transform or transfer; any other type needs it
(`at_missing`). No older field name is read: year zero.

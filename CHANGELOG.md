# Changelog

What changed in each version. The spec says what each version means; this page says what moved.

## 1.6.0 (October 2026, in this repository, not yet published to package managers)

Year zero: 1.6 is the first version of the protocol itself. Old data enters once, through the converter in `spec/legacy/`.

- The spec split into one short core (`spec/core.md`) and thirteen modules, with every closed list in `spec/protocol.json`.
- Seven types in three moods, seven verbs; four closed types carry authority.
- Signing suites `std` (Ed25519), `p256` (including passkeys) and `sm`.
- Privacy: commitments, sealed blocks, erasure by deleting the salt.
- Consent as a block: STOP binds by fold, and only the person can lift it.
- One Rust core for every rule, with SDKs in JavaScript, Python, Go, Swift and Kotlin over it.
- Assurance: conformance vectors every SDK reproduces, an implementation written from the spec text alone, a differential fuzzer, a deterministic world simulator, and a TLA+ model checked in CI.
- Profiles: short-form (SMS, USSD, voice), EPCIS 2.0 and FSMA 204, Beckn/ONDC adapters, and others.
- The core published as IETF Internet-Draft draft-reynolds-foodblock-core.

Security fixes: none reported.

## 0.5.0 (20 February 2026, npm)

The JavaScript SDK, MCP server and CLI of the 0.x protocol. Superseded by 1.6.

## 0.4.0 (17 February 2026, npm)

## 0.1.0 (16 February 2026, npm and PyPI)

First public release: SDK, whitepaper and sandbox.

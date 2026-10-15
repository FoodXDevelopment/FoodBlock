# Profile: attestations

Optional. Ties a key to a real-name person or a registered business, for places where the law or a buyer asks. Core never needs it, and no block is refused for lacking it.

**Adds:** the observe kind `attestation`.

- An attestation is an `observe` of kind `attestation`, signed by an **issuer**: whoever the law or the reader trusts (a registry, a licensed e-ID service, a bank, a wallet). `refs.subject` is the identity. `state.scheme` names the register (`eudi`, `cnpj`, `rfc`, `abn`, `uscc`, `national_id`), `state.value` the number, and `state.kind_of` says `person` or `business`.
- A person's number is a commitment (profiles/erasure.md). A business number is public.
- An issuer withdraws it by an `updates` that carries `status: stopped`.
- A reader decides which issuers count. Several issuers may attest the same identity.
- The wallet or register proof it came from is kept by hash in `derives_from`.

# Profile: attestations

Optional. Ties a key to a real-name person, a registered business or a device, for places where the law or a buyer asks. Core never needs it, and no block is refused for lacking it.

**Adds:** the observe kind `attestation`.

- An attestation is an `observe` of kind `attestation`, signed by an **issuer**: whoever the law or the reader trusts (a registry, a licensed e-ID service, a bank, a wallet). `refs.subject` is the identity. `state.scheme` names the register (`eudi`, `cnpj`, `rfc`, `abn`, `uscc`, `national_id`), `state.value` the number, and `state.kind_of` says `person`, `business` or `device`.
- A person's number is a commitment (profiles/erasure.md). A business number is public.
- An issuer withdraws it by an `updates` that carries `status: stopped`.
- A reader decides which issuers count. Several issuers may attest the same identity.
- The wallet or register proof it came from is kept by hash in `derives_from`.

## Devices

A machine or a sensor that signs is an actor with its own key (identity.md, Agents and machines). Three signed facts, none new, say **"this device, set up by X, reported Y at T"**:

- **The key is the device's.** An attestation (`kind_of: device`) signed by the maker or the installer, `refs.subject` the device, `state.scheme` how the key is held (`secure_element`, `installed_by`) and `state.value` the maker's serial or the thing it was set up at (a commitment, if private). An attestation for a sensor that cannot sign may name it in `refs.from`. A reader decides which issuers count, as for any attestation.
- **Set up by X.** The sensor's **owner** says who may sign for it: an `operator` grant the owner signs, `refs.to` the device, `refs.subject` the sensor thing. Only the owner's word counts. A grant a stranger signs, or an installer who does not own the sensor, makes no one an operator of it. When the owner gives the sensor away (a transfer the new owner accepts), the old owner's grants stop counting, and the new owner's start; nothing needs to be revoked. The owner ends one by an `updates` that carries `status: stopped`. (The operator of a machine in identity.md is the same grant without `refs.subject`: who answers for the machine.)
- **Reported Y at T.** The device's own `observe`, `kind` the reading's kind, `state.amount` Y, `state.at` T on the device's clock, `refs.from` the sensor. An edge that holds it may write its own `observe` of kind `receipt` (blocks.md, No clock), a time a reader may trust more than the device's.

The rule a reader applies is the one in tasks.md (Whose readings count): a reading counts as grounds when its signer is the sensor, the sensor's owner, or the receiver of a live operator grant the owner signed naming the sensor. Everything else is evidence a reader may weigh, never grounds. Vectors: `spec/vectors.json` (`door`, `reading_condition_holds`, "devices:") and the audit case 12.

# Profile: attestations

Optional. Ties a key to a real-name person, a registered business or a device, for readers who ask for it. No block is refused for lacking one.

**Adds:** the observe kind `attestation`.

- An attestation is an `observe` of kind `attestation`, signed by an **issuer**: whoever a reader chooses to trust (a registry, an e-ID service, a bank, a wallet). `refs.subject` is the identity. `state.scheme` names the register the issuer checked (any label), `state.value` the number, `state.kind_of` says `person`, `business` or `device`. A person's number is expected committed (privacy.md, A commitment).
- The issuer withdraws it by an `updates` with `status: stopped` (authority.md, Ending). A reader decides which issuers count.
- The wallet or register proof it came from is kept by hash in `derives_from`.

## Devices

A machine or sensor that signs is an actor with its own key (identity.md). Three signed facts say **"this device, set up by X, reported Y at T"**:

- **The key is the device's.** An attestation (`kind_of: device`) signed by the maker or installer: `refs.subject` the device, `state.scheme` how the key is held (`secure_element`, `installed_by`), `state.value` the maker's serial or where it was set up. A sensor that cannot sign may be named in `refs.from`.
- **Set up by X.** The sensor's owner signs an `operator` grant: `refs.to` the device, `refs.subject` the sensor thing (authority.md, Kinds the protocol reads). Who owns the sensor, and who speaks for it, is read as in authority.md, Who a block speaks for. A new owner's grants replace the old owner's; nothing needs revoking.
- **Reported Y at T.** The device's own `observe`, `kind` the reading's kind, `state.amount` Y, `state.at` T on its clock, `refs.from` the sensor. An edge that holds it may write its own `observe` of kind `receipt` (blocks.md, No clock), a time a reader may trust more.

A reading counts as grounds when its signer speaks for the sensor (authority.md, Who a block speaks for). Any other reading is evidence only. Vectors: `spec/vectors.json` (`door`, `reading_condition_holds`, "devices:") and audit case 12.

## Who pays a confirmer, and whom she relies on

- **Who paid her.** An attester may state `paid_by`, `funded_by` and `pay_depends_on_result`, the one block every confirmer may state (promises.md, Who pays a confirmer). A reader shows it beside her word and never reads it as a verdict.
- **A list of issuers she relies on.** An `observe` of kind `relies` (the base schema `reliance`) names an issuer in `refs.subject`, the kind of thing in `of`, and `reliance`: "relied on" or "on conditions" (the conditions in `text`). It is her own reading and binds only her; a follower adopts it by choice. There is no "rejected": not being on her list is silence, and silence is never a no. She withdraws an entry by a stop. `endorse` does not exist in the protocol, so this is the form.
- **Terms I give you today.** A supplier's signed reading ("I sell to Achieng on 14 days, up to 40,000, today") is an `observe` of kind `terms`. It binds her to its truth and never to keep giving. The attestation shape names a register, so it does not fit; no other shared form is needed.
- **A market-price reading.** The base schema `price_reading`: good, grade, place, date and the price per unit, signed by the assessor. It is a fact she signed, never a verdict; a price fixed later may cite it.
- **A hazard notice on a place.** An `observe` of kind `hazard` names the place (a thing), the hazard and who was told, sealed to the audience the owner picks. It is evidence a judge reads and binds nobody.

## Two worked examples

- **A place certificate.** The Nyeri growers' circle signs an attestation (`scheme`: its written rule, by hash) on each lot, `as` the circle. Anyone may write "Nyeri-style" on a bag, but nobody can sign as the circle without `sign` in its fold. A false origin claim inside a sale is failed delivery to the buyer (promises.md, Settling), ruled by the deal's referee. No new rule.
- **A bookkeeper's figure.** A shop owner grants her bookkeeper read access for a week. He signs, sealed to the lender alone, an `observe`: "12 months, 240 sales, total 41,000, none disputed". It is his word about what he read, `derives_from` nothing the lender sees. The lender weighs him; the protocol adds no score.
- **A grader's own bond.** The grader schema declares an optional field, `bond` (money; an observe has no terms): "if a referee finds my rejection wrong, up to £N of mine becomes the seller's", signed before she inspects. Consent to be inspected is the owner's, so she may make it conditional on the bond.

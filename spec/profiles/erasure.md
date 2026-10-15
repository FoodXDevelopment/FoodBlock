# Profile: erasure

Optional, and required of any node that claims to follow a data-protection law. A block never changes, so forgetting a person works by deleting what the block hides.

**Adds:** a fixed list of personal fields (`protocol.json`, `profiles.erasure.personal_fields`) and the node's duty to forget.

- **Always commitments.** These fields are never written as plain values in a block about a person: `given_name`, `family_name`, `phone`, `email`, `address`, `birth`, `id_number`, `face`, `voice`. Each is a commitment (privacy.md), and its salt and value travel only in the reveals of the people it is for.
- **Forgetting.** An `observe` of kind `erase`, `refs.subject` the person, asks nodes to delete the salts and values they hold for them. The chain stays valid. Without the salt, nobody can link the hash to the person.
- **The duty.** A node in this profile deletes within the period its admission rule states (a duration), and says so in a `receipt` observe.
- **Honest limits.** The hash of a personal value may still count as personal data in some law. This profile is the mechanism. It is not legal advice. Get counsel before launching in a place with an erasure right (EU, UK, Brazil, Kenya and others).

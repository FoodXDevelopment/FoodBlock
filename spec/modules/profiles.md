# Profiles

**Three profiles: micro, edge, node.** One protocol, three sizes of peer, by what they do. `protocol.json` (`profiles`) lists what each needs, and `profiles.modules` which modules.
- **Micro**, the device: measures, signs, buffers and sends. One that acts in the world adds the grant check and obeys a stop on arrival. It may have no clock (blocks.md, No clock) and may send the compact form (encoding.md).
- **Edge**, the local operator: adds local discovery, Pull and Push with nearby peers, the promise fold for its own deals, and works offline. It reads devices that cannot sign, and signs what it read as its own observe, the device named as a thing in `refs.from`, so a stranger weighs the edge's word, not the device's. It times a clock-less micro block with a `receipt` observe.
- **Node**, held by a person or a machine: adds envelopes and commitments, serving Pull and Push to anyone, signed answers, internet discovery, and the folds for every record it holds. A node may also be an **index**, serving others' public records and every fold.

Which profile needs which module is in protocol.md.

Only people and machines hold nodes. A business, a household, a regulator or a community is a circle of them (circles.md): it has an id and a record, kept by its members' nodes, never a node of its own. A peer may run any profile. `protocol.json` also names the outputs of the chain helpers (`next_link`, `chain`) and the keypair shapes SDKs use.

# Peers

**Three peers: micro, edge, node.** One protocol, three sizes of peer, by what they do. `protocol.json` (`peers`) lists what each does and which modules it needs. Optional profiles (the `profiles/` folder) are a different thing: extra rules any peer may adopt.

- **Micro**, the device: measures, signs, buffers and sends. It needs core.md, canonical.md, blocks.md and encoding.md, and it may use the compact form. A micro that acts in the world is a **micro that acts**: it adds authority.md, checks the grants it acts under and obeys a stop on arrival. It may have no clock (blocks.md, No clock) and leaves the `until` test to its edge.
- **Edge**, the local operator: adds local discovery, Pull and Push with nearby peers, the promise fold for its own deals, and works offline. It reads devices that cannot sign, and signs what it read as its own `observe`, the device named as a thing in `refs.from`, so a stranger weighs the edge's word, not the device's. It times a clock-less micro's block with a `receipt` observe.
- **Node**, held by a person or a machine: adds envelopes and commitments, serving Pull and Push to anyone, signed answers, internet discovery, and the folds for every record it holds. A node may also be an **index**, serving others' public records and every fold.

Which peer needs which module is in protocol.md.

**Micro safety.** A micro keeps its `seq` counter and its last block's id in storage that survives power loss, and writes them before it sends. If it loses them, it asks its edge for its head. If it cannot learn its true head, it stops using that key: its operator rotates it with `counted_to` the last block anyone has (identity.md, Who may rotate). A block marked `skip` may jump `seq` forward when only the counter, not the head, was lost. So a lost counter never freezes an identity.

Only people and machines hold nodes. A business, a household, a regulator or a community is a circle of them (circles.md): it has an id and a record, kept by its members' nodes, never a node of its own. A peer may run any size.

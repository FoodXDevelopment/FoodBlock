# Profile: residency

Optional. Says where a node promises to store blocks, and where an author asks a block to stay. A region is a plain label the node's promise defines.

**Adds:** the admission field `holds_in` and the block field `state.stays_in`.

- `holds_in` (nodes.md, A node's promise): a list of labels (a country code, a continent, any name). Labels are compared by exact equality and have no meaning. A label is never expanded: `DE` is not inside `EU` unless `stays_in` lists `DE`.
- `state.stays_in`: a list of the same labels, the author's request. **Inside** is plain membership: `holds_in` lies inside `stays_in` when it is not empty and every entry of it is in `stays_in`.
- A node that states `holds_in` pushes a copy only to a node whose `holds_in` lies inside `stays_in`, and refuses (`residency`) a block whose `stays_in` does not contain every entry of its own `holds_in`. A block with no `stays_in` asks nothing. A node that states no `holds_in` refuses nothing.
- Crossing a border is a deliberate act: a copy re-sealed and pushed by someone allowed to. The public header is not held back by `stays_in`.

# Profile: residency

Optional. Says where blocks may be stored, for places with data-localisation laws.

**Adds:** the admission field `holds_in` and the block field `state.stays_in`.

- A node's admission rule lists the regions it stores in, `holds_in`: a list of ISO 3166-1 country codes, or `EU`, `EEA`.
- A block may carry `state.stays_in`, a list of the same codes. A node pushes a sealed or public copy of it only to a node whose `holds_in` lies inside `stays_in`.
- A node refuses a push that breaks its own `holds_in` (`residency`).
- Crossing a border is then a deliberate act: a copy re-sealed and pushed by someone allowed to.
- The public header of a block is not held back by `stays_in`. It holds no personal field.

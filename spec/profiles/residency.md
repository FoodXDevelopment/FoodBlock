# Profile: residency

Optional. Says where blocks may be stored, for places with data-localisation laws.

**Adds:** the admission field `holds_in` and the block field `state.stays_in`.

- A node's admission rule lists the regions it stores in, `holds_in`: a list of ISO 3166-1 country codes, or `EU`, `EEA`.
- A block may carry `state.stays_in`, a list of the same codes. A node pushes a sealed or public copy of it only to a node whose `holds_in` lies inside `stays_in`. **Inside** is plain membership: `holds_in` lies inside `stays_in` when it is not empty and every entry of it is also an entry of `stays_in`, written exactly. The protocol expands no region: `DE` is not inside `EU` unless `stays_in` lists `DE`, and a list that holds `EU` stays in `EU`. A node that holds in `DE` and `FR` is inside `["DE", "FR"]` and inside `["DE", "FR", "IT"]`, not inside `["DE"]`. A block meant for any country of the EU lists the countries it allows.
- A node refuses a push that breaks its own `holds_in` (`residency`).
- Crossing a border is then a deliberate act: a copy re-sealed and pushed by someone allowed to.
- The public header of a block is not held back by `stays_in`. It holds no personal field.

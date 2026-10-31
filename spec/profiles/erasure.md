# Profile: erasure

Optional. A block never changes, so forgetting a person works by deleting what the block hides.

**Adds:** the node's promise to forget (nodes.md, A node's promise). Nobody has a right to make others forget; only the node that promised is bound.

- **Committed fields.** The node's promise names which fields it will forget; they are expected committed (privacy.md, A commitment). Salt and value travel only in the reveals of the people they are for.
- **Forgetting.** An `observe` of kind `erase`, `refs.subject` the person, asks nodes to delete the salts and values they hold for them. The chain stays valid. Without the salt, nobody can link the hash to the person.
- **The promise.** The node states in its admission rule the period it deletes within (a duration), deletes within it and says so in a `receipt` observe.

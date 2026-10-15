# Identity

Keys, rotation, recovery, custody and contacts.

**A genesis** is the one block with no author: an `actor` with no `author`, `prev`, `after` or `seq`, public, signed
by its own key. Its hash is the id. Its state names `kind`, `at`, `audience`, `public_key_sign`, `recovery_key_hash`, `recovery_reach`, `alg_sign` and `alg_encrypt` when not the defaults (Algorithms), and `public_key_encrypt` if the identity will receive sealed blocks (a micro that only signs may add one later by a key grant). A genesis with the recovery fields is a 1.6 genesis; every genesis written now carries
them.

**The recovery key** is an offline key that outranks the others. The genesis holds its hash (`recovery_key_hash`) and
how far back it may reach (`recovery_reach`, a duration). Its first block has `seq` 1 and `prev` the genesis. It signs
only key grants and `defeats` of a successor's trigger.

**Keys.** Each device has its own signing key, so devices never fork one chain. A key comes in by a `grant` of kind
key: `refs.subject` the id, `state.public_key_sign` the new key. Any live key of the id may bring in a new key.
- **Rotation.** A key grant that also names `replaces` (the old key) and `counted_to` (the last block of the old key that counts: a block of that key's chain)
  rotates that key: the old key's blocks after `counted_to` are void. The rotation itself stands, even when it comes
  after `counted_to` in the old key's chain. A key is rotated only by itself or by the recovery key; a rotation by the
  recovery key says so (`recovery_key`, its hex).
- **Void spreads.** A key brought in by a void block is void, with every key it brought in.
- **Conflict.** Two rotations of one key that do not see each other (at one `seq`, or on two branches) both stand. The
  key they replace speaks no further: its blocks after the lowest `counted_to` either names are void. The keys they
  bring in are **frozen**: nothing they or their descendants sign counts until a recovery rotation of the same key
  settles it. Then the keys brought in by a crossing rotation in the recovery rotation's causal past speak; the others
  stay frozen. Every other key of the id keeps speaking. Two recovery rotations that do not see each other end the
  identity: every block in the causal past of either stands, and nothing after counts.
- **Two blocks at one `seq`** (nodes.md, Equivocation) are both the author's in the identity fold. If both are
  key grants, Conflict applies whether or not they name `replaces`; a pair that both rotate also ends the old key's
  speech after `counted_to`.
- **An identity's keys** are the genesis key and every key brought in by a key grant that counts. A rotated-out key
  stays (its blocks up to `counted_to` still speak), and so does a frozen key; a void key and the recovery key are left
  out. The rules above say which speaks for a given block.
- **Recovery reach.** A recovery rotation voids only what it may reach. It cannot void a block that another identity
  built on (named in its causal past) when that block arrived on the reader's node before the reach began (the
  rotation's arrival, less `recovery_reach`). A block nobody used is void if it arrived within the reach. Months and
  years are calendar months and years, in UTC. A node records each block's arrival when it takes it in; an unknown
  arrival is read as inside the reach.
- **Encryption keys.** A key grant that carries only `public_key_encrypt` changes the encryption key, and never voids
  or freezes anything.

**History is closed.** A 1.6 genesis has no history. An older genesis has open history until its first 1.6 block (its
genesis key's block with `seq` 1). After that, a block without `seq` counts only if it is in the causal past of that
block, or listed in a manifest it names (`state.manifest`, a set of hashes); every other one is refused, on push too.
A block in the closed history counts in every fold under the rules it was written in, read through aliases (an old
membership still needs the member's join, `confirms` read as `answers`). A key grant without `seq` never brings in a
key. A reader holding neither an id's genesis nor any of its 1.6 blocks reads its history as open, and its folds about
that id as provisional. An older genesis adds recovery once, by a key grant naming `recovery_key_hash` and
`recovery_reach`.

**Agents and machines.** An agent or a machine is an actor with its own genesis and keys, like a person. Its operator
answers for it: the author of its live grant of kind operator, which names it in `refs.to`. That grant is the only
place the operator is named. A machine acts only within the grants it holds, and every block it signs for someone
names the grant in `refs.under`.

**Contacts.** An actor of kind contact is someone with no keys, written by anyone as an ordinary block. Anyone may
later claim it is `same_as` a genesis; each reader decides.

**Held keys (custody).** A person who cannot or will not hold keys may have a custodian they chose hold them. The
genesis or key grant names the custodian in `state.custodian`, so every reader sees the key is held by someone else
and weighs it so; a key the person holds counts for more.
- The custodian signs only on the person's own word, and the block's grounds say how it came: `state.channel` (the
  list is in `protocol.json`) and `derives_from` the hash of the raw message.
- The person may take their keys at any time: a key grant to a key on their own device rotates the custodian's key
  out, and their record stays theirs.
- A custodian never acts for the person on its own judgement; that needs a grant like any agent's.

**Profile facts** (a name, a timezone) are the person's own `observe` of kind profile, not identity.

**`counted_to`** is the one field for "counts up to here": the last block of the subject's own chain that still counts. A rotation names it for the old key. An admin's removal of a member names it for the member (circles.md).

**Algorithms.** A key names its algorithms. A genesis or a key grant carries `alg_sign` for `public_key_sign` and `alg_encrypt` for `public_key_encrypt`; left out, they are `ed25519` and `x25519`. The recovery key is `ed25519` unless the genesis names `alg_recovery`. The known algorithms, with their key and signature grammars, are in `protocol.json` (`algs`).
- A key moves to a new algorithm by a key grant that rotates it (`replaces`) and names the new `alg_sign`. An encryption key moves by a key grant that carries `public_key_encrypt` and the new `alg_encrypt`.
- A reader verifies each signature with its key's own algorithm, and refuses a block whose key names an algorithm it does not know (`unknown_alg`).
- The hash stays SHA-256 for every block.
- A post-quantum signature such as ML-DSA (FIPS 204) is one more row in `algs` and one key grant. Nothing else changes, except that its larger keys and signatures must still fit the block limit (encoding.md, Limits).

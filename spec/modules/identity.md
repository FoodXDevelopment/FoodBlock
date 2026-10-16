# Identity

Keys, rotation, recovery, custody and contacts. The genesis is in core.md.

An **identity** is an `actor` and its id is its genesis hash. It has one or more **keys**. A key is a public signing key, and the identity's blocks are signed by one of them.

**The recovery key** is an offline key that outranks the others. It is optional. The genesis may hold its hash (`recovery_key_hash`) and how far back it may reach (`recovery_reach`, a duration); a genesis without them may add them once, by a key grant that names both. `recovery_key_hash` is the hash, in the identity's suite, of the recovery key's SPKI hex as UTF-8 text. The recovery key is in the identity's suite unless the genesis names `recovery_suite`. Its first block has `seq` 1 and `prev` the genesis. It signs only key grants, and the `defeats` that a profile gives it (profiles/successor.md).

**Keys.** A key may be a passkey (passkeys.md): an ordinary `p256` key whose signatures are WebAuthn assertions. Each device has its own signing key, so devices never fork one chain. A key comes in by a `grant` of kind `key`: `refs.subject` the id, `state.public_key_sign` the new key, `state.suite` if not `std`. Any live key of the id may bring in a new key.
- **Rotation.** A key grant that also names `replaces` (the old key) and `counted_to` rotates that key. `counted_to` is the last block of the old key's chain that still counts. The old key's blocks after it are void. The rotation itself stands, even when it comes after `counted_to` in the old key's chain. `counted_to` is a block the rotation rests on (core.md, check 5), so a node holds a rotation only once it holds that block, and the rotation's causal past includes it: **the new key sees the old chain up to `counted_to`** with no help from the client, whoever signed the rotation (the old key, the recovery key or an operator).
- **Who may rotate.** A key is rotated only by itself, by the recovery key, or, for an agent or machine, by a key of its operator. A rotation by the recovery key says so (`recovery_key`, its hex). The operator route is how a micro that lost its counter, or forked by mistake, gets a clean key.
- **A new suite.** A rotation that names a new `suite` moves the key to it. Blocks signed by the new key are hashed with the new suite's hash (core.md, Suites).
- **Void spreads.** A key brought in by a void block is void, with every key it brought in.
- **Conflict.** Two rotations of one key that do not see each other (they name the same `prev`, or sit on two branches) both stand. Then:
  - the replaced key speaks no further after the lower of the two `counted_to`;
  - the keys they bring in are **frozen**: nothing they or their descendants sign counts;
  - a recovery rotation of the same key settles it. Of the frozen keys, only those brought in by a crossing rotation in the recovery rotation's causal past speak. The rest stay frozen;
  - every other key of the identity keeps speaking.
  Two recovery rotations that do not see each other end the identity. Every block in the causal past of either stands, and nothing after counts.
- **A fork.** Two blocks of one key that name one `prev` (nodes.md, Equivocation) are both the author's in the identity fold. If both are key grants, Conflict applies whether or not they name `replaces`. A pair that both rotate also ends the old key's speech after `counted_to`.
- **An identity's keys** are the genesis key and every key brought in by a key grant that counts. A rotated-out key stays (its blocks up to `counted_to` still speak), and so does a frozen key. A void key and the recovery key are left out.
- **Encryption keys.** A key grant that carries only `public_key_encrypt` (and `suite`) changes the encryption key. It never voids or freezes anything.

**Recovery reach (a view).** A recovery rotation may not void everything. It cannot void a block that another identity built on (named in its causal past) when that block arrived before the reach began: the rotation's arrival, less `recovery_reach`. A block nobody used is void if it arrived within the reach.
- The identity **fold** is pure: it voids every block after `counted_to`.
- The **view** adds the reader's own record of arrivals. A node writes down when it took in each block. The view hands back to the reader the voided blocks the reach protects. Two nodes may differ, because they saw blocks arrive at different times. The reader's own node's record always decides for that reader. An unknown arrival is read as inside the reach.

**Agents and machines.** An agent or a machine is an actor with its own genesis and keys, like a person. Its operator answers for it: the author of its live grant of kind `operator`, which names it in `refs.to`. That grant is the only place the operator is named. A machine acts only within the grants it holds, and every block it signs for someone names the grant in `refs.under`.

**Contacts.** An actor of kind `contact` is someone with no keys, written by anyone as an ordinary block. It may carry `state.marks` such as a phone number (profiles/addressing.md). Anyone may later claim it is `same_as` a genesis. Each reader decides.

**Held keys (custody).** A person who cannot or will not hold keys may have a custodian they chose hold them. The genesis or key grant names the custodian in `state.custodian`, so every reader sees the key is held by someone else.
- The protocol does not count a held key as lesser. A reader weighs the custodian: who it is, and what it publishes about how it signs (profiles/custody.md).
- The custodian signs only on the person's own word. The block's grounds say how it came: `state.channel`, an open label (`sms`, `ussd`, `voice`, `letter`, `meeting`), and `derives_from` the hash of the raw message. Words the custodian read by a model are a reading, and the person's own yes to the exact terms is what the custodian signs on (strangers.md).
- The person may take their keys at any time: a key grant to a key on their own device rotates the custodian's key out, and their record stays theirs.
- A custodian never acts for the person on its own judgement. That needs a grant, like any agent's.

**Profile facts** (a name, a timezone) are the person's own `observe` of kind `profile`, not identity.

## Invariants

8. A key speaks only while the key grants that brought it in are sound and no rival rotation crosses it unsettled. It is rotated only by itself, its recovery key, or its operator. It speaks no further after `counted_to`.
19. A key held by someone else always says so, and its holder signs only on the person's own word.

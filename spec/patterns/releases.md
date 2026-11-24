# Pattern: releases

Not normative. A pattern adds no rule: it is a schema and a worked example, and no word reads it (core.md, section 10).

A **release** is a person's signed word naming bytes by hash. It says "these are mine, and these are the bytes". It binds only its signer, to the truth of that (core.md, section 11; GOVERNANCE.md, How rule sets are named). It is not a shelf: no list says which releases count, none outranks another, and no fold reads one. A reader picks whose words she trusts and checks the bytes she holds against the hashes.

## The base schema

A release is an `observe` of kind `software_release`. These field names are this pattern's own choice; any community may name its own in its own schema (things.md, Schemas).

| Field | Shape | Means |
|---|---|---|
| `state.kind` | `software_release` | the kind word (not `release`, which is a side letting go of her own claims: promises.md, Rulings) |
| `state.rule_set` | an id | the rule set (core.md, section 11) the packages below were built from |
| `state.packages` | map of name to SHA-256 (lowercase hex) | each package or binary the signer built from that rule set, named, with the hash of its bytes |

Where a release names files instead of built packages (a source tree, a paper), it uses `state.files`, a map of path to SHA-256, in place of `packages`. A release carries one of the two.

A community that wants these fields checked writes them in its own schema (a `thing` of kind `schema`, named by its hash); a shape is checked by `read`, never by `valid`.

A reader who trusts the signer takes the hashes as her word that those bytes are hers; one who does not ignores the block. A signer who finds a mistake signs another release; the first stays (append-only), and a reader decides which she trusts.

## Worked example

Kofi forks the protocol for a co-op in Kisumu and builds two packages from his fork. He signs one `observe`:

```
{ "type": "observe",
  "state": { "kind": "software_release",
             "rule_set": "a39f6ff57ad74be8272a136350f0027ec47f5e695e961b3ad90bbbea49609d78",
             "packages": { "kofi-core-0.3.tgz": "06879e7b9a248fa12b8bf3833128997994f6e36c174b50e646dcd7b860f1f18d",
                           "kofi-host-0.3.tgz": "d5f3c94d5c64bea9f79437c12ce63ea5c2c278a10431fcc1f3dca833c5f2d2b0" },
             "seq": 1, "at": ..., "audience": "public" },
  "refs": { "author": <Kofi's id>, "prev": <his last block> } }
```

FoodX, signing as itself, publishes its own release for its own rule set and package:

```
{ "type": "observe",
  "state": { "kind": "software_release",
             "rule_set": "21337563e3441321e77d2d93f49fcd13e68d2cbd4ec1358485409bcce37cdcce",
             "packages": { "foodblock-js-1.9.0.tgz": "1a3c5227e8aac902a2950f0b9b3cb426a8be80fa7ad5bb3124d4aed5455fe7e9" }, ... },
  "refs": { "author": <FoodX's id>, ... } }
```

(The hashes above are examples.) A reader holding both reads two signed words. Neither names the other, neither is "official", and no fold reads either. Amara, who trusts Kofi, downloads `kofi-core-0.3.tgz`, hashes it, and sees it equals what Kofi signed. She runs it and chooses `rule_set` `a39f6ff57ad7...` as one she runs. A block that names that rule set is read under it by her; a block that names none is read by H₀ (core.md, section 11).

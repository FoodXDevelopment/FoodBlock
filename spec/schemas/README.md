# Base schemas

`schemas.json` is the source of the base schemas and `published.json` the result: signed things of kind `schema` with stable ids (`node sdk/javascript/test/make-schemas.cjs` rebuilds it). The seed that made the publisher's key is public (`seed_text` in `published.json`), so anyone can reproduce every byte.

**Trust by hash, never by publisher.** A reader who holds the bytes whose hash is the id a block names knows which fields and roles that schema declares. Who signed them adds nothing: a key anyone can derive from a public seed is no authority. Anyone may publish another schema; its weight for a reader is set by authority.md (the grantor's own, or one the grantor confirmed).

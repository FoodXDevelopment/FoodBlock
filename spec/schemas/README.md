# Base schemas

`schemas.json` is the source of the base schemas and `published.json` the result: signed things of kind `schema` with stable ids (`node sdk/javascript/test/make-schemas.cjs` rebuilds it). The seed that made the publisher's key is public (`seed_text` in `published.json`), on purpose, so anyone can reproduce every byte.

**Trust by hash, never by publisher.** A base schema is trusted because of its **hash**: a reader who holds the bytes whose hash is the id a block names knows exactly which fields and roles that schema declares. Who signed those bytes adds nothing. There is no privileged publisher: the key above is a convention for finding the base schemas, and a key that anyone can derive from a public seed cannot be an authority. Anyone may publish another schema, and a schema's weight for a reader is set by the rules of authority.md (the grantor's own, or one the grantor confirmed), exactly as for any other.

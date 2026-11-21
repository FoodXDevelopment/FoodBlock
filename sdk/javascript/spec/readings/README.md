# Readings

Not normative. Each reading is computed from blocks and changes none of the four answers (core.md, section 10). Each is a file named by its hash, with its cases. A node may compute any; no block is read under one unless it names it.

A reading's name is made as a rule set's is (core.md, section 11): the SHA-256, in lowercase hex, of the canonical bytes of the manifest `{ "files": { "<path under spec/>": "<SHA-256 hex of the file's bytes>" } }` over its two files, the text (`<name>.md`) and its cases (`<name>.cases.json`). No name is written down: each engine computes it from the files' bytes. The file is text, and each engine implements it, as with the protocol's own files; an engine runs a reading when it passes the reading's cases.

- `readback.md`, `readback.cases.json`: the read-back's answer (profiles/short-form.md, A read-back that can be redone).

# Renderers

Not normative. A renderer turns one reading's answer into words in one language. It reads that answer only, never a block, and classifies nothing; free text it never reads, but the deal's own words (`what`) it quotes word for word. Each is a file named by its hash, with its cases.

A renderer's name is made as a rule set's is (core.md, section 11): the SHA-256, in lowercase hex, of the canonical bytes of the manifest `{ "files": { "<path under spec/>": "<SHA-256 hex of the file's bytes>" } }` over its two files, the text (`<name>.md`) and its cases (`<name>.cases.json`). No name is written down: each engine computes it from the files' bytes. The file is text, and each engine implements it, as with the protocol's own files; an engine runs a renderer when it passes the renderer's cases.

- `en.md`, `en.cases.json`: English, one line each, for a screen.
- `en-sms.md`, `en-sms.cases.json`: short English for a basic phone, GSM-7 only.

Both render `readings/readback`'s answer.

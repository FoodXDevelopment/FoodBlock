# Security

## Reporting a weakness

Email hello@foodx.network with "Security" in the subject. Please do not open a public issue.

Tell us what you found, how to reproduce it, and which part it affects (the spec, an SDK, the node, the CLI or the MCP server). We reply within 3 working days, keep you told as we fix it, and credit you when it is public unless you ask us not to.

## What counts

- A block that verifies when it should not, or is refused when it should verify.
- Two SDKs that disagree on a hash, signature, commitment or envelope (`spec/vectors.json`).
- A way to read a sealed block, link a commitment to a person, or act beyond a grant.
- Any flaw in the reference node, CLI or MCP server.

## Supported versions

Only FoodBlock 1.6, the current version. There is no earlier version in the protocol.

## Known limits

The spec states its known limits openly, for example what a sealed block's public header shows (`spec/modules/privacy.md`, "A known leak"). Those are not secret, but better answers are welcome.

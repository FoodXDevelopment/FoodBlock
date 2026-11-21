# foodblock-cli

The FoodBlock 1.9 protocol from a terminal. Blocks are JSON on stdout, so they compose with anything else.

```
npm install -g foodblock-cli
fb adopt me.json --genesis genesis.json      # keep her public identity (blocks only, 0600); her key stays on her own device
fb draft thing eggs --state '{"name":"Eggs"}' --audience public --identity me.json   # a block for her device to sign
fb attach --draft '<what draft printed>' --signature <hex made on her device> --identity me.json
fb --help                # every command
```

**This command line holds no key.** A person's key is made and kept on her own device (a passkey); `fb init`, `fb key` and `fb create` are gone because they made a key or signed with one a file kept. `fb draft` composes the block, her device signs it, `fb attach` checks the signature is her key's over exactly that block and adds it to her chain.

`--audience` (`public`, or the ids that may read it, comma separated) is required: the CLI fills in none, and a call without it exits non-zero with the reason. It states `at` itself, from its own clock at the call.

Every check is the SDK's ([`@foodxdev/foodblock`](https://www.npmjs.com/package/@foodxdev/foodblock)). The protocol is in `spec/core.md` and `spec/modules/` of
<https://github.com/FoodXDevelopment/foodblock>. Public domain (CC0 1.0).

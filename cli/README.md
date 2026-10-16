# foodblock-cli

The FoodBlock 1.6 protocol from a terminal. Blocks are JSON on stdout, so they compose with anything else.

```
npm install -g foodblock-cli
fb init me.json          # a new identity: keys and genesis (kept 0600)
fb --help                # every command
```

Every check is the SDK's ([`@foodxdev/foodblock`](https://www.npmjs.com/package/@foodxdev/foodblock)); `fb create` is its one write path
(compose, check, sign, chain). The protocol is in `spec/core.md` and `spec/modules/` of
<https://github.com/FoodXDevelopment/foodblock>. MIT licence.

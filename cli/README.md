# foodblock-cli

The FoodBlock 1.7 protocol from a terminal. Blocks are JSON on stdout, so they compose with anything else.

```
npm install -g foodblock-cli
fb init me.json --kind person --audience public --reach P30D   # a new identity: keys and genesis (kept 0600)
fb create thing eggs --state '{"name":"Eggs"}' --audience public --identity me.json
fb --help                # every command
```

`--kind`, `--audience` (`public`, or the ids that may read it, comma separated) and `--reach` (how long after a theft a recovery key may reach back, a duration) are required: the CLI fills in none, and a call without them exits non-zero with the reason. It states `at` itself, from its own clock at the call.

Every check is the SDK's ([`@foodxdev/foodblock`](https://www.npmjs.com/package/@foodxdev/foodblock)); `fb create` is its one write path
(compose, check, sign, chain). The protocol is in `spec/core.md` and `spec/modules/` of
<https://github.com/FoodXDevelopment/foodblock>. Public domain (CC0 1.0).

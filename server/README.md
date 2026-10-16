# foodblock-node

A FoodBlock 1.6 node: Postgres holds the blocks, HTTP carries signed pull, push and `.well-known/foodblock`.

```
npm install -g foodblock-node
NODE_KEY=node.json DATABASE_URL=postgresql://localhost:5432/foodblock foodblock-node
```

`NODE_KEY` is a file made by `fb key` (the holder, the key that signs this node's answers, and the blocks that prove it).
`PORT` defaults to 3111. The node never checks a block itself: the SDK does
([`@foodxdev/foodblock`](https://www.npmjs.com/package/@foodxdev/foodblock)). MIT licence.

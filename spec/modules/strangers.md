# Strangers

What may pass between people who have never dealt. Four rules, each one primitive that every part of the system reads.

A **stranger** to a sender is someone who has answered none of the sender's blocks and has no live YES for the sender (below).

## 1. Every message to a stranger has a human author

A first message to a stranger is signed by a person: the person's own key, or their custodian on their word (identity.md, Held keys). An agent may draft it. It does not send it.

The one exception is the receiver's own published order channel. A node that wants agent-written orders says so in its admission rule (`order_channel`: the acts, as `type.kind` names, that an agent may send first). Then an agent may send those acts there, once for each real request, and its block names the grant it acts under.

A node refuses any other first block to a stranger that an agent signed (`not_human`). A block is an agent's when its author is an actor of kind `agent` or `machine`, or it names a grant in `refs.under`.

Words to someone with no node (a business that is not on FoodBlock) are not blocks. They go out from the person's own phone or address, or through a channel that business published for orders (transport.md).

## 2. Consent is a block

A person's answer to contact is an `observe` of kind `consent`. It carries `state.word`, one of four machine tokens:
- `yes`: you may deal with me about this.
- `stop`: do not contact me.
- `keep`: keep my copy of the record for me.
- `move`: move my record to the custodian or node in `state.to`.

`refs.subject` names who it is about: the sender, or an operator (a person or business whose agents it covers). Left out, it is about every sender who has no live YES. It may name an ask or deal in `refs.for`. A person's custodian may write it on their word, with the raw message's hash in `derives_from`. Gateways map a person's own word (STOP, ACHA, 停止) to the token; the token is what the block holds.

A `stop` is public. A reader finds the live word with the `consent` fold: the person's latest consent block that names the sender, then one that names no one, ordered by the person's own chain and causal order. A `stop` wins any tie.

**Every node honours a live STOP.** It refuses a message to that person from the sender named, from the sender's operator, or from any agent under that operator (`stopped`). It works like a do-not-call list that nobody owns.

## 3. The receipt is the invitation

Nobody is pitched.
- A message to a stranger holds only the ask: what, how much, when, how to reply, and how to STOP. It names no product and carries no invitation. A node may refuse one that does.
- After a yes, each side gets its own copy of the deal. That copy is the receipt, and it is the only door in: it opens the person's own record, and it may carry a short code (profiles/short-form.md). A receipt for a deal they made is a service message.
- Nothing further is sent unless the receiver's YES covers it.

## 4. A model's reading is not a person's observation

A model that reads a receipt, an email or a voice note writes an `observe` of kind `reading`, signed by the agent's own key, with `derives_from` the raw evidence and the `method`. It is the agent's claim. It becomes the person's own claim only when the person's block `confirms` it. An import is a reading of this kind (things.md).

Where words must bind (an SMS, a voice call), the custodian echoes the exact terms back once. Only the person's reply to those exact terms is signed on. That reply is the decision itself, and the block `derives_from` its hash.

## Invariants

16. Every message to a stranger has a human author, or goes through the receiver's own published order channel.
20. Consent is a block, and a live STOP is honoured by every node.
21. The receipt is the invitation: no ask pitches a product.
24. A model's reading is never the person's observation until the person confirms it.

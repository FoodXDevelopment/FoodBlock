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

`refs.subject` names who it is about: the sender, an operator, or a principal (a person or business whose agents it covers). Left out, it is about every sender who has no live YES.

**Consent follows the principal.** A sender is named by itself, by its operators, and by the grantor of the grant its block acts under: the author of the grant it names in `refs.under` (and the circle that grant was signed `as`), when that grant is live, is addressed to the sender or open, and is one others act under (not a key or member grant). So a stranger's `yes` to a person covers that person's agents acting under her live grant, and her `stop` binds them. A word about her is a word about them, and a recorder's STOP binds the recorder's own side, which includes the principals the sender acts for. It may name an ask or deal in `refs.for`. The block is the person's when she signs it, or her custodian on her word, with the raw message's hash in `derives_from`. `refs.from` names the person whose word it is when someone else records it; left out, it is the author.

**Recording a STOP for someone off FoodX.** A person with no keys (a contact, identity.md) cannot sign. Whoever received her STOP records it: the SMS gateway, her custodian, her channel provider, or the asker's own app that saw the reply. The recorder writes a `stop` consent `from` her, with the raw message in `derives_from`. **Anyone may record a STOP, and it binds only the recorder's own side**: the recorder, its operator and every agent under that operator. An app that sees her reply records it against its own sending. It cannot bind anyone else's.

**Recognising an opt-out is the recorder's reading, not a word list.** The protocol holds no list of stop words in any language. The recorder asks a model the right question about the message (does this person want no more contact?) or takes the carrier's own opt-out signal, and records the result as the block above. That reading is the recorder's, never hers.

**Only the person lifts a STOP.** A `yes` lifts a `stop` only when it is the person's own block (her key, or her custodian's on her word) and the stop is in its causal past, so the yes is fresh and human: she said it after she knew of the stop, through a channel the asker does not control (her own phone or custodian, or the recorder who received it). The asker's app never lifts it, and neither does a model's reading of a reply. A recorder outside the asker's side may record her yes the same way (it counts only as the lift of a stop it has in its causal past). Any other consent block written by someone who is not the person counts for nothing.

**The live word.** The `consent` fold takes a person, a sender (or none), optionally the hash of the grant the sender's block acts under (its `refs.under`, which is how consent follows the principal), and the blocks the caller holds. It reads them for that person and sender: the latest word that names the sender (or its operator), else the latest that names no one, in causal order. A recorder's blocks are ordered by the recorder's own chain, so the fold works when the person has no keys. A `stop` wins any tie. A tie between other words leaves no live word. A tie of the same word stands, and the fold names the block with the lowest hash (only to name one; no authority).

**There is no public STOP list.** A hashed phone number can be reversed, so nothing about a STOP is published. A STOP lives with whoever recorded it and with the person's custodian. A sender asks privately, of the custodian or its own record, before it contacts her.

**Consent decides what binds, not what exists.** A block sent despite a live STOP is **valid and kept**: it is judged on the block alone and what it rests on (core.md, check 5), so the sender's chain goes on. The fold reads it as **stopped**: it binds no one (a stopped ask is read as `declined` in advance, folds.md), and a node delivers it to no one. A node may decline to relay its body to the stopped party, and keeps it with the sender's chain. Her own `accepted` answer still binds, because `answers` is the only consent to a deal. A node that holds none cannot know, and delivers as usual. So an honest sender's chain never stalls because of anyone else's consent.

## 3. The receipt is the invitation

Nobody is pitched.
- The request to a stranger is an ordinary ask: what, how much, when, how to reply, and how to STOP. It invites by being useful, and never pitches. It names no product and carries no invitation. A node may refuse one that does.
- After a yes, each side gets its own copy of the deal. That copy is the receipt. The asker, or her custodian, sends it in the same thread the ask came in. It is the door into an app: it opens the person's own record, and it may carry a short code (profiles/short-form.md). A receipt for a deal they made is a service message.
- Nothing further is sent unless the receiver's YES covers it.

## 4. A model's reading is not a person's observation

A model that reads a receipt, an email, a voice note or an exported record writes an `observe` of kind `reading`, signed by the agent's own key, with `derives_from` the raw evidence and the `method` (an import is a reading with `method: import`, things.md). It is the agent's claim. **Sharing a reading claims nothing**: showing it, forwarding it or keeping it is not a statement by the person. It becomes the person's own claim only when she **puts that fact to someone else in her own step**: a block she signs, naming someone other than herself in `refs.to` or `refs.to_owner`, with the reading in `derives_from`. Her private `confirms` is not enough.

Where words must bind (an SMS, a voice call), the custodian echoes the exact terms back once. Only the person's reply to those exact terms is signed on. That reply is the decision itself, and the block `derives_from` its hash.

## 5. A first ask to someone off the network travels in the asker's own name

A person with no node and no custodian yet is not a block-holder, so the first ask to her is words (section 1), but words with a spine: the asker's signed ask.
- **The asker signs the ask** (section 1: a human author). The words that go out are built from that signed block.
- **They go from the asker's own channel**: the asker's own phone, share sheet, SMS or chat app, or an address the asker chose to send from. They are never sent from a number or an account the asker did not choose. A first ask never reaches a stranger from a platform, a custodian or a shared sender.
- **The words carry the ask code**: the short code of the signed ask (profiles/short-form.md, The ask code). The words say who is asking, what, how much and when, how to reply to the asker, how to STOP, and that she may answer the asker as normal. The code lets anyone check the ask against the signed block. It pitches nothing (section 3).
- **A normal reply binds nothing.** She may talk to the asker in the thread, as to anyone.
- **The reply binds only when she sends `YES <code>` to a custodian of her choosing**: a custodian she picks (FoodX first; later her co-op, her M-Pesa agent, her own phone). The custodian resolves the code to the signed ask, echoes the exact terms from that signed block (section 4), and signs her `accepted` answer on her `YES` to the echo, holding her key for her from then (identity.md, Held keys). Her `YES` may come from any number; the custodian holds that number's custody. A code that resolves to nothing, an expired ask or one for a different number signs nothing, and the custodian says so.
- **The custodian never relays or invents the ask.** It resolves the one the asker signed.

## 6. A custodian speaks only for its own client

A custodian (or any host that sends words on someone's behalf) has a voice only for a person who chose it.
- It speaks **in the client's name**, never as a platform or in its own name to the outside.
- It speaks **to people already in that conversation**: her confirmations, receipts and replies, her messages to her own regulars, a laptop or machine she chose to send as, and things people subscribed to.
- It **never speaks first to a stranger nobody chose to message.** A stranger's first contact is the asker's own message (section 5), and the custodian answers only whoever writes to it.
- It **never speaks after a STOP** that names its side (section 2). A STOP by the person binds her custodian too.

## Invariants

16. Every message to a stranger has a human author, or goes through the receiver's own published order channel.
20. Consent is a block, and it follows the principal. Anyone may record a STOP, binding their own side; only the person lifts it; there is no public list.
30. A first ask to someone off the network travels in the asker's own name from the asker's own channel and carries the code of the signed ask; the reply binds only when she sends YES with that code to a custodian she chose. A custodian speaks only for its own client, in her name, to people already in that conversation: never first to a stranger nobody chose, never after STOP.
29. Validity is about the block alone and what it rests on; consent decides what binds, not what exists. A block sent despite a STOP is kept in the chain and read as stopped, so an honest sender's chain never stalls because of anyone else's consent.
21. The ask is ordinary and never pitches; the receipt, sent by the asker or her custodian in the same thread, is the door into an app.
24. A model's reading is never the person's claim until she puts that fact to someone else in her own step; sharing it claims nothing.

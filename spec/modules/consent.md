# Consent

What a person's word does to what may reach them and what binds them. A few rules, each one primitive that every part of the system reads.

A **stranger** to a sender is someone who has answered none of the sender's blocks and has no live YES for the sender (below).

## 1. Every message to a stranger has a human author

A first message to a stranger is signed by a person: the person's own key, or their custodian on their word (identity.md, Held keys). An autonomous system may draft it. It does not send it.

The one exception is the receiver's own published order channel. A node that wants orders written by an autonomous system says so in its admission rule (`order_channel`: the acts, as `type.kind` names, that an autonomous system may send first). Then an autonomous system may send those acts there, once for each real request, and its block names the grant it acts under.

A node refuses any other first block to a stranger that an autonomous system signed (`not_human`). A block is an autonomous system's when its author is an actor of kind `agent` or `machine`, or it names a grant in `refs.under`.

## 2. Consent is a block

A person's answer to contact is an `observe` of kind `consent`. It carries `state.word`, one of four machine tokens:
- `yes`: you may deal with me about this.
- `stop`: do not contact me.
- `keep`: keep my copy of the record for me.
- `move`: move my record to the custodian or node in `state.to`.

`refs.subject` names who it is about: the sender, an operator, or a principal (a person or business whose autonomous systems it covers). Left out, it is about every sender who has no live YES.

**Consent follows the principal.** A sender is named by itself, by its operators, and by the grantor of the grant its block acts under: the author of the grant it names in `refs.under` (and the circle that grant was signed `as`), when that grant is live, is addressed to the sender or open, and is one others act under (not a key or member grant). So a stranger's `yes` to a person covers that person's autonomous systems acting under her live grant, and her `stop` binds them. A word about her is a word about them, and a recorder's STOP binds the recorder's own side, which includes the principals the sender acts for. It may name an ask or deal in `refs.for`. The block is the person's when she signs it, or her custodian on her word, with the raw message's hash in `derives_from`. `refs.from` names the person whose word it is when someone else records it; left out, it is the author.

**Recording a STOP for someone off FoodX.** A person with no keys (a contact, identity.md) cannot sign. Whoever received her STOP records it: the SMS gateway, her custodian, her channel provider, or the asker's own app that saw the reply. The recorder writes a `stop` consent `from` her, with the raw message in `derives_from`. **Anyone may record a STOP, and it binds only the recorder's own side**: the recorder, its operator and every autonomous system under that operator. An app that sees her reply records it against its own sending. It cannot bind anyone else's.

**Recognising an opt-out is the recorder's reading, not a word list.** The protocol holds no list of stop words in any language. The recorder asks a model the right question about the message (does this person want no more contact?) or takes the carrier's own opt-out signal, and records the result as the block above. That reading is the recorder's, never hers.

**Only the person lifts a STOP.** A `yes` lifts a `stop` only when it is the person's own block (her key, or her custodian's on her word) and the stop is in its causal past, so the yes is fresh and human: she said it after she knew of the stop, through a channel the asker does not control (her own phone or custodian, or the recorder who received it). The asker's app never lifts it, and neither does a model's reading of a reply. A recorder outside the asker's side may record her yes the same way (it counts only as the lift of a stop it has in its causal past). Any other consent block written by someone who is not the person counts for nothing.

**The live word.** The `consent` fold takes a person, a sender (or none), optionally the hash of the grant the sender's block acts under (its `refs.under`, which is how consent follows the principal), and the blocks the caller holds. It reads them for that person and sender: the latest word that names the sender (or its operator), else the latest that names no one, in causal order. A recorder's blocks are ordered by the recorder's own chain, so the fold works when the person has no keys. A `stop` wins any tie. A tie between other words leaves no live word. A tie of the same word stands, and the fold names the block with the lowest hash (only to name one; no authority).

**There is no public STOP list.** A hashed phone number can be reversed, so nothing about a STOP is published. A STOP lives with whoever recorded it and with the person's custodian. A sender asks privately, of the custodian or its own record, before it contacts her.

**Consent decides what binds, not what exists.** A block sent despite a live STOP is **valid and kept**: it is judged on the block alone and what it rests on (core.md, check 5), so the sender's chain goes on. The fold reads it as **stopped**: it binds no one (a stopped ask is read as `declined` in advance, folds.md), and a node delivers it to no one. A node may decline to relay its body to the stopped party, and keeps it with the sender's chain. Her own `accepted` answer still binds, because `answers` is the only consent to a deal. A node that holds none cannot know, and delivers as usual. So an honest sender's chain never stalls because of anyone else's consent.

## Invariants

16. Every message to a stranger has a human author, or goes through the receiver's own published order channel.
20. Consent is a block, and it follows the principal. Anyone may record a STOP, binding their own side; only the person lifts it; there is no public list.
21. The ask is ordinary and never pitches; the receipt, sent by the asker or her custodian in the same thread, is the door into an app.
29. Validity is about the block alone and what it rests on; consent decides what binds, not what exists. A block sent despite a STOP is kept in the chain and read as stopped, so an honest sender's chain never stalls because of anyone else's consent.
30. A first ask to someone off the network travels in the asker's own name from the asker's own channel and carries the code of the signed ask; the reply binds only when she sends YES with that code to a custodian she chose. A custodian speaks only for its own client, in her name, to people already in that conversation: never first to a stranger nobody chose, never after STOP.

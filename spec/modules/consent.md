# Consent

What a person's word does to what may reach them and what binds them.

A **stranger** to a sender is someone who has dealt with none of the blocks of the sender, or of those it is named by (below), and has no live YES of their own for the sender (a recorder's `yes` lifts only a stop that recorder recorded; it is never her consent). **Only her accept, her counter-offer or a deal she opened makes him no stranger:** a block of hers that binds her (a fork's included, folds.md) and answers one of his `accepted`, or answers his promise with a counter (a promise with no status), or a promise of hers that names him as a side. Her `declined` or `stopped` answer keeps him a stranger, and so does any other reply: saying no to someone, or asking who they are, is not dealing with them. A block of hers that is half of a fork counts for nothing (core.md, invariant 3).

## 1. Who may write to someone first is their own rule

Each node admits by its owner's published rule (nodes.md, Admission), which decides whether an autonomous system may write to its owner first. The protocol keeps no default: with no `order_channel` in the rule, what a node does with such a first block is its own software's choice. A block an autonomous system signs under no grant binds it alone (promises.md, Who may bind). An **autonomous system** here is an author that is an actor of kind `agent` or `machine`, or one an operator answers for (a live operator grant it accepted, identity.md), or a block that names a grant in `refs.under`. **An owner who wants a person to write first says so:** her rule's `order_channel` lists the acts (as `type.kind` names, or every act) that an autonomous system may send her first; any other first block to her that an autonomous system signed is refused (`not_human`), and an empty list refuses them all. An autonomous system may draft such a message; a person sends it, with their own key or their custodian's on their word (identity.md, Held keys). A rule may also ask earnest money (profiles/earnest.md).

## 2. Consent is a block

A person's answer to contact is an `observe` of kind `consent`. It carries `state.word`, one of four machine tokens:
- `yes`: you may deal with me about this.
- `stop`: do not contact me.
- `keep`: keep my copy of the record for me.
- `move`: move my record to the custodian or node in `state.to`.

`refs.subject` names who it is about: the sender, an operator, or a principal (a person or business whose autonomous systems it covers). A `yes` must name one (`required`), because it widens what reaches her, and silence never widens; a word left without a subject may be only `stop`, `keep` or `move`, which only narrow, and is about every sender with no live YES. A `yes` with no subject counts for nothing in the fold, checked or not. `refs.for` may name an ask or deal. The person signs it, or her custodian on her word, with the raw message's hash in `derives_from`. `refs.from` names whose word it is when someone else records it; left out, the author.

**Consent follows the principal.** A sender is named by every party its block speaks for or answers to: itself, its operators, and whom its block speaks for (authority.md, Who a block speaks for: the one `speaks_for` rule, grant scope included; the circle if signed `as` one). The `consent` fold is given the sender's block for this; without it, only the sender and its operators. So a stranger's `yes` to a person covers her autonomous systems acting under her live grant, and her `stop` binds them.

**Recording a STOP.** A person with no keys (a contact, identity.md) cannot sign. Whoever received her STOP (gateway, custodian, channel provider, the asker's own app) records it: the recorder writes a `stop` consent `from` her, with the raw message in `derives_from`. **Anyone may record a STOP, and it binds only the recorder's own side**: the recorder, its operator and every autonomous system under that operator, including the principals the sender acts for.

**Recognising an opt-out is the recorder's reading, not a word list.** The protocol holds no list of stop words. The recorder asks a model the right question or takes the carrier's opt-out signal, and records the block above.

**Only the person lifts a STOP.** A `yes` lifts a `stop` only when it is the person's own block (her key, or her custodian's on her word) and the stop is in its causal past, so she said it after she knew of the stop. A model's reading of a reply never lifts it. **What a recorder records counts for the recorder's own side alone, both ways:** its recorded `stop` binds its own side, and its recorded `yes` counts only as the lift of a stop that same recorder recorded, in its causal past. Any other consent block written by someone who is not the person counts for nothing.

**The live word.** The `consent` fold takes a person, a sender (or none), optionally the sender's block, and the blocks the caller holds. It reads the latest word that names the sender (or its operator), else the latest that names no one, in causal order. A recorder's blocks are ordered by the recorder's own chain, so the fold works when the person has no keys. A `stop` wins any tie. A tie between other words leaves no live word. A tie of the same word stands, and the fold names the block with the lowest hash (only to name one; no authority).

**There is no public STOP list** (a hashed phone number can be reversed): a STOP lives with its recorder and the person's custodian, and a sender asks privately first.

**Consent decides what binds, not what exists.** A block sent despite a live STOP is **valid and kept**: it is judged on the block alone and what it rests on (core.md, check 5), so the sender's chain goes on. The fold reads it as **stopped**: it binds no one (a stopped ask is read as `declined` in advance, folds.md), and a node delivers it to no one; it may decline to relay its body to the stopped party. Her own `accepted` answer still binds, because `answers` is the only consent to a deal. A node that holds no STOP cannot know, and delivers as usual.

## Invariants

20. Consent is a block, and it follows the principal. Anyone may record a STOP, binding their own side; only the person lifts it; there is no public list.
29. Validity is about the block alone and what it rests on; consent decides what binds, not what exists. A block sent despite a STOP is kept in the chain and read as stopped, so an honest sender's chain never stalls because of anyone else's consent.
30. A first ask to someone off the network travels in the asker's own name from the asker's own channel and carries the code of the signed ask; the reply binds only when she sends YES with that code to a custodian she chose. A custodian block outside that conversation speaks for no one she chose; a custodian that promised to speak only for its own client, in her name, to people already in that conversation, never first to a stranger nobody chose and never after STOP, keeps its own word, not a duty of the protocol (core.md, section 10).

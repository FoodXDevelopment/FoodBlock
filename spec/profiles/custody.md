# Profile: custody hardening

Optional. Rules for custodians who hold keys by SMS, so a stolen SIM does not become a stolen identity. Core says only that a held key says so (identity.md, Held keys).

**Adds:** the observe kind `custody_policy`, and rules a custodian may promise. Each binds only a custodian that publishes it, as its own word (nodes.md, A node's promise);

- **The policy.** An `observe` of kind `custody_policy`: `quiet` (a duration), `step_up` (a money limit), `assisted` (true if it takes help from autonomous systems). Readers weigh a held key by it; the protocol counts it as no lesser.
- **A quiet period after a SIM change.** Once it learns a SIM changed, it signs nothing for the person above a small amount for `quiet`. It tells their other contacts only if her own grant or standing word names it.
- **A step-up above a limit.** Above `step_up` it needs a second proof of her word: another channel, a second device, or a person who knows her. The block names how in `state.proof`, an open label list.
- **An assisted channel.** A village agent or shop helper may write the words for someone who cannot. `state.channel` is the link, `state.assisted_by` the helper's id; her own yes to the echoed terms still binds. The helper is not a side of the deal.
- **Speaking only for its own client.** It speaks only in her name, to people already in that conversation, never first to a stranger nobody chose and never after her STOP. Her `YES <code>` to a first ask counts only from the number the ask was sent to, or one she tied to it (short-form.md, The ask code); the custodian then holds that number's custody.
- **An ordinary ask.** A first ask it carries is ordinary and never pitches; its receipt, in the same thread, is the door into an app.
- **Taking the keys back.** It signs, when asked, the key grant to a key on her own device (identity.md, Held keys).

# Profile: custody hardening

Optional. Rules for custodians who hold keys by SMS, so a stolen SIM does not become a stolen identity. Core says only that a held key says so (identity.md, Held keys).

**Adds:** the observe kind `custody_policy`, and three rules a custodian may promise.

- **The policy is published.** A custodian publishes its rules as an `observe` of kind `custody_policy`: `quiet` (a duration), `step_up` (a money limit), and `assisted` (true if it takes help from agents). Readers weigh a held key by this policy and by the custodian's record. The protocol does not count a held key as lesser.
- **A quiet period after a SIM change.** When the custodian learns a person's SIM changed, it signs nothing for them above a small amount for `quiet`, and tells their other contacts.
- **A step-up above a limit.** Above `step_up`, the custodian needs a second proof of the person's word: another channel, a second device, or a person who knows them. The block names how it was proved: `state.proof`, an open label list.
- **An assisted channel.** A village agent or shop helper may write the words for someone who cannot. The block's `state.channel` is the link, `state.assisted_by` is the helper's id, and the person's own yes to the echoed terms is still what binds. The helper is not a side of the deal.
- **A custodian speaks only for its own client** (strangers.md, section 6): in her name, to people already in that conversation, never first to a stranger nobody chose and never after her STOP. Her `YES <code>` to a first ask may come from any number, and the custodian then holds that number's custody (short-form.md, The ask code).
- **Taking the keys back** is tested by the custodian, in the open: a key grant to a key on the person's own device. A custodian that blocks it breaks invariant 19.

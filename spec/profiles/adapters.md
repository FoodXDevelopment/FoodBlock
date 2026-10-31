# Profile: adapters

Optional. How FoodBlock meets other networks. An adapter is a node that speaks both languages. None of it is in core.

**Beckn / ONDC.** An adapter holds a seller's keys as their custodian, under their grant (identity.md). It maps search to a pull of open offers; select, init and confirm to an ask, a counter and an `answers` `accepted`; payment and fulfilment calls to transfers and the seller's work blocks. FoodBlock never buys orders, holds money, or becomes a registry. Remove the adapter and the seller keeps their record.

**EPCIS / FSMA 204.** `foodblock-profile-epcis.md` carries EPCIS events as ordinary blocks.

**Local traceability.** Cattle IDs, TAP codes, HACCP numbers, one-step-back records and allergen lists are schemas: `thing` identifiers as marks, and `observe` kinds with `grounds`. Data a reader reads, never a word in core.

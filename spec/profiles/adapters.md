# Profile: adapters

Optional. How FoodBlock meets other networks. An adapter is a node that speaks both languages. None of it is in core.

**Beckn / ONDC.** An adapter node holds a seller's keys as their custodian, under their grant (identity.md). It maps:
- search to a pull of open offers;
- select, init and confirm to a promise (ask), a counter, and an `answers` of `accepted`;
- the network's payment and fulfilment calls to transfers and the seller's own work blocks.

FoodBlock never buys orders, never holds money, and never becomes a registry or gateway. The adapter can be removed and the seller keeps their record.

**EPCIS / FSMA 204.** The profile in `foodblock-profile-epcis.md` carries EPCIS events and Critical Tracking Events as ordinary blocks.

**Local traceability.** Japan's cattle ID, Taiwan's TAP code, Korea's HACCP number, the EU's one-step-back records and allergen lists are schemas: `thing` identifiers as marks, and `observe` kinds with `grounds`. Each is data a reader reads. None is a word in core.

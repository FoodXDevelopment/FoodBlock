# To do

Open work, with enough context to pick up.

- **Waiting blocks are asked for only from whoever pushed them** (spec §10). A push carries no identity, so the
  node cannot tell who pushed; it retries waiting blocks on every push and drops them after `WAIT_TTL`.
- **Local discovery.** The node builds its local announcement but runs no mDNS / DNS-SD responder or short-range
  link; a transport that carries it is still to be added.
- **A node that holds many blocks.** A pull reads every block since `since` before filtering, which is fine for one
  person's node; an index needs the filter and `heads` in SQL.
- **Publishing 1.6.** See `DISTRIBUTION.md`.
- EPCIS profile vectors not yet written: AssociationEvent, SensorElement, ErrorDeclaration, a circle as covered person (spec/profiles/foodblock-profile-epcis.md §9).
- Passkeys: a real device's assertion has not been tried (the vectors use a test authenticator that writes the same shapes); the Kotlin tests need a JDK.

## Ideas parked on purpose

Each is real and wanted, and none is started. Each says what would start it. The protocol must not grow for them before then.

- **Science on people's own nodes.** Studies run over data that stays on each person's node: federated, with secure aggregation, and a grant per study. Starts when a researcher with a real question and a first group of people who would join is ready to run one.
- **Local law as data.** A community, council or regulator publishes its rules as schemas (`under` can already name one), so a law is a block anyone can read and a fold can check. Starts when one real authority is willing to publish one rule this way.
- **Promises settled by the physical world.** A promise is done when a sensor says so: cold chain held, a delivery arrived, parametric cover paid on a measured event. Regulatory advice comes first (money and insurance law). Starts when a partner with real sensors and a regulator's go-ahead is named.
- **Offline mesh trading.** Peers swap blocks over Bluetooth or SMS with no internet (`profiles/short-form.md` is the first step). Starts when a market with no reliable connection and a group who would trade that way is found.
- **Machines coordinating through signed traces.** Robots, vehicles and fridges agree work by writing and reading each other's signed blocks. Starts when two machines from different makers must cooperate on one real job.
- **Physical fingerprints as thing identity.** A thing is named by what it physically is (a crop's chemical or visual fingerprint), not by a tag that can be moved. Starts when a reader that gives a repeatable fingerprint exists at a price a farm or a kitchen would pay.
- **Proofs about a record without disclosing it.** Step 1: selective disclosure, showing part of a record with Merkle proofs (the Merkle rule is in `spec/modules/encoding.md`). Step 2: a trusted verifier's signed statement about the record. Step 3: real zero-knowledge proofs. Start step 1 when a person must prove one fact (an allergy, a certificate) without handing over the whole record; step 3 only when steps 1 and 2 are shown not to be enough.

# Profile: tasks

Optional. How any task in food, in software or in the world, is organised with the blocks that already exist. A task is a promise. A deed is the worker's own block. Evidence is an observe. No new type and no new verb.

**Adds:** the condition schemas, the progress kind, skills as offers, and the horizon rule. The relative `when` is in promises.md, and the rule for acts that cannot be undone is in authority.md.

- **The plan.** The top of a plan is a promise to oneself (promises.md). Each sub-task is its own first promise and names its parent in `refs.for`.
- **Dependencies are conditions.** A step that must follow another has `terms.condition` under a schema: `{ settled: <promise id> }` or `{ deed: <block id> }`.
- **Sensor conditions.** `terms.condition` under the schema `reading_condition`: `{ reading: <sensor thing>, kind, op, value, over }`. For example, bed 3 soil moisture below 30% for PT2H. The performer's edge checks it against the observes it holds. The condition holds the rule. The readings are the evidence. A reading never settles a promise (promises.md, Settling).
- **Windows.** `state.when` under a schema may add `not_before`, `not_after` and `takes` (the performer's estimate, not a promise).
- **Skills are standing open offers.** A mower, a drone or a cook publishes a `promise` (offer): `refs.from` itself, `to` open, `refs.what` a job kind (a thing of kind `schema`, such as `job:spray`), `terms.needs`, a geofence and rate in `terms`, and a `repeat` or `until` for when it is free.
- **Certifications are confirms.** A certifier's `confirms` of that offer is the certificate. The schema's grounds name who may confirm. A skill registry is only a fold over offers and confirms, which any index can serve and a site's edge can cache.
- **Progress.** An `observe` of kind `progress`, `for` the ask, with `state.phase` (a label from the job's schema) and optionally `state.fraction` (a decimal string). Sign a change of phase, not a heartbeat. A fast stream stays at the edge and enters the record by Merkle root (things.md).
- **The horizon.** A planner sends an ask only for a step inside its horizon, the near steps it can really release. The rest stays a draft on its own node and is free to change. This keeps stale asks out of the world.
- **The scheduler is an edge service.** It holds the near horizon, reads the skills, picks who to ask, watches progress and replans. It works offline. For a shared thing on the site (the tractor, a lane, the dishwasher) it is the orderer, and a backup takes over only by a new grant from the owner. A model may help rank. It never controls a machine.
- **A machine is a peer with an operator** (identity.md). It posts its own asks, such as a worn blade asking for service.

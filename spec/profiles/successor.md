# Profile: successor

Optional. Lets a person name who acts for them after an event (death, long absence). Core and every module work without it.

**Adds:** the grant kind `successor`, the observe kinds `trigger` and `close`, one right for the recovery key, and the view `successor_view`.

- **The grant.** A `grant` of kind `successor`: `refs.to` is the successor. `state.witnesses` names who may record the event, `state.needed` how many must, `state.wait` how long the trigger waits (a duration), and `state.keys` holds the person's decryption keys sealed to the successor (an envelope, privacy.md, whose plaintext is a list of encryption private keys). It never holds signing keys. It carries no `scope.until`.
- **The trigger.** A witness records the event as an `observe` of kind `trigger` that names the successor grant in `refs.under`.
- **The wait.** The trigger fires `wait` after the `needed`-th witness observe arrives. In that time any live key of the person, or the recovery key, stops it by a `defeats` of an event observe. The recovery key may sign this `defeats`; it is the one thing besides key grants it may sign.
- **After it fires.** The successor signs as themselves, `under` the grant, and reads only what the person could read and was free to pass on. The successor closes the person's chain with their own block: an `observe` of kind `close`, `refs.subject` the person.

**The view `successor_view`** reads the arrivals of the witness observes on the reader's own node and the reader's clock. It returns `events`, `cancelled`, `since`, `fires` (`since` plus `wait`) and `fired` (true once the reader's clock reaches `fires`). Two nodes may fire at different moments. The successor acts only where a reader's own view says fired.

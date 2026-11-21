// Adds to spec/vectors.json the cases of the typed fields of a kind (core.md, section 3; protocol.json `kind_fields`): a witness's said and
// readback, a consent's word and to, a draw's terms.reveal_by and terms.recipe. `node test/make-vectors-kinds.cjs`, after `node scripts/build-wasm.cjs`.
// Idempotent. Every expectation is written here by hand from the spec text and checked against the Rust core; the oracle then checks the file.
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { check, story, retire } = kit
// a draw with no wins count was clean before it was asked for; it is no draw now
retire(['kinds: a draw with neither is not asked for them'])

const ID = '2'.repeat(64), HEX = 'ab'.repeat(32)
const witness = (extra, refs = { for: ID }) => ({ type: 'observe', state: { kind: 'witness', handle: 'sms:+447700900123', said: 'yes', readback: HEX, ...extra }, refs })
const consent = (extra, refs = { subject: ID }) => ({ type: 'observe', state: { kind: 'consent', word: 'yes', ...extra }, refs })
// the draw schema is held: a promise names it in refs.schema, so its terms are declared (core.md, section 7)
const s = story(), pat = s.person('kinds-pat')
const schema = s.say(pat, 'thing', { kind: 'schema', target: 'promise.draw', fields: { what: 'what is drawn for' }, terms: { wins: 'how many win', commitment: 'a commitment', recipe: 'the ranking recipe', reveal_by: 'a time', keepers: 'a named clock', if_withheld: 'last' } })
const drawBare = (terms) => ({ type: 'promise', state: { kind: 'draw', what: 'the turns', terms }, refs: { from: pat.id, to: pat.id, schema: schema.hash } })
// a draw states how many win (profiles/pools.md): none stated, no draw
const draw = (terms) => drawBare({ wins: 1, ...terms })

// ---- a witness (authority.md, A witness) ----
check('kinds: a witness with said and readback well formed is clean', witness({}), [])
check('kinds: a witness may say the words themselves', witness({ said: 'yes please' }), [])
check('kinds: a witness with no said or readback is not asked for them', witness({ said: undefined, readback: undefined }), [])
check('kinds: said that is not text is refused', witness({ said: 1 }), ['shape'])
check('kinds: said that is true is refused', witness({ said: true }), ['shape'])
check('kinds: readback that is not text is refused', witness({ readback: 5 }), ['grammar'])
check('kinds: readback that is not a digest is refused', witness({ readback: 'read it back' }), ['grammar'])
check('kinds: readback in capitals is refused (hex is lowercase)', witness({ readback: 'AB'.repeat(32) }), ['grammar'])
check('kinds: readback one character short is refused', witness({ readback: HEX.slice(1) }), ['grammar'])
check('kinds: said on an observe of another kind is not read', { type: 'observe', state: { kind: 'note', said: 1, readback: 'x' }, refs: {} }, [])

// ---- a consent line (consent.md, section 2) ----
for (const w of ['yes', 'stop', 'keep', 'move']) check(`kinds: consent word ${w} is clean`, consent({ word: w, ...(w === 'move' ? { to: ID } : {}) }), [])
check('kinds: a consent word outside the four is refused', consent({ word: 'maybe' }), ['shape'])
check('kinds: a consent word that is not text is refused', consent({ word: 1 }), ['shape'])
check('kinds: a consent word in capitals is refused (the tokens are lowercase)', consent({ word: 'STOP' }, {}), ['shape'])
check('kinds: a yes with no subject is still required, as before', consent({}, {}), ['required'])
check('kinds: a move to an id is clean', consent({ word: 'move', to: ID }, {}), [])
check('kinds: a move to something that is no id is refused', consent({ word: 'move', to: 'my new host' }, {}), ['grammar'])
check('kinds: to that is not text is refused', consent({ word: 'move', to: 7 }, {}), ['grammar'])
check('kinds: a stop with no to is clean', consent({ word: 'stop' }, {}), [])
check('kinds: word on an observe of another kind is not read', { type: 'observe', state: { kind: 'note', word: 'maybe', to: 'x' }, refs: {} }, [])

// ---- a draw (profiles/pools.md, a rotating pot; the schema draw) ----
check('kinds: a draw with a reveal_by time and a recipe id is clean', draw({ reveal_by: '2026-12-01T00:00:00.000Z', recipe: ID }), [], s.held)
check('kinds: a draw with a wins count and neither reveal_by nor recipe is not asked for them', draw({}), [], s.held)
check('kinds: a draw that states no wins is no draw', drawBare({ reveal_by: '2026-12-01T00:00:00.000Z', recipe: ID }), ['shape'], s.held)
check('kinds: a draw with no terms at all is no draw', drawBare({}), ['shape'], s.held)
check('kinds: wins of zero is refused', draw({ wins: 0 }), ['shape'], s.held)
check('kinds: wins that is text is refused', draw({ wins: '2' }), ['shape'], s.held)
check('kinds: wins of three is clean', draw({ wins: 3 }), [], s.held)
check('kinds: reveal_by that is not a time is refused', draw({ reveal_by: 'friday' }), ['time'], s.held)
check('kinds: reveal_by that is not a real instant is refused', draw({ reveal_by: '2026-02-30T00:00:00.000Z' }), ['calendar'], s.held)
check('kinds: reveal_by that is a number is refused', draw({ reveal_by: 5 }), ['time'], s.held)
check('kinds: recipe that is no id is refused', draw({ recipe: 'by rank' }), ['grammar'], s.held)
check('kinds: recipe that is not text is refused', draw({ recipe: 3 }), ['grammar'], s.held)

vectorsFile.save(V, tags)

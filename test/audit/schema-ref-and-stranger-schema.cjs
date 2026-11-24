const { fb, oracle, World } = require('./lib.cjs')
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const w = new World('case9 reversibility')
const farmer = w.person('farmer'), agent = w.person('agent', 'agent'), eve = w.person('eve')
const field = w.w(farmer, 'thing', { kind: 'field', name: 'north field' }, {}, 'field')
const EXPIRES = '2099-01-01T00:00:00.000Z'
const broad = w.w(farmer, 'grant', { kind: 'authority', scope: { types: ['transfer', 'observe'], expires: EXPIRES } }, { to: agent.id }, 'broad grant (types: transfer, observe)')
const named = w.w(farmer, 'grant', { kind: 'authority', scope: { types: ['transfer.spray'], expires: EXPIRES } }, { to: agent.id }, 'named grant, NO limit')
const namedLim = w.w(farmer, 'grant', { kind: 'authority', scope: { types: ['transfer.spray'], limit: { value: '50', unit: 'GBP' }, every: 'P1D', expires: EXPIRES } }, { to: agent.id }, 'named grant WITH limit')
const sprayS = w.w(farmer, 'thing', { kind: 'schema', target: 'transfer.spray', fields: { field: 'text' } }, {}, 'schema spray (by farmer)')
const valveS = w.w(farmer, 'thing', { kind: 'schema', target: 'transfer.open_valve', fields: { valve: 'text' } }, {}, 'schema open_valve')
const act = (kind, under, extraRefs = {}, who = agent) => w.w(who, 'transfer', { kind }, { what: field.hash, to_place: field.hash, under: under.hash, ...extraRefs }, `${kind} under ${under.state.scope.types.join('+')}${under === namedLim ? ' (limit)' : under === named ? ' (no limit)' : ''}${Object.keys(extraRefs).length ? ' +' + Object.keys(extraRefs) : ''}`)
const check = (label, b) => {
  const s = fb.grant.whyNotUnder(b, w.blocks).map(x => x.code || x)
  let o; try { o = oracle.whyNotUnder(b, w.blocks).map(x => x.code) } catch (e) { o = 'ERR ' + e.message }
  show(label, '| sdk whyNotUnder', s, '| oracle', o)
}
check('spray under BROAD grant', act('spray', broad))
check('spray under named grant NO limit', act('spray', named))
check('spray under named grant WITH limit', act('spray', namedLim))
check('open_valve under BROAD grant', act('open_valve', broad))
check('act with NO schema at all (launch_robot) under BROAD', act('launch_robot', broad))
// spray with schema ref omitted vs present, and a schema by a stranger
check('spray w/ refs.schema -> farmer schema, BROAD', act('spray', broad, { schema: sprayS.hash }))
// stranger-marked schema: eve publishes a schema for an innocent act 'transfer.restock'
w.w(eve, 'thing', { kind: 'schema', target: 'transfer.restock'}, {}, 'EVE (stranger) schema for transfer.restock')
check('restock (harmless) under BROAD after eve\'s stranger schema', act('restock', broad))
// specific accepted ask path
const ask = w.w(agent, 'promise', { what: 'transfer.spray' , terms: { expires: EXPIRES } }, { to: farmer.id, from: agent.id, under: broad.hash, schema: sprayS.hash }, 'agent asks to spray (names act via state.what)')
const yes = w.w(farmer, 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash }, 'farmer accepts the ask')
check('spray under BROAD + accepted ask (for)', act('spray', broad, { for: ask.hash }))
w.report()

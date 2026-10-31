const { fb, oracle, World } = require('./lib.cjs')
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const w = new World('case9 reversibility')
const farmer = w.person('farmer'), agent = w.person('agent', 'agent'), eve = w.person('eve')
const field = w.w(farmer, 'thing', { kind: 'field', name: 'north field' }, {}, 'field')
w.w(farmer, 'grant', { kind: 'operator' }, { to: agent.id }, 'operator grant')
const UNTIL = '2099-01-01T00:00:00.000Z'
const broad = w.w(farmer, 'grant', { kind: 'authority', scope: { acts: ['transfer', 'observe'], until: UNTIL } }, { to: agent.id }, 'broad grant (acts: transfer, observe)')
const named = w.w(farmer, 'grant', { kind: 'authority', scope: { acts: ['transfer.spray'], until: UNTIL } }, { to: agent.id }, 'named grant, NO limit')
const namedLim = w.w(farmer, 'grant', { kind: 'authority', scope: { acts: ['transfer.spray'], limit: { minor: 5000, currency: 'GBP' }, every: 'P1D', until: UNTIL } }, { to: agent.id }, 'named grant WITH limit')
const sprayS = w.w(farmer, 'thing', { kind: 'schema', target: 'transfer.spray', undo: 'never', fields: { field: 'text' } }, {}, 'schema spray undo:never (by farmer)')
const valveS = w.w(farmer, 'thing', { kind: 'schema', target: 'transfer.open_valve', fields: { valve: 'text' } }, {}, 'schema open_valve (NO undo marking)')
const act = (kind, under, extraRefs = {}, who = agent) => w.w(who, 'transfer', { kind }, { what: field.hash, to_place: field.hash, under: under.hash, ...extraRefs }, `${kind} under ${under.state.scope.acts.join('+')}${under === namedLim ? ' (limit)' : under === named ? ' (no limit)' : ''}${Object.keys(extraRefs).length ? ' +' + Object.keys(extraRefs) : ''}`)
const check = (label, b) => {
  const s = fb.grant.whyNotUnder(b, w.blocks).map(x => x.code || x), u = (() => { try { return fb.grant.whyNotLiveUndo(b, w.blocks) } catch (e) { return 'ERR ' + e.message } })()
  let o; try { o = oracle.whyNotUnder(b, w.blocks).map(x => x.code) } catch (e) { o = 'ERR ' + e.message }
  show(label, '| sdk whyNotUnder', s, '| whyNotLiveUndo', u, '| oracle', o)
}
check('spray(undo never) under BROAD grant', act('spray', broad))
check('spray under named grant NO limit', act('spray', named))
check('spray under named grant WITH limit', act('spray', namedLim))
check('open_valve (irreversible, schema has NO undo) under BROAD grant', act('open_valve', broad))
check('irreversible act with NO schema at all (launch_robot) under BROAD', act('launch_robot', broad))
// spray with schema ref omitted vs present, and a schema by a stranger
check('spray w/ refs.schema -> farmer schema, BROAD', act('spray', broad, { schema: sprayS.hash }))
// stranger-marked schema: eve publishes undo:never for an innocent act 'transfer.restock'
w.w(eve, 'thing', { kind: 'schema', target: 'transfer.restock', undo: 'never' }, {}, 'EVE (stranger) schema marks transfer.restock undo:never')
check('restock (harmless) under BROAD after eve\'s stranger schema', act('restock', broad))
// specific accepted ask path
const ask = w.w(agent, 'promise', { what: 'transfer.spray' , terms: { expires: UNTIL } }, { to: farmer.id, from: agent.id, under: broad.hash, schema: sprayS.hash }, 'agent asks to spray (names act via state.what)')
const yes = w.w(farmer, 'promise', { status: 'accepted' }, { answers: ask.hash, for: ask.hash }, 'farmer accepts the ask')
check('spray under BROAD + accepted ask (for)', act('spray', broad, { for: ask.hash }))
w.report()

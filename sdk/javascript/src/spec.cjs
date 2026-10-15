// The one source (spec/core.md and modules/): every closed list and grammar is read from spec/protocol.json, exactly as
// written there. No list is copied into code; every module reads these names. There is no alias table: year zero.
// The package carries its own exact copy of protocol.json (sdk/javascript/spec, made by test/sync-spec.cjs).
const PROTOCOL = require('../spec/protocol.json')

const GRAMMAR = Object.fromEntries(Object.entries(PROTOCOL.grammar).filter(([name]) => !name.endsWith('_note')).map(([name, pattern]) => [name, new RegExp(pattern)]))
const TYPES = Object.keys(PROTOCOL.types)
const REF_KEYS = [...PROTOCOL.refs.who_and_where, ...PROTOCOL.refs.what_and_which, ...PROTOCOL.verbs, ...PROTOCOL.causal]

module.exports = {
  PROTOCOL, GRAMMAR, TYPES, REF_KEYS,
  VERSION: PROTOCOL.version,
  VERBS: PROTOCOL.verbs,
  CLOSED_TYPES: PROTOCOL.closed_types,
  STATUSES: PROTOCOL.statuses,
  STOPS: Object.keys(PROTOCOL.stop),
  GRANT_KINDS: PROTOCOL.grant_kinds,
  POWERS: PROTOCOL.powers,
  GENESIS: PROTOCOL.genesis,
  TERMS: PROTOCOL.terms,
  SCOPE: PROTOCOL.scope,
  LIMITS: PROTOCOL.limits,
  INTEGERS: PROTOCOL.integers,
  SUITES: Object.keys(PROTOCOL.suites).filter((name) => PROTOCOL.suites[name] && PROTOCOL.suites[name].hash),
  PEERS: PROTOCOL.peers
}

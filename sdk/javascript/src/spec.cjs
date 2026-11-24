// The one source (spec/core.md and modules/): every closed list and grammar is read from spec/protocol.json, exactly as
// written there. No list is copied into code; every module reads these names.
// The package carries its own exact copy of protocol.json (sdk/javascript/spec, made by test/sync-spec.cjs).
const PROTOCOL = require('../spec/protocol.json')
// conventions.json: a node's conventions and the lists of readings and tools (envelope, messages, cbor, peers, profiles,
// views, the other ops' door entries); no word reads it. Carried the same way (sdk/javascript/spec).
const CONVENTIONS = require('../spec/conventions.json')

const TYPES = Object.keys(PROTOCOL.types)
const REF_KEYS = [...PROTOCOL.refs.who_and_where, ...PROTOCOL.refs.what_and_which, ...PROTOCOL.verbs, ...PROTOCOL.causal]

module.exports = {
  PROTOCOL, CONVENTIONS, TYPES, REF_KEYS,
  // the package's own number (a label: protocol.json names no version; a rule set is named by its hash, core.md section 11)
  VERSION: require('../package.json').version,
  VERBS: PROTOCOL.verbs,
  SUITES: Object.keys(PROTOCOL.suites).filter((name) => PROTOCOL.suites[name] && PROTOCOL.suites[name].hash),
  PEERS: CONVENTIONS.peers
}

// The one source (spec/protocol.md, "One source for lists"): every closed list and grammar is read from
// spec/protocol.json, and every older shape from spec/aliases.json, exactly as written there. No list is copied into
// code; every module reads these names.
// The package carries its own exact copy (sdk/javascript/spec, made by test/sync-spec.cjs).
const load = (file) => require(`../spec/${file}`)
const PROTOCOL = load('protocol.json')
const ALIASES = load('aliases.json')

const GRAMMAR = Object.fromEntries(Object.entries(PROTOCOL.grammar).map(([name, pattern]) => [name, new RegExp(pattern)]))
const TYPES = Object.keys(PROTOCOL.types)
const REF_KEYS = [...PROTOCOL.refs.who_and_where, ...PROTOCOL.refs.what_and_which, ...PROTOCOL.refs.verbs]

module.exports = {
  PROTOCOL, ALIASES, GRAMMAR, TYPES, REF_KEYS,
  VERSION: PROTOCOL.version,
  VERBS: PROTOCOL.verbs,
  ANSWERS: PROTOCOL.answers,
  STOPS: Object.keys(PROTOCOL.stop),
  GRANT_KINDS: PROTOCOL.grant_kinds,
  ROLES: PROTOCOL.roles,
  GENESIS: PROTOCOL.genesis,
  GENESIS_OPTIONAL: PROTOCOL.genesis_optional,
  TERMS: PROTOCOL.terms,
  SCOPE: PROTOCOL.scope,
  LIMITS: PROTOCOL.limits,
  INTEGERS: PROTOCOL.integers,
  PROFILES: PROTOCOL.profiles
}

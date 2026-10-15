// The FoodBlock 1.6 reference SDK: its whole API. Every closed list comes from spec/protocol.json (PROTOCOL), every
// older shape from spec/aliases.json. The names match the other SDKs (FILE-AUDIT §4): `sign` signs, `seal` encrypts.
const spec = require('./spec.cjs')
const { create, hash } = require('./block.cjs')
const { canonical, canonicalJSON } = require('./canonical.cjs')
const sign = require('./sign.cjs')
const envelope = require('./envelope.cjs')
const audience = require('./audience.cjs')
const write = require('./write.cjs')
const protocol = require('./protocol.cjs')
const { readAs, isA } = require('./aliases.cjs')
const chain = require('./chain.cjs')
const order = require('./order.cjs')
const identity = require('./identity.cjs')
const grant = require('./grant.cjs')
const fold = require('./fold.cjs')
const sync = require('./sync.cjs')
const keystore = require('./keystore.cjs')
const cbor = require('./cbor.cjs')

module.exports = {
  // The protocol, as data
  VERSION: spec.VERSION, PROTOCOL: spec.PROTOCOL, ALIASES: spec.ALIASES, TYPES: spec.TYPES, VERBS: spec.VERBS, REF_KEYS: spec.REF_KEYS,
  FIELDS: protocol.FIELDS, PROFILES: spec.PROFILES,

  // A block: its canonical form and its id
  create, hash, canonical, canonicalJSON,

  // Signing (Ed25519) and encryption (X25519, HKDF-SHA256, AES-256-GCM)
  generateKeypair: sign.generateKeypair, keypairFromSeed: sign.keypairFromSeed, sign: sign.sign, verify: sign.verify,
  signMessage: sign.signMessage, verifyMessage: sign.verifyMessage,
  generateEncryptionKeypair: envelope.generateEncryptionKeypair, encryptionKeyOf: envelope.encryptionKeyOf,
  seal: envelope.seal, open: envelope.open, ALG: envelope.ALG, ALG_RAW: envelope.ALG_RAW,

  // The commitment: audience, personal fields, for_whom, ballots
  newSalt: audience.newSalt, saltedHash: audience.saltedHash, commit: audience.commit, findsSelf: audience.findsSelf, revealFor: audience.revealFor,

  // Writing: compose, check, sign, chain (`write` does all four); the wire
  PUBLIC: write.PUBLIC, compose: write.compose, write: write.write, check: protocol.check, refusals: protocol.refusals, CODES: protocol.CODES,
  amount: protocol.amount, money: protocol.money, confidence: protocol.confidence, terms: protocol.terms, isTime: protocol.isTime, isDate: protocol.isDate,
  wrap: write.wrap, unwrap: write.unwrap, header: write.header, sealCopy: write.sealCopy, openCopy: write.openCopy, headerSignedBy: write.headerSignedBy,

  // The compact form: a public block as CBOR for small links (the id is still the hash of the canonical JSON)
  cbor,

  // Reading every earlier shape as 1.6
  readAs, isA,

  // Chains and causal order
  nextLink: chain.nextLink, checkChain: chain.checkChain, causalOrder: order.causalOrder, pastOf: order.pastOf, sees: order.sees,

  // Who someone is; authority; the folds; between nodes
  identity, grant, fold, sync,
  promiseStage: fold.promiseStage, circleState: fold.circleState, identityState: identity.identityState, membersThen: fold.membersThen, whereNow: fold.whereNow, ownerOf: fold.ownerOf,

  // Keys kept on a person's device, locked with a recovery code (product custody, not protocol)
  keystore
}

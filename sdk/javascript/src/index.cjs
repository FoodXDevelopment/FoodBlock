// The FoodBlock 1.6 reference SDK: its whole API. Every closed list comes from spec/protocol.json (PROTOCOL). There is no
// earlier version in the protocol: old data enters once, through `legacy.convert`. The names match the other SDKs:
// `sign` signs, `seal` encrypts.
const spec = require('./spec.cjs')
const { create, hash } = require('./block.cjs')
const { canonical, canonicalJSON } = require('./canonical.cjs')
const sign = require('./sign.cjs')
const envelope = require('./envelope.cjs')
const audience = require('./audience.cjs')
const write = require('./write.cjs')
const protocol = require('./protocol.cjs')
const strangers = require('./strangers.cjs')
const legacy = require('./legacy.cjs')
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
  VERSION: spec.VERSION, PROTOCOL: spec.PROTOCOL, TYPES: spec.TYPES, VERBS: spec.VERBS, REF_KEYS: spec.REF_KEYS, SUITES: spec.SUITES,
  FIELDS: protocol.FIELDS, PEERS: spec.PEERS,

  // A block: its canonical form and its id
  create, hash, canonical, canonicalJSON,

  // Signing and encryption, by suite (std: Ed25519 and X25519; p256; sm)
  generateKeypair: sign.generateKeypair, keypairFromSeed: sign.keypairFromSeed, sign: sign.sign, verify: sign.verify,
  signMessage: sign.signMessage, verifyMessage: sign.verifyMessage, suiteOfKey: sign.suiteOfKey, passkeyChallenge: sign.passkeyChallenge, passkeySignature: sign.passkeySignature,
  generateEncryptionKeypair: envelope.generateEncryptionKeypair, encryptionKeyOf: envelope.encryptionKeyOf,
  seal: envelope.seal, open: envelope.open, ALG: envelope.ALG,

  // The commitment: audience, personal fields, for_whom, ballots
  newSalt: audience.newSalt, saltedHash: audience.saltedHash, commit: audience.commit, findsSelf: audience.findsSelf, revealFor: audience.revealFor,

  // Writing: compose, check, sign, chain (`write` does all four); the wire
  PUBLIC: write.PUBLIC, compose: write.compose, write: write.write, check: protocol.check, refusals: protocol.refusals, valid: protocol.valid, strictText: protocol.strictText, CODES: protocol.CODES,
  amount: protocol.amount, money: protocol.money, confidence: protocol.confidence, terms: protocol.terms, isTime: protocol.isTime, isDate: protocol.isDate,
  wrap: write.wrap, unwrap: write.unwrap, header: write.header, sealCopy: write.sealCopy, openCopy: write.openCopy, headerSignedBy: write.headerSignedBy,

  // The compact form: a public block as CBOR for small links (the id is still the hash of the canonical JSON)
  cbor,

  // Strangers, short form, tasks and deposits (the small rules)
  strangers, receiptCode: strangers.receiptCode,

  // The one-time converter for pre-1.6 data (not part of the protocol)
  legacy,

  // Chains and causal order
  nextLink: chain.nextLink, checkChain: chain.checkChain, causalOrder: order.causalOrder, pastOf: order.pastOf, sees: order.sees,

  // Who someone is; authority; the folds; between nodes
  identity, grant, fold, sync,
  promiseStage: fold.promiseStage, promiseView: fold.promiseView, consent: fold.consent, circleState: fold.circleState, identityState: identity.identityState, membersThen: fold.membersThen, whereNow: fold.whereNow, ownerOf: fold.ownerOf,

  // Keys kept on a person's device, locked with a recovery code (product custody, not protocol)
  keystore
}

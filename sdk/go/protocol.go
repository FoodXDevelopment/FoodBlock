package foodblock

// FoodBlock 1.7 (spec/core.md), as thin calls into the Rust core: signing, the write check, chains, commitments,
// envelopes and the wire. No rule lives here.

// Finding is one finding of a check: a code from protocol.json (refusals.codes) and free text for people.
type Finding struct {
	Code   string `json:"code"`
	Detail string `json:"detail"`
}

// CheckOptions: Schemas (a schema block named by a block's schema ref counts its fields and roles as declared) and
// Held (hash -> block, so `at` is checked against what refs.after names and a child grant against its parent).
type CheckOptions struct {
	Schemas map[string]Block
	Held    map[string]Block
}

// heldAndSchemas are the blocks held and the schemas a check reads (nil schemas: none given).
func heldAndSchemas(options []CheckOptions) (held, schemas []Block) {
	var o CheckOptions
	if len(options) > 0 {
		o = options[0]
	}
	return blockList(o.Held), blockList(o.Schemas)
}

// Refusals is what is wrong with a block: one entry per rule found, in the order of protocol.json refusals.codes.block.
func Refusals(typ string, state, refs map[string]any, options ...CheckOptions) []Finding {
	held, schemas := heldAndSchemas(options)
	return doorRefusals(typ, orEmpty(state), orEmpty(refs), held, schemas)
}

// Valid is every refusal of a signed block against the blocks held (empty when valid). ArrivedAt is the reader's
// arrival log, when it keeps one (validity reads none: the core takes no arrivals here); Schemas are schema blocks, by hash.
func Valid(b Block, held []Block, schemas map[string]Block, arrivedAt ArrivedAt) []Finding {
	return doorValid(b, held, blockList(schemas))
}

// StrictText is strict writing from JSON text: a repeated key, then every refusal of the block it holds.
func StrictText(text string) []Finding {
	return doorStrictText(text)
}

// Check is what is wrong with a block, in plain words (each finding's detail); empty when it passes.
func Check(typ string, state, refs map[string]any, options ...CheckOptions) []string {
	held, schemas := heldAndSchemas(options)
	return doorCheck(typ, orEmpty(state), orEmpty(refs), held, schemas)
}

// Amount is an amount: Amount("2.5", "kg"). The value is a decimal string.
func Amount(value, unit string) map[string]any { return doorAmount[map[string]any](value, unit) }

// Money is an amount of money in minor units: Money(450, "GBP").
func Money(minor int64, currency string) map[string]any {
	return doorMoney[map[string]any](minor, currency)
}

// Terms keeps only the terms protocol.json names.
func Terms(given map[string]any) map[string]any { return doorTerms[map[string]any](given) }

// ---- Signing ----

// Keypair: a signing key (SPKI DER, hex) and its private key (hex), and its Suite when it is not std.
type Keypair struct {
	PublicKeySign string `json:"public_key_sign"`
	PrivateKey    string `json:"private_key"`
	Suite         string `json:"suite,omitempty"`
}

// String and GoString hide the private key: a key is never printed or logged by accident (fmt's %v, %+v, %#v and %s). JSON still carries it.
func (k Keypair) String() string {
	return "Keypair{PublicKeySign: " + k.PublicKeySign + ", PrivateKey: <hidden>, Suite: " + k.Suite + "}"
}
func (k Keypair) GoString() string { return k.String() }

// KeypairFromSeed is the signing key a 32-byte seed (hex) gives, in a suite (std when none is given).
func KeypairFromSeed(seedHex string, suite ...string) (Keypair, error) {
	return doorKeypair[Keypair](seedHex, suiteArg(suite))
}

// GenerateKeypair is a new signing key, in a suite (std when none is given).
func GenerateKeypair(suite ...string) (Keypair, error) {
	return doorKeypair[Keypair]("", suiteArg(suite))
}

// Sign is the author's signature over a block's canonical form, by the algorithm of the suite of the signing key.
func Sign(b Block, privateKeyHex string, suite ...string) (string, error) {
	return doorSign(b, privateKeyHex, suiteArg(suite))
}

// SuiteOfKey is the suite a signing key (SPKI hex) belongs to, or "".
func SuiteOfKey(publicKeySign string) string {
	if suite := doorSuiteOfKey(publicKeySign); suite != nil {
		return *suite
	}
	return ""
}

// PasskeyChallenge is the challenge to ask a passkey to sign: base64url of the SHA-256 of the signed bytes (for a block,
// its id). It takes a block, or a message part.
func PasskeyChallenge(blockOrPart any) (string, error) { return doorPasskeyChallenge(blockOrPart) }

// PasskeySignature is a passkey's WebAuthn answer (authenticatorData, clientDataJSON and the signature, each as hex; the
// signature may be DER) written as a FoodBlock signature, hex. Verify and Valid open it.
func PasskeySignature(authenticatorDataHex, clientDataJSONHex, signatureHex string) (string, error) {
	return doorPasskeySignature(authenticatorDataHex, clientDataJSONHex, signatureHex)
}

// Verify is whether a signature is this key's over exactly this block.
func Verify(b Block, signature, publicKeySign string) bool {
	return doorVerify(b, signature, publicKeySign)
}

// SignMessage signs a message part (over its canonical JSON without its `signature`).
func SignMessage(part map[string]any, privateKeyHex string, suite ...string) (map[string]any, error) {
	return doorSignMessage[map[string]any](part, privateKeyHex, suiteArg(suite))
}

// VerifyMessage is whether a message part's signature is this key's.
func VerifyMessage(part map[string]any, publicKeySign string) bool {
	return doorVerifyMessage(part, publicKeySign)
}

// ---- Envelopes ----

// EncryptionKeypair: an encryption key of a suite (X25519 for std; raw private scalar, hex).
type EncryptionKeypair struct {
	PublicKeyEncrypt string `json:"public_key_encrypt"`
	X25519Private    string `json:"x25519_private"`
}

// GenerateEncryptionKeypair is a new encryption key in a suite (std when none is given).
func GenerateEncryptionKeypair(suite ...string) (EncryptionKeypair, error) {
	return doorEncryptionKeypair[EncryptionKeypair](suiteArg(suite))
}

// EncryptionKeyOf is the public encryption key of a private key in a suite.
func EncryptionKeyOf(privateHex string, suite ...string) (string, error) {
	return doorEncryptionKeyOf(privateHex, suiteArg(suite))
}

// Fixed is fixed randomness, only to reproduce a vector.
type Fixed struct {
	VectorsOnly bool     `json:"vectorsOnly"` // must be true: fixed randomness only reproduces a vector
	Ephemeral   string   `json:"ephemeral,omitempty"`
	ContentKey  string   `json:"contentKey,omitempty"`
	Nonce       string   `json:"nonce,omitempty"`
	KeyNonces   []string `json:"keyNonces,omitempty"`
}

// Seal encrypts a value (JSON) to recipients' encryption keys in a suite ("" is std).
func Seal(value any, recipientKeys []string, suite string, fixed *Fixed) (map[string]any, error) {
	return doorSeal[map[string]any](value, recipientKeys, suite, fixed)
}

// Open opens an envelope with a recipient's X25519 private key: the value inside.
func Open(envelope map[string]any, privateHex string) (any, error) {
	return doorOpen[any](envelope, privateHex)
}

// ---- The commitment ----

// NewSalt is a fresh 16-byte salt, hex.
func NewSalt() string { return sure(doorNewSalt()) }

// SaltedHash is the commitment to a value under a salt.
func SaltedHash(saltHex, value string, suite ...string) string {
	return doorSaltedHash(saltHex, value, suiteArg(suite))
}

// Commit is an audience for these recipients (people, circles, `circle#role`): the sorted commitments and each
// recipient's salt (given, only to reproduce a vector, else fresh).
func Commit(recipients []string, given map[string]string, suite ...string) ([]string, map[string]string, error) {
	out, err := doorCommit[struct {
		Audience []string          `json:"audience"`
		Salts    map[string]string `json:"salts"`
	}](recipients, given, suiteArg(suite))
	return out.Audience, out.Salts, err
}

// FindsSelf is whether a recipient holding this salt finds itself in a block's audience.
func FindsSelf(b Block, recipient, saltHex string) bool {
	return doorFindsSelf(b, recipient, saltHex)
}

// RevealFor is the reveal a recipient's copy carries for its audience entry: { salt, value }.
func RevealFor(salts map[string]string, recipient string) map[string]any {
	return doorRevealFor[map[string]any](salts, recipient)
}

// ---- Chains and causal order ----

// Link is a block's place in its key's chain.
type Link struct {
	Seq  int64  `json:"seq"`
	Prev string `json:"prev"`
}

// NextLink is where the next block for a key goes: after `last` (the key's latest block), or, with none, first after
// `broughtIn` (the hash of the genesis or key grant that brought the key in).
func NextLink(last *Block, broughtIn string) (Link, error) {
	return doorNextLink[Link](last, broughtIn)
}

// Chain is one key's chain, checked: its head, its length, the missing seq numbers, the skipped ones, the pairs of
// hashes naming one prev, and the blocks whose prev is not the block before them.
type Chain struct {
	Head          string     `json:"head"` // the hash of the chain's last block
	Length        int64      `json:"length"`
	Gaps          []int64    `json:"gaps"`
	Skips         []int64    `json:"skips"`
	Equivocations [][]string `json:"equivocations"`
	Broken        []string   `json:"broken"`
	OK            bool       `json:"ok"`
}

// CheckChain checks one key's chain: blocks it signed (in any order) and the block that brought it in.
func CheckChain(blocks []Block, broughtIn string) Chain {
	return doorCheckChain[Chain](blocks, broughtIn)
}

// CausalOrder sorts blocks so each comes after every block it names.
func CausalOrder(blocks []Block) []Block { return doorCausalOrder(blocks) }

// CausesOf are the hashes a block names, through every ref.
func CausesOf(b Block) []string { return doorCausesOf(b) }

// PastOf is every held block in a block's causal past (hashes; the block itself is not in it).
func PastOf(b Block, blocks []Block) []string {
	return plural(doorPastOf[[]string](b, blocks))
}

// HeadsAmong are the blocks no other block among them has in its causal past.
func HeadsAmong(blocks []Block) []Block { return doorHeadsAmong(blocks) }

// Sees is whether `later` has `earlier` (a hash) in its causal past among blocks.
func Sees(later Block, earlier string, blocks []Block) bool {
	return doorSees(later, map[string]any{"hash": earlier}, blocks)
}

// ---- Writing and the wire ----

// Public is the audience of a block anyone may read. Write it as the whole audience: []string{Public}.
const Public = "public"

// audienceJSON is the audience a signer stated: "public", or the recipients. Nothing stated: nil, and the core refuses.
func audienceJSON(audience []string) any {
	if len(audience) == 1 && audience[0] == Public {
		return Public
	}
	if len(audience) == 0 {
		return nil
	}
	return audience
}

// ComposeOptions: Author and Audience (required: []string{Public}, or recipients: people, circles, `circle#role`,
// written as commitments with a nonce); After (heads seen); At (required; a time); Link (its place in its key's chain); Salts
// (given salts, only to reproduce a vector); Suite (of the signing key, when not std); Skip (a deliberate skip in the
// chain).
type ComposeOptions struct {
	Author   string
	Audience []string
	After    []string
	At       string
	Link     *Link
	Salts    map[string]string
	Suite    string
	Skip     bool
}

func (o ComposeOptions) json() map[string]any {
	out := map[string]any{"author": o.Author}
	if a := audienceJSON(o.Audience); a != nil {
		out["audience"] = a
	}
	if len(o.After) > 0 {
		out["after"] = o.After
	}
	if o.At != "" {
		out["at"] = o.At
	}
	if o.Link != nil {
		out["link"] = o.Link
	}
	if len(o.Salts) > 0 {
		out["salts"] = o.Salts
	}
	if o.Suite != "" {
		out["suite"] = o.Suite
	}
	if o.Skip {
		out["skip"] = true
	}
	return out
}

// Compose is a block as its author says it. A private block comes back with its salts beside it, never signed.
func Compose(typ string, state, refs map[string]any, o ComposeOptions) (Block, error) {
	return doorCompose[Block](typ, orEmpty(state), orEmpty(refs), o.json())
}

// WriteOptions: the ComposeOptions, the author's Key, Held (the author's genesis, key grants and blocks) and Schemas.
type WriteOptions struct {
	ComposeOptions
	Key     Keypair
	Held    []Block
	Schemas map[string]Block
}

// Write is the one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next
// place in that key's chain among Held. It returns the signed block, or a *Refused with every reason.
func Write(typ string, state, refs map[string]any, o WriteOptions) (Block, error) {
	options := o.ComposeOptions.json()
	options["key"], options["held"] = o.Key, plural(o.Held)
	if o.Schemas != nil {
		options["schemas"] = blockList(o.Schemas)
	}
	return doorWrite[Block](typ, orEmpty(state), orEmpty(refs), options)
}

// Wrap is a signed public block as it travels: { block, signature }. Never
// the hash: readers recompute it.
func Wrap(signed Block) map[string]any { return doorWrap[map[string]any](signed) }

// Unwrap is a block off the wire: its hash recomputed from its content, its signature kept beside. The id is in
// the suite of the key that signed it, found among held (the author's blocks; core.md, section 2); with none, in the suite
// the block shows.
func Unwrap(message any, held ...Block) (Block, error) {
	return doorUnwrap[Block](message, held)
}

// Header is a block's public header: { author, seq, prev, hash }.
func Header(b Block) map[string]any { return doorHeader[map[string]any](b) }

// SealOptions: the recipients' encryption Keys, the Reveals this copy carries, and the PrivateKey that signed the block.
type SealOptions struct {
	Keys       []string
	Reveals    []any
	PrivateKey string
	Suite      string
	Fixed      *Fixed
}

// SealCopy is a sealed copy: { header, header_signature, envelope }.
func SealCopy(signed Block, o SealOptions) (map[string]any, error) {
	return doorSealCopy[map[string]any](signed, o.Keys, plural(o.Reveals), o.PrivateKey, o.Fixed, o.Suite, "")
}

// HeaderSignedBy is whether a sealed copy's header is signed by this key (the key that signed the block).
func HeaderSignedBy(message map[string]any, publicKey string) bool {
	return doorHeaderSignedBy(message, publicKey)
}

// OpenCopy opens a sealed copy with a recipient's X25519 private key: the block, its signature and its reveals.
func OpenCopy(message map[string]any, x25519Private string) (Block, error) {
	return doorOpenCopy[Block](message, x25519Private)
}

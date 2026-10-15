package foodblock

// FoodBlock 1.6 (spec/protocol.md), as thin calls into the Rust core: signing, the write check, reading older shapes,
// chains, commitments, envelopes and the wire. No rule lives here.

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

func checkArgs(typ string, state, refs map[string]any, options []CheckOptions) []any {
	var o CheckOptions
	if len(options) > 0 {
		o = options[0]
	}
	held, schemas := blockList(o.Held), blockList(o.Schemas)
	if held == nil {
		held = []Block{}
	}
	return []any{typ, orEmpty(state), orEmpty(refs), held, schemas}
}

// Refusals is what is wrong with a block: one entry per rule found, in the order of protocol.json refusals.codes.block.
func Refusals(typ string, state, refs map[string]any, options ...CheckOptions) []Finding {
	return append([]Finding{}, must[[]Finding]("refusals", checkArgs(typ, state, refs, options)...)...)
}

// Check is what is wrong with a block, in plain words (each finding's detail); empty when it passes.
func Check(typ string, state, refs map[string]any, options ...CheckOptions) []string {
	return append([]string{}, must[[]string]("check", checkArgs(typ, state, refs, options)...)...)
}

// Amount is an amount: Amount("2.5", "kg"). The value is a decimal string.
func Amount(value, unit string) map[string]any { return must[map[string]any]("amount", value, unit) }

// Money is an amount of money in minor units: Money(450, "GBP").
func Money(minor int64, currency string) map[string]any {
	return must[map[string]any]("money", minor, currency)
}

// Confidence is a confidence as a decimal string.
func Confidence(value string) (string, error) { return ask[string]("confidence", value) }

// Terms keeps only the terms protocol.json names.
func Terms(given map[string]any) map[string]any { return must[map[string]any]("terms", given) }

// ---- Signing ----

// Keypair: a signing key (SPKI DER, hex) and its PKCS#8 private key (hex).
type Keypair struct {
	PublicKeySign string `json:"public_key_sign"`
	PrivateKey    string `json:"private_key"`
}

// KeypairFromSeed is the signing key a 32-byte seed (hex) gives.
func KeypairFromSeed(seedHex string) (Keypair, error) { return ask[Keypair]("keypair", seedHex) }

// GenerateKeypair is a new signing key.
func GenerateKeypair() (Keypair, error) { return ask[Keypair]("keypair", nil) }

// Sign is the author's signature over a block's canonical form, 128 hex characters.
func Sign(b Block, privateKeyHex string) (string, error) {
	return ask[string]("sign", b, privateKeyHex)
}

// Verify is whether a signature is this key's over exactly this block.
func Verify(b Block, signature, publicKeySign string) bool {
	return must[bool]("verify", b, signature, publicKeySign)
}

// SignMessage signs a message part (over its canonical JSON without its `signature`).
func SignMessage(part map[string]any, privateKeyHex string) (map[string]any, error) {
	return ask[map[string]any]("sign_message", part, privateKeyHex)
}

// VerifyMessage is whether a message part's signature is this key's.
func VerifyMessage(part map[string]any, publicKeySign string) bool {
	return must[bool]("verify_message", part, publicKeySign)
}

// ---- Envelopes ----

// EncryptionKeypair: an X25519 key (raw 32 bytes each, hex).
type EncryptionKeypair struct {
	PublicKeyEncrypt string `json:"public_key_encrypt"`
	X25519Private    string `json:"x25519_private"`
}

// GenerateEncryptionKeypair is a new X25519 key.
func GenerateEncryptionKeypair() (EncryptionKeypair, error) {
	return ask[EncryptionKeypair]("encryption_keypair")
}

// EncryptionKeyOf is the public key of an X25519 private key.
func EncryptionKeyOf(privateHex string) (string, error) {
	return ask[string]("encryption_key_of", privateHex)
}

// Fixed was fixed randomness to reproduce a vector; the core draws its own, so it is accepted and ignored.
type Fixed struct {
	Ephemeral, ContentKey, Nonce string
	KeyNonces                    []string
}

// Seal encrypts a value (JSON) to recipients' encryption keys with alg ("" is the one written now).
func Seal(value any, recipientKeys []string, alg string, _ *Fixed) (map[string]any, error) {
	if alg == "" {
		alg = Alg
	}
	return ask[map[string]any]("seal", value, recipientKeys, alg)
}

// Open opens an envelope with a recipient's X25519 private key: the value inside.
func Open(envelope map[string]any, privateHex string) (any, error) {
	return ask[any]("open", envelope, privateHex)
}

// ---- The commitment ----

// NewSalt is a fresh 16-byte salt, hex.
func NewSalt() string { return must[string]("new_salt") }

// SaltedHash is the commitment to a value under a salt.
func SaltedHash(saltHex, value string) string { return must[string]("salted_hash", saltHex, value) }

// Commit is an audience for these recipients (people, circles, `circle#role`): the sorted commitments and each
// recipient's salt (given, only to reproduce a vector, else fresh).
func Commit(recipients []string, given map[string]string) ([]string, map[string]string, error) {
	if given == nil {
		given = map[string]string{}
	}
	out, err := ask[struct {
		Audience []string          `json:"audience"`
		Salts    map[string]string `json:"salts"`
	}]("commit", recipients, given)
	return out.Audience, out.Salts, err
}

// FindsSelf is whether a recipient holding this salt finds itself in a block's audience.
func FindsSelf(b Block, recipient, saltHex string) bool {
	return must[bool]("finds_self", b, recipient, saltHex)
}

// RevealFor is the reveal a recipient's copy carries for its audience entry: { salt, value }.
func RevealFor(salts map[string]string, recipient string) map[string]any {
	return must[map[string]any]("reveal_for", salts, recipient)
}

// ---- Reading older shapes ----

// ReadAs reads a block of any earlier shape as 1.6 through aliases.json.
func ReadAs(b Block) Block {
	out, err := ask[Block]("read_as", b)
	if err != nil {
		return b
	}
	return out
}

// IsA is whether a block is of a type (and, if kind is not "", of a kind), reading earlier shapes.
func IsA(b Block, typ, kind string) bool {
	var k any
	if kind != "" {
		k = kind
	}
	return must[bool]("is_a", b, typ, k)
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
	var l any
	if last != nil {
		l = *last
	}
	return ask[Link]("next_link", l, broughtIn)
}

// Chain is one key's chain, checked: its head, its length, the missing seq numbers, the sets of hashes sharing a seq,
// and the blocks whose prev is not the block before them.
type Chain struct {
	Head          *Block     `json:"head"`
	Length        int64      `json:"length"`
	Gaps          []int64    `json:"gaps"`
	Equivocations [][]string `json:"equivocations"`
	Broken        []string   `json:"broken"`
	OK            bool       `json:"ok"`
}

// CheckChain checks one key's chain: blocks it signed (in any order) and the block that brought it in.
func CheckChain(blocks []Block, broughtIn string) Chain {
	return must[Chain]("check_chain", plural(blocks), broughtIn)
}

// CausalOrder sorts blocks so each comes after every block it names.
func CausalOrder(blocks []Block) []Block { return must[[]Block]("causal_order", plural(blocks)) }

// Sees is whether `later` has `earlier` (a hash) in its causal past among blocks.
func Sees(later Block, earlier string, blocks []Block) bool {
	return must[bool]("sees", later, map[string]any{"hash": earlier}, plural(blocks))
}

// ---- Writing and the wire ----

// Public is the audience of a block anyone may read.
const Public = "public"

// ComposeOptions: Author (required); Audience (nil for public, or recipients: people, circles, `circle#role`, written
// as commitments with a nonce); After (heads seen); At (default now); Link (its place in its key's chain); Salts
// (given salts, only to reproduce a vector).
type ComposeOptions struct {
	Author   string
	Audience []string
	After    []string
	At       string
	Link     *Link
	Salts    map[string]string
}

func (o ComposeOptions) json() map[string]any {
	out := map[string]any{"author": o.Author}
	if len(o.Audience) > 0 {
		out["audience"] = o.Audience
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
	return out
}

// Compose is a block as its author says it. A private block comes back with its salts beside it, never signed.
func Compose(typ string, state, refs map[string]any, o ComposeOptions) (Block, error) {
	return ask[Block]("compose", typ, orEmpty(state), orEmpty(refs), o.json())
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
	return ask[Block]("write", typ, orEmpty(state), orEmpty(refs), options)
}

// Wrap is a signed public block as it travels: { version, block, signature }. Never the hash: readers recompute it.
func Wrap(signed Block, version string) map[string]any {
	out := must[map[string]any]("wrap", signed)
	if version != "" {
		out["version"] = version
	}
	return out
}

// Unwrap is a block off the wire: its hash recomputed from its content, its signature and version kept beside.
func Unwrap(message any) (Block, error) { return ask[Block]("unwrap", message) }

// Header is a block's public header: { author, seq, prev, hash }.
func Header(b Block) map[string]any { return must[map[string]any]("header", b) }

// SealOptions: the recipients' encryption Keys, the Reveals this copy carries, and the PrivateKey that signed the block.
type SealOptions struct {
	Keys       []string
	Reveals    []any
	PrivateKey string
	Alg        string
	Fixed      *Fixed
}

// SealCopy is a sealed copy: { version, header, header_signature, envelope }.
func SealCopy(signed Block, o SealOptions) (map[string]any, error) {
	return ask[map[string]any]("seal_copy", signed, o.Keys, plural(o.Reveals), o.PrivateKey)
}

// HeaderSignedBy is whether a sealed copy's header is signed by this key (the key that signed the block).
func HeaderSignedBy(message map[string]any, publicKey string) bool {
	return must[bool]("header_signed_by", message, publicKey)
}

// OpenCopy opens a sealed copy with a recipient's X25519 private key: the block, its signature and its reveals.
func OpenCopy(message map[string]any, x25519Private string) (Block, error) {
	return ask[Block]("open_copy", message, x25519Private)
}

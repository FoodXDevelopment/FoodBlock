package foodblock

// Who someone is (modules/identity.md): thin calls into the Rust core.

// ArrivedAt is when this reader first held a block (a time), or "" when it keeps no arrival log.
type ArrivedAt func(hash string) string

// UnknownArrival is what a reader reads a block as whose arrival it does not know: "inside" or "outside". It is
// required whenever the reader keeps an arrival log; nothing fills it.
type UnknownArrival string

const (
	Inside  UnknownArrival = "inside"
	Outside UnknownArrival = "outside"
)

// arrivals is the arrival log as data { hash: at }; nil when the reader keeps none.
func arrivals(arrivedAt ArrivedAt, blocks []Block) map[string]string {
	if arrivedAt == nil {
		return nil
	}
	out := map[string]string{}
	for _, b := range blocks {
		if at := arrivedAt(b.id()); at != "" {
			out[b.id()] = at
		}
	}
	return out
}

// unknownFor is the unknown-arrival choice to pass: with no arrival log there is nothing to read it for.
func unknownFor(arrivedAt ArrivedAt, unknown UnknownArrival) string {
	if arrivedAt == nil {
		return ""
	}
	return string(unknown)
}

// RecoveryKeyHash is the hash a genesis writes for its recovery key, in a suite (std when none is given).
func RecoveryKeyHash(publicKeyHex string, suite ...string) string {
	return doorRecoveryKeyHash(publicKeyHex, suiteArg(suite))
}

// GenesisOptions: Kind, At and Audience (all required: "public" or a non-empty list of recipients; nothing is filled in),
// EncryptionKey (the public encryption key, if it will
// receive sealed blocks), RecoveryKey and Reach (they come as a pair or not at all; RecoverySuite when the recovery
// key is not std) and Custodian (the id of whoever holds the key for the person, if anyone). The keys' own Suite is
// the genesis's suite.
type GenesisOptions struct {
	Kind, At, EncryptionKey, RecoveryKey, Reach, RecoverySuite, Custodian string
	Audience                                                              []string // recipients; or Public
	Salts                                                                 map[string]string
	Nonce                                                                 string
}

// Genesis is a new person, autonomous system, machine or signing circle: their genesis, signed. It needs only kind, at, audience
// and the key.
func Genesis(keys Keypair, o GenesisOptions) (Block, error) {
	given := map[string]any{}
	for k, v := range map[string]string{"kind": o.Kind, "at": o.At, "encryption_key": o.EncryptionKey, "recovery_key": o.RecoveryKey, "reach": o.Reach, "recovery_suite": o.RecoverySuite, "custodian": o.Custodian} {
		if v != "" {
			given[k] = v
		}
	}
	if a := audienceJSON(o.Audience); a != nil {
		given["audience"] = a
	}
	if len(o.Salts) > 0 {
		given["salts"] = o.Salts
	}
	if o.Nonce != "" {
		given["nonce"] = o.Nonce
	}
	return doorGenesis[Block](keys, given)
}

// IsGenesis is whether a block is a genesis.
func IsGenesis(b Block) bool { return doorIsGenesis(b) }

// GenesisOpens is whether a genesis is opened by its own key.
func GenesisOpens(b Block) bool { return doorGenesisOpens(b) }

// KeySigner signs a key grant: a key the id holds (PrivateKey and its Suite, its Last block, the block that brought it
// in), or the recovery key (PrivateKey and RecoveryKey, its public key), whose chain starts at the genesis.
type KeySigner struct {
	PrivateKey, Suite, BroughtIn, RecoveryKey string
	Last                                      *Block
}

// KeyGrantOptions: At is required; a rotation names the key it Replaces and that key's CountedTo block; Suite is the new key's; Skip
// is a deliberate skip in the chain; Encrypt brings in an encryption key; Custodian names who holds the key for the
// person. The recovery pair is named only in a genesis.
type KeyGrantOptions struct {
	Replaces, CountedTo, At, Encrypt, Custodian, Suite string
	Skip                                               bool
	After                                              []string
}

// KeyGrant is a key grant, signed: brings newPublicKey into the id.
func KeyGrant(id, newPublicKey string, signer KeySigner, o KeyGrantOptions) (Block, error) {
	s := map[string]any{"private_key": signer.PrivateKey}
	if signer.Suite != "" {
		s["suite"] = signer.Suite
	}
	if signer.Last != nil {
		s["last"] = *signer.Last
	}
	if signer.BroughtIn != "" {
		s["brought_in"] = signer.BroughtIn
	}
	if signer.RecoveryKey != "" {
		s["recovery_key"] = signer.RecoveryKey
	}
	opts := map[string]any{"after": plural(o.After)}
	if o.Skip {
		opts["skip"] = true
	}
	for k, v := range map[string]string{"replaces": o.Replaces, "counted_to": o.CountedTo, "at": o.At, "encrypt": o.Encrypt, "custodian": o.Custodian, "suite": o.Suite} {
		if v != "" {
			opts[k] = v
		}
	}
	return doorKeyGrant[Block](id, newPublicKey, s, opts)
}

// KeyEntry is one key an id has held: who brought it in (By), which key signed that (Signer: a key, "recovery", or ""
// for the genesis), whether it is frozen, and its Suite. A void key is never listed.
type KeyEntry struct {
	Suite  string `json:"suite"`
	Key    string `json:"key"`
	By     string `json:"by"`
	Signer string `json:"signer"`
	Frozen bool   `json:"frozen"`
}

// KeyTimeline is every key an id has held, in the order they came in.
func KeyTimeline(id string, blocks []Block, arrivedAt ArrivedAt, unknown UnknownArrival) []*KeyEntry {
	return doorKeyTimeline[[]*KeyEntry](id, blocks, arrivals(arrivedAt, blocks), unknownFor(arrivedAt, unknown))
}

// KeysOf are the id's keys that are not void.
func KeysOf(id string, blocks []Block, arrivedAt ArrivedAt, unknown UnknownArrival) []string {
	return plural(doorKeysOf[[]string](id, blocks, arrivals(arrivedAt, blocks), unknownFor(arrivedAt, unknown)))
}

// SignedByAuthor is whether a block is signed by a key that speaks for its author at the time.
func SignedByAuthor(b Block, blocks []Block, arrivedAt ArrivedAt, unknown UnknownArrival) bool {
	return doorSignedByAuthor(b, blocks, arrivals(arrivedAt, blocks), unknownFor(arrivedAt, unknown))
}

// IdentityState is the identity fold: signed_by_author (hash -> bool), keys, frozen, and operators (sorted).
type IdentityState struct {
	SignedByAuthor map[string]bool `json:"signed_by_author"`
	Keys           []string        `json:"keys"`
	Frozen         []string        `json:"frozen"`
	Operators      []string        `json:"operators"`
}

// IdentityStateOf is who an id is among these blocks.
func IdentityStateOf(id string, blocks []Block, arrivedAt ArrivedAt, unknown UnknownArrival) IdentityState {
	return doorIdentityState[IdentityState](id, blocks, arrivals(arrivedAt, blocks), unknownFor(arrivedAt, unknown))
}

// Forked is whether a block's key signed two blocks at one seq.
func Forked(b Block, blocks []Block) bool { return doorForked(b, blocks) }

// ForkPairs are the pairs of blocks one key signed naming one prev.
func ForkPairs(blocks []Block) [][]string {
	return plural(doorForkPairs[[][]string](blocks))
}

// NextLinkFor is where an id's next block goes for one of its keys.
func NextLinkFor(id, publicKey string, blocks []Block) (Link, error) {
	return doorNextLinkFor[Link](id, publicKey, blocks)
}

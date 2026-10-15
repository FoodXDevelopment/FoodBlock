package foodblock

// Who someone is (modules/identity.md): thin calls into the Rust core.

// ArrivedAt is when this reader first held a block (a time), or "" when it keeps no arrival log.
type ArrivedAt func(hash string) string

// arrivals is the arrival log as data { hash: at }; nil when the reader keeps none.
func arrivals(arrivedAt ArrivedAt, blocks []Block) any {
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

// RecoveryKeyHash is the hash a genesis writes for its recovery key, in a suite (std when none is given).
func RecoveryKeyHash(publicKeyHex string, suite ...string) string {
	return must[string]("recovery_key_hash", publicKeyHex, suiteOf(suite))
}

// GenesisOptions: Kind (default person), At (default now), EncryptionKey (the public encryption key, if it will
// receive sealed blocks), RecoveryKey and Reach (they come as a pair or not at all; RecoverySuite when the recovery
// key is not std) and Custodian (the id of whoever holds the key for the person, if anyone). The keys' own Suite is
// the genesis's suite.
type GenesisOptions struct {
	Kind, At, EncryptionKey, RecoveryKey, Reach, RecoverySuite, Custodian string
}

// Genesis is a new person, agent, machine or signing circle: their genesis, signed. It needs only kind, at, audience
// and the key.
func Genesis(keys Keypair, o GenesisOptions) (Block, error) {
	given := map[string]any{}
	for k, v := range map[string]string{"kind": o.Kind, "at": o.At, "encryption_key": o.EncryptionKey, "recovery_key": o.RecoveryKey, "reach": o.Reach, "recovery_suite": o.RecoverySuite, "custodian": o.Custodian} {
		if v != "" {
			given[k] = v
		}
	}
	return ask[Block]("genesis", keys, given)
}

// IsGenesis is whether a block is a genesis.
func IsGenesis(b Block) bool { return must[bool]("is_genesis", b) }

// GenesisOpens is whether a genesis is opened by its own key.
func GenesisOpens(b Block) bool { return must[bool]("genesis_opens", b) }

// KeySigner signs a key grant: a key the id holds (PrivateKey and its Suite, its Last block, the block that brought it
// in), or the recovery key (PrivateKey and RecoveryKey, its public key), whose chain starts at the genesis.
type KeySigner struct {
	PrivateKey, Suite, BroughtIn, RecoveryKey string
	Last                                      *Block
}

// KeyGrantOptions: a rotation names the key it Replaces and that key's CountedTo block; Suite is the new key's; Skip
// is a deliberate skip in the chain; Encrypt brings in an encryption key; Recovery adds recovery (once); Custodian
// names who holds the key for the person.
type KeyGrantOptions struct {
	Replaces, CountedTo, At, Encrypt, Custodian, Suite string
	Skip                                               bool
	After                                              []string
	Recovery                                           *struct{ Key, Reach string }
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
	if o.Recovery != nil {
		opts["recovery"] = map[string]any{"key": o.Recovery.Key, "reach": o.Recovery.Reach}
	}
	var key any
	if newPublicKey != "" {
		key = newPublicKey
	}
	return ask[Block]("key_grant", id, key, s, opts)
}

// KeyEntry is one key an id has held: who brought it in (By), which key signed that (Signer: a key, "recovery", or ""
// for the genesis), whether it is void or frozen, and its Suite.
type KeyEntry struct {
	Suite  string `json:"suite"`
	Key    string `json:"key"`
	By     string `json:"by"`
	Signer string `json:"signer"`
	Void   bool   `json:"void"`
	Frozen bool   `json:"frozen"`
}

// KeyTimeline is every key an id has held, in the order they came in.
func KeyTimeline(id string, blocks []Block, arrivedAt ArrivedAt) []*KeyEntry {
	return must[[]*KeyEntry]("key_timeline", id, plural(blocks), arrivals(arrivedAt, blocks))
}

// KeysOf are the id's keys that are not void.
func KeysOf(id string, blocks []Block, arrivedAt ArrivedAt) []string {
	return plural(must[[]string]("keys_of", id, plural(blocks), arrivals(arrivedAt, blocks)))
}

// SignedByAuthor is whether a block is signed by a key that speaks for its author at the time.
func SignedByAuthor(b Block, blocks []Block, arrivedAt ArrivedAt) bool {
	return must[bool]("signed_by_author", b, plural(blocks), arrivals(arrivedAt, blocks))
}

// IdentityState is the identity fold: signed_by_author (hash -> bool), keys, frozen, and operators (sorted).
type IdentityState struct {
	SignedByAuthor map[string]bool `json:"signed_by_author"`
	Keys           []string        `json:"keys"`
	Frozen         []string        `json:"frozen"`
	Operators      []string        `json:"operators"`
}

// IdentityStateOf is who an id is among these blocks.
func IdentityStateOf(id string, blocks []Block, arrivedAt ArrivedAt) IdentityState {
	return must[IdentityState]("identity_state", id, plural(blocks), arrivals(arrivedAt, blocks))
}

// Forked is whether a block's key signed two blocks at one seq.
func Forked(b Block, blocks []Block) bool { return must[bool]("forked", b, plural(blocks)) }

// ForkPairs are the pairs of blocks one key signed naming one prev.
func ForkPairs(blocks []Block) [][]string {
	return plural(must[[][]string]("fork_pairs", plural(blocks)))
}

// NextLinkFor is where an id's next block goes for one of its keys.
func NextLinkFor(id, publicKey string, blocks []Block) (Link, error) {
	return ask[Link]("next_link_for", id, publicKey, plural(blocks))
}

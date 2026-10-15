package foodblock

// Who someone is (protocol.md §5): thin calls into the Rust core.

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

// RecoveryKeyHash is the hash a genesis writes for its recovery key.
func RecoveryKeyHash(publicKeyHex string) string {
	return must[string]("recovery_key_hash", publicKeyHex)
}

// GenesisOptions: Kind (default person), At (default now), EncryptionKey (X25519 public, if it will receive sealed
// blocks), RecoveryKey (required: the offline key's public signing key), Reach (default P30D) and Custodian (the id of
// whoever holds the key for the person, if anyone).
type GenesisOptions struct {
	Kind, At, EncryptionKey, RecoveryKey, Reach, Custodian string
}

// Genesis is a new person, agent, machine or signing circle: their genesis, signed.
func Genesis(keys Keypair, o GenesisOptions) (Block, error) {
	given := map[string]any{}
	for k, v := range map[string]string{"kind": o.Kind, "at": o.At, "encryption_key": o.EncryptionKey, "recovery_key": o.RecoveryKey, "reach": o.Reach, "custodian": o.Custodian} {
		if v != "" {
			given[k] = v
		}
	}
	return ask[Block]("genesis", keys, given)
}

// IsGenesis is whether a block is a genesis.
func IsGenesis(b Block) bool { return must[bool]("is_genesis", b) }

// Is16Genesis is a genesis with the recovery fields: a 1.6 genesis, which has no history.
func Is16Genesis(b Block) bool { return must[bool]("is_16_genesis", b) }

// GenesisOpens is whether a genesis is opened by its own key.
func GenesisOpens(b Block) bool { return must[bool]("genesis_opens", b) }

// KeySigner signs a key grant: a key the id holds (PrivateKey, its Last block, the block that brought it in), or the
// recovery key (PrivateKey and RecoveryKey, its public key), whose chain starts at the genesis.
type KeySigner struct {
	PrivateKey, BroughtIn, RecoveryKey string
	Last                               *Block
}

// KeyGrantOptions: a rotation names the key it Replaces and that key's LastGood block; Encrypt brings in an encryption
// key; Recovery adds recovery to an older genesis (once); Custodian names who holds the key for the person.
type KeyGrantOptions struct {
	Replaces, LastGood, At, Encrypt, Custodian string
	After                                      []string
	Recovery                                   *struct{ Key, Reach string }
}

// KeyGrant is a key grant, signed: brings newPublicKey into the id.
func KeyGrant(id, newPublicKey string, signer KeySigner, o KeyGrantOptions) (Block, error) {
	s := map[string]any{"private_key": signer.PrivateKey}
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
	for k, v := range map[string]string{"replaces": o.Replaces, "last_good": o.LastGood, "at": o.At, "encrypt": o.Encrypt, "custodian": o.Custodian} {
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
// for the genesis), and whether it is void or frozen.
type KeyEntry struct {
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

// IdentityState is the identity fold (§11): signed_by_author (hash -> bool), keys, frozen, operators (sorted) and
// history (none for a 1.6 genesis, open or closed).
type IdentityState struct {
	SignedByAuthor map[string]bool `json:"signed_by_author"`
	Keys           []string        `json:"keys"`
	Frozen         []string        `json:"frozen"`
	Operators      []string        `json:"operators"`
	History        string          `json:"history"`
}

// IdentityStateOf is who an id is among these blocks.
func IdentityStateOf(id string, blocks []Block, arrivedAt ArrivedAt) IdentityState {
	return must[IdentityState]("identity_state", id, plural(blocks), arrivals(arrivedAt, blocks))
}

// Forked is whether a block's key signed two blocks at one seq.
func Forked(b Block, blocks []Block) bool { return must[bool]("forked", b, plural(blocks)) }

// HistoryCounts is whether a block without seq counts as its author's history.
func HistoryCounts(b Block, id string, blocks []Block) bool {
	return must[bool]("history_counts", b, id, plural(blocks))
}

// NextLinkFor is where an id's next block goes for one of its keys.
func NextLinkFor(id, publicKey string, blocks []Block) (Link, error) {
	return ask[Link]("next_link_for", id, publicKey, plural(blocks))
}

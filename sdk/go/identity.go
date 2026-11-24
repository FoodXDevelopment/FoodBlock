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

// KeyHash is a key named by its hash (identity.md, Her voices): its suite's hash of its SPKI hex as UTF-8 text (std when no suite is given).
func KeyHash(publicKeyHex string, suite ...string) string {
	return doorKeyHash(publicKeyHex, suiteArg(suite))
}

// GenesisOptions: Kind, At and Audience (all required: "public" or a non-empty list of recipients; nothing is filled in),
// EncryptionKey (the public encryption key, if it will receive sealed blocks), and Reach (a duration) with Clocks (her
// clock: { names, needed }), which come together. The keys' own Suite is the genesis's suite.
type GenesisOptions struct {
	Kind, At, EncryptionKey, Reach string
	Clocks                         any
	Audience                       []string // recipients; or Public
	Salts                          map[string]string
	Nonce                          string
}

// Genesis is a new person, autonomous system, machine or signing circle: their genesis, signed. It needs only kind, at, audience
// and the key.
func Genesis(keys Keypair, o GenesisOptions) (Block, error) {
	given := map[string]any{}
	for k, v := range map[string]string{"kind": o.Kind, "at": o.At, "encryption_key": o.EncryptionKey, "reach": o.Reach} {
		if v != "" {
			given[k] = v
		}
	}
	if o.Clocks != nil {
		given["clocks"] = o.Clocks
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

// KeySigner signs a key grant: one of her voices, or a voice of named people, signing in their own name.
// Author defaults to the id the grant is about; Keys is the signer's keypair; Blocks the author's genesis, grants and blocks.
type KeySigner struct {
	Author string
	Keys   Keypair
	Blocks []Block
	At     string
	After  []string
	Link   *Link
}

// KeyGrantOptions (identity.md): Voices (her whole list again, with Updates the list it replaces and Clocks her clock), or Key (one key
// under the signer's voice, in Suite), or Encrypt alone; ShownKey when a key named by hash shows itself (KeyRef the list that holds
// its hash); CountedTo the last block of a key a voice above ends.
type KeyGrantOptions struct {
	Voices                                   any
	Updates, KeyRef                          string
	Clocks                                   any
	Key, Suite, Encrypt, ShownKey, CountedTo string
}

// KeyGrant is a key grant about id, signed by the signer.
func KeyGrant(id string, signer KeySigner, o KeyGrantOptions) (Block, error) {
	state := map[string]any{"kind": "key"}
	if o.Voices != nil {
		state["voices"] = o.Voices
	}
	if o.Clocks != nil {
		state["clocks"] = o.Clocks
	}
	for k, v := range map[string]string{"public_key_sign": o.Key, "suite": o.Suite, "public_key_encrypt": o.Encrypt, "shown_key": o.ShownKey, "counted_to": o.CountedTo} {
		if v != "" {
			state[k] = v
		}
	}
	refs := map[string]any{"subject": id}
	for k, v := range map[string]string{"updates": o.Updates, "key": o.KeyRef} {
		if v != "" {
			refs[k] = v
		}
	}
	author := signer.Author
	if author == "" {
		author = id
	}
	return Write("grant", state, refs, WriteOptions{ComposeOptions: ComposeOptions{Author: author, Audience: []string{Public}, At: signer.At, After: signer.After, Link: signer.Link}, Key: signer.Keys, Blocks: signer.Blocks})
}

// Confirm is the second signature (blocks.md, Finality, Signed twice): a block of the same key, or of a voice above, naming the word in refs.confirms.
func Confirm(word Block, signer KeySigner) (Block, error) {
	return Write("observe", map[string]any{}, map[string]any{"confirms": []any{word.Hash}}, WriteOptions{ComposeOptions: ComposeOptions{Author: signer.Author, Audience: []string{Public}, At: signer.At, After: signer.After, Link: signer.Link}, Key: signer.Keys, Blocks: signer.Blocks})
}

// KeyEntry is one key an id has held: Key, by whom it came in (By), its Voice, what it is Under, its Suite, and whether it Ended.
type KeyEntry struct {
	Key   string `json:"key"`
	By    string `json:"by"`
	Voice any    `json:"voice"`
	Under any    `json:"under"`
	Suite string `json:"suite"`
	Ended any    `json:"ended"`
}

// KeyTimeline is every key a list or a key grant of the id's brought in, in the order they came in.
func KeyTimeline(id string, blocks []Block) []*KeyEntry {
	return plural(doorKeyTimeline[[]*KeyEntry](id, blocks))
}

// LiveKeys are the keys that speak for the id now: of her standing voices and under them, not ended. Sorted.
func LiveKeys(id string, blocks []Block) []string { return plural(doorLiveKeys(id, blocks)) }

// KeysOf is LiveKeys.
func KeysOf(id string, blocks []Block) []string { return LiveKeys(id, blocks) }

// SignedByAuthor is whether a key of the block's author spoke for her there (a waiting block is true here; Stands says it waits).
func SignedByAuthor(b Block, blocks []Block) bool {
	return doorSignedByAuthor(b, blocks)
}

// Stands is whether a word stands (blocks.md, Finality): { stands, waiting: [{ block, on }] }, read with no clock and no arrival.
func Stands(b Block, blocks []Block) map[string]any { return doorStands[map[string]any](b, blocks) }

// ChainsOf is each key's chain for an id: [{ key, by, head, length, gaps, skips, equivocations, broken, ok }].
func ChainsOf(id string, blocks []Block) []map[string]any {
	return plural(doorChainsOf[[]map[string]any](id, blocks))
}

// Counts is whether a block counts among the blocks.
func Counts(b Block, blocks []Block) bool { return doorCounts(b, blocks) }

// IdentityState is the identity fold: signed_by_author (hash -> bool), voices, clocks, keys and waiting.
type IdentityState struct {
	SignedByAuthor map[string]bool `json:"signed_by_author"`
	Voices         any             `json:"voices"`
	Clocks         any             `json:"clocks"`
	Keys           []string        `json:"keys"`
	Waiting        any             `json:"waiting"`
}

// IdentityStateOf is who an id is among these blocks.
func IdentityStateOf(id string, blocks []Block) IdentityState {
	return doorIdentityState[IdentityState](id, blocks)
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

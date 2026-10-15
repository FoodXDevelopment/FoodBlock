package foodblock

// Block is a FoodBlock: { type, state, refs }, its id (the hash of its canonical form in its suite) and its author's
// signature. Suite is set beside the hash when it is not std. What is never signed: Version and Reveals (off the
// wire), Salts (a private block's salts, kept by its author).
type Block struct {
	Hash      string         `json:"hash"`
	Type      string         `json:"type"`
	State     map[string]any `json:"state"`
	Refs      map[string]any `json:"refs"`
	Suite     string         `json:"suite,omitempty"`
	Signature string         `json:"signature,omitempty"`

	Version string            `json:"version,omitempty"`
	Reveals []any             `json:"reveals,omitempty"`
	Salts   map[string]string `json:"salts,omitempty"`
}

// id is the block's hash, recomputed when it carries none.
func (b Block) id() string {
	if b.Hash != "" {
		return b.Hash
	}
	h, _ := Hash(b.Type, b.State, b.Refs, b.Suite)
	return h
}

// suiteOf is the optional suite argument: std when none is given.
func suiteOf(suite []string) string {
	if len(suite) > 0 && suite[0] != "" {
		return suite[0]
	}
	return "std"
}

// Hash is a block's id: the hash of its canonical form in the hash of the suite of the key that signs it (std: bare
// SHA-256, 64 lowercase hex characters; sm: `sm3:...`).
func Hash(typ string, state, refs map[string]any, suite ...string) (string, error) {
	return ask[string]("hash", typ, orEmpty(state), orEmpty(refs), suiteOf(suite))
}

// Create is a block with its hash (and its suite when not std). Strict: a null, a float, an unsorted set or text
// outside NFC is refused.
func Create(typ string, state, refs map[string]any, suite ...string) (Block, error) {
	return ask[Block]("create", typ, orEmpty(state), orEmpty(refs), suiteOf(suite))
}

// Canonical is the canonical string of { type, state, refs } (spec/canonical.md).
func Canonical(typ string, state, refs map[string]any) (string, error) {
	return ask[string]("canonical", typ, orEmpty(state), orEmpty(refs))
}

// CanonicalJSON is the canonical JSON of any value.
func CanonicalJSON(value any) (string, error) { return ask[string]("canonical_json", value) }

// blockList lists a hash -> block map as the core reads it.
func blockList(m map[string]Block) []Block {
	if m == nil {
		return nil
	}
	out := make([]Block, 0, len(m))
	for _, b := range m {
		out = append(out, b)
	}
	return out
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func hashesOfBlocks(blocks []Block) []string {
	out := []string{}
	for _, b := range blocks {
		out = append(out, b.id())
	}
	return out
}

package foodblock

// Block is a FoodBlock: { type, state, refs }, its id (the hash of its canonical form in its suite) and its author's
// signature. The suite comes from the key that signed it, never from the block. What is never signed: Reveals (off the
// wire), Salts (a private block's salts, kept by its author).
type Block struct {
	Hash      string         `json:"hash"`
	Type      string         `json:"type"`
	State     map[string]any `json:"state"`
	Refs      map[string]any `json:"refs"`
	Signature string         `json:"signature,omitempty"`

	Reveals []any             `json:"reveals,omitempty"`
	Salts   map[string]string `json:"salts,omitempty"`
}

// id is the block's hash, recomputed when it carries none.
func (b Block) id() string {
	if b.Hash != "" {
		return b.Hash
	}
	h, _ := Hash(b.Type, b.State, b.Refs)
	return h
}

// suiteArg is the optional suite argument: "" (the core's default suite) when none is given.
func suiteArg(suite []string) string {
	if len(suite) > 0 {
		return suite[0]
	}
	return ""
}

// Hash is a block's id: the hash of its canonical form in the hash of the suite of the key that signs it (std: bare
// SHA-256, 64 lowercase hex characters; sm: `sm3:...`).
func Hash(typ string, state, refs map[string]any, suite ...string) (string, error) {
	return doorHash(typ, orEmpty(state), orEmpty(refs), suiteArg(suite))
}

// Create is a block with its hash. Strict: a null, a float, an unsorted set or text
// outside NFC is refused.
func Create(typ string, state, refs map[string]any, suite ...string) (Block, error) {
	return doorCreate[Block](typ, orEmpty(state), orEmpty(refs), suiteArg(suite))
}

// Canonical is the canonical string of { type, state, refs } (spec/canonical.md).
func Canonical(typ string, state, refs map[string]any) (string, error) {
	return doorCanonical(typ, orEmpty(state), orEmpty(refs))
}

// CanonicalJSON is the canonical JSON of any value.
func CanonicalJSON(value any) (string, error) { return doorCanonicalJson(value) }

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

func hashesOfBlocks(blocks []Block) []string {
	out := []string{}
	for _, b := range blocks {
		out = append(out, b.id())
	}
	return out
}

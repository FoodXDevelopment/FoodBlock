package foodblock

// Block is a FoodBlock: { type, state, refs }, its id (the SHA-256 of its canonical form) and its author's signature.
// What a reader adds beside the signed content is never signed: ReadFrom, Settles, Outside and Retired (ReadAs),
// Version and Reveals (off the wire), Salts (a private block's salts, kept by its author).
type Block struct {
	Hash      string         `json:"hash"`
	Type      string         `json:"type"`
	State     map[string]any `json:"state"`
	Refs      map[string]any `json:"refs"`
	Signature string         `json:"signature,omitempty"`

	Version  string            `json:"version,omitempty"`
	Reveals  []any             `json:"reveals,omitempty"`
	Salts    map[string]string `json:"salts,omitempty"`
	ReadFrom string            `json:"readFrom,omitempty"`
	Settles  any               `json:"settles,omitempty"`
	Outside  map[string]string `json:"outside,omitempty"`
	Retired  bool              `json:"retired,omitempty"`
}

// id is the block's hash, recomputed when it carries none.
func (b Block) id() string {
	if b.Hash != "" {
		return b.Hash
	}
	h, _ := Hash(b.Type, b.State, b.Refs)
	return h
}

// Hash is a block's id: SHA-256 of its canonical form, 64 lowercase hex characters.
func Hash(typ string, state, refs map[string]any) (string, error) {
	return ask[string]("hash", typ, orEmpty(state), orEmpty(refs))
}

// Create is a block with its hash. Nulls are dropped; each ref is a hash or a set of hashes (strings).
func Create(typ string, state, refs map[string]any) (Block, error) {
	return ask[Block]("create", typ, orEmpty(state), orEmpty(refs))
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

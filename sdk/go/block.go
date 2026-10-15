package foodblock

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

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

// Hash is a block's id: SHA-256 of its canonical form, 64 lowercase hex characters.
func Hash(typ string, state, refs map[string]any) (string, error) {
	c, err := Canonical(typ, state, refs)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(c))
	return hex.EncodeToString(sum[:]), nil
}

// Create is a block with its hash. Nulls are dropped; each ref is a hash or a set of hashes (strings).
func Create(typ string, state, refs map[string]any) (Block, error) {
	if typ == "" {
		return Block{}, errors.New("FoodBlock: type is required and must be a string")
	}
	state, refs = omitNulls(state), omitNulls(refs)
	for key, value := range refs {
		if isStr(value) {
			continue
		}
		items, ok := arr(value)
		if ok && len(list(value)) == len(items) {
			continue
		}
		return Block{}, errors.New("FoodBlock: refs." + key + " must be a string or array of strings")
	}
	h, err := Hash(typ, state, refs)
	if err != nil {
		return Block{}, err
	}
	return Block{Hash: h, Type: typ, State: state, Refs: refs}, nil
}

// id is the block's hash, recomputed when it carries none.
func (b Block) id() string {
	if b.Hash != "" {
		return b.Hash
	}
	h, _ := Hash(b.Type, b.State, b.Refs)
	return h
}

// omitNulls drops null values from an object, and from the objects inside it.
func omitNulls(m map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		if v == nil {
			continue
		}
		if inner, ok := v.(map[string]any); ok {
			out[k] = omitNulls(inner)
		} else {
			out[k] = v
		}
	}
	return out
}

// index is a lookup by hash that keeps the order blocks were given in (as a JavaScript Map does).
type index struct {
	order []string
	m     map[string]Block
	forks map[string]int64 // where each key first signed two blocks at one seq (identity.go forksOf), read once
}

func indexOf(blocks []Block) *index {
	ix := &index{m: map[string]Block{}}
	for _, b := range blocks {
		ix.set(b)
	}
	return ix
}

func (ix *index) set(b Block) {
	h := b.id()
	if _, ok := ix.m[h]; !ok {
		ix.order = append(ix.order, h)
	}
	b.Hash = h
	ix.m[h] = b
	ix.forks = nil
}

func (ix *index) get(hash string) (Block, bool) { b, ok := ix.m[hash]; return b, ok }

func (ix *index) has(hash string) bool { _, ok := ix.m[hash]; return ok }

func (ix *index) values() []Block {
	out := make([]Block, 0, len(ix.order))
	for _, h := range ix.order {
		out = append(out, ix.m[h])
	}
	return out
}

func (ix *index) with(b Block) *index {
	out := &index{order: append([]string{}, ix.order...), m: make(map[string]Block, len(ix.m)+1)}
	for k, v := range ix.m {
		out.m[k] = v
	}
	if !out.has(b.id()) {
		out.set(b)
	}
	return out
}

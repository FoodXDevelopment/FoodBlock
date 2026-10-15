package foodblock

import (
	"errors"
	"fmt"
	"strings"
)

// Writing a block and carrying it (protocol.md §1, §9, Encoding: Messages). Compose stamps an author's words with
// what every block carries (who, when, its place in the signing key's chain, what was seen, who may see it); Write is
// the one path every writer shares: compose, check, sign, chain. On the wire a public block is { version, block,
// signature }; a sealed one is { version, header, header_signature, envelope }, its public header { author, seq,
// prev, hash } signed by the key that signed the block, its body sealed to the audience.

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

// Compose is a block as its author says it. A private block comes back with its salts beside it, never signed.
func Compose(typ string, state, refs map[string]any, o ComposeOptions) (Block, error) {
	if o.Author == "" {
		return Block{}, errors.New("write: a block names its author")
	}
	if o.At == "" {
		o.At = now()
	}
	if _, ok := parseTime(o.At); !ok {
		return Block{}, errors.New("write: at is a time")
	}
	s, r := cloneMap(state), cloneMap(refs)
	s["at"] = o.At
	var salts map[string]string
	if len(o.Audience) == 0 {
		s["audience"] = Public
	} else {
		audience, given, err := Commit(o.Audience, o.Salts)
		if err != nil {
			return Block{}, err
		}
		s["audience"], salts = audience, given
		if !truthy(state["nonce"]) {
			s["nonce"] = NewSalt()
		}
	}
	if o.Link != nil {
		s["seq"] = o.Link.Seq
		r["prev"] = o.Link.Prev
	}
	r["author"] = o.Author
	if seen := sorted(uniq(o.After)); len(seen) > 0 {
		r["after"] = seen
	}
	b, err := Create(typ, s, r)
	b.Salts = salts
	return b, err
}

// WriteOptions are ComposeOptions plus the author's Key, the blocks they hold (Held: their genesis, key grants and
// blocks, and what `after` names) and the Schemas the block may name.
type WriteOptions struct {
	ComposeOptions
	Key     Keypair
	Held    []Block
	Schemas map[string]Block
}

// Refused is a block the write check refused: every refusal ({code, detail}, in protocol.json's order), and the
// details alone in plain words.
type Refused struct {
	Refusals []Finding
	Wrong    []string
}

func (r *Refused) Error() string {
	parts := []string{}
	for _, f := range r.Refusals {
		parts = append(parts, f.Code+": "+f.Detail)
	}
	return "write: refused: " + strings.Join(parts, "; ")
}

// CodedError is an error that carries a code from protocol.json's refusals.codes (an opened sealed copy whose block is
// over the size limit is `size_limit`).
type CodedError struct{ Code, Message string }

func (e *CodedError) Error() string { return e.Message }

// Write is the one way to write: compose, check (refusing, never repairing), sign with the author's key, at the next
// place in that key's chain among Held. It returns the signed block, or a *Refused with every reason.
func Write(typ string, state, refs map[string]any, o WriteOptions) (Block, error) {
	if o.Link == nil {
		link, err := NextLinkFor(o.Author, o.Key.PublicKeySign, o.Held)
		if err != nil {
			return Block{}, err
		}
		o.Link = &link
	}
	b, err := Compose(typ, state, refs, o.ComposeOptions)
	if err != nil {
		return Block{}, err
	}
	held := map[string]Block{}
	for _, one := range o.Held {
		held[one.id()] = one
	}
	if refused := Refusals(b.Type, b.State, b.Refs, CheckOptions{Schemas: o.Schemas, Held: held}); len(refused) > 0 {
		return Block{}, &Refused{refused, details(refused)}
	}
	b.Signature, err = Sign(b, o.Key.PrivateKey)
	return b, err
}

// ---- Messages ----

// Wrap is a signed public block as it travels: { version, block, signature }. Never the hash: readers recompute it.
// version "" is this protocol's.
func Wrap(signed Block, version string) map[string]any {
	if version == "" {
		version = Version
	}
	return map[string]any{"version": version, "block": map[string]any{"type": signed.Type, "state": orEmpty(signed.State), "refs": orEmpty(signed.Refs)}, "signature": signed.Signature}
}

func orEmpty(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

// Unwrap is a block off the wire: its hash recomputed from its content, its signature and version kept beside.
func Unwrap(message any) (Block, error) {
	m := obj(message)
	inner := obj(m["block"])
	typ, ok := inner["type"].(string)
	sig, ok2 := m["signature"].(string)
	if !ok || !ok2 {
		return Block{}, errors.New("write: a message is { version, block, signature }")
	}
	state, refs := orEmpty(obj(inner["state"])), orEmpty(obj(inner["refs"]))
	c, err := Canonical(typ, state, refs)
	if err != nil {
		return Block{}, err
	}
	if int64(len(c)) > blockBytes {
		return Block{}, &CodedError{"size_limit", fmt.Sprintf("write: a block is at most %d bytes", blockBytes)}
	}
	h, _ := Hash(typ, state, refs)
	b := Block{Hash: h, Type: typ, State: state, Refs: refs, Signature: sig, Version: str(m["version"])}
	if reveals, ok := arr(m["reveals"]); ok {
		b.Reveals = reveals
	}
	return b, nil
}

// Header is a block's public header: { author, seq, prev, hash }.
func Header(b Block) map[string]any {
	return map[string]any{"author": b.Refs["author"], "seq": b.State["seq"], "prev": b.Refs["prev"], "hash": b.id()}
}

// SealOptions: the recipients' encryption Keys, the Reveals this copy carries, the PrivateKey that signed the block,
// and Alg and Fixed (only to reproduce a vector).
type SealOptions struct {
	Keys       []string
	Reveals    []any
	PrivateKey string
	Alg        string
	Fixed      *Fixed
}

// SealCopy is a sealed copy: { version, header, header_signature, envelope }. The plaintext { version, block,
// signature, reveals } is sealed to Keys. A copy with reveals goes to one recipient, or to several who share every
// reveal (the members of one circle).
func SealCopy(signed Block, o SealOptions) (map[string]any, error) {
	top := Header(signed)
	head, err := SignMessage(top, o.PrivateKey)
	if err != nil {
		return nil, err
	}
	plaintext := Wrap(signed, "")
	plaintext["reveals"] = plural(o.Reveals)
	envelope, err := Seal(plaintext, o.Keys, o.Alg, o.Fixed)
	if err != nil {
		return nil, err
	}
	return map[string]any{"version": Version, "header": top, "header_signature": head["signature"], "envelope": envelope}, nil
}

// HeaderSignedBy is whether a sealed copy's header is signed by this key (the key that signed the block).
func HeaderSignedBy(message map[string]any, publicKey string) bool {
	part := cloneMap(obj(message["header"]))
	part["signature"] = message["header_signature"]
	return VerifyMessage(part, publicKey)
}

// OpenCopy opens a sealed copy with a recipient's X25519 private key: the block, its signature and its reveals. The
// header must name it.
func OpenCopy(message map[string]any, x25519Private string) (Block, error) {
	opened, err := Open(obj(message["envelope"]), x25519Private)
	if err != nil {
		return Block{}, err
	}
	plaintext := obj(opened)
	for _, key := range messageKeys("plaintext") {
		if _, ok := plaintext[key]; !ok && key != "reveals" {
			return Block{}, errors.New("write: a plaintext is { version, block, signature, reveals }")
		}
	}
	inside, err := Unwrap(plaintext)
	if err != nil {
		return Block{}, err
	}
	if header := obj(message["header"]); header != nil && !same(header["hash"], inside.Hash) {
		return Block{}, errors.New("write: the header names another block")
	}
	if inside.Reveals == nil {
		inside.Reveals = []any{}
	}
	return inside, nil
}

package foodblock

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// ProtocolVersion is the current FoodBlock protocol version.
const ProtocolVersion = "0.4.0"

// Block represents a FoodBlock.
type Block struct {
	Hash  string                 `json:"hash"`
	Type  string                 `json:"type"`
	State map[string]interface{} `json:"state"`
	Refs  map[string]interface{} `json:"refs"`
}

// SignedBlock is the authentication wrapper (Rule 7).
type SignedBlock struct {
	FoodBlock       Block  `json:"foodblock"`
	AuthorHash      string `json:"author_hash"`
	Signature       string `json:"signature"`
	ProtocolVersion string `json:"protocol_version"`
}

// Create makes a new FoodBlock.
func Create(typ string, state, refs map[string]interface{}) Block {
	if state == nil {
		state = map[string]interface{}{}
	}
	if refs == nil {
		refs = map[string]interface{}{}
	}

	// Auto-inject instance_id for event types (Section 2.1)
	// Definitional observe.* subtypes are excluded — they're registry blocks, not events
	injected := state
	if isEventType(typ) {
		if _, hasID := state["instance_id"]; !hasID {
			injected = make(map[string]interface{})
			injected["instance_id"] = generateUUID()
			for k, v := range state {
				injected[k] = v
			}
		}
	}

	cleanState := omitNulls(injected)
	cleanRefs := omitNulls(refs)
	validateRefs(cleanRefs)
	h := Hash(typ, cleanState, cleanRefs)

	return Block{Hash: h, Type: typ, State: cleanState, Refs: cleanRefs}
}

// Update creates a block that supersedes a previous block.
func Update(previousHash, typ string, state, refs map[string]interface{}) Block {
	if refs == nil {
		refs = map[string]interface{}{}
	}
	merged := make(map[string]interface{})
	for k, v := range refs {
		merged[k] = v
	}
	merged["updates"] = previousHash
	return Create(typ, state, merged)
}

// Hash computes the SHA-256 hash of a FoodBlock's canonical form.
func Hash(typ string, state, refs map[string]interface{}) string {
	c := Canonical(typ, state, refs)
	sum := sha256.Sum256([]byte(c))
	return hex.EncodeToString(sum[:])
}

// Canonical produces deterministic JSON for hashing.
func Canonical(typ string, state, refs map[string]interface{}) string {
	obj := map[string]interface{}{
		"type":  typ,
		"state": state,
		"refs":  refs,
	}
	return stringify(obj, false)
}

// GenerateKeypair generates a new Ed25519 keypair for signing.
func GenerateKeypair() (publicKey, privateKey []byte) {
	pub, priv, _ := ed25519.GenerateKey(nil)
	return []byte(pub), []byte(priv)
}

// Sign signs a FoodBlock and returns the authentication wrapper.
func Sign(block Block, authorHash string, privateKey []byte) SignedBlock {
	content := Canonical(block.Type, block.State, block.Refs)
	sig := ed25519.Sign(ed25519.PrivateKey(privateKey), []byte(content))
	return SignedBlock{
		FoodBlock:       block,
		AuthorHash:      authorHash,
		Signature:       hex.EncodeToString(sig),
		ProtocolVersion: ProtocolVersion,
	}
}

// Verify verifies a signed FoodBlock wrapper.
func Verify(signed SignedBlock, publicKey []byte) bool {
	content := Canonical(signed.FoodBlock.Type, signed.FoodBlock.State, signed.FoodBlock.Refs)
	sig, err := hex.DecodeString(signed.Signature)
	if err != nil {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(publicKey), []byte(content), sig)
}

// Tombstone creates a tombstone block for content erasure (Section 5.4).
func Tombstone(targetHash, requestedBy string) Block {
	return Create("observe.tombstone", map[string]interface{}{
		"reason":       "erasure_request",
		"requested_by": requestedBy,
	}, map[string]interface{}{
		"target":  targetHash,
		"updates": targetHash,
	})
}

// Chain follows the update chain backwards from a starting hash.
func Chain(startHash string, resolve func(string) *Block, maxDepth int) []Block {
	if maxDepth <= 0 {
		maxDepth = 100
	}
	visited := make(map[string]bool)
	var result []Block
	current := startHash

	for i := 0; i < maxDepth && current != ""; i++ {
		if visited[current] {
			break
		}
		visited[current] = true
		block := resolve(current)
		if block == nil {
			break
		}
		result = append(result, *block)
		// Follow updates ref
		if updates, ok := block.Refs["updates"]; ok {
			if s, ok := updates.(string); ok {
				current = s
			} else {
				current = ""
			}
		} else {
			current = ""
		}
	}
	return result
}

// MergeUpdate creates an update by merging changes into the previous block's state.
// Shallow-merges stateChanges into previousBlock.State.
func MergeUpdate(previousBlock Block, stateChanges, additionalRefs map[string]interface{}) Block {
	mergedState := make(map[string]interface{})
	for k, v := range previousBlock.State {
		mergedState[k] = v
	}
	if stateChanges != nil {
		for k, v := range stateChanges {
			mergedState[k] = v
		}
	}
	return Update(previousBlock.Hash, previousBlock.Type, mergedState, additionalRefs)
}

// Head finds the latest version in an update chain by walking forward.
func Head(startHash string, resolveForward func(string) []Block, maxDepth int) string {
	if maxDepth <= 0 {
		maxDepth = 1000
	}
	visited := make(map[string]bool)
	current := startHash
	for i := 0; i < maxDepth; i++ {
		if visited[current] {
			break
		}
		visited[current] = true
		children := resolveForward(current)
		found := false
		for _, child := range children {
			if updates, ok := child.Refs["updates"].(string); ok && updates == current {
				current = child.Hash
				found = true
				break
			}
		}
		if !found {
			break
		}
	}
	return current
}

func stringify(value interface{}, inRefs bool) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case bool:
		if v {
			return "true"
		}
		return "false"

	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return canonicalNumber(v)

	case string:
		normalized := norm.NFC.String(v)
		return escapeJSON(normalized)

	case []interface{}:
		if inRefs {
			// Sort string arrays for refs (set semantics)
			if isStringSlice(v) {
				sorted := make([]string, len(v))
				for i, item := range v {
					sorted[i] = item.(string)
				}
				sort.Strings(sorted)
				parts := make([]string, 0, len(sorted))
				for _, s := range sorted {
					parts = append(parts, stringify(s, inRefs))
				}
				return "[" + strings.Join(parts, ",") + "]"
			}
		}
		parts := make([]string, 0, len(v))
		for _, item := range v {
			s := stringify(item, inRefs)
			if s != "" {
				parts = append(parts, s)
			}
		}
		return "[" + strings.Join(parts, ",") + "]"

	case map[string]interface{}:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			val := v[k]
			if val == nil {
				continue
			}
			childInRefs := inRefs || k == "refs"
			valStr := stringify(val, childInRefs)
			if valStr != "" {
				normalizedKey := norm.NFC.String(k)
				parts = append(parts, escapeJSON(normalizedKey)+":"+valStr)
			}
		}
		return "{" + strings.Join(parts, ",") + "}"
	}

	return ""
}

func canonicalNumber(n float64) string {
	if n == 0 {
		return "0"
	}
	if n == math.Trunc(n) && math.Abs(n) < (1<<53) {
		// Use Sprintf instead of FormatInt to avoid int64 overflow for large values
		return fmt.Sprintf("%.0f", n)
	}
	return strconv.FormatFloat(n, 'f', -1, 64)
}

func escapeJSON(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		switch r {
		case '"':
			b.WriteString("\\\"")
		case '\\':
			b.WriteString("\\\\")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		case '\t':
			b.WriteString("\\t")
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf("\\u%04x", r))
			} else {
				b.WriteRune(r)
			}
		}
		i += size
	}
	b.WriteByte('"')
	return b.String()
}

func isStringSlice(v []interface{}) bool {
	for _, item := range v {
		if _, ok := item.(string); !ok {
			return false
		}
	}
	return true
}

func validateRefs(refs map[string]interface{}) {
	for k, v := range refs {
		switch val := v.(type) {
		case string:
			continue
		case []interface{}:
			for _, item := range val {
				if _, ok := item.(string); !ok {
					panic(fmt.Sprintf("FoodBlock: refs.%s array contains non-string value", k))
				}
			}
		default:
			panic(fmt.Sprintf("FoodBlock: refs.%s must be a string or array of strings", k))
		}
	}
}

func omitNulls(m map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range m {
		if v == nil {
			continue
		}
		switch val := v.(type) {
		case map[string]interface{}:
			result[k] = omitNulls(val)
		case []interface{}:
			result[k] = omitNullsSlice(val)
		default:
			result[k] = v
		}
	}
	return result
}

var definitionalTypes = map[string]bool{
	"observe.vocabulary":    true,
	"observe.template":      true,
	"observe.schema":        true,
	"observe.trust_policy":  true,
	"observe.protocol":      true,
}

var eventPrefixes = []string{"transfer.", "transform.", "observe."}

func isEventType(typ string) bool {
	if definitionalTypes[typ] {
		return false
	}
	for _, prefix := range eventPrefixes {
		if strings.HasPrefix(typ, prefix) {
			return true
		}
	}
	return false
}

func generateUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	h := hex.EncodeToString(buf[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

func omitNullsSlice(arr []interface{}) []interface{} {
	var result []interface{}
	for _, v := range arr {
		if v == nil {
			continue
		}
		switch val := v.(type) {
		case map[string]interface{}:
			result = append(result, omitNulls(val))
		case []interface{}:
			result = append(result, omitNullsSlice(val))
		default:
			result = append(result, v)
		}
	}
	return result
}

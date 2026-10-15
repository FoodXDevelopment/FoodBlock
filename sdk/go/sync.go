package foodblock

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Between nodes (protocol.md §10, Encoding: Messages): two messages, Pull and Push. Pull asks for the blocks the asker
// may see since the responder's arrival number (never a time); `heads: true` returns only the heads among the matches.
// A signed pull names the asker, the node it is for, a fresh nonce and `at`. Push sends signed blocks; a node takes
// those signed by a live key of their author that pass the write check, holds back (waiting) those whose prev it
// lacks, lists the second of two blocks at one seq beside the first (Equivocations), and refuses the rest, each
// { hash, code, detail } with a code from protocol.json's refusals.codes. Every node answer is signed by the node
// (invariant 18).

func pick(m map[string]any, keys []string) map[string]any {
	out := map[string]any{}
	for _, k := range keys {
		if m[k] != nil {
			out[k] = m[k]
		}
	}
	return out
}

// PullRequest is a pull: { since (exclusive arrival number, 0 from the start), limit, filter, heads }. Keys outside
// protocol.json's pull message are dropped; a missing since is 0.
func PullRequest(request map[string]any) map[string]any {
	r := cloneMap(request)
	if r["since"] == nil {
		r["since"] = 0
	}
	return pick(r, messageKeys("pull"))
}

// SignPullOptions: who asks, which node it is for, the asker's private key; Nonce and At default to fresh values.
type SignPullOptions struct {
	Asker, Node, PrivateKey, Nonce, At string
}

// SignPull is a signed pull: the request, plus asker, node, a fresh nonce and at, signed by one of the asker's keys.
func SignPull(request map[string]any, o SignPullOptions) (map[string]any, error) {
	if o.Nonce == "" {
		o.Nonce = NewSalt()
	}
	if o.At == "" {
		o.At = now()
	}
	r := PullRequest(request)
	r["asker"], r["node"], r["nonce"], r["at"] = o.Asker, o.Node, o.Nonce, o.At
	return SignMessage(r, o.PrivateKey)
}

// signedWindow is how far a signed message's `at` may be from the node's clock, either way (protocol.json
// limits.signed_window).
var signedWindow = func() time.Duration {
	from := "2000-01-01T00:00:00.000Z"
	a, _ := parseTime(from)
	b, _ := parseTime(AddDuration(from, str(at(protocolDoc, "limits", "signed_window")), 1))
	return b.Sub(a)
}()

// PullCheck: the node `Node` whose clock reads Now; Keys, the signer's live signing keys; Seen, whether this node has
// seen a nonce; Window, how far `at` may be from its clock (default protocol.json limits.signed_window).
type PullCheck struct {
	Node, Now string
	Keys      []string
	Seen      func(nonce string) bool
	Window    time.Duration
}

// messageRefusals is why a node refuses a signed message whose keys may be `fields`: codes from protocol.json's
// refusals.codes.message, none when it may be answered.
func messageRefusals(message map[string]any, o PullCheck, fields []string) []Finding {
	if o.Now == "" {
		o.Now = now()
	}
	if o.Window == 0 {
		o.Window = signedWindow
	}
	wrong := errs(keysWithin(message, fields), "bad_signature", "a signed message is { "+strings.Join(fields, ", ")+" }")
	wrong = append(wrong, errs(same(message["node"], o.Node), "wrong_node", "the message names another node")...)
	if matchesGrammar("nonce", message["nonce"]) {
		wrong = append(wrong, errs(o.Seen == nil || !o.Seen(str(message["nonce"])), "replay", "this nonce was seen: a replay")...)
	} else {
		wrong = append(wrong, Finding{"replay", "a signed message carries a fresh nonce"})
	}
	at, ok := parseTime(str(message["at"]))
	clock, ok2 := parseTime(o.Now)
	wrong = append(wrong, errs(matchesGrammar("time", message["at"]) && ok && ok2 && math.Abs(float64(at.Sub(clock))) <= float64(o.Window), "window", "its at is outside this node's window")...)
	signedBy := false
	for _, key := range o.Keys {
		signedBy = signedBy || VerifyMessage(message, key)
	}
	wrong = append(wrong, errs(signedBy, "bad_signature", "it is not signed by its signer")...)
	return ordered(wrong, RefusalCodes["message"])
}

// PullRefusals is why a node refuses a signed pull: none when it may be answered.
func PullRefusals(message map[string]any, o PullCheck) []Finding {
	return messageRefusals(message, o, messageKeys("signed_pull"))
}

// PushRefusals is why a node refuses a signed push: none when it may be taken.
func PushRefusals(message map[string]any, o PullCheck) []Finding {
	return messageRefusals(message, o, messageKeys("signed_push"))
}

// PullErrors is what is wrong with a signed pull, in plain words: none when it may be answered.
func PullErrors(message map[string]any, o PullCheck) []string {
	return details(PullRefusals(message, o))
}

// recordOf: every first version a block is a version of (itself, and back through `updates`).
func recordOf(b Block, byHash *index) []string {
	out, seen := []string{}, map[string]bool{}
	var walk func(Block)
	walk = func(one Block) {
		if seen[one.Hash] {
			return
		}
		seen[one.Hash] = true
		out = append(out, one.Hash)
		for _, h := range list(one.Refs["updates"]) {
			if held, ok := byHash.get(h); ok {
				walk(held)
			} else {
				walk(Block{Hash: h})
			}
		}
	}
	b.Hash = b.id()
	walk(b)
	return out
}

// Matches is whether a block matches a pull filter: every key, ANDed; `type` read through aliases; `record` resolved
// among held.
func Matches(b Block, filter map[string]any, held []Block) bool {
	return matches(b, filter, indexOf(held))
}

func matches(b Block, filter map[string]any, held *index) bool {
	if len(filter) == 0 {
		return true
	}
	read := ReadAs(b)
	if filter["type"] != nil && !same(read.Type, filter["type"]) {
		return false
	}
	if filter["kind"] != nil && !equalScalar(read.State["kind"], filter["kind"]) {
		return false
	}
	if filter["author"] != nil && !same(b.Refs["author"], filter["author"]) {
		return false
	}
	if filter["hash"] != nil && !same(b.id(), filter["hash"]) {
		return false
	}
	if filter["record"] != nil && !contains(recordOf(b, held), str(filter["record"])) {
		return false
	}
	refs := obj(filter["refs"])
	for _, k := range sortedKeys(refs) {
		if !contains(list(read.Refs[k]), str(refs[k])) {
			return false
		}
	}
	return true
}

// HeadsOf are the heads among blocks: those no other among them names by prev or updates.
func HeadsOf(blocks []Block) []Block {
	named := map[string]bool{}
	for _, b := range blocks {
		for _, h := range append(list(b.Refs["prev"]), list(b.Refs["updates"])...) {
			named[h] = true
		}
	}
	out := []Block{}
	for _, b := range blocks {
		if !named[b.id()] {
			out = append(out, b)
		}
	}
	return out
}

// Arrival is one block in a node's arrival log: its arrival number (1, 2, 3, never reused), the block, the sealed
// copies by recipient id, and a sealed block's signed header.
type Arrival struct {
	N               int64
	Block           Block
	Copies          map[string]map[string]any
	Header          map[string]any
	HeaderSignature string
}

// AnswerOptions: the node's id and private key (the answer is unsigned without one); Asker (default the request's);
// Cap, the node's own limit (default 500); Held, to resolve records (default the log's blocks).
type AnswerOptions struct {
	Node, PrivateKey, Asker string
	Cap                     int64
	Held                    []Block
}

// AnswerPull answers a pull from a node's arrival log. A public block travels whole; a sealed one as its header, or,
// to a signed pull's asker, the copy sealed to them. Signed by the node: { node, request, blocks: [{ n, message }],
// next, signature }.
func AnswerPull(log []Arrival, request map[string]any, o AnswerOptions) (map[string]any, error) {
	if o.Cap == 0 {
		o.Cap = 500
	}
	if o.Asker == "" {
		o.Asker = str(request["asker"])
	}
	since := int64(jsNumber(request["since"]))
	limit := o.Cap
	if request["limit"] != nil {
		if l := int64(jsNumber(request["limit"])); l < limit {
			limit = l
		}
	}
	held := o.Held
	if held == nil {
		for _, entry := range log {
			held = append(held, entry.Block)
		}
	}
	heldIndex := indexOf(held)
	found := []Arrival{}
	for _, entry := range log {
		if entry.N > since && matches(entry.Block, obj(request["filter"]), heldIndex) {
			found = append(found, entry)
		}
	}
	sort.SliceStable(found, func(i, j int) bool { return found[i].N < found[j].N })
	if truthy(request["heads"]) {
		blocks := []Block{}
		for _, entry := range found {
			blocks = append(blocks, entry.Block)
		}
		heads := map[string]bool{}
		for _, b := range HeadsOf(blocks) {
			heads[b.id()] = true
		}
		kept := []Arrival{}
		for _, entry := range found {
			if heads[entry.Block.id()] {
				kept = append(kept, entry)
			}
		}
		found = kept
	}
	if int64(len(found)) > limit {
		found = found[:limit]
	}
	c, err := CanonicalJSON(request)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(c))
	blocks := []any{}
	for _, entry := range found {
		var message map[string]any
		if _, private := arr(entry.Block.State["audience"]); !private || isStr(entry.Block.State["audience"]) {
			message = Wrap(entry.Block, "")
		} else if copy := entry.Copies[o.Asker]; o.Asker != "" && copy != nil {
			message = copy
		} else {
			header := entry.Header
			if header == nil {
				header = Header(entry.Block)
			}
			message = map[string]any{"version": Version, "header": header, "header_signature": entry.HeaderSignature}
		}
		blocks = append(blocks, map[string]any{"n": entry.N, "message": message})
	}
	next := since
	if len(found) > 0 {
		next = found[len(found)-1].N
	}
	answer := map[string]any{"node": o.Node, "request": hex.EncodeToString(sum[:]), "blocks": blocks, "next": next}
	if o.PrivateKey == "" {
		return answer, nil
	}
	return SignMessage(answer, o.PrivateKey)
}

// AnswerSignedBy is whether a node's answer (pull or push) is signed by one of the node's keys. Two signed answers
// that differ for one arrival number prove a lie.
func AnswerSignedBy(answer map[string]any, nodeKeys []string) bool {
	for _, key := range nodeKeys {
		if VerifyMessage(answer, key) {
			return true
		}
	}
	return false
}

// PushRequest is a push: { messages, for } (for: which of the node's people a sealed copy is for, by hash).
func PushRequest(messages []any, forWhom map[string]any) map[string]any {
	return pick(map[string]any{"messages": messages, "for": forWhomOrNil(forWhom)}, messageKeys("push"))
}

func forWhomOrNil(m map[string]any) any {
	if m == nil {
		return nil
	}
	return m
}

// Waiting is a pushed block waiting for the blocks it needs.
type Waiting struct {
	Hash  string   `json:"hash"`
	Needs []string `json:"needs"`
}

// Refusal is a refused block and why: a code from protocol.json's refusals.codes, and free text for people.
type Refusal struct {
	Hash   string `json:"hash"`
	Code   string `json:"code"`
	Detail string `json:"detail"`
}

// Accepted is what a node takes of a push.
type Accepted struct {
	Taken         []Block
	Waiting       []Waiting
	Refused       []Refusal
	Equivocations [][]string
}

// AcceptOptions: ArrivedAt (for recovery reach) and the Schemas the check may read.
type AcceptOptions struct {
	ArrivedAt ArrivedAt
	Schemas   map[string]Block
}

// Accept is what a node takes of a push. Genesis blocks are read first. A block without seq is taken only as history:
// an older identity's, while its history is open or inside its closed history (a grant or an answer there stands). A
// 1.6 block passes the write check and is signed by a key of its author that speaks for it (bad_signature when no key
// of the author opens it, void_key when one does but does not speak); one whose key's previous block is not held
// waits. The second of two blocks from one key at one seq is neither taken nor refused: the pair is listed in
// Equivocations (sorted), and the node keeps both as proof.
func Accept(incoming, held []Block, options ...AcceptOptions) Accepted {
	var o AcceptOptions
	if len(options) > 0 {
		o = options[0]
	}
	known := indexOf(append(append([]Block{}, held...), incoming...))
	result := Accepted{Taken: []Block{}, Waiting: []Waiting{}, Refused: []Refusal{}, Equivocations: [][]string{}}
	slots := map[string]string{}
	slot := func(b Block) string {
		key := SignerOf(b, identityOf(refStr(b, "author"), known, nil).Keys)
		if key == "" {
			return ""
		}
		seq, _ := intOf(b.State["seq"])
		return fmt.Sprintf("%s %s %d", refStr(b, "author"), key, seq)
	}
	for _, b := range held {
		if isInt(b.State["seq"]) && truthy(b.Refs["author"]) {
			if at := slot(b); at != "" {
				slots[at] = b.id()
			}
		}
	}
	refuse := func(b Block, code, detail string) {
		result.Refused = append(result.Refused, Refusal{b.Hash, code, detail})
	}
	// Not the author's: no key of the author opens it (bad_signature), or one does but does not speak for it (void_key).
	unsigned := func(b Block) {
		if IsGenesis(b) {
			refuse(b, "bad_genesis", "a genesis is signed by its own key")
			return
		}
		opened := SignerOf(b, identityOf(refStr(b, "author"), known, nil).Keys) != ""
		if rk := str(b.State["recovery_key"]); !opened && rk != "" {
			opened = SignerOf(b, []*KeyEntry{{Key: rk}}) != ""
		}
		if opened {
			refuse(b, "void_key", "signed by a key of its author that does not speak for it: void, frozen, or rotated past last_good")
		} else {
			refuse(b, "bad_signature", "its signature opens with no key of its author")
		}
	}
	for _, b := range CausalOrder(incoming) {
		if !IsGenesis(b) && b.State["seq"] == nil {
			root, ok := known.get(refStr(b, "author"))
			if ok && Is16Genesis(root) {
				refuse(b, "no_history", "a 1.6 identity has no history: a block without seq is refused")
				continue
			}
			if ok && !historyCounts(b, root.Hash, known) {
				refuse(b, "history_closed", "history is closed: it is in neither the first 1.6 block's causal past nor its manifest")
				continue
			}
			if !signedByAuthor(b, known, o.ArrivedAt) {
				unsigned(b)
				continue
			}
			result.Taken = append(result.Taken, b)
			continue
		}
		if wrong := Refusals(b.Type, b.State, b.Refs, CheckOptions{Schemas: o.Schemas}); len(wrong) > 0 {
			for _, f := range wrong {
				refuse(b, f.Code, f.Detail)
			}
			continue
		}
		if !IsGenesis(b) && truthy(b.Refs["prev"]) && !known.has(refStr(b, "prev")) {
			result.Waiting = append(result.Waiting, Waiting{b.Hash, []string{refStr(b, "prev")}})
			continue
		}
		if !signedByAuthor(b, known, o.ArrivedAt) {
			unsigned(b)
			continue
		}
		if b.Type == "grant" && b.State["kind"] == "key" && truthy(b.State["replaces"]) && !truthy(b.State["recovery_key"]) &&
			SignerOf(b, identityOf(refStr(b, "author"), known, nil).Keys) != str(b.State["replaces"]) {
			refuse(b, "not_own_rotation", "a key is rotated only by itself or by the recovery key")
			continue
		}
		at := ""
		if isInt(b.State["seq"]) {
			at = slot(b)
		}
		if prior, ok := slots[at]; at != "" && ok && prior != b.Hash {
			// The second of a pair: neither taken nor refused, listed with the first. The node keeps both and serves them together.
			result.Equivocations = append(result.Equivocations, sorted([]string{prior, b.Hash}))
			continue
		}
		if at != "" {
			slots[at] = b.Hash
		}
		result.Taken = append(result.Taken, b)
	}
	return result
}

// WaitedTooLong is whether a waiting block has waited past the node's own time to live since it arrived.
func WaitedTooLong(since, now string, ttl time.Duration) bool {
	a, ok := parseTime(since)
	b, ok2 := parseTime(now)
	return ok && ok2 && b.Sub(a) > ttl
}

// PushAnswer is a node's signed answer to a push (signed by a key of its holder, a person or a machine, brought in by
// a key grant): { node, taken, waiting, refused: [{ hash, code, detail }], equivocations: [[hash, hash]], signature }.
// Every key is always there; an empty list is []. Each pair is sorted as text.
func PushAnswer(result Accepted, node, privateKey string) (map[string]any, error) {
	taken, waiting, refused, equivocations := []any{}, []any{}, []any{}, []any{}
	for _, b := range result.Taken {
		taken = append(taken, b.id())
	}
	for _, w := range result.Waiting {
		waiting = append(waiting, w.Hash)
	}
	for _, r := range result.Refused {
		refused = append(refused, map[string]any{"hash": r.Hash, "code": r.Code, "detail": r.Detail})
	}
	for _, pair := range result.Equivocations {
		one := []any{}
		for _, h := range sorted(pair) {
			one = append(one, h)
		}
		equivocations = append(equivocations, one)
	}
	return SignMessage(map[string]any{"node": node, "taken": taken, "waiting": waiting, "refused": refused, "equivocations": equivocations}, privateKey)
}

// ---- Discovery ----

// Discovery is what a node publishes at `.well-known/foodblock`. Admission is the hash of its owner's admission block,
// or "".
type Discovery struct {
	Node, Admission  string
	Holds, SpeaksFor []string
	Endpoints        map[string]string
}

// WellKnown is the `.well-known/foodblock` document.
func WellKnown(d Discovery) map[string]any {
	endpoints := map[string]any{}
	for _, k := range messageKeys("endpoints") {
		endpoints[k] = nilIfEmpty(d.Endpoints[k])
	}
	holds, speaks := []any{}, []any{}
	for _, h := range d.Holds {
		holds = append(holds, h)
	}
	for _, h := range d.SpeaksFor {
		speaks = append(speaks, h)
	}
	return map[string]any{"protocol": "foodblock", "version": Version, "node": d.Node, "holds": holds, "speaks_for": speaks, "admission": nilIfEmpty(d.Admission), "endpoints": endpoints}
}

// Announcement is a local announcement (mDNS / DNS-SD or a short-range link): { protocol, version, node, endpoints }.
func Announcement(doc map[string]any) map[string]any { return pick(doc, messageKeys("announcement")) }

var url = regexp.MustCompile(`^https?://`)

// WellKnownErrors is what is wrong with a `.well-known/foodblock` document, in plain words.
func WellKnownErrors(doc map[string]any) []string {
	if doc == nil || doc["protocol"] != "foodblock" {
		return []string{`protocol is "foodblock"`}
	}
	discovery, endpointKeys := messageKeys("discovery"), messageKeys("endpoints")
	wrong := []string{}
	for _, k := range sortedKeys(doc) {
		if !contains(discovery, k) {
			wrong = append(wrong, fmt.Sprintf("%s is not part of discovery (%s)", k, strings.Join(discovery, ", ")))
		}
	}
	wrong = append(wrong, words(isStr(doc["version"]), "version names the rules the node speaks")...)
	wrong = append(wrong, words(isHash(doc["node"]), "node is the id of the node (an actor)")...)
	for _, k := range []string{"holds", "speaks_for"} {
		wrong = append(wrong, words(listOf(doc[k], isHash, false), k+" lists ids (hashes)")...)
	}
	admission, named := doc["admission"]
	wrong = append(wrong, words((named && admission == nil) || isHash(admission), "admission is the hash of the admission block")...)
	endpoints := obj(doc["endpoints"])
	good := endpoints != nil && keysWithin(endpoints, endpointKeys)
	for _, k := range endpointKeys {
		value, named := endpoints[k]
		good = good && ((named && value == nil) || url.MatchString(str(value)))
	}
	return append(wrong, words(good, "endpoints: { "+strings.Join(endpointKeys, ", ")+" } are URLs")...)
}

// words is a plain-words finding unless cond holds.
func words(cond bool, message string) []string {
	if cond {
		return nil
	}
	return []string{message}
}

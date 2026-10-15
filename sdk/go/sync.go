package foodblock

import "time"

// The messages between nodes (protocol.md §9, §10): thin calls into the Rust core.

// PullRequest is a pull: { since (exclusive arrival number, 0 from the start), limit, filter, heads }. Keys outside
// protocol.json's pull message are dropped; a missing since is 0.
func PullRequest(request map[string]any) map[string]any {
	return must[map[string]any]("pull_request", orEmpty(request))
}

// SignOptions: who signs (Signer), which node it is for, the signer's private key and its Suite, and exactly one proof
// against replay: Counter (above the highest the node has seen from the signer) or Challenge (one the node issued).
// A signed request carries no time.
type SignOptions struct {
	Signer, Node, PrivateKey, Suite, Challenge string
	Counter                                    int64
}

func (o SignOptions) json() map[string]any {
	given := map[string]any{"who": o.Signer, "node": o.Node, "private_key": o.PrivateKey}
	if o.Suite != "" {
		given["suite"] = o.Suite
	}
	if o.Counter != 0 {
		given["counter"] = o.Counter
	}
	if o.Challenge != "" {
		given["challenge"] = o.Challenge
	}
	return given
}

// SignPull is a signed pull: the request, plus signer, node and one proof against replay, signed by one of the
// signer's keys.
func SignPull(request map[string]any, o SignOptions) (map[string]any, error) {
	return ask[map[string]any]("sign_pull", orEmpty(request), o.json())
}

// SignPush is a signed push: the push, plus signer, node and one proof against replay.
func SignPush(push map[string]any, o SignOptions) (map[string]any, error) {
	return ask[map[string]any]("sign_push", orEmpty(push), o.json())
}

// NewChallenge is a new challenge value a node hands out at its `challenge` endpoint.
func NewChallenge() string { return must[string]("new_challenge") }

// PullCheck is what a node remembers: Node (its id), Keys (the signer's live signing keys), Highest (the highest
// counter seen from the signer; nil when none) and Issued (challenges issued and not yet used). No clock.
type PullCheck struct {
	Node    string
	Keys    []string
	Highest *int64
	Issued  []string
}

func (o PullCheck) json() map[string]any {
	var highest any
	if o.Highest != nil {
		highest = *o.Highest
	}
	return map[string]any{"node": o.Node, "keys": plural(o.Keys), "highest": highest, "issued": plural(o.Issued)}
}

// PullRefusals is why a node refuses a signed pull: none when it may be answered.
func PullRefusals(message map[string]any, o PullCheck) []Finding {
	return plural(must[[]Finding]("pull_refusals", orEmpty(message), o.json()))
}

// PushRefusals is why a node refuses a signed push: none when it may be taken.
func PushRefusals(message map[string]any, o PullCheck) []Finding {
	return plural(must[[]Finding]("push_refusals", orEmpty(message), o.json()))
}

// PullErrors is what is wrong with a signed pull, in plain words: none when it may be answered.
func PullErrors(message map[string]any, o PullCheck) []string {
	return plural(must[[]string]("pull_errors", orEmpty(message), o.json()))
}

// PushErrors is what is wrong with a signed push, in plain words.
func PushErrors(message map[string]any, o PullCheck) []string {
	return plural(must[[]string]("push_errors", orEmpty(message), o.json()))
}

// Matches is whether a block matches a pull filter: every key, ANDed; `record` resolved
// among held.
func Matches(b Block, filter map[string]any, held []Block) bool {
	return must[bool]("matches", b, filter, plural(held))
}

// HeadsOf are the blocks no other block among them names.
func HeadsOf(blocks []Block) []Block { return plural(must[[]Block]("heads_of", plural(blocks))) }

// Arrival is one block a node holds: its arrival number N (1, 2, 3 as blocks were taken in, never reused), the sealed
// copies by recipient id, and a sealed block's signed header.
type Arrival struct {
	N               int64
	Block           Block
	Copies          map[string]map[string]any
	Header          map[string]any
	HeaderSignature string
}

// AnswerOptions: the node's id and private key (the answer is unsigned without one) and its Suite; Signer (default
// the request's); Cap, the node's own limit (default 500); Held (blocks that sealed copies are checked against).
type AnswerOptions struct {
	Node, PrivateKey, Signer, Suite string
	Cap                             int64
	Held                            []Block
}

// AnswerPull answers a pull from a node's arrival log. A public block travels whole; a sealed one as its header, or,
// to a signed pull's asker, the copy sealed to them. Signed by the node: { node, request, blocks: [{ n, message }],
// next, signature }.
func AnswerPull(log []Arrival, request map[string]any, o AnswerOptions) (map[string]any, error) {
	entries := make([]map[string]any, 0, len(log))
	for _, e := range log {
		entry := map[string]any{"n": e.N, "block": e.Block, "copies": e.Copies}
		if e.Header != nil {
			entry["header"] = e.Header
		}
		if e.HeaderSignature != "" {
			entry["header_signature"] = e.HeaderSignature
		}
		entries = append(entries, entry)
	}
	cap := o.Cap
	if cap == 0 {
		cap = 500
	}
	var key any
	if o.PrivateKey != "" {
		key = o.PrivateKey
	}
	var signer, held any
	if o.Signer != "" {
		signer = o.Signer
	}
	if o.Held != nil {
		held = o.Held
	}
	return ask[map[string]any]("answer_pull", entries, orEmpty(request), o.Node, key, cap, signer, held, suiteOf([]string{o.Suite}))
}

// AnswerSignedBy is whether a node's answer (pull or push) is signed by one of the node's keys.
func AnswerSignedBy(answer map[string]any, nodeKeys []string) bool {
	return must[bool]("answer_signed_by", answer, plural(nodeKeys))
}

// PushRequest is a push: { messages, for }.
func PushRequest(messages []any, forWhom map[string]any) map[string]any {
	return must[map[string]any]("push_request", plural(messages), forWhom)
}

// Waiting is a block that waits for blocks it needs.
type Waiting struct {
	Hash  string   `json:"hash"`
	Needs []string `json:"needs"`
}

// Refusal is one refusal in a push answer: { hash, code, detail }, its code from protocol.json's refusals.codes.
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

// AcceptOptions: ArrivedAt (this node's arrival log) and Schemas (hash -> schema block).
type AcceptOptions struct {
	ArrivedAt ArrivedAt
	Schemas   map[string]Block
}

// Accept is what a node takes of a push (incoming, blocks off the wire) given what it holds.
func Accept(incoming, held []Block, options ...AcceptOptions) Accepted {
	var o AcceptOptions
	if len(options) > 0 {
		o = options[0]
	}
	r := must[struct {
		Taken         []string   `json:"taken"`
		Waiting       []Waiting  `json:"waiting"`
		Refused       []Refusal  `json:"refused"`
		Equivocations [][]string `json:"equivocations"`
	}]("accept", plural(incoming), plural(held), arrivals(o.ArrivedAt, append(append([]Block{}, incoming...), held...)), blockList(o.Schemas))
	byHash := map[string]Block{}
	for _, b := range incoming {
		byHash[b.id()] = b
	}
	out := Accepted{Taken: []Block{}, Waiting: plural(r.Waiting), Refused: plural(r.Refused), Equivocations: plural(r.Equivocations)}
	for _, h := range r.Taken {
		out.Taken = append(out.Taken, byHash[h])
	}
	return out
}

// WaitedTooLong is whether a waiting block has waited past the node's own time to live since it arrived.
func WaitedTooLong(since, now string, ttl time.Duration) bool {
	return must[bool]("waited_too_long", since, now, ttl.Milliseconds())
}

// PushAnswer is a node's signed answer to a push: { node, taken, waiting, refused: [{ hash, code, detail }],
// equivocations: [[hash, hash]], signature }. Every key is always there; an empty list is []. Each pair is sorted.
func PushAnswer(result Accepted, node, privateKey string, suite ...string) (map[string]any, error) {
	taken, waiting := []string{}, []string{}
	for _, b := range result.Taken {
		taken = append(taken, b.id())
	}
	for _, w := range result.Waiting {
		waiting = append(waiting, w.Hash)
	}
	parts := map[string]any{"taken": taken, "waiting": waiting, "refused": plural(result.Refused), "equivocations": plural(result.Equivocations)}
	return ask[map[string]any]("push_answer", parts, node, privateKey, suiteOf(suite))
}

// AdmissionRefusals is what a node's admission and strangers rules refuse of a block for a person: not_admitted,
// not_human, stopped. admission is the node's admission rules (JSON); strangersToday counts strangers already taken today.
func AdmissionRefusals(b Block, receiver string, blocks []Block, admission map[string]any, strangersToday int) []Finding {
	return plural(must[[]Finding]("admission_refusals", b, receiver, plural(blocks), orEmpty(admission), strangersToday))
}

// ResidencyRefusals is a block that stays in regions its node does not hold in (profiles/residency.md).
func ResidencyRefusals(b Block, holdsIn []string) []Finding {
	return plural(must[[]Finding]("residency_refusals", b, plural(holdsIn)))
}

// Discovery is what a node publishes at `.well-known/foodblock`. Admission is the hash of its owner's admission block,
// or "".
type Discovery struct {
	Node, Admission  string
	Holds, SpeaksFor []string
	Endpoints        map[string]string
}

// WellKnown is the `.well-known/foodblock` document.
func WellKnown(d Discovery) map[string]any {
	var admission any
	if d.Admission != "" {
		admission = d.Admission
	}
	endpoints := map[string]any{}
	for k, v := range d.Endpoints {
		endpoints[k] = v
	}
	return must[map[string]any]("well_known", d.Node, plural(d.Holds), plural(d.SpeaksFor), admission, endpoints)
}

// Announcement is a local announcement (mDNS / DNS-SD or a short-range link): { protocol, version, node, endpoints }.
func Announcement(doc map[string]any) map[string]any {
	return must[map[string]any]("announcement", doc)
}

// WellKnownErrors is what is wrong with a `.well-known/foodblock` document, in plain words.
func WellKnownErrors(doc map[string]any) []string {
	return plural(must[[]string]("well_known_errors", doc))
}

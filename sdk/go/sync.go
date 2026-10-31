package foodblock

import "time"

// The messages between nodes (protocol.md §9, §10): thin calls into the Rust core.

// PullRequest is a pull: { since (exclusive arrival number, 0 from the start), limit, filter, heads }. Keys outside
// protocol.json's pull message are dropped; a missing since is 0.
func PullRequest(request map[string]any) map[string]any {
	return doorPullRequest[map[string]any](orEmpty(request))
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
	return doorSignPull[map[string]any](orEmpty(request), o.json())
}

// SignPush is a signed push: the push, plus signer, node and one proof against replay.
func SignPush(push map[string]any, o SignOptions) (map[string]any, error) {
	return doorSignPush[map[string]any](orEmpty(push), o.json())
}

// NewChallenge is a new challenge value a node hands out at its `challenge` endpoint.
func NewChallenge() string { return sure(doorNewChallenge()) }

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
	return doorPullRefusals(orEmpty(message), o.json())
}

// PushRefusals is why a node refuses a signed push: none when it may be taken.
func PushRefusals(message map[string]any, o PullCheck) []Finding {
	return doorPushRefusals(orEmpty(message), o.json())
}

// Matches is whether a block matches a pull filter: every key, ANDed; `record` resolved
// among held.
func Matches(b Block, filter map[string]any, held []Block) bool {
	return doorMatches(b, filter, held)
}

// HeadsOf are the blocks no other block among them names.
func HeadsOf(blocks []Block) []Block { return doorHeadsOf(blocks) }

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
// the request's); Cap, the node's own limit (required, 1 or more: there is no default cap); ServesPairs (required choice:
// true sends a fork's other half with its proof, false only what matches); Held (blocks that sealed copies are checked
// against). A zero Cap is refused by the core.
type AnswerOptions struct {
	Node, PrivateKey, Signer, Suite string
	Cap                             int64
	ServesPairs                     bool
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
	choices := map[string]any{"cap": o.Cap, "serves_pairs": o.ServesPairs}
	return doorAnswerPull[map[string]any](entries, orEmpty(request), o.Node, o.PrivateKey, choices, o.Signer, o.Held, o.Suite, nil)
}

// AnswerSignedBy is whether a node's answer (pull or push) is signed by one of the node's keys.
func AnswerSignedBy(answer map[string]any, nodeKeys []string) bool {
	return doorAnswerSignedBy(answer, nodeKeys)
}

// PushRequest is a push: { messages, for }.
func PushRequest(messages []any, forWhom map[string]any) map[string]any {
	// messages are not all Blocks (a sealed one is a header and its copy), so this one is not the typed door function
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

// AcceptOptions: TakesPairs (the node's choice: false leaves both blocks of a pair arriving together out of Taken,
// listed in Equivocations; true takes them too) and Schemas (hash -> schema block). Validity reads no arrival (core.md,
// section 8).
type AcceptOptions struct {
	TakesPairs bool
	Schemas    map[string]Block
}

// Accept is what a node takes of a push (incoming, blocks off the wire) given what it holds.
func Accept(incoming, held []Block, o AcceptOptions) Accepted {
	r := doorAccept[struct {
		Taken         []string   `json:"taken"`
		Waiting       []Waiting  `json:"waiting"`
		Refused       []Refusal  `json:"refused"`
		Equivocations [][]string `json:"equivocations"`
	}](incoming, held, map[string]any{"takes_pairs": o.TakesPairs}, blockList(o.Schemas))
	byHash := map[string]Block{}
	for _, b := range incoming {
		byHash[b.id()] = b
	}
	out := Accepted{Taken: []Block{}, Waiting: plural(r.Waiting), Refused: plural(r.Refused), Equivocations: plural(r.Equivocations)}
	// the core names what it took by the id it computed, in the suite of the key that signed it (core.md, section 2): a key's
	// first block after a move to a suite of another hash has an id its bytes alone do not show, so a block is found by that id too
	all := append(append([]Block{}, held...), incoming...)
	for _, h := range r.Taken {
		b, found := byHash[h]
		if !found {
			for _, one := range incoming {
				if doorIdOf(one, all) == h {
					b, found = one, true
					b.Hash = h
					break
				}
			}
		}
		out.Taken = append(out.Taken, b)
	}
	return out
}

// AcceptSealed is what a node takes of the sealed blocks of a push: the core checks each public header (a key of its author that
// speaks for it opens its signature; the same key's next seq; no rival) once the block it names in prev is held. incoming are
// sealed messages { header, header_signature, ... }; held whole blocks, sealed messages or their headers. Taken are the hashes.
func AcceptSealed(incoming, held []Block, takesPairs bool) map[string]any {
	return doorAcceptSealed[map[string]any](incoming, held, map[string]any{"takes_pairs": takesPairs})
}

// WaitedTooLong is whether a waiting block has waited past the node's own time to live since it arrived.
func WaitedTooLong(since, now string, ttl time.Duration) bool {
	return doorWaitedTooLong(since, now, ttl.Milliseconds())
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
	return doorPushAnswer[map[string]any](parts, node, privateKey, suiteArg(suite))
}

// AdmissionRefusals is what a node's admission and consent rules refuse of a block for a person: not_admitted,
// not_human. admission is the rule's state, or nil for no rule (stated, not filled in); strangersToday counts strangers
// already taken today.
func AdmissionRefusals(b Block, receiver string, blocks []Block, admission map[string]any, strangersToday int) []Finding {
	var rule any
	if admission != nil {
		rule = admission
	}
	return doorAdmissionRefusals(b, receiver, blocks, rule, int64(strangersToday))
}

// ResidencyRefusals is a block that stays in regions its node does not hold in (profiles/residency.md).
func ResidencyRefusals(b Block, holdsIn []string) []Finding {
	return doorResidencyRefusals(b, holdsIn)
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
	endpoints := d.Endpoints
	if endpoints == nil {
		endpoints = map[string]string{}
	}
	return doorWellKnown[map[string]any](d.Node, d.Holds, d.SpeaksFor, d.Admission, endpoints)
}

// Announcement is a local announcement (mDNS / DNS-SD or a short-range link): { protocol, version, node, endpoints }.
func Announcement(doc map[string]any) map[string]any {
	return doorAnnouncement[map[string]any](doc)
}

// WellKnownErrors is what is wrong with a `.well-known/foodblock` document, in plain words.
func WellKnownErrors(doc map[string]any) []string {
	return doorWellKnownErrors(doc)
}

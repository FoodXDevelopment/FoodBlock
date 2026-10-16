package foodblock

import "sort"

// The folds and views (modules/folds.md): thin calls into the Rust core.

// MoneyTotal is an amount of money in minor units.
type MoneyTotal struct {
	Minor    int64 `json:"minor"`
	Currency any   `json:"currency"`
}

// Taker is one taker of an offer open to many: who, their request, the offerer's allocation, the quantity.
type Taker struct {
	Who        string `json:"who"`
	Request    string `json:"request"`
	Allocation string `json:"allocation"`
	Quantity   any    `json:"quantity"`
}

// LineState is one line of a promise: how much is needed and how much counted transfers moved.
type LineState struct {
	ID     any `json:"id"`
	Needed any `json:"needed"`
	Moved  any `json:"moved"`
}

// Stage is where a promise stands: offered, asked, expired, declined, stopped, accepted, underway, done or reversed.
// Every name the spec gives is always there (§11, What each fold returns): a field that does not apply is null, or an
// empty list.
type Stage struct {
	Stage    string         `json:"stage"`
	Stop     any            `json:"stop"`
	From     any            `json:"from"`
	Offer    string         `json:"offer"`
	Accept   any            `json:"accept"`
	Sides    map[string]any `json:"sides"`
	Quantity any            `json:"quantity"`
	Takers   []Taker        `json:"takers"`
	Forks    []string       `json:"forks"`
	Lines    []LineState    `json:"lines"`
	Total    *MoneyTotal    `json:"total"`
	Paid     map[string]any `json:"paid"`
	Stopped  []string       `json:"stopped"`
}

// StageOptions: Confirmers (ids whose confirms count a transfer, beside the schema's grounds).
type StageOptions struct {
	Confirmers []string
}

// PromiseStage is a promise's stage, from its first promise and every block in its deal. No clock.
func PromiseStage(firstBlock Block, blocks []Block, options ...StageOptions) Stage {
	var o StageOptions
	if len(options) > 0 {
		o = options[0]
	}
	return must[Stage]("promise_stage", firstBlock, plural(blocks), map[string]any{"confirmers": plural(o.Confirmers)})
}

// PromiseView is the same answer with stage `expired` once the reader's now passes `expires` and nothing binds.
func PromiseView(firstBlock Block, blocks []Block, now string, options ...StageOptions) Stage {
	var o StageOptions
	if len(options) > 0 {
		o = options[0]
	}
	return must[Stage]("promise_view", firstBlock, plural(blocks), map[string]any{"now": nilIfEmpty(now), "confirmers": plural(o.Confirmers)})
}

// Member is one member of a circle: the roles they hold, the grant that made them a member, and counted_to (null
// for a current member).
type Member struct {
	Roles     []string `json:"roles"`
	Grant     string   `json:"grant"`
	CountedTo any      `json:"counted_to"`
}

// CircleState is a circle's members and roles: its founder, its members, and who was removed (each with their last
// counted block, or "").
type CircleState struct {
	Founder string             `json:"founder"`
	Members map[string]*Member `json:"members"`
	Removed map[string]string  `json:"removed"`
}

// MemberIDs are the members' ids, sorted.
func (s *CircleState) MemberIDs() []string {
	out := []string{}
	if s == nil {
		return out
	}
	for who := range s.Members {
		out = append(out, who)
	}
	sort.Strings(out)
	return out
}

// CircleStateOf is a circle's members and roles from its member grants, in causal order; nil when the circle is not
// held. within: fold only that block's causal past.
func CircleStateOf(circle string, blocks []Block, within *Block) *CircleState {
	var w any
	if within != nil {
		w = *within
	}
	state, err := ask[*CircleState]("circle_state", circle, plural(blocks), w)
	if err != nil {
		return nil
	}
	return state
}

// HoldersOf are the members who hold a role, sorted.
func HoldersOf(state *CircleState, role string) []string {
	out := []string{}
	if state == nil {
		return out
	}
	for who, m := range state.Members {
		for _, r := range m.Roles {
			if r == role {
				out = append(out, who)
				break
			}
		}
	}
	sort.Strings(out)
	return out
}

// MayActAs is whether a block may be signed as a circle.
func MayActAs(b Block, circle string, blocks []Block, role string) bool {
	var r any
	if role != "" {
		r = role
	}
	return must[bool]("may_act_as", b, circle, plural(blocks), r)
}

// MembersThen is who a circle (or `circle#role`) in a block's audience means.
func MembersThen(b Block, recipient string, blocks []Block) []string {
	return plural(must[[]string]("members_then", b, recipient, plural(blocks)))
}

// Ownership is who owns an instance ("" when it went to an open receiver), the counted transfers, and a conflict
// (two transfers that do not see each other) or nil.
type Ownership struct {
	Owner     string
	Transfers []string
	Conflict  []string
}

// OwnershipOf is who owns an instance.
func OwnershipOf(instance Block, blocks []Block) Ownership {
	o := must[struct {
		Owner     *string  `json:"owner"`
		Transfers []string `json:"transfers"`
		Conflict  []string `json:"conflict"`
	}]("ownership", instance, plural(blocks))
	out := Ownership{Transfers: plural(o.Transfers), Conflict: o.Conflict}
	if o.Owner != nil {
		out.Owner = *o.Owner
	}
	return out
}

// OwnerOf is the owner of an instance ("" when it went to an open receiver).
func OwnerOf(instance Block, blocks []Block) string { return OwnershipOf(instance, blocks).Owner }

// WhereNow is where a thing is now.
func WhereNow(thing Block, blocks []Block) []string {
	return plural(must[[]string]("where_now", thing, plural(blocks)))
}

// ReceiverOf is who receives a promise ("" when none).
func ReceiverOf(promise Block, blocks []Block) string {
	return must[string]("receiver_of", promise, plural(blocks))
}

// OrdererOf is the orderer a record names (state.orderer), or nil.
func OrdererOf(record Block) any { return must[any]("orderer_of", record) }

// Consent is a person's live word about a sender (or none): { word, block }. The optional under is the grant the sender's
// block acts under: a word about its grantor is a word about the sender (consent follows the principal).
func Consent(person, sender string, blocks []Block, under ...string) map[string]any {
	grant := ""
	if len(under) > 0 {
		grant = under[0]
	}
	return must[map[string]any]("consent", person, nilIfEmpty(sender), plural(blocks), nilIfEmpty(grant))
}

// LiveGrant is the grant, among grants, that makes an act live at the reader's now (nil when none).
func LiveGrant(act Block, grants []Block, now string) any {
	return must[any]("live_grant", act, plural(grants), now)
}

// WithdrawalSeen is whether a withdrawal was seen before a block, on the reader's arrival log.
func WithdrawalSeen(withdrawal, b Block, blocks []Block, arrivedAt ArrivedAt) any {
	return must[any]("withdrawal_seen", withdrawal, b, plural(blocks), arrivals(arrivedAt, append(append([]Block{}, blocks...), withdrawal, b)))
}

// Due is when a promise falls due, on the reader's arrival log (of the blocks it names).
func Due(promise Block, arrivedAt ArrivedAt, named []Block) any {
	return must[any]("due", promise, arrivals(arrivedAt, append([]Block{promise}, named...)))
}

// RecoveryReach lists the voided blocks a recovery rotation's reach protects.
func RecoveryReach(rotation Block, blocks []Block, arrivedAt ArrivedAt) any {
	return must[any]("recovery_reach", rotation, plural(blocks), arrivals(arrivedAt, append(append([]Block{}, blocks...), rotation)))
}

// Successor is where a successor grant's trigger stands.
type Successor struct {
	Events    []string `json:"events"`
	Cancelled []string `json:"cancelled"`
	Since     any      `json:"since"`
	Fires     any      `json:"fires"`
	Fired     bool     `json:"fired"`
}

// SuccessorView is where a successor grant's trigger stands on the reader's own clock (now) and arrival log.
func SuccessorView(grant Block, blocks []Block, now string, arrivedAt ArrivedAt) Successor {
	var n any
	if now != "" {
		n = now
	}
	return must[Successor]("successor_view", grant, plural(blocks), n, arrivals(arrivedAt, blocks))
}

// CircleKey is a circle's encryption key now: its epoch (0 is the key in the circle's actor), the open keys and the
// grants that hold them.
type CircleKey struct {
	Epoch  int64    `json:"epoch"`
	Keys   []string `json:"keys"`
	Grants []string `json:"grants"`
}

// CircleKeyOf reads the rekeys of a circle.
func CircleKeyOf(circle string, blocks []Block) CircleKey {
	return must[CircleKey]("circle_key", circle, plural(blocks))
}

// CountedIn is whether a counter's count is in a result for a commitment.
func CountedIn(result Block, commitment, counter string) bool {
	return must[bool]("counted_in", result, commitment, counter)
}

package foodblock

import (
	"math"
	"math/big"
	"sort"
	"strings"
)

// The folds (protocol.md §11): a set of blocks read into one answer, the same on every node from the same blocks.
// Every block is first read as 1.6 through aliases.json. No step reads another author's clock or breaks a tie on
// authority by hash; `now` is only the reader's own clock, for views (expired, until).

func readAll(blocks []Block) *index {
	ix := &index{m: map[string]Block{}}
	for _, b := range blocks {
		ix.set(ReadAs(b))
	}
	return ix
}

func readIndex(byHash *index) *index { return readAll(byHash.values()) }

func refStr(b Block, key string) string { return str(b.Refs[key]) }

// ---- A promise's stage ----

// speaksAs: a side the block names as its author or `as`, or a side whose live grant it acts under.
func speaksAs(b *Block, side string, byHash *index, now string) bool {
	if side == "" || b == nil {
		return false
	}
	if same(b.Refs["author"], side) || same(b.Refs["as"], side) {
		return true
	}
	grant, ok := byHash.get(refStr(*b, "under"))
	return ok && grant.Type == "grant" && same(grant.Refs["author"], side) && (!truthy(grant.Refs["to"]) || same(grant.Refs["to"], b.Refs["author"])) && isLive(grant, byHash, now)
}

func amountIn(amount any, unit any) (float64, bool) {
	m := obj(amount)
	if m == nil || !equalScalar(m["unit"], unit) && !(m["unit"] == nil && unit == nil) {
		return 0, false
	}
	return jsNumber(m["value"]), true
}

// MoneyTotal is an amount of money in minor units.
type MoneyTotal struct {
	Minor    int64  `json:"minor"`
	Currency string `json:"currency"`
}

// fraction is a decimal string as an exact fraction of whole numbers: "1.25" is 125 / 100.
func fraction(text string) (n, d *big.Int, ok bool) {
	whole, part, _ := strings.Cut(text, ".")
	n, ok = new(big.Int).SetString(whole+part, 10)
	return n, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(len(part))), nil), ok
}

// roundHalfUp is n / d rounded to the nearest whole number, halves up (toward +infinity), exactly: floor((2n + d) / 2d).
func roundHalfUp(n, d *big.Int) *big.Int {
	if d.Sign() < 0 {
		n, d = new(big.Int).Neg(n), new(big.Int).Neg(d)
	}
	twice := new(big.Int).Add(new(big.Int).Mul(big.NewInt(2), n), d)
	den := new(big.Int).Mul(big.NewInt(2), d)
	return new(big.Int).Div(twice, den) // Euclidean: with den > 0, the floor
}

// totalOf is the total a price comes to for a quantity: money; money per unit, money.minor times the quantity over
// per, rounded to the nearest minor unit, halves up (§6); or none when it is a share.
func totalOf(price, quantity any) *MoneyTotal {
	p := obj(price)
	if p == nil {
		return nil
	}
	if minor, ok := intOf(p["minor"]); ok {
		return &MoneyTotal{minor, str(p["currency"])}
	}
	per, money := obj(p["per"]), obj(p["money"])
	if per != nil && money != nil {
		q := obj(quantity)
		minor, whole := intOf(money["minor"])
		if q == nil || !equalScalar(q["unit"], per["unit"]) || !whole {
			return nil
		}
		qn, qd, ok := fraction(str(q["value"]))
		pn, pd, ok2 := fraction(str(per["value"]))
		if !ok || !ok2 || pn.Sign() == 0 {
			return nil
		}
		n := new(big.Int).Mul(new(big.Int).Mul(big.NewInt(minor), qn), pd)
		return &MoneyTotal{roundHalfUp(n, new(big.Int).Mul(qd, pn)).Int64(), str(money["currency"])}
	}
	return nil
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

// StageOptions: Now (the reader's clock, for expired), Confirmers (ids whose confirms count a transfer, beside the
// schema's grounds).
type StageOptions struct {
	Now        string
	Confirmers []string
}

// PromiseStage is a promise's stage, from its first promise and every block in its deal.
func PromiseStage(firstBlock Block, blocks []Block, options ...StageOptions) Stage {
	var o StageOptions
	if len(options) > 0 {
		o = options[0]
	}
	now := o.Now
	byHash := readAll(append([]Block{firstBlock}, blocks...))
	first, _ := byHash.get(firstBlock.id())
	// The deal: every block naming the first promise in `for`, or answering a block in it (history only where it counts).
	deal := []string{first.Hash}
	inSet := map[string]bool{first.Hash: true}
	for grew := true; grew; {
		grew = false
		for _, b := range byHash.values() {
			if inSet[b.Hash] || !counts(b, byHash) {
				continue
			}
			joins := contains(list(b.Refs["for"]), first.Hash)
			for _, h := range append(list(b.Refs["answers"]), list(b.Refs["updates"])...) {
				joins = joins || inSet[h]
			}
			if joins {
				deal, inSet[b.Hash], grew = append(deal, b.Hash), true, true
			}
		}
	}
	from, to := refStr(first, "from"), refStr(first, "to")
	offererSide := "to"
	if speaksAs(&first, from, byHash, now) {
		offererSide = "from"
	}
	otherSide := "from"
	if offererSide == "from" {
		otherSide = "to"
	}
	offerer := refStr(first, offererSide)
	open := !truthy(first.Refs[otherSide])
	sideOf := func(b Block) string {
		if speaksAs(&b, from, byHash, now) {
			return "from"
		}
		if speaksAs(&b, to, byHash, now) {
			return "to"
		}
		return ""
	}
	byOfferer := func(b Block) bool { return speaksAs(&b, offerer, byHash, now) }
	// 1. Only blocks a side signed (an open side is anyone, until an accept binds).
	dealBlocks := []Block{}
	for _, h := range deal {
		b, _ := byHash.get(h)
		dealBlocks = append(dealBlocks, b)
	}
	inDeal := []Block{}
	for _, b := range CausalOrder(dealBlocks) {
		if b.Hash != first.Hash && (sideOf(b) != "" || (open && !byOfferer(b))) {
			inDeal = append(inDeal, b)
		}
	}
	status := func(b Block, word string) bool { return b.State["status"] == word }
	answersOf := func(h string, word string) []Block {
		out := []Block{}
		for _, b := range inDeal {
			if contains(list(b.Refs["answers"]), h) && ((word == "" && b.State["status"] == nil) || (word != "" && status(b, word))) {
				out = append(out, b)
			}
		}
		return out
	}
	// 2. The live offers: the first promise, or the latest counters between the same two sides.
	live := []Block{first}
	if !open {
		for {
			next := []Block{}
			for _, offer := range live {
				for _, counter := range answersOf(offer.Hash, "") {
					if counter.Type == "promise" && sideOf(counter) != "" && sideOf(counter) != sideOf(offer) {
						next = append(next, counter)
					}
				}
			}
			if len(next) == 0 {
				break
			}
			live = next
		}
	}
	// 6. A binding accept.
	declinedByOfferer := func(accept Block) bool {
		for _, b := range answersOf(accept.Hash, "declined") {
			if byOfferer(b) {
				return true
			}
		}
		return false
	}
	takers, forks := []Taker{}, []string{}
	var accept *Block
	// To yourself: a promise whose from and to both name its author is accepted when made.
	toSelf := from != "" && from == to && refStr(first, "author") == from
	if toSelf {
		self := first
		accept = &self
	} else if !open {
		for _, offer := range live {
			for _, b := range answersOf(offer.Hash, "accepted") {
				if accept == nil && sideOf(b) != "" && sideOf(b) != sideOf(offer) && !declinedByOfferer(b) {
					b := b
					accept = &b
				}
			}
		}
	} else {
		requests := []Block{}
		for _, b := range answersOf(first.Hash, "accepted") {
			if !byOfferer(b) {
				requests = append(requests, b)
			}
		}
		requestFor := func(allocation Block) *Block {
			for _, r := range requests {
				if contains(list(allocation.Refs["answers"]), r.Hash) {
					r := r
					return &r
				}
			}
			return nil
		}
		allocations := []Block{}
		for _, b := range inDeal {
			if byOfferer(b) && status(b, "accepted") && requestFor(b) != nil {
				allocations = append(allocations, b)
			}
		}
		terms := obj(first.State["terms"])
		capacity := obj(obj(terms["quantity"])["max"])
		if capacity == nil {
			capacity = obj(terms["quantity"])
		}
		// The sequencer's allocations form one chain, each seeing the one before. Two that do not see each other prove a
		// lie: neither counts, nor anything after them; only what came before the pair binds.
		allocated := 0.0
		for _, allocation := range CausalOrder(allocations) {
			crossed := -1
			for i, taker := range takers {
				if !sees(allocation, taker.Allocation, byHash) {
					crossed = i
					break
				}
			}
			if crossed != -1 {
				forks = append(forks, sorted([]string{takers[crossed].Allocation, allocation.Hash})...)
				takers = takers[:crossed]
				break
			}
			request := requestFor(allocation)
			quantity := obj(allocation.State["terms"])["quantity"]
			if quantity == nil {
				quantity = obj(request.State["terms"])["quantity"]
			}
			if capacity != nil && quantity != nil {
				if q, ok := amountIn(quantity, capacity["unit"]); ok {
					// What is bound from an offer never exceeds what is offered (invariant 11).
					if allocated+q > jsNumber(capacity["value"]) {
						continue
					}
					allocated += q
				}
			}
			takers = append(takers, Taker{refStr(*request, "author"), request.Hash, allocation.Hash, quantity})
		}
		if len(takers) > 0 {
			a, _ := byHash.get(takers[0].Allocation)
			accept = &a
		}
	}
	offer := live[0]
	if accept != nil && !open && !toSelf {
		offer, _ = byHash.get(list(accept.Refs["answers"])[0])
	}
	sides := map[string]any{"from": nilIfEmpty(from), "to": nilIfEmpty(to)}
	result := func(stage string) Stage {
		var acceptHash any
		if accept != nil {
			acceptHash = accept.Hash
		}
		return Stage{Stage: stage, Offer: offer.Hash, Accept: acceptHash, Sides: sides, Takers: takers, Forks: forks, Lines: []LineState{}, Stopped: []string{}}
	}
	// 3. Stopped before, unless an accept binds over it.
	stopBlocks, before := []Block{}, []Block{}
	for _, b := range inDeal {
		if status(b, "stopped") {
			stopBlocks = append(stopBlocks, b)
			if b.State["stop"] == "before" {
				before = append(before, b)
			}
		}
	}
	if len(before) > 0 {
		over := accept == nil
		for _, stop := range before {
			over = over || sees(*accept, stop.Hash, byHash)
		}
		if over {
			r := result("stopped")
			r.Stop = "before"
			return r
		}
	}
	// 4. Declined by the other side.
	if accept == nil && !open {
		for _, one := range live {
			for _, b := range answersOf(one.Hash, "declined") {
				if sideOf(b) != "" && sideOf(b) != sideOf(one) {
					return result("declined")
				}
			}
		}
	}
	// 5. No binding accept: offered or asked; expired once the reader's clock passes `expires` (a view).
	if accept == nil {
		expires := str(obj(live[0].State["terms"])["expires"])
		if now != "" && expires != "" && now > expires {
			return result("expired")
		}
		if offererSide == "from" {
			return result("offered")
		}
		return result("asked")
	}
	// 7, 8. Settling.
	terms := obj(offer.State["terms"])
	if terms == nil {
		terms = map[string]any{}
	}
	chosen := obj(accept.State["terms"])["quantity"]
	if chosen == nil && len(takers) > 0 {
		chosen = takers[0].Quantity
	}
	if chosen == nil {
		chosen = terms["quantity"]
	}
	receiver := func(side string) string {
		if s := refStr(first, side); s != "" {
			return s
		}
		if side == otherSide {
			if len(takers) > 0 && takers[0].Who != "" {
				return takers[0].Who
			}
			return refStr(*accept, "author")
		}
		return ""
	}
	toSide, fromSide := receiver("to"), receiver("from")
	// A confirmer is one given, or one the deal's schema names in its grounds (an id, or circle#role: its holders).
	named := []string{}
	schema, _ := byHash.get(refStr(first, "schema"))
	for _, who := range append(append([]string{}, o.Confirmers...), list(obj(schema.State["grounds"])["confirmers"])...) {
		parts := strings.SplitN(who, "#", 2)
		if len(parts) == 2 {
			named = append(named, HoldersOf(circleState(parts[0], byHash, nil), parts[1])...)
		} else {
			named = append(named, who)
		}
	}
	counted := func(b Block, receiverID string) bool {
		for _, answer := range answersOf(b.Hash, "accepted") {
			if same(answer.Refs["author"], receiverID) || same(answer.Refs["as"], receiverID) {
				return true
			}
		}
		for _, other := range byHash.values() {
			if contains(list(other.Refs["confirms"]), b.Hash) && contains(named, refStr(other, "author")) {
				return true
			}
		}
		return false
	}
	goods, pays, refunds, work, acceptedWork := []Block{}, []Block{}, []Block{}, []Block{}, []Block{}
	for _, b := range inDeal {
		if b.Type == "transfer" && b.State["status"] == nil {
			money := truthy(b.State["money"])
			if !money && (((contains(list(b.Refs["to_owner"]), toSide) || contains(list(b.Refs["to_holder"]), toSide)) && counted(b, toSide)) ||
				(b.State["count"] != nil && !truthy(b.Refs["to_owner"]) && byOfferer(b) && offererSide == "from")) {
				goods = append(goods, b)
			}
			if money && contains(list(b.Refs["to_owner"]), fromSide) && counted(b, fromSide) {
				pays = append(pays, b)
			}
			if money && contains(list(b.Refs["to_owner"]), toSide) && counted(b, toSide) {
				refunds = append(refunds, b)
			}
		}
		if (b.Type == "transform" || (b.Type == "observe" && b.State["kind"] == "work")) && sideOf(b) != "" && b.State["status"] == nil {
			work = append(work, b)
			if counted(b, toSide) {
				acceptedWork = append(acceptedWork, b)
			}
		}
	}
	moneyFor := func(b Block) int64 {
		if parts, ok := arr(b.State["split"]); ok {
			var sum int64
			for _, item := range parts {
				part := obj(item)
				if same(part["for"], first.Hash) {
					sum += int64(jsNumber(obj(part["money"])["minor"]))
				}
			}
			return sum
		}
		return int64(jsNumber(obj(b.State["money"])["minor"]))
	}
	var paid, back int64
	for _, b := range pays {
		paid += moneyFor(b)
	}
	for _, b := range refunds {
		back += moneyFor(b)
	}
	// Each line (or the whole) is covered when counted transfers move at least its quantity of `what` to the `to` side.
	type line struct {
		id, what, quantity, price any
	}
	lines := []line{}
	if items, ok := arr(terms["lines"]); ok {
		for _, item := range items {
			l := obj(item)
			lines = append(lines, line{l["id"], l["what"], l["quantity"], l["price"]})
		}
	} else {
		var what any = offer.Refs["what"]
		lines = append(lines, line{nil, what, chosen, terms["price"]})
	}
	type lineState struct {
		id     any
		needed *float64
		moved  float64
		total  *MoneyTotal
	}
	states := []lineState{}
	for _, l := range lines {
		unit := obj(l.quantity)["unit"]
		moved := 0.0
		for _, b := range goods {
			if l.id != nil && !equalScalar(b.State["line"], l.id) {
				continue
			}
			if amount, ok := amountIn(b.State["amount"], unit); ok {
				moved += amount
				continue
			}
			packs, any := 0.0, false
			for _, h := range list(b.Refs["what"]) {
				if thing, ok := byHash.get(h); ok {
					if pack, ok := amountIn(thing.State["pack"], unit); ok {
						packs += pack
						any = true
					}
				}
			}
			if any {
				moved += packs
			} else {
				moved = math.Inf(1)
			}
		}
		var needed *float64
		if q := obj(l.quantity); q != nil {
			n := jsNumber(q["value"])
			needed = &n
		}
		states = append(states, lineState{l.id, needed, moved, totalOf(l.price, l.quantity)})
	}
	var total *MoneyTotal
	for _, s := range states {
		if s.total != nil {
			if total == nil {
				total = &MoneyTotal{0, s.total.Currency}
			}
			total.Minor += s.total.Minor
		}
	}
	goodsDone := true
	for i, l := range lines {
		if !truthy(l.what) {
			continue
		}
		if states[i].needed == nil {
			goodsDone = goodsDone && states[i].moved > 0
		} else {
			goodsDone = goodsDone && states[i].moved >= *states[i].needed
		}
	}
	workDone := len(acceptedWork) > 0
	if q := obj(terms["quantity"]); q != nil && !truthy(offer.Refs["what"]) {
		sum := 0.0
		for _, b := range acceptedWork {
			if a, ok := amountIn(b.State["amount"], q["unit"]); ok {
				sum += a
			}
		}
		workDone = sum >= jsNumber(q["value"])
	}
	done := goodsDone && (total == nil || paid >= total.Minor) && (truthy(offer.Refs["what"]) || terms["lines"] != nil || workDone)
	occurrences := []string{}
	for _, b := range stopBlocks {
		occurrences = append(occurrences, list(obj(b.State["stop"])["occurrences"])...)
	}
	r := result("")
	r.Quantity = chosen
	r.Total = total
	// Paid carries a currency even with no total: the payments'.
	if total != nil || paid != 0 {
		r.Paid = map[string]any{"minor": paid}
		if total != nil {
			r.Paid["currency"] = total.Currency
		} else if len(pays) > 0 {
			r.Paid["currency"] = obj(pays[0].State["money"])["currency"]
		}
	}
	for _, s := range states {
		var needed any
		if s.needed != nil {
			needed = *s.needed
		}
		var moved any = s.moved
		if math.IsInf(s.moved, 0) {
			moved = needed
		}
		r.Lines = append(r.Lines, LineState{s.id, needed, moved})
	}
	r.Stopped = sorted(uniq(occurrences))
	// 10. Reversed: a done promise with counted transfers back for it covering what was paid.
	if done && paid > 0 && back >= paid {
		r.Stage = "reversed"
		return r
	}
	// 9. Stopped onward, from that block.
	for _, b := range stopBlocks {
		if b.State["stop"] == "onward" {
			r.Stage, r.Stop, r.From = "stopped", "onward", b.Hash
			return r
		}
	}
	if done {
		r.Stage = "done"
	} else if len(goods) > 0 || len(pays) > 0 || len(work) > 0 {
		r.Stage = "underway"
	} else {
		r.Stage = "accepted"
	}
	return r
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// ---- A circle: membership and roles ----

// Member is one member of a circle: the roles they hold, the grant that made them a member, and last_counted (null
// for a current member).
type Member struct {
	Roles       []string `json:"roles"`
	Grant       string   `json:"grant"`
	LastCounted any      `json:"last_counted"`
}

// CircleState is a circle's members and roles: its founder, its members (in the order they came in), and who was
// removed (each with their last counted block, or "").
type CircleState struct {
	Founder string
	Order   []string
	Members map[string]*Member
	Removed map[string]string
}

func (s *CircleState) setMember(who string, m *Member) {
	if _, ok := s.Members[who]; !ok {
		s.Order = append(s.Order, who)
	}
	s.Members[who] = m
}

func (s *CircleState) deleteMember(who string) {
	delete(s.Members, who)
	for i, w := range s.Order {
		if w == who {
			s.Order = append(s.Order[:i:i], s.Order[i+1:]...)
			break
		}
	}
}

// MemberIDs are the members' ids, sorted.
func (s *CircleState) MemberIDs() []string {
	if s == nil {
		return []string{}
	}
	out := []string{}
	for who := range s.Members {
		out = append(out, who)
	}
	return sorted(out)
}

type circleTarget struct {
	to     string
	roles  []string
	update bool
	grant  string
	added  []string
}

func circleState(circle string, blocks *index, within *Block) *CircleState {
	byHash := readIndex(blocks)
	root, ok := byHash.get(circle)
	if !ok {
		return nil
	}
	id, founder := root.Hash, refStr(root, "author")
	related := []Block{}
	for _, b := range byHash.values() {
		// Every member grant and answer naming the circle that counts: with seq, or as its author's history.
		if b.Type == "grant" && b.State["kind"] == "member" && contains(list(b.Refs["subject"]), id) && counts(b, byHash) {
			related = append(related, b)
		}
	}
	needed := removalNeeded
	if n, ok := intOf(obj(root.State["removal"])["needed"]); ok && n != 0 {
		needed = n
	}
	// Whose admin grant is earlier in causal order (the circle itself, the founder's, above all).
	earlier := func(a, b string) bool {
		if a == b || a == "" || b == "" {
			return false
		}
		if a == id {
			return true
		}
		later, ok := byHash.get(b)
		return ok && sees(later, a, byHash)
	}
	isStop := func(b Block) bool {
		return b.State["status"] == "stopped" && len(list(b.Refs["updates"])) > 0 && len(list(b.Refs["answers"])) == 0
	}
	memo := map[string]*CircleState{}
	var fold func(set []Block) *CircleState
	pastFold := func(b Block) *CircleState {
		past := pastOf(b, byHash)
		set := []Block{}
		for _, one := range related {
			if past[one.Hash] {
				set = append(set, one)
			}
		}
		return fold(set)
	}
	// One pass in causal order: each invitation, answer, change and removal applies where it falls, so a member removed
	// and later invited again is in, by the new grant; a grant once ended stays ended.
	fold = func(set []Block) *CircleState {
		key := strings.Join(sorted(hashesOfBlocks(set)), ",")
		if s, ok := memo[key]; ok {
			return s
		}
		state := &CircleState{Founder: founder, Members: map[string]*Member{}, Removed: map[string]string{}}
		state.setMember(founder, &Member{Roles: []string{"admin"}, Grant: id})
		memo[key] = state
		invitations, updates := map[string]*circleTarget{}, map[string]*circleTarget{}
		ended, agreed, held := map[string]bool{}, map[string][]string{}, map[string]string{founder: id}
		admin := func(b Block) bool {
			if !same(b.Refs["as"], id) {
				return false
			}
			m := pastFold(b).Members[refStr(b, "author")]
			return m != nil && contains(m.Roles, "admin")
		}
		stops := []Block{}
		for _, b := range set {
			if isStop(b) && admin(b) {
				stops = append(stops, b)
			}
		}
		remove := func(who string, lastCounted any) {
			state.Removed[who] = str(lastCounted)
			state.deleteMember(who)
		}
		for _, b := range CausalOrder(set) {
			answered, updated := list(b.Refs["answers"]), list(b.Refs["updates"])
			switch {
			case len(answered) == 0 && len(updated) == 0 && b.State["status"] == nil:
				if admin(b) {
					invitations[b.Hash] = &circleTarget{to: refStr(b, "to"), roles: list(b.State["roles"])}
				}
			case len(answered) > 0:
				grant := ""
				for _, h := range answered {
					if invitations[h] != nil || updates[h] != nil {
						grant = h
						break
					}
				}
				if grant == "" {
					continue
				}
				target := invitations[grant]
				if target == nil {
					target = updates[grant]
				}
				who := refStr(b, "author")
				if target.to != "" && target.to != who {
					continue
				}
				current := state.Members[who]
				if b.State["status"] == "accepted" {
					if target.update {
						if current != nil && current.Grant == target.grant && !ended[target.grant] {
							current.Roles = uniq(append(current.Roles, target.added...))
						}
					} else if !ended[grant] {
						state.setMember(who, &Member{Roles: append([]string{}, target.roles...), Grant: grant})
						held[who] = grant
						delete(state.Removed, who)
					}
				} else if b.State["status"] == "stopped" || b.State["status"] == "declined" {
					ofGrant := grant
					if target.update {
						ofGrant = target.grant
					}
					if who != founder && current != nil && current.Grant == ofGrant {
						ended[current.Grant] = true
						remove(who, b.State["last_counted"])
					}
				}
			case len(updated) > 0 && admin(b):
				grant := ""
				for _, h := range updated {
					if invitations[h] != nil {
						grant = h
						break
					}
				}
				if grant == "" || ended[grant] {
					continue
				}
				who := ""
				for _, w := range state.Order {
					if state.Members[w].Grant == grant {
						who = w
						break
					}
				}
				if isStop(b) {
					// An invitation not yet answered simply ends.
					if who == "" {
						ended[grant] = true
						continue
					}
					if who == founder {
						continue
					}
					// Removing an admin takes `state.removal.needed` other admins (default from protocol.json); a member, one admin.
					remover := refStr(b, "author")
					if !contains(agreed[grant], remover) {
						agreed[grant] = append(agreed[grant], remover)
					}
					others := int64(0)
					for _, by := range agreed[grant] {
						if by != who {
							others++
						}
					}
					if contains(state.Members[who].Roles, "admin") && others < needed {
						continue
					}
					// Crossing removals of admins: the one whose admin grant is earlier wins; if neither is, both stand.
					rival := false
					for _, other := range stops {
						if refStr(other, "author") == who && held[remover] != "" && contains(list(other.Refs["updates"]), held[remover]) && !sees(other, b.Hash, byHash) && !sees(b, other.Hash, byHash) {
							rival = true
							break
						}
					}
					if rival && remover != founder && earlier(held[who], held[remover]) {
						continue
					}
					ended[grant] = true
					remove(who, b.State["last_counted"])
				} else if b.State["roles"] != nil && who != "" {
					beforeRoles, afterRoles := state.Members[who].Roles, list(b.State["roles"])
					kept, added := []string{}, []string{}
					for _, r := range beforeRoles {
						if contains(afterRoles, r) {
							kept = append(kept, r)
						}
					}
					for _, r := range afterRoles {
						if !contains(beforeRoles, r) {
							added = append(added, r)
						}
					}
					state.Members[who].Roles = kept
					updates[b.Hash] = &circleTarget{update: true, grant: grant, to: who, added: added}
				}
			}
		}
		return state
	}
	if within != nil {
		b, ok := byHash.get(within.id())
		if !ok {
			b = *within
		}
		return pastFold(b)
	}
	return fold(related)
}

// CircleStateOf folds a circle's member grants: who is a member, with which roles, and who was removed. within (may
// be nil) folds only that block's causal past.
func CircleStateOf(circle string, blocks []Block, within *Block) *CircleState {
	return circleState(circle, indexOf(blocks), within)
}

// HoldersOf are the holders of a role in a circle, sorted.
func HoldersOf(state *CircleState, role string) []string {
	out := []string{}
	if state == nil {
		return out
	}
	for who, m := range state.Members {
		if contains(m.Roles, role) {
			out = append(out, who)
		}
	}
	return sorted(out)
}

func mayActAs(b Block, circle string, byHash *index, role string) bool {
	state := circleState(circle, byHash, &b)
	if state == nil {
		return false
	}
	root, _ := byHash.get(circle)
	root = ReadAs(root)
	member := state.Members[refStr(b, "author")]
	roles := []string{role}
	if role == "" {
		roles = signersDefault
		if root.State["signers"] != nil {
			roles = list(root.State["signers"])
		}
	}
	if member == nil {
		return false
	}
	for _, held := range member.Roles {
		if contains(roles, held) {
			return true
		}
	}
	return false
}

// MayActAs is whether a block may be signed as a circle: its author holds, in the fold of its causal past, `role` if
// one is named, else a role the circle actor lists in `state.signers` (default from protocol.json).
func MayActAs(b Block, circle string, blocks []Block, role string) bool {
	return mayActAs(b, circle, indexOf(blocks), role)
}

// MembersThen is who a circle (or `circle#role`) in a block's audience means: the members (or holders) in the fold of
// the circle's grants within that block's causal past.
func MembersThen(b Block, recipient string, blocks []Block) []string {
	parts := strings.SplitN(recipient, "#", 2)
	byHash := indexOf(blocks)
	if !byHash.has(parts[0]) {
		return []string{}
	}
	state := circleState(parts[0], byHash, &b)
	if len(parts) == 2 {
		return HoldersOf(state, parts[1])
	}
	return state.MemberIDs()
}

// ---- Things: who owns an instance, and where it is now ----

// Ownership is who owns an instance ("" when it went to an open receiver), the counted transfers, and a conflict
// (two transfers that do not see each other) or nil.
type Ownership struct {
	Owner     string
	Transfers []string
	Conflict  []string
}

func ownership(instance Block, blocks *index) Ownership {
	byHash := readAll(append([]Block{instance}, blocks.values()...))
	thing, _ := byHash.get(instance.id())
	owner, transfers := refStr(thing, "author"), []string{}
	var last *Block
	accepted := func(transfer Block) bool {
		for _, b := range byHash.values() {
			if b.Type == "transfer" && b.State["status"] == "accepted" && counts(b, byHash) && contains(list(b.Refs["answers"]), transfer.Hash) && contains(list(transfer.Refs["to_owner"]), refStr(b, "author")) {
				return true
			}
		}
		return false
	}
	candidates := []Block{}
	for _, b := range byHash.values() {
		if b.Type == "transfer" && counts(b, byHash) && b.State["status"] == nil && contains(list(b.Refs["what"]), thing.Hash) && b.State["amount"] == nil {
			if (truthy(b.Refs["to_owner"]) && accepted(b)) || (!truthy(b.Refs["to_owner"]) && b.State["count"] != nil) {
				candidates = append(candidates, b)
			}
		}
	}
	for {
		open := []Block{}
		for _, b := range candidates {
			if !contains(transfers, b.Hash) && (same(b.Refs["author"], owner) || same(b.Refs["as"], owner)) && (last == nil || sees(b, last.Hash, byHash)) {
				open = append(open, b)
			}
		}
		next := earliest(open, byHash)
		if len(next) > 1 {
			return Ownership{owner, transfers, sorted(hashesOfBlocks(next))}
		}
		if len(next) == 0 {
			return Ownership{owner, transfers, nil}
		}
		b := next[0]
		last = &b
		transfers = append(transfers, b.Hash)
		owner = ""
		if owners := list(b.Refs["to_owner"]); len(owners) > 0 {
			owner = owners[0]
		}
		if owner == "" {
			return Ownership{owner, transfers, nil}
		}
	}
}

// OwnershipOf is who owns an instance: the `to_owner` of its last counted ownership transfer, else its maker. A
// transfer of ownership counts only if signed by the owner the previous counted transfer named (or the maker, for the
// first), with that transfer in its causal past; to a named receiver, once it answers accepted. A part leaves
// ownership where it is.
func OwnershipOf(instance Block, blocks []Block) Ownership {
	return ownership(instance, indexOf(blocks))
}

// OwnerOf is who owns an instance now.
func OwnerOf(instance Block, blocks []Block) string { return OwnershipOf(instance, blocks).Owner }

// ReceiverOf is who receives a bearer promise (refs.to names a thing): whoever owns it now; otherwise refs.to.
func ReceiverOf(promise Block, blocks []Block) string {
	byHash := indexOf(blocks)
	to := refStr(promise, "to")
	if thing, ok := byHash.get(to); ok && thing.Type == "thing" {
		return ownership(thing, byHash).Owner
	}
	return to
}

func whereNow(thing Block, byHash *index, seen map[string]bool) []string {
	self := thing
	if held, ok := byHash.get(thing.id()); ok {
		self = held
	}
	self = ReadAs(self)
	self.Hash = self.id()
	if seen[self.Hash] {
		return []string{self.Hash}
	}
	seen[self.Hash] = true
	owner := ownership(self, byHash).Owner
	all, read := []Block{}, readIndex(byHash)
	for _, b := range read.values() {
		if b.Type == "transfer" && b.State["status"] == nil && contains(list(b.Refs["what"]), self.Hash) && counts(b, read) {
			all = append(all, b)
		}
	}
	holders := []string{owner}
	for _, b := range all {
		if same(b.Refs["author"], owner) {
			holders = append(holders, list(b.Refs["to_holder"])...)
		}
	}
	moves := []Block{}
	for _, b := range all {
		if truthy(b.Refs["to_place"]) && contains(holders, refStr(b, "author")) {
			moves = append(moves, b)
		}
	}
	places := []string{}
	if len(moves) > 0 {
		for _, b := range HeadsAmong(moves) {
			places = append(places, list(b.Refs["to_place"])...)
		}
		places = uniq(places)
	} else {
		places = list(self.Refs["place"])
	}
	out := []string{}
	for _, place := range places {
		at, ok := byHash.get(place)
		if !ok || ReadAs(at).Type != "thing" {
			out = append(out, place)
			continue
		}
		if further := whereNow(at, byHash, seen); len(further) > 0 {
			out = append(out, further...)
		} else {
			out = append(out, place)
		}
	}
	return sorted(uniq(out))
}

// WhereNow is where a thing is now: the `to_place` of its latest counted move (by its owner, or a holder its owner
// named), else its own refs.place; a place that is a thing is wherever that thing is (stopping at a repeat). Two moves
// that do not see each other give both places. Sorted hashes.
func WhereNow(thing Block, blocks []Block) []string {
	return whereNow(thing, indexOf(blocks), map[string]bool{})
}

// ---- A successor's trigger (§7) ----

// Successor is where a successor grant's trigger stands.
type Successor struct {
	Events    []string `json:"events"`
	Cancelled []string `json:"cancelled"`
	Since     any      `json:"since"`
	Fires     any      `json:"fires"`
	Fired     bool     `json:"fired"`
}

// SuccessorState: the needed witnesses' event observes (each a witness's observe naming the grant in refs.under), less
// those the person (a live key, or the recovery key) defeats before it fires. It fires `wait` after the needed-th event
// arrived on this node (arrivedAt), on the reader's own clock (now); no author's clock is read.
func SuccessorState(grant Block, blocks []Block, now string, arrivedAt ArrivedAt) Successor {
	byHash := indexOf(blocks)
	grant.Hash = grant.id()
	person, witnesses := refStr(grant, "author"), list(grant.State["witnesses"])
	needed, _ := intOf(grant.State["needed"])
	arrived := func(b Block) string {
		if arrivedAt == nil {
			return ""
		}
		return arrivedAt(b.Hash)
	}
	events, defeats := []Block{}, []Block{}
	for _, b := range byHash.values() {
		if b.Type == "observe" && same(b.Refs["under"], grant.Hash) && contains(witnesses, refStr(b, "author")) && counts(b, byHash) {
			events = append(events, b)
		}
		if same(b.Refs["author"], person) && len(list(b.Refs["defeats"])) > 0 && signedByAuthor(b, byHash, nil) {
			defeats = append(defeats, b)
		}
	}
	text := func(s string) string {
		if s == "" {
			return "null"
		}
		return s
	}
	sort.SliceStable(events, func(i, j int) bool { return text(arrived(events[i])) < text(arrived(events[j])) })
	type reading struct {
		cancelled    []string
		standing     []Block
		since, fires string
	}
	read := func(until string) reading {
		r := reading{cancelled: []string{}}
		for _, event := range events {
			cancelled := false
			for _, d := range defeats {
				if contains(list(d.Refs["defeats"]), event.Hash) && (until == "" || arrived(d) == "" || arrived(d) < until) {
					cancelled = true
				}
			}
			if cancelled {
				r.cancelled = append(r.cancelled, event.Hash)
				continue
			}
			already := false
			for _, other := range r.standing {
				already = already || same(other.Refs["author"], event.Refs["author"])
			}
			if !already {
				r.standing = append(r.standing, event)
			}
			if int64(len(r.standing)) == needed && r.since == "" {
				r.since = arrived(event)
				if r.since != "" {
					r.fires = AddDuration(r.since, str(grant.State["wait"]), 1)
				}
			}
		}
		return r
	}
	state := read("")
	for i := 0; i <= len(events); i++ {
		next := read(state.fires)
		if next.fires == state.fires {
			state = next
			break
		}
		state = next
	}
	return Successor{Events: sorted(hashesOfBlocks(state.standing)), Cancelled: sorted(state.cancelled), Since: nilIfEmpty(state.since), Fires: nilIfEmpty(state.fires),
		Fired: state.fires != "" && now != "" && now >= state.fires}
}

// ---- A circle's key, by epoch (§8) ----

// CircleKey is a circle's encryption key now: its epoch (0 is the key in the circle's actor), the open keys and the
// grants that hold them.
type CircleKey struct {
	Epoch  int64    `json:"epoch"`
	Keys   []string `json:"keys"`
	Grants []string `json:"grants"`
}

// CircleKeyOf reads the rekeys: key grants signed as the circle by an admin (in the fold of each grant's causal past),
// each with state.epoch one higher, naming epoch n-1 in after. Two rekeys in one epoch both open; the next settles.
func CircleKeyOf(circle string, blocks []Block) CircleKey {
	byHash := readAll(blocks)
	root, _ := byHash.get(circle)
	rekeys := []Block{}
	for _, b := range byHash.values() {
		if b.Type == "grant" && b.State["kind"] == "key" && same(b.Refs["as"], root.Hash) && isInt(b.State["epoch"]) && truthy(b.State["public_key_encrypt"]) && counts(b, byHash) && mayActAs(b, root.Hash, byHash, "admin") {
			rekeys = append(rekeys, b)
		}
	}
	type openKey struct{ hash, key string }
	var epoch int64
	open := []openKey{{root.Hash, str(root.State["public_key_encrypt"])}}
	for next := int64(1); ; next++ {
		these := []openKey{}
		for _, b := range rekeys {
			e, _ := intOf(b.State["epoch"])
			if e != next {
				continue
			}
			for _, one := range open {
				if contains(list(b.Refs["after"]), one.hash) {
					these = append(these, openKey{b.Hash, str(b.State["public_key_encrypt"])})
					break
				}
			}
		}
		if len(these) == 0 {
			break
		}
		epoch, open = next, these
	}
	keys, grants := []string{}, []string{}
	for _, one := range open {
		keys, grants = append(keys, one.key), append(grants, one.hash)
	}
	return CircleKey{epoch, sorted(keys), sorted(grants)}
}

// ---- A secret ballot (§8) ----

// CountedIn is whether a voter's commitment is among those the named counter signed as counted (`state.counted`).
func CountedIn(result Block, commitment, counter string) bool {
	return same(result.Refs["author"], counter) && contains(list(result.State["counted"]), commitment)
}

// Sequencer is who orders a record: the key its first block names in state.sequencer, else its author.
type Sequencer struct {
	Key    string `json:"key,omitempty"`
	Author string `json:"author,omitempty"`
}

// SequencerOf is a record's sequencer.
func SequencerOf(record Block) Sequencer {
	if k := str(record.State["sequencer"]); k != "" {
		return Sequencer{Key: k}
	}
	return Sequencer{Author: refStr(record, "author")}
}

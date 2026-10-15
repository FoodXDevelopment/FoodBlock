package foodblock

import (
	"regexp"
	"strconv"
	"time"
)

// Authority (protocol.md §7). A grant gives authority to `refs.to` (left out, to anyone), within `state.scope`. A child
// grant (`refs.parent`) is a subset of its parent on every field (invariant 10), and a grant is live only while every
// ancestor is (invariant 9). A grant carries no status: its author ends it by an `updates` with stopped; the receiver
// declines or leaves by an `answers`. Durations count calendar months and years in UTC.

// Duration is an ISO 8601 duration in parts.
type Duration struct {
	Years, Months, Days int
	Ms                  int64
}

var durationParts = regexp.MustCompile(`^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)

// ParseDuration reads an ISO 8601 duration (the protocol's grammar), or false.
func ParseDuration(text string) (Duration, bool) {
	if !grammar["duration"](text) {
		return Duration{}, false
	}
	m := durationParts.FindStringSubmatch(text)
	if m == nil {
		return Duration{}, false
	}
	n := func(s string) int { v, _ := strconv.Atoi(s); return v }
	return Duration{Years: n(m[1]), Months: n(m[2]), Days: n(m[3])*7 + n(m[4]), Ms: int64(n(m[6])*3600+n(m[7])*60+n(m[8])) * 1000}, true
}

func parseTime(text string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339Nano, text)
	return t.UTC(), err == nil
}

func formatTime(t time.Time) string { return t.UTC().Format(timeLayout) }

// AddDuration moves a time by a duration (sign -1 goes back), months and years by the UTC calendar. "" when either is
// not readable.
func AddDuration(at, duration string, sign int) string {
	parts, ok := ParseDuration(duration)
	t, ok2 := parseTime(at)
	if !ok || !ok2 {
		return ""
	}
	moved := time.Date(t.Year()+sign*parts.Years, t.Month()+time.Month(sign*parts.Months), t.Day()+sign*parts.Days, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), time.UTC)
	return formatTime(moved.Add(time.Duration(int64(sign)*parts.Ms) * time.Millisecond))
}

// CompareDurations compares two durations by adding both to one instant (the parent grant's `at`): -1, 0 or 1.
func CompareDurations(a, b, from string) int {
	x, _ := parseTime(AddDuration(from, a, 1))
	y, _ := parseTime(AddDuration(from, b, 1))
	switch {
	case x.Before(y):
		return -1
	case x.After(y):
		return 1
	}
	return 0
}

func containsValue(outer, inner any) bool {
	if inner == nil {
		return true
	}
	if items, ok := arr(inner); ok && !isStr(inner) {
		others, ok := arr(outer)
		if !ok || isStr(outer) {
			return false
		}
		for _, item := range items {
			found := false
			for _, other := range others {
				if containsValue(other, item) && containsValue(item, other) {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	}
	if m := obj(inner); m != nil {
		o := obj(outer)
		if o == nil {
			return false
		}
		for k, v := range m {
			if !containsValue(o[k], v) {
				return false
			}
		}
		return true
	}
	if a, ok := numOf(outer); ok {
		b, ok := numOf(inner)
		return ok && a == b
	}
	return outer == inner
}

// ScopeRefusals is what makes a child grant wider than its parent: wider_than_parent, or not_receiver (none when it
// is within it).
func ScopeRefusals(child, parent Block) []Finding {
	c, p := obj(child.State["scope"]), obj(parent.State["scope"])
	from := str(parent.State["at"])
	if from == "" {
		from = "2000-01-01T00:00:00.000Z"
	}
	wrong := []Finding{}
	wider := func(detail string) { wrong = append(wrong, Finding{"wider_than_parent", detail}) }
	for _, set := range []string{"acts", "parties"} {
		if p[set] == nil {
			continue
		}
		within := c[set] != nil
		for _, item := range list(c[set]) {
			within = within && contains(list(p[set]), item)
		}
		if !within {
			wider("scope." + set + " is a subset of the parent's")
		}
	}
	if pl := obj(p["limit"]); pl != nil {
		cl := obj(c["limit"])
		if !(cl != nil && same(cl["currency"], pl["currency"]) && jsNumber(cl["minor"]) <= jsNumber(pl["minor"])) {
			wider("scope.limit is no larger than the parent's")
		}
	}
	if p["per"] != nil && !(c["per"] != nil && CompareDurations(str(c["per"]), str(p["per"]), from) <= 0) {
		wider("scope.per is no longer than the parent's")
	}
	if p["until"] != nil && !(c["until"] != nil && str(c["until"]) <= str(p["until"])) {
		wider("scope.until is no later than the parent's")
	}
	if p["notice"] != nil && !(c["notice"] != nil && CompareDurations(str(c["notice"]), str(p["notice"]), from) >= 0) {
		wider("scope.notice is no shorter than the parent's")
	}
	if p["condition"] != nil && !containsValue(c["condition"], p["condition"]) {
		wider("scope.condition keeps every condition of the parent's")
	}
	depth := 0.0
	if parent.State["depth"] != nil {
		depth = jsNumber(parent.State["depth"])
	}
	childDepth := 0.0
	if child.State["depth"] != nil {
		childDepth = jsNumber(child.State["depth"])
	}
	if !(depth >= 1 && childDepth <= depth-1) {
		wider("state.depth is smaller than the parent's by at least one (a grant with no depth is not passed on)")
	}
	if truthy(parent.Refs["to"]) && !same(child.Refs["author"], parent.Refs["to"]) {
		wrong = append(wrong, Finding{"not_receiver", "a grant is passed on by the one who received it"})
	}
	return wrong
}

// ScopeWithin is what makes a child grant wider than its parent, in plain words (none when it is within it).
func ScopeWithin(child, parent Block) []string { return details(ScopeRefusals(child, parent)) }

// LiveOptions: Now is the reader's own clock (for scope.until), a UTC time; "" reads no clock.
type LiveOptions struct{ Now string }

func whyNotLive(grant *Block, byHash *index, now string, seen map[string]bool) []string {
	if grant == nil {
		return []string{"the grant is not held"}
	}
	if seen[grant.Hash] {
		return []string{"its parents form a cycle"}
	}
	seen[grant.Hash] = true
	wrong := []string{}
	for _, b := range byHash.values() {
		if b.Type != "grant" || b.State["status"] == nil {
			continue
		}
		ends := b.State["status"] == "stopped" || b.State["status"] == "declined"
		if ends && contains(list(b.Refs["updates"]), grant.Hash) && (same(b.Refs["author"], grant.Refs["author"]) || (truthy(grant.Refs["as"]) && same(b.Refs["as"], grant.Refs["as"]))) {
			wrong = append(wrong, "its author stopped it")
		}
		if ends && contains(list(b.Refs["answers"]), grant.Hash) && truthy(grant.Refs["to"]) && same(b.Refs["author"], grant.Refs["to"]) {
			wrong = append(wrong, "its receiver ended it")
		}
	}
	scope := obj(grant.State["scope"])
	if now != "" && truthy(scope["until"]) && str(scope["until"]) <= now {
		wrong = append(wrong, "its scope.until has passed")
	}
	if truthy(grant.Refs["parent"]) {
		var parent *Block
		if p, ok := byHash.get(str(grant.Refs["parent"])); ok {
			parent = &p
		}
		above := whyNotLive(parent, byHash, now, seen)
		if len(above) > 0 {
			wrong = append(wrong, "its parent is not live ("+joinWords(above)+")")
		} else {
			wrong = append(wrong, ScopeWithin(*grant, *parent)...)
		}
	}
	return wrong
}

func joinWords(items []string) string {
	out := ""
	for i, item := range items {
		if i > 0 {
			out += "; "
		}
		out += item
	}
	return out
}

func liveOf(options []LiveOptions) string {
	if len(options) > 0 {
		return options[0].Now
	}
	return ""
}

// WhyNotLive is why a grant is not live among these blocks (its own end, the receiver's, its `until` on the reader's
// clock, an ancestor's): none when live.
func WhyNotLive(grant Block, blocks []Block, options ...LiveOptions) []string {
	g := grant
	g.Hash = g.id()
	return whyNotLive(&g, indexOf(blocks), liveOf(options), map[string]bool{})
}

func isLive(grant Block, byHash *index, now string) bool {
	return len(whyNotLive(&grant, byHash, now, map[string]bool{})) == 0
}

// IsLive is whether a grant is live among these blocks.
func IsLive(grant Block, blocks []Block, options ...LiveOptions) bool {
	return len(WhyNotLive(grant, blocks, options...)) == 0
}

// Ancestors are the grants above this one, nearest first.
func Ancestors(grant Block, blocks []Block) []Block {
	byHash, out, seen := indexOf(blocks), []Block{}, map[string]bool{}
	for at, ok := byHash.get(str(grant.Refs["parent"])); ok && !seen[at.Hash]; at, ok = byHash.get(str(at.Refs["parent"])) {
		seen[at.Hash] = true
		out = append(out, at)
	}
	return out
}

func whyNotUnder(b Block, byHash *index, now string) []string {
	grant, ok := byHash.get(str(b.Refs["under"]))
	if !ok || grant.Type != "grant" {
		return []string{"refs.under names no grant this reader holds"}
	}
	wrong := []string{}
	if truthy(grant.Refs["to"]) && !same(grant.Refs["to"], b.Refs["author"]) {
		wrong = append(wrong, "the grant is for someone else")
	}
	scope := obj(grant.State["scope"])
	if scope["acts"] != nil {
		acts := list(scope["acts"])
		kind := str(b.State["kind"])
		if !contains(acts, b.Type) && !contains(acts, b.Type+"."+kind) {
			what := b.Type
			if kind != "" {
				what += "." + kind
			}
			wrong = append(wrong, "the grant's acts do not cover a "+what)
		}
	}
	return append(wrong, whyNotLive(&grant, byHash, now, map[string]bool{})...)
}

// WhyNotUnder is whether a block signed under a grant (refs.under) speaks for its grantor: none, or why not.
// `scope.acts` lists the block types or type.kind names the grant covers.
func WhyNotUnder(b Block, blocks []Block, options ...LiveOptions) []string {
	return whyNotUnder(b, indexOf(blocks), liveOf(options))
}

// OperatorsOf is who answers for an agent or machine: the authors of its live grants of kind operator, naming it in
// refs.to (§2), sorted.
func OperatorsOf(agent string, blocks []Block, options ...LiveOptions) []string {
	byHash, now := indexOf(blocks), liveOf(options)
	out := []string{}
	for _, b := range byHash.values() {
		if b.Type == "grant" && b.State["kind"] == "operator" && same(b.Refs["to"], agent) && b.State["status"] == nil && isLive(b, byHash, now) {
			out = append(out, str(b.Refs["author"]))
		}
	}
	return sorted(uniq(out))
}

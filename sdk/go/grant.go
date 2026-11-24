package foodblock

// Authority (modules/authority.md): thin calls into the Rust core.

// LiveOptions: Now is the reader's clock ("" ignores scope.expires).
type LiveOptions struct{ Now string }

func nowOf(options []LiveOptions) string {
	if len(options) > 0 {
		return options[0].Now
	}
	return ""
}

// ScopeRefusals is why a child grant's scope is not within its parent's, as findings.
func ScopeRefusals(child, parent Block) []Finding {
	return doorScopeRefusals(child, parent)
}

// ScopeReading is the one reading of a grant's state.scope (authority.md): acts, parties, limit, each, every, expires, notice, sealed, condition and
// junk, with every default the spec states and nothing else filled in. A missing scope (nil) reads as an empty one. A non-empty junk (the sorted
// names of fields that are there but cannot be read) means the grant is held to no word.
func ScopeReading(scope any) map[string]any {
	return doorScopeReading[map[string]any](scope)
}

// ScopeWithin is why a child grant's scope is not within its parent's; empty when it is.
func ScopeWithin(child, parent Block) []string {
	return doorScopeWithin(child, parent)
}

// ParseDuration reads an ISO 8601 duration (nil when it is not one).
func ParseDuration(text string) map[string]any {
	return doorParseDuration[map[string]any](text)
}

// WhyNotLive is why a grant is not live; empty when it is.
func WhyNotLive(grant Block, blocks []Block, options ...LiveOptions) []string {
	return doorWhyNotLive(grant, blocks, nowOf(options))
}

// IsLive is whether a grant and every ancestor is live.
func IsLive(grant Block, blocks []Block, options ...LiveOptions) bool {
	return doorIsLive(grant, blocks, nowOf(options))
}

// Ancestors are a grant's parents, nearest first.
func Ancestors(grant Block, blocks []Block) []Block {
	return plural(doorAncestors[[]Block](grant, blocks))
}

// WhyNotUnder is why a block is not under a live grant; empty when it is.
func WhyNotUnder(b Block, blocks []Block, options ...LiveOptions) []string {
	return doorWhyNotUnder(b, blocks, nowOf(options))
}

// AddDuration moves a time by an ISO 8601 duration (sign -1 goes back), months and years by the UTC calendar. "" when
// either is not readable.
func AddDuration(at, duration string, sign int) string {
	s := int64(sign)
	if moved := doorAddDuration(at, duration, &s); moved != nil {
		return *moved
	}
	return ""
}

// CompareDurations is -1, 0 or 1: whether duration a is shorter than, as long as or longer than b, counted from a time.
func CompareDurations(a, b, from string) int { return int(doorCompareDurations(a, b, from)) }

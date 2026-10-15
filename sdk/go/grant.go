package foodblock

// Authority (protocol.md §7): thin calls into the Rust core.

// LiveOptions: Now is the reader's clock ("" ignores scope.until).
type LiveOptions struct{ Now string }

func nowOf(options []LiveOptions) any {
	if len(options) > 0 && options[0].Now != "" {
		return options[0].Now
	}
	return nil
}

// ScopeRefusals is why a child grant's scope is not within its parent's, as findings.
func ScopeRefusals(child, parent Block) []Finding {
	return plural(must[[]Finding]("scope_refusals", child, parent))
}

// ScopeWithin is why a child grant's scope is not within its parent's; empty when it is.
func ScopeWithin(child, parent Block) []string {
	return plural(must[[]string]("scope_within", child, parent))
}

// LimitFence is the observe of kind limit for a grant, to hand to Write: its audience is the agent alone.
func LimitFence(grantHash, agent string, limit map[string]any, per string) map[string]any {
	return must[map[string]any]("limit_fence", grantHash, agent, limit, nilIfEmpty(per))
}

// WithinLimit is whether spending money stays inside a limit (the limit observe, its state, or the money); spent is
// what the principal's node has counted in the period, in minor units.
func WithinLimit(limit, money any, spent int) bool {
	return must[bool]("within_limit", limit, money, spent)
}

// WhyNotLive is why a grant is not live; empty when it is.
func WhyNotLive(grant Block, blocks []Block, options ...LiveOptions) []string {
	return plural(must[[]string]("why_not_live", grant, plural(blocks), nowOf(options)))
}

// IsLive is whether a grant and every ancestor is live.
func IsLive(grant Block, blocks []Block, options ...LiveOptions) bool {
	return must[bool]("is_live", grant, plural(blocks), nowOf(options))
}

// Ancestors are a grant's parents, nearest first.
func Ancestors(grant Block, blocks []Block) []Block {
	return plural(must[[]Block]("ancestors", grant, plural(blocks)))
}

// WhyNotUnder is why a block is not under a live grant; empty when it is.
func WhyNotUnder(b Block, blocks []Block, options ...LiveOptions) []string {
	return plural(must[[]string]("why_not_under", b, plural(blocks), nowOf(options)))
}

// OperatorsOf are the people who answer for an agent.
func OperatorsOf(agent string, blocks []Block, options ...LiveOptions) []string {
	return plural(must[[]string]("operators_of", agent, plural(blocks), nowOf(options)))
}

// AddDuration moves a time by an ISO 8601 duration (sign -1 goes back), months and years by the UTC calendar. "" when
// either is not readable.
func AddDuration(at, duration string, sign int) string {
	return must[string]("add_duration", at, duration, sign)
}

// CompareDurations is -1, 0 or 1: whether duration a is shorter than, as long as or longer than b, counted from a time.
func CompareDurations(a, b, from string) int { return must[int]("compare_durations", a, b, from) }

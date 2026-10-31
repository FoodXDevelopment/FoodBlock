package foodblock

// Authority (modules/authority.md): thin calls into the Rust core.

// LiveOptions: Now is the reader's clock ("" ignores scope.until).
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

// ScopeWithin is why a child grant's scope is not within its parent's; empty when it is.
func ScopeWithin(child, parent Block) []string {
	return doorScopeWithin(child, parent)
}

// LimitFence is the observe of kind limit for a grant, to hand to Write: its audience is the autonomous system alone.
func LimitFence(grantHash, agent string, limit map[string]any, every string) map[string]any {
	return doorLimitFence[map[string]any](grantHash, agent, limit, every, "", nil)
}

// LimitFenceSealed is LimitFence with the salt that opens the grant's scope.limit_commitment, and each, a cap on any
// single act (nil for none).
func LimitFenceSealed(grantHash, agent string, limit map[string]any, every, salt string, each map[string]any) map[string]any {
	return doorLimitFence[map[string]any](grantHash, agent, limit, every, salt, each)
}

// LimitCommitment is the commitment to a limit, for a grant's scope.limit_commitment (authority.md). suite is "" for std.
func LimitCommitment(limit map[string]any, every, salt, suite string) string {
	return doorLimitCommitment(limit, every, salt, suite, nil)
}

// LimitCommitmentEach is LimitCommitment with each, a cap on any single act, inside the commitment.
func LimitCommitmentEach(limit map[string]any, every, salt, suite string, each map[string]any) string {
	return doorLimitCommitment(limit, every, salt, suite, each)
}

// LimitOpens is whether the limit observe opens the grant's scope.limit_commitment.
func LimitOpens(grant, fence Block, suite string) bool {
	return doorLimitOpens(grant, fence, suite)
}

// WithinLimit is whether one act of value (money or an amount) stays inside a limit (the limit observe, its state, or
// the limit); spent is what the principal's node has counted in the period: minor units, or the amount's value (an int
// or a decimal string), compared exactly.
func WithinLimit(limit, money any, spent any) bool {
	return doorWithinLimit(limit, money, spent)
}

// WhyNotLiveUndo is why an act that cannot be undone (its schema says `undo: never`) is not live: empty when it has a
// specific accepted ask or a grant that names it with a limit.
func WhyNotLiveUndo(b Block, blocks []Block) []string {
	return doorWhyNotLiveUndo(b, blocks)
}

// ActName is the act a block is, named `type.kind`.
func ActName(b Block) string { return doorActName(b) }

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

// OperatorsOf are the people who answer for an autonomous system.
func OperatorsOf(agent string, blocks []Block, options ...LiveOptions) []string {
	return doorOperatorsOf(agent, blocks, nowOf(options))
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

package foodblock

// Strangers (modules/consent.md) and the small profiles: thin calls into the Rust core.

// ReceiptCode is the short receipt code of a block: the first 5 bytes of its id in Crockford Base32, XXXX-XXXX.
func ReceiptCode(id string) string { return doorReceiptCode(id, false) }

// ReceiptCodeLong is the ten-character form (the first 50 bits, XXXXX-XXXXX), for a custodian whose index holds two blocks with one short code.
func ReceiptCodeLong(id string) string { return doorReceiptCode(id, true) }

// CodeMatches is whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; eight characters match the short code, ten the long one.
func CodeMatches(text, id string) bool { return doorCodeMatches(text, id) }

// ReadingIsPersonsClaim is whether a model's reading is the person's claim: only once the person's own block confirms it.
func ReadingIsPersonsClaim(reading Block, person string, blocks []Block) bool {
	return doorReadingIsPersonsClaim(reading, person, blocks)
}

// ReadingConditionHolds is whether a tasks-profile `reading_condition` holds on the readings held, at the reader's now.
func ReadingConditionHolds(condition any, blocks []Block, now string) bool {
	return doorReadingConditionHolds(condition, blocks, now)
}

// ConditionHolds is whether a condition holds on the blocks held, at the reader's now (promises.md, Conditions): settled, a
// deed, a reading or a signal. A condition reads three ways: true, false, or nil for a shape the protocol does not read.
func ConditionHolds(condition any, blocks []Block, now string) *bool {
	return doorConditionHolds(condition, blocks, now)
}

// EarnestShapeOk is whether the shape of an admission's earnest is right.
func EarnestShapeOk(earnest any) bool { return doorEarnestShapeOk(earnest) }

// EarnestPaid is whether an ask's earnest is paid.
func EarnestPaid(ask, earnest Block, blocks []Block) bool {
	return doorEarnestPaid(ask, earnest, blocks)
}

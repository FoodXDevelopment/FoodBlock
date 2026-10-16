package foodblock

// Strangers (modules/strangers.md) and the small profiles: thin calls into the Rust core.

// ReceiptCode is the short receipt code of a block: the first 5 bytes of its id in Crockford Base32, XXXX-XXXX.
func ReceiptCode(id string) string { return must[string]("receipt_code", id) }

// ReceiptCodeLong is the ten-character form (the first 50 bits, XXXXX-XXXXX), for a custodian whose index holds two blocks with one short code.
func ReceiptCodeLong(id string) string { return must[string]("receipt_code", id, true) }

// CodeMatches is whether a typed code names this block: case, spaces and hyphens ignored, O read as 0, I and L as 1; eight characters match the short code, ten the long one.
func CodeMatches(text, id string) bool { return must[bool]("code_matches", text, id) }

// ReadingIsPersonsClaim is whether a model's reading is the person's claim: only once the person's own block confirms it.
func ReadingIsPersonsClaim(reading Block, person string, blocks []Block) bool {
	return must[bool]("reading_is_persons_claim", reading, person, plural(blocks))
}

// ReadingConditionHolds is whether a tasks-profile `reading_condition` holds on the readings held, at the reader's now.
func ReadingConditionHolds(condition any, blocks []Block, now string) bool {
	return must[bool]("reading_condition_holds", condition, plural(blocks), now)
}

// DepositShapeOk is whether the shape of an admission's deposit is right.
func DepositShapeOk(deposit any) bool { return must[bool]("deposit_shape_ok", deposit) }

// DepositPaid is whether an ask's deposit is paid.
func DepositPaid(ask, deposit Block, blocks []Block) bool {
	return must[bool]("deposit_paid", ask, deposit, plural(blocks))
}

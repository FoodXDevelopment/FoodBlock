package foodblock

// The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node
// reads an older shape. It writes fresh blocks, each deriving from the old hash.

// ConvertOptions: Keys maps each old identity (its old genesis hash) to the key that signs for it; At is the
// conversion time; Map and Existing continue an earlier run; Channel and RequestHash are for a custodian signing on
// the owners' word. Schemas are published schemas a block may name instead of a new one; CustodianKey signs only for the
// old identities in CustodianFor, and only under a channel; every other one is skipped. Nothing a signer left out is filled
// in: a block with no audience is its author's alone.
type ConvertOptions struct {
	Keys         map[string]Keypair `json:"keys"`
	At           string             `json:"at,omitempty"`
	Map          map[string]string  `json:"map"`
	Existing     []Block            `json:"existing"`
	Channel      string             `json:"channel,omitempty"`
	RequestHash  string             `json:"request_hash,omitempty"`
	Schemas      []Block            `json:"schemas"`
	CustodianKey *Keypair           `json:"custodian_key,omitempty"`
	CustodianFor []string           `json:"custodian_for,omitempty"`
}

// Skipped is an old block the converter left out, and why.
type Skipped struct {
	Hash string `json:"hash"`
	Why  string `json:"why"`
}

// Converted is { blocks, map (old to new), skipped }.
type Converted struct {
	Blocks  []Block           `json:"blocks"`
	Map     map[string]string `json:"map"`
	Skipped []Skipped         `json:"skipped"`
}

// Convert converts old blocks (as JSON values: their shape is not the protocol's).
func Convert(oldBlocks []map[string]any, o ConvertOptions) (Converted, error) {
	if o.Map == nil {
		o.Map = map[string]string{}
	}
	o.Existing = plural(o.Existing)
	o.Schemas = plural(o.Schemas)
	// old blocks are not Blocks (their shape is not the protocol's), so this one is not the typed door function
	return ask[Converted]("convert", plural(oldBlocks), o)
}

// OldHash is the id an old block had under the old canonical form.
func OldHash(block map[string]any) (string, error) { return doorOldHash(block) }

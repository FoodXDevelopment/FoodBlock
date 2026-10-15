package foodblock

// The one-time converter for blocks from before 1.6 (spec/legacy/converter.md). Not part of the protocol: no node
// reads an older shape. It writes fresh 1.6 blocks, each deriving from the old hash.

// ConvertOptions: Keys maps each old identity (its old genesis hash) to the key that signs for it; At is the
// conversion time; Map and Existing continue an earlier run; Channel and RequestHash are for a custodian signing on
// the owners' word.
type ConvertOptions struct {
	Keys        map[string]Keypair `json:"keys"`
	At          string             `json:"at,omitempty"`
	Map         map[string]string  `json:"map"`
	Existing    []Block            `json:"existing"`
	Channel     string             `json:"channel,omitempty"`
	RequestHash string             `json:"request_hash,omitempty"`
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

// Convert converts old blocks (as JSON values: their shape is not 1.6's).
func Convert(oldBlocks []map[string]any, o ConvertOptions) (Converted, error) {
	if o.Map == nil {
		o.Map = map[string]string{}
	}
	o.Existing = plural(o.Existing)
	return ask[Converted]("convert", plural(oldBlocks), o)
}

// OldHash is the id an old block had under the old canonical form.
func OldHash(block map[string]any) (string, error) { return ask[string]("old_hash", block) }

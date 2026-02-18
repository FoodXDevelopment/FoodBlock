package foodblock

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// FieldDef describes a single field within a vocabulary.
type FieldDef struct {
	Type           string   `json:"type"`
	Required       bool     `json:"required,omitempty"`
	Aliases        []string `json:"aliases,omitempty"`
	InvertAliases  []string `json:"invert_aliases,omitempty"`
	ValidUnits     []string `json:"valid_units,omitempty"`
	ValidValues    []string `json:"valid_values,omitempty"`
	Description    string   `json:"description,omitempty"`
	Compound       bool     `json:"compound,omitempty"`
}

// VocabularyDef is a vocabulary definition containing domain, applicable types,
// field definitions, and optional workflow transitions.
type VocabularyDef struct {
	Domain      string              `json:"domain"`
	ForTypes    []string            `json:"for_types"`
	Fields      map[string]FieldDef `json:"fields"`
	Transitions map[string][]string `json:"transitions,omitempty"`
}

// MapFieldsResult is the result of mapping natural language text against a vocabulary.
type MapFieldsResult struct {
	Matched   map[string]interface{}
	Unmatched []string
}

// Vocabularies is the set of 14 built-in vocabulary definitions.
var Vocabularies = map[string]VocabularyDef{
	"bakery": {
		Domain:  "bakery",
		ForTypes: []string{"substance.product", "substance.ingredient", "transform.process"},
		Fields: map[string]FieldDef{
			"price":    {Type: "number", Aliases: []string{"price", "cost", "sells for", "costs"}, Description: "Price of the baked good"},
			"weight":   {Type: "number", Aliases: []string{"weight", "weighs", "grams", "kg"}, Description: "Weight of the product"},
			"allergens": {Type: "compound", Aliases: []string{"gluten", "nuts", "dairy", "eggs", "soy", "wheat"}, Description: "Allergens present in the product", Compound: true},
			"name":     {Type: "string", Required: true, Aliases: []string{"name", "called", "named"}, Description: "Product name"},
			"organic":  {Type: "boolean", Aliases: []string{"organic", "bio"}, Description: "Whether the product is organic"},
		},
	},
	"restaurant": {
		Domain:  "restaurant",
		ForTypes: []string{"actor.venue", "substance.product", "observe.review"},
		Fields: map[string]FieldDef{
			"cuisine":     {Type: "string", Aliases: []string{"cuisine", "style", "serves"}, Description: "Type of cuisine served"},
			"rating":      {Type: "number", Aliases: []string{"rating", "rated", "stars", "score"}, Description: "Rating score"},
			"price_range": {Type: "string", Aliases: []string{"price range", "budget", "expensive", "cheap", "moderate"}, Description: "Price range category"},
			"halal":       {Type: "boolean", Aliases: []string{"halal"}, Description: "Whether food is halal"},
			"kosher":      {Type: "boolean", Aliases: []string{"kosher"}, Description: "Whether food is kosher"},
			"vegan":       {Type: "boolean", Aliases: []string{"vegan", "plant-based"}, Description: "Whether food is vegan"},
		},
	},
	"farm": {
		Domain:  "farm",
		ForTypes: []string{"actor.producer", "substance.ingredient", "observe.certification"},
		Fields: map[string]FieldDef{
			"crop":     {Type: "string", Aliases: []string{"crop", "grows", "produces", "cultivates"}, Description: "Primary crop or product"},
			"acreage":  {Type: "number", Aliases: []string{"acreage", "acres", "hectares", "area"}, Description: "Farm size"},
			"organic":  {Type: "boolean", Aliases: []string{"organic", "bio", "chemical-free"}, Description: "Whether the farm is organic"},
			"region":   {Type: "string", Aliases: []string{"region", "location", "from", "based in"}, Description: "Geographic region"},
			"seasonal": {Type: "boolean", Aliases: []string{"seasonal"}, Description: "Whether production is seasonal"},
		},
	},
	"retail": {
		Domain:  "retail",
		ForTypes: []string{"actor.venue", "substance.product", "transfer.order"},
		Fields: map[string]FieldDef{
			"price":    {Type: "number", Aliases: []string{"price", "cost", "sells for", "priced at"}, Description: "Retail price"},
			"sku":      {Type: "string", Aliases: []string{"sku", "product code", "item number"}, Description: "Stock keeping unit"},
			"quantity": {Type: "number", Aliases: []string{"quantity", "qty", "count", "units"}, Description: "Available quantity"},
			"category": {Type: "string", Aliases: []string{"category", "department", "section", "aisle"}, Description: "Product category"},
			"on_sale":  {Type: "boolean", Aliases: []string{"on sale", "discounted", "clearance"}, Description: "Whether the item is on sale"},
		},
	},
	"lot": {
		Domain:  "lot",
		ForTypes: []string{"substance.product", "substance.ingredient", "transform.process"},
		Fields: map[string]FieldDef{
			"lot_id":          {Type: "string", Required: true, Aliases: []string{"lot", "lot number", "lot id", "batch"}, Description: "Lot or batch identifier"},
			"batch_id":        {Type: "string", Aliases: []string{"batch", "batch number", "batch id"}, Description: "Batch identifier"},
			"production_date": {Type: "string", Aliases: []string{"produced", "manufactured", "made on", "production date"}, Description: "Date of production (ISO 8601)"},
			"expiry_date":     {Type: "string", Aliases: []string{"expires", "expiry", "best before", "use by", "sell by"}, Description: "Expiry or best-before date (ISO 8601)"},
			"lot_size":        {Type: "number", Aliases: []string{"lot size", "batch size", "quantity produced"}, Description: "Number of units in the lot"},
			"facility":        {Type: "string", Aliases: []string{"facility", "plant", "factory", "site"}, Description: "Production facility identifier"},
		},
	},
	"units": {
		Domain:  "units",
		ForTypes: []string{"substance.product", "substance.ingredient", "transfer.order", "observe.reading"},
		Fields: map[string]FieldDef{
			"weight":      {Type: "quantity", Aliases: []string{"weight", "weighs", "mass"}, ValidUnits: []string{"g", "kg", "oz", "lb", "ton", "mg"}, Description: "Weight/mass measurement"},
			"volume":      {Type: "quantity", Aliases: []string{"volume", "capacity", "amount"}, ValidUnits: []string{"ml", "l", "fl_oz", "gal", "cup", "tbsp", "tsp"}, Description: "Volume measurement"},
			"temperature": {Type: "quantity", Aliases: []string{"temperature", "temp", "degrees"}, ValidUnits: []string{"celsius", "fahrenheit", "kelvin"}, Description: "Temperature reading"},
			"length":      {Type: "quantity", Aliases: []string{"length", "height", "width", "depth", "distance"}, ValidUnits: []string{"mm", "cm", "m", "km", "in", "ft"}, Description: "Length/distance measurement"},
			"currency":    {Type: "quantity", Aliases: []string{"price", "cost", "total", "amount"}, ValidUnits: []string{"USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"}, Description: "Monetary amount"},
		},
	},
	"workflow": {
		Domain:  "workflow",
		ForTypes: []string{"transfer.order", "transfer.shipment", "transfer.booking"},
		Fields: map[string]FieldDef{
			"status":          {Type: "string", Required: true, Aliases: []string{"status", "state", "stage"}, Description: "Current workflow status"},
			"previous_status": {Type: "string", Aliases: []string{"was", "previously", "changed from"}, Description: "Previous status before transition"},
			"reason":          {Type: "string", Aliases: []string{"reason", "because", "note"}, Description: "Reason for status change"},
		},
		Transitions: map[string][]string{
			"draft":      {"quote", "order", "cancelled"},
			"quote":      {"order", "cancelled"},
			"order":      {"confirmed", "cancelled"},
			"confirmed":  {"processing", "cancelled"},
			"processing": {"shipped", "cancelled"},
			"shipped":    {"delivered", "returned"},
			"delivered":  {"paid", "returned"},
			"paid":       {},
			"cancelled":  {},
			"returned":   {"order"},
		},
	},
	"distributor": {
		Domain:   "distributor",
		ForTypes: []string{"actor.distributor", "transfer.delivery"},
		Fields: map[string]FieldDef{
			"vehicle_type":        {Type: "string", Aliases: []string{"van", "truck", "lorry", "reefer", "refrigerated"}, Description: "Type of delivery vehicle"},
			"temperature_range":   {Type: "object", Aliases: []string{"chilled", "frozen", "ambient", "cold chain"}, Description: "Required temperature range for transport"},
			"delivery_zone":       {Type: "string", Aliases: []string{"zone", "area", "region", "route", "coverage"}, Description: "Delivery coverage zone or route"},
			"fleet_size":          {Type: "number", Aliases: []string{"fleet", "vehicles"}, Description: "Number of vehicles in the fleet"},
			"cold_chain_certified": {Type: "boolean", Aliases: []string{"cold chain certified", "temperature controlled", "cold chain"}, Description: "Whether the distributor is cold chain certified"},
			"transit_time":        {Type: "object", Aliases: []string{"transit", "delivery time", "lead time"}, Description: "Expected transit or delivery time"},
		},
	},
	"processor": {
		Domain:   "processor",
		ForTypes: []string{"transform.process", "actor.processor"},
		Fields: map[string]FieldDef{
			"process_type":    {Type: "string", Aliases: []string{"milling", "pressing", "extraction", "refining", "pasteurizing", "fermenting", "smoking", "curing"}, Description: "Type of processing operation"},
			"extraction_rate": {Type: "number", Aliases: []string{"extraction rate", "yield", "recovery"}, Description: "Extraction or yield rate"},
			"batch_size":      {Type: "number", Aliases: []string{"batch", "batch size", "run size"}, Description: "Size of a processing batch"},
			"equipment":       {Type: "string", Aliases: []string{"mill", "press", "vat", "oven", "kiln", "smoker", "pasteurizer"}, Description: "Processing equipment used"},
			"quality_grade":   {Type: "string", Aliases: []string{"grade", "quality", "grade a", "grade b", "premium", "standard"}, Description: "Quality grade of the output"},
			"shelf_life":      {Type: "object", Aliases: []string{"shelf life", "best before", "use by", "expiry"}, Description: "Expected shelf life of the product"},
		},
	},
	"market": {
		Domain:   "market",
		ForTypes: []string{"place.market", "actor.vendor"},
		Fields: map[string]FieldDef{
			"stall_number": {Type: "string", Aliases: []string{"stall", "pitch", "stand", "booth"}, Description: "Stall or pitch number"},
			"market_day":   {Type: "string", Aliases: []string{"saturday", "sunday", "weekday", "daily", "weekly"}, Description: "Day or frequency the market operates"},
			"seasonal":     {Type: "boolean", Aliases: []string{"seasonal", "summer only", "winter market"}, Description: "Whether the market is seasonal"},
			"pitch_fee":    {Type: "number", Aliases: []string{"pitch fee", "stall fee", "rent"}, Description: "Fee for a market pitch or stall"},
			"market_name":  {Type: "string", Aliases: []string{"market", "farmers market", "street market", "food market"}, Description: "Name or type of the market"},
		},
	},
	"catering": {
		Domain:   "catering",
		ForTypes: []string{"transfer.catering", "actor.caterer"},
		Fields: map[string]FieldDef{
			"event_type":      {Type: "string", Aliases: []string{"wedding", "corporate", "party", "banquet", "conference", "reception", "private event"}, Description: "Type of event being catered"},
			"covers":          {Type: "number", Aliases: []string{"covers", "guests", "people", "servings", "portions", "pax"}, Description: "Number of covers or guests"},
			"dietary_options":  {Type: "compound", Aliases: []string{"vegan", "vegetarian", "gluten-free", "halal", "kosher", "nut-free", "dairy-free"}, Description: "Available dietary options", Compound: true},
			"service_style":   {Type: "string", Aliases: []string{"buffet", "plated", "canape", "family style", "food truck"}, Description: "Style of catering service"},
			"per_head_price":  {Type: "number", Aliases: []string{"per head", "per person", "per cover", "pp"}, Description: "Price per person"},
		},
	},
	"fishery": {
		Domain:   "fishery",
		ForTypes: []string{"substance.seafood", "actor.fishery"},
		Fields: map[string]FieldDef{
			"catch_method":  {Type: "string", Aliases: []string{"line caught", "net", "trawl", "pot", "dredge", "longline", "hand dive", "rod and line"}, Description: "Method used to catch fish"},
			"vessel":        {Type: "string", Aliases: []string{"vessel", "boat", "trawler", "seiner"}, Description: "Fishing vessel name or type"},
			"landing_port":  {Type: "string", Aliases: []string{"landed", "landing port", "port", "harbour"}, Description: "Port where the catch was landed"},
			"species":       {Type: "string", Aliases: []string{"cod", "salmon", "haddock", "mackerel", "tuna", "sea bass", "crab", "lobster", "prawns", "oyster", "mussels"}, Description: "Fish or seafood species"},
			"msc_certified": {Type: "boolean", Aliases: []string{"msc", "msc certified", "marine stewardship", "sustainable"}, Description: "Whether the fishery is MSC certified"},
			"catch_date":    {Type: "string", Aliases: []string{"caught", "landed", "catch date"}, Description: "Date the catch was made"},
			"fishing_zone":  {Type: "string", Aliases: []string{"zone", "area", "ices area", "fao area", "fishing ground"}, Description: "Fishing zone or area designation"},
		},
	},
	"dairy": {
		Domain:   "dairy",
		ForTypes: []string{"substance.dairy", "actor.dairy"},
		Fields: map[string]FieldDef{
			"milk_type":    {Type: "string", Aliases: []string{"cow", "goat", "sheep", "buffalo", "oat", "almond", "soy"}, Description: "Type of milk used"},
			"pasteurized":  {Type: "boolean", Aliases: []string{"pasteurized", "pasteurised", "raw", "unpasteurized"}, InvertAliases: []string{"raw", "unpasteurized"}, Description: "Whether the product is pasteurized (raw/unpasteurized = false)"},
			"fat_content":  {Type: "number", Aliases: []string{"fat", "fat content", "butterfat", "cream"}, Description: "Fat content percentage"},
			"culture":      {Type: "string", Aliases: []string{"culture", "starter", "rennet", "aged", "cave aged"}, Description: "Culture or aging method used"},
			"aging_days":   {Type: "number", Aliases: []string{"aged", "matured", "days", "months"}, Description: "Number of days the product has been aged"},
			"animal_breed": {Type: "string", Aliases: []string{"jersey", "holstein", "friesian", "guernsey", "brown swiss", "saanen"}, Description: "Breed of the dairy animal"},
		},
	},
	"butcher": {
		Domain:   "butcher",
		ForTypes: []string{"substance.meat", "actor.butcher"},
		Fields: map[string]FieldDef{
			"cut":              {Type: "string", Aliases: []string{"sirloin", "ribeye", "fillet", "rump", "brisket", "chuck", "loin", "shoulder", "leg", "rack", "chop", "mince"}, Description: "Cut of meat"},
			"animal":           {Type: "string", Aliases: []string{"beef", "pork", "lamb", "chicken", "duck", "venison", "rabbit", "turkey", "goose"}, Description: "Type of animal"},
			"breed":            {Type: "string", Aliases: []string{"angus", "hereford", "wagyu", "berkshire", "duroc", "suffolk", "texel"}, Description: "Breed of the animal"},
			"hanging_days":     {Type: "number", Aliases: []string{"hung", "dry aged", "aged", "hanging days", "matured"}, Description: "Number of days the meat has been hung"},
			"slaughter_method": {Type: "string", Aliases: []string{"slaughter", "abattoir"}, Description: "Method of slaughter"},
			"halal":            {Type: "boolean", Aliases: []string{"halal", "halal certified"}, Description: "Whether the meat is halal"},
			"kosher":           {Type: "boolean", Aliases: []string{"kosher", "kosher certified", "glatt"}, Description: "Whether the meat is kosher"},
		},
	},
}

// CreateVocabulary creates an observe.vocabulary FoodBlock.
func CreateVocabulary(domain string, forTypes []string, fields map[string]FieldDef, authorHash string) Block {
	fieldsMap := make(map[string]interface{})
	for name, def := range fields {
		entry := map[string]interface{}{"type": def.Type}
		if def.Required {
			entry["required"] = true
		}
		if len(def.Aliases) > 0 {
			aliases := make([]interface{}, len(def.Aliases))
			for i, a := range def.Aliases {
				aliases[i] = a
			}
			entry["aliases"] = aliases
		}
		if len(def.InvertAliases) > 0 {
			invertAliases := make([]interface{}, len(def.InvertAliases))
			for i, a := range def.InvertAliases {
				invertAliases[i] = a
			}
			entry["invert_aliases"] = invertAliases
		}
		if len(def.ValidUnits) > 0 {
			units := make([]interface{}, len(def.ValidUnits))
			for i, u := range def.ValidUnits {
				units[i] = u
			}
			entry["valid_units"] = units
		}
		if len(def.ValidValues) > 0 {
			vals := make([]interface{}, len(def.ValidValues))
			for i, v := range def.ValidValues {
				vals[i] = v
			}
			entry["valid_values"] = vals
		}
		if def.Description != "" {
			entry["description"] = def.Description
		}
		if def.Compound {
			entry["compound"] = true
		}
		fieldsMap[name] = entry
	}

	ft := make([]interface{}, len(forTypes))
	for i, t := range forTypes {
		ft[i] = t
	}

	state := map[string]interface{}{
		"domain":    domain,
		"for_types": ft,
		"fields":    fieldsMap,
	}
	refs := map[string]interface{}{}
	if authorHash != "" {
		refs["author"] = authorHash
	}
	return Create("observe.vocabulary", state, refs)
}

// MapFields extracts field values from natural language text using a vocabulary's aliases.
func MapFields(text string, vocab VocabularyDef) MapFieldsResult {
	if len(vocab.Fields) == 0 {
		return MapFieldsResult{Matched: map[string]interface{}{}, Unmatched: []string{text}}
	}

	matched := map[string]interface{}{}
	lower := strings.ToLower(text)
	tokens := splitTokens(lower)
	used := make(map[int]bool)

	for fieldName, fieldDef := range vocab.Fields {
		aliases := fieldDef.Aliases
		if len(aliases) == 0 {
			aliases = []string{fieldName}
		}

		for _, alias := range aliases {
			aliasLower := strings.ToLower(alias)

			switch fieldDef.Type {
			case "boolean", "flag":
				if strings.Contains(lower, aliasLower) {
					// Support invert_aliases: aliases that set the boolean to false
					boolValue := true
					for _, inv := range fieldDef.InvertAliases {
						if strings.ToLower(inv) == aliasLower {
							boolValue = false
							break
						}
					}
					if fieldDef.Compound {
						if matched[fieldName] == nil {
							matched[fieldName] = map[string]interface{}{aliasLower: boolValue}
						} else if m, ok := matched[fieldName].(map[string]interface{}); ok {
							m[aliasLower] = boolValue
						}
					} else {
						matched[fieldName] = boolValue
					}
					for i, tok := range tokens {
						if tok == aliasLower {
							used[i] = true
						}
					}
				}

			case "number":
				aliasIdx := indexOf(tokens, aliasLower)
				if aliasIdx >= 0 {
					used[aliasIdx] = true
					for _, offset := range []int{-2, -1, 1, 2} {
						idx := aliasIdx + offset
						if idx >= 0 && idx < len(tokens) {
							if num, err := strconv.ParseFloat(tokens[idx], 64); err == nil {
								matched[fieldName] = num
								used[idx] = true
								break
							}
						}
					}
				} else {
					escaped := regexp.QuoteMeta(aliasLower)
					pattern := fmt.Sprintf(`(?i)(?:%s)\s+(?:for\s+)?([\d.]+)|([\d.]+)\s+(?:%s)`, escaped, escaped)
					re, err := regexp.Compile(pattern)
					if err == nil {
						m := re.FindStringSubmatch(text)
						if len(m) > 0 {
							numStr := m[1]
							if numStr == "" {
								numStr = m[2]
							}
							if num, err := strconv.ParseFloat(numStr, 64); err == nil {
								matched[fieldName] = num
							}
						}
					}
				}

			case "compound":
				if strings.Contains(lower, aliasLower) {
					if matched[fieldName] == nil {
						matched[fieldName] = map[string]interface{}{}
					}
					if m, ok := matched[fieldName].(map[string]interface{}); ok {
						m[aliasLower] = true
					}
					for i, tok := range tokens {
						if tok == aliasLower {
							used[i] = true
						}
					}
				}

			default: // string
				aliasIdx := indexOf(tokens, aliasLower)
				if aliasIdx >= 0 {
					used[aliasIdx] = true
					if aliasIdx+1 < len(tokens) {
						matched[fieldName] = tokens[aliasIdx+1]
						used[aliasIdx+1] = true
					}
				}
			}
		}
	}

	var unmatched []string
	for i, tok := range tokens {
		if !used[i] {
			unmatched = append(unmatched, tok)
		}
	}
	if unmatched == nil {
		unmatched = []string{}
	}

	return MapFieldsResult{Matched: matched, Unmatched: unmatched}
}

// Quantity creates a quantity object with value and unit.
func Quantity(value float64, unit string, measureType string) (map[string]interface{}, error) {
	if math.IsNaN(value) {
		return nil, fmt.Errorf("FoodBlock: quantity value must be a number")
	}
	if unit == "" {
		return nil, fmt.Errorf("FoodBlock: quantity unit is required")
	}

	if measureType != "" {
		if unitsDef, ok := Vocabularies["units"]; ok {
			if fieldDef, ok := unitsDef.Fields[measureType]; ok && len(fieldDef.ValidUnits) > 0 {
				valid := false
				for _, u := range fieldDef.ValidUnits {
					if u == unit {
						valid = true
						break
					}
				}
				if !valid {
					return nil, fmt.Errorf("FoodBlock: invalid unit '%s' for %s. Valid: %s",
						unit, measureType, strings.Join(fieldDef.ValidUnits, ", "))
				}
			}
		}
	}

	return map[string]interface{}{"value": value, "unit": unit}, nil
}

// Transition validates a workflow state transition.
func Transition(from, to string) bool {
	wf, ok := Vocabularies["workflow"]
	if !ok || wf.Transitions == nil {
		return false
	}
	allowed, ok := wf.Transitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

// NextStatuses returns valid next statuses for a given workflow status.
func NextStatuses(status string) []string {
	wf, ok := Vocabularies["workflow"]
	if !ok || wf.Transitions == nil {
		return []string{}
	}
	if next, ok := wf.Transitions[status]; ok {
		return next
	}
	return []string{}
}

// Localize extracts values for a specific locale from a block's state.
func Localize(block Block, locale string, fallback string) Block {
	if fallback == "" {
		fallback = "en"
	}

	localeRe := regexp.MustCompile(`^[a-z]{2}(-[A-Z]{2})?$`)
	localizedState := make(map[string]interface{})

	for key, value := range block.State {
		if dict, ok := value.(map[string]interface{}); ok && len(dict) > 0 {
			allLocale := true
			keys := make([]string, 0, len(dict))
			for k := range dict {
				keys = append(keys, k)
				if !localeRe.MatchString(k) {
					allLocale = false
					break
				}
			}
			if allLocale {
				if v, ok := dict[locale]; ok {
					localizedState[key] = v
				} else if v, ok := dict[fallback]; ok {
					localizedState[key] = v
				} else if len(keys) > 0 {
					localizedState[key] = dict[keys[0]]
				} else {
					localizedState[key] = value
				}
			} else {
				localizedState[key] = value
			}
		} else {
			localizedState[key] = value
		}
	}

	return Create(block.Type, localizedState, block.Refs)
}

func splitTokens(s string) []string {
	re := regexp.MustCompile(`[\s,;]+`)
	parts := re.Split(s, -1)
	var result []string
	for _, p := range parts {
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func indexOf(slice []string, val string) int {
	for i, s := range slice {
		if s == val {
			return i
		}
	}
	return -1
}

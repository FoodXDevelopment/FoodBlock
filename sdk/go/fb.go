package foodblock

import (
	"regexp"
	"strconv"
	"strings"
)

// FBResult is the return type of the FB() function.
type FBResult struct {
	Blocks  []Block
	Primary Block
	Type    string
	State   map[string]interface{}
	Text    string
}

type intent struct {
	Type    string
	Signals []string
	Weight  int
}

type numPattern struct {
	Pattern   *regexp.Regexp
	Field     string
	Unit      string
	UnitGroup int
}

var intents = []intent{
	{
		Type: "actor.agent",
		Signals: []string{"set up an agent", "create an agent", "register an agent", "new agent",
			"agent for", "agent that handles", "agent to handle"},
		Weight: 5,
	},
	{
		Type: "substance.surplus",
		Signals: []string{"left over", "leftover", "surplus", "reduced", "reduced to",
			"selling for", "collect by", "pick up by", "use by today",
			"going spare", "end of day", "waste", "about to expire"},
		Weight: 4,
	},
	{
		Type: "observe.review",
		Signals: []string{"stars", "star", "rated", "rating", "review", "amazing", "terrible", "loved", "hated",
			"best", "worst", "delicious", "disgusting", "fantastic", "awful", "great", "horrible",
			"recommend", "overrated", "underrated", "disappointing", "outstanding", "mediocre",
			"tried", "visited", "went to", "ate at", "dined at"},
		Weight: 2,
	},
	{
		Type: "observe.certification",
		Signals: []string{"certified", "certification", "inspection", "inspected", "passed", "failed",
			"audit", "audited", "compliance", "approved", "accredited", "usda", "fda",
			"haccp", "iso", "organic certified", "grade", "soil association"},
		Weight: 3,
	},
	{
		Type: "observe.reading",
		Signals: []string{"temperature", "temp", "celsius", "fahrenheit", "humidity", "ph",
			"reading", "measured", "sensor", "cooler", "freezer", "thermometer",
			"fridge", "oven", "cold room", "hot hold", "probe"},
		Weight: 3,
	},
	{
		Type: "transfer.order",
		Signals: []string{"ordered", "order", "purchased", "bought", "sold", "invoice",
			"shipped", "delivered", "shipment", "payment", "receipt", "transaction"},
		Weight: 2,
	},
	{
		Type: "transform.process",
		Signals: []string{"baked", "cooked", "fried", "grilled", "roasted", "fermented",
			"brewed", "distilled", "processed", "mixed", "blended", "milled",
			"smoked", "cured", "pickled", "recipe", "preparation",
			"stone-mill", "stone mill", "extraction rate",
			"into", "transform", "converted"},
		Weight: 2,
	},
	{
		Type: "actor.producer",
		Signals: []string{"farm", "ranch", "orchard", "vineyard", "grows", "cultivates", "harvested",
			"harvest", "planted", "acres", "hectares", "acreage", "seasonal",
			"producer", "grower", "farmer", "variety"},
		Weight: 2,
	},
	{
		Type: "actor.venue",
		Signals: []string{"restaurant", "bakery", "cafe", "shop", "store", "market", "bar",
			"deli", "diner", "bistro", "pizzeria", "taqueria", "patisserie",
			"on", "street", "avenue", "located", "downtown", "opens", "closes"},
		Weight: 1,
	},
	{
		Type: "substance.ingredient",
		Signals: []string{"ingredient", "flour", "sugar", "salt", "butter", "milk", "eggs",
			"yeast", "water", "oil", "spice", "herb", "raw material", "grain",
			"wheat", "rice", "corn", "barley", "oats"},
		Weight: 1,
	},
	{
		Type: "substance.product",
		Signals: []string{"bread", "cake", "pizza", "pasta", "cheese", "wine", "beer",
			"chocolate", "coffee", "tea", "juice", "sauce", "jam",
			"product", "item", "sells", "menu", "dish", "$",
			"croissant", "bagel", "muffin", "cookie", "pie", "tart",
			"sourdough", "loaf"},
		Weight: 1,
	},
}

var numPatterns = []numPattern{
	{Pattern: regexp.MustCompile(`[$£€]\s*([\d,.]+)`), Field: "price", Unit: "USD"},
	{Pattern: regexp.MustCompile(`(?i)([\d,.]+)\s*(kg|g|oz|lb|mg|ton)\b`), Field: "weight", UnitGroup: 2},
	{Pattern: regexp.MustCompile(`(?i)([\d,.]+)\s*(ml|l|fl_oz|gal|cup|tbsp|tsp)\b`), Field: "volume", UnitGroup: 2},
	{Pattern: regexp.MustCompile(`(?i)([\d,.]+)\s*°?\s*(celsius|fahrenheit|kelvin|[CFK])\b`), Field: "temperature", UnitGroup: 2},
	{Pattern: regexp.MustCompile(`(?i)([\d,.]+)\s*(acres?|hectares?)\b`), Field: "acreage"},
	{Pattern: regexp.MustCompile(`(?i)([\d.]+)\s*(?:/5\s*)?(?:stars?|star)\b`), Field: "rating"},
	{Pattern: regexp.MustCompile(`(?i)\brated?\s*([\d.]+)`), Field: "rating"},
	{Pattern: regexp.MustCompile(`(?i)\bscore\s*([\d.]+)`), Field: "score"},
	{Pattern: regexp.MustCompile(`(?i)([\d,]+)\s*units?\b`), Field: "lot_size"},
}

var unitNormalize = map[string]string{
	"c": "celsius", "f": "fahrenheit", "k": "kelvin",
	"acre": "acres", "hectare": "hectares",
}

// FB is the single natural language entry point to FoodBlock.
// Describe food in plain English, get FoodBlocks back.
func FB(text string) FBResult {
	if text == "" {
		return FBResult{Text: text}
	}

	lower := strings.ToLower(text)

	// 1. Score intents
	type scored struct {
		typ   string
		score int
	}
	var scores []scored
	for _, intent := range intents {
		s := 0
		for _, signal := range intent.Signals {
			if strings.Contains(lower, signal) {
				s += intent.Weight
			}
		}
		if s > 0 {
			scores = append(scores, scored{intent.typ, s})
		}
	}
	// Sort by score descending
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].score > scores[i].score {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}

	primaryType := "substance.product"
	if len(scores) > 0 {
		primaryType = scores[0].typ
	}

	// 2. Extract name
	name := extractName(text, primaryType)

	// 3. Extract numbers and quantities
	quantities := map[string]interface{}{}
	for _, np := range numPatterns {
		matches := np.Pattern.FindAllStringSubmatch(text, -1)
		for _, m := range matches {
			numStr := strings.ReplaceAll(m[1], ",", "")
			value, err := strconv.ParseFloat(numStr, 64)
			if err != nil {
				continue
			}
			if np.Unit != "" {
				quantities[np.Field] = map[string]interface{}{"value": value, "unit": np.Unit}
			} else if np.UnitGroup > 0 && np.UnitGroup < len(m) {
				rawUnit := strings.ToLower(m[np.UnitGroup])
				if normalized, ok := unitNormalize[rawUnit]; ok {
					rawUnit = normalized
				}
				quantities[np.Field] = map[string]interface{}{"value": value, "unit": rawUnit}
			} else {
				quantities[np.Field] = value
			}
		}
	}

	// 4. Extract boolean flags from all vocabularies
	flags := map[string]interface{}{}
	for _, vocab := range Vocabularies {
		for fieldName, fieldDef := range vocab.Fields {
			if fieldDef.Type == "boolean" {
				for _, alias := range fieldDef.Aliases {
					if strings.Contains(lower, strings.ToLower(alias)) {
						flags[fieldName] = true
					}
				}
			}
			if fieldDef.Type == "compound" {
				for _, alias := range fieldDef.Aliases {
					if strings.Contains(lower, strings.ToLower(alias)) {
						if flags[fieldName] == nil {
							flags[fieldName] = map[string]interface{}{}
						}
						if m, ok := flags[fieldName].(map[string]interface{}); ok {
							m[strings.ToLower(alias)] = true
						}
					}
				}
			}
		}
	}

	// 5. Build state
	state := map[string]interface{}{}
	if name != "" {
		state["name"] = name
	}
	for field, val := range quantities {
		state[field] = val
	}
	for field, val := range flags {
		state[field] = val
	}

	// Type-specific enrichment
	if primaryType == "observe.review" {
		state["text"] = text
	}
	if primaryType == "observe.reading" {
		locRe := regexp.MustCompile(`(?i)\b(?:in|at)\s+(?:the\s+)?(.+?)(?:\s*[,.]|$)`)
		if m := locRe.FindStringSubmatch(text); len(m) > 1 {
			loc := strings.TrimSpace(m[1])
			if len(loc) > 1 && len(loc) < 50 {
				state["location"] = loc
			}
		}
	}
	if primaryType == "actor.producer" {
		growsRe := regexp.MustCompile(`(?i)\b(?:grows?|cultivates?|produces?)\s+(.+?)(?:\s*[,.]|\s+in\s+|\s+on\s+|$)`)
		if m := growsRe.FindStringSubmatch(text); len(m) > 1 {
			state["crop"] = strings.TrimSpace(m[1])
		}
		if v, ok := quantities["acreage"]; ok {
			if m, ok := v.(map[string]interface{}); ok {
				state["acreage"] = m["value"]
			}
		}
		regionRe := regexp.MustCompile(`\bin\s+([A-Z][A-Za-z\s]+?)(?:\s*[,.]|$)`)
		if m := regionRe.FindStringSubmatch(text); len(m) > 1 {
			state["region"] = strings.TrimSpace(m[1])
		}
	}

	// 6. Create primary block
	refs := map[string]interface{}{}
	primary := Create(primaryType, state, refs)
	blocks := []Block{primary}

	return FBResult{
		Blocks:  blocks,
		Primary: primary,
		Type:    primaryType,
		State:   state,
		Text:    text,
	}
}

func extractName(text, typ string) string {
	if typ == "observe.review" {
		atRe := regexp.MustCompile(`(?i)\bat\s+([A-Z][A-Za-z\s']+)`)
		if m := atRe.FindStringSubmatch(text); len(m) > 1 {
			return strings.TrimRight(strings.TrimSpace(m[1]), ",. ")
		}
	}
	if typ == "observe.reading" {
		return ""
	}

	// Try proper noun phrase
	properRe := regexp.MustCompile(`([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+)*(?:'s)?)`)
	if m := properRe.FindStringSubmatch(text); len(m) > 1 {
		candidate := strings.TrimSpace(m[1])
		if len(candidate) > 2 {
			return candidate
		}
	}

	// Fall back to first segment before comma or dollar sign
	parts := regexp.MustCompile(`[,$•\-—|]`).Split(text, 2)
	if len(parts) > 0 {
		seg := strings.TrimSpace(parts[0])
		if len(seg) < 80 {
			// Strip leading articles
			articleRe := regexp.MustCompile(`(?i)^(a|an|the|my|our)\s+`)
			return strings.TrimSpace(articleRe.ReplaceAllString(seg, ""))
		}
	}

	if len(text) > 50 {
		return strings.TrimSpace(text[:50])
	}
	return strings.TrimSpace(text)
}

package foodblock

// WellKnownDoc is the /.well-known/foodblock discovery document.
type WellKnownDoc struct {
	Protocol  string   `json:"protocol"`
	Version   string   `json:"version"`
	Name      string   `json:"name"`
	Types     []string `json:"types"`
	Count     int      `json:"count"`
	Schemas   []string `json:"schemas"`
	Templates []string `json:"templates"`
	Peers     []string `json:"peers"`
	Endpoints struct {
		Blocks string `json:"blocks"`
		Batch  string `json:"batch"`
		Chain  string `json:"chain"`
		Heads  string `json:"heads"`
	} `json:"endpoints"`
}

// WellKnownInfo holds the input for generating a well-known document.
type WellKnownInfo struct {
	Version   string
	Name      string
	Types     []string
	Count     int
	Schemas   []string
	Templates []string
	Peers     []string
}

// WellKnown generates the well-known discovery document for a server.
func WellKnown(info WellKnownInfo) WellKnownDoc {
	version := info.Version
	if version == "" {
		version = "0.4.0"
	}
	name := info.Name
	if name == "" {
		name = "FoodBlock Server"
	}
	types := info.Types
	if types == nil {
		types = []string{}
	}
	schemas := info.Schemas
	if schemas == nil {
		schemas = []string{}
	}
	templates := info.Templates
	if templates == nil {
		templates = []string{}
	}
	peers := info.Peers
	if peers == nil {
		peers = []string{}
	}

	doc := WellKnownDoc{
		Protocol:  "foodblock",
		Version:   version,
		Name:      name,
		Types:     types,
		Count:     info.Count,
		Schemas:   schemas,
		Templates: templates,
		Peers:     peers,
	}
	doc.Endpoints.Blocks = "/blocks"
	doc.Endpoints.Batch = "/blocks/batch"
	doc.Endpoints.Chain = "/chain"
	doc.Endpoints.Heads = "/heads"

	return doc
}

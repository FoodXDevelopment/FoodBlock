package foodblock

import "fmt"

// Explain generates a human-readable narrative for a block and its provenance.
func Explain(hash string, resolve func(string) *Block, maxDepth int) string {
	if maxDepth <= 0 {
		maxDepth = 10
	}
	block := resolve(hash)
	if block == nil {
		return fmt.Sprintf("Block not found: %s", hash)
	}

	visited := make(map[string]bool)
	parts := buildNarrative(block, resolve, visited, 0, maxDepth)
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += " "
		}
		result += p
	}
	return result
}

func buildNarrative(block *Block, resolve func(string) *Block, visited map[string]bool, depth, maxDepth int) []string {
	if block == nil || visited[block.Hash] || depth > maxDepth {
		return nil
	}
	visited[block.Hash] = true

	name := ""
	if n, ok := block.State["name"].(string); ok {
		name = n
	} else if t, ok := block.State["title"].(string); ok {
		name = t
	} else {
		name = block.Type
	}

	var parts []string

	if depth == 0 {
		desc := name
		if price, ok := block.State["price"].(float64); ok {
			desc += fmt.Sprintf(" ($%.2f)", price)
		}
		if rating, ok := block.State["rating"].(float64); ok {
			desc += fmt.Sprintf(" (%.0f/5)", rating)
		}
		parts = append(parts, desc+".")
	}

	refs := block.Refs

	// Actor refs
	for _, role := range []string{"seller", "buyer", "author", "operator", "producer"} {
		if refHash, ok := refs[role].(string); ok {
			actor := resolve(refHash)
			if actor != nil && !visited[actor.Hash] {
				if actorName, ok := actor.State["name"].(string); ok {
					visited[actor.Hash] = true
					if depth == 0 {
						parts = append(parts, "By "+actorName+".")
					}
				}
			}
		}
	}

	// Input/source refs
	for _, role := range []string{"inputs", "source", "origin", "input"} {
		ref, ok := refs[role]
		if !ok {
			continue
		}
		var refHashes []string
		switch v := ref.(type) {
		case string:
			refHashes = []string{v}
		case []interface{}:
			for _, item := range v {
				if s, ok := item.(string); ok {
					refHashes = append(refHashes, s)
				}
			}
		}

		var names []string
		for _, h := range refHashes {
			dep := resolve(h)
			if dep == nil {
				continue
			}
			if depName, ok := dep.State["name"].(string); ok {
				depDesc := depName
				for _, srcRole := range []string{"seller", "source", "producer"} {
					if srcHash, ok := dep.Refs[srcRole].(string); ok {
						srcActor := resolve(srcHash)
						if srcActor != nil {
							if srcName, ok := srcActor.State["name"].(string); ok {
								depDesc += " (" + srcName + ")"
							}
						}
						break
					}
				}
				names = append(names, depDesc)
			}
		}
		if len(names) > 0 {
			joined := ""
			for i, n := range names {
				if i > 0 {
					joined += ", "
				}
				joined += n
			}
			parts = append(parts, "Made from "+joined+".")
		}
	}

	// Certifications
	if certRef, ok := refs["certifications"]; ok {
		var certHashes []string
		switch v := certRef.(type) {
		case string:
			certHashes = []string{v}
		case []interface{}:
			for _, item := range v {
				if s, ok := item.(string); ok {
					certHashes = append(certHashes, s)
				}
			}
		}
		for _, h := range certHashes {
			cert := resolve(h)
			if cert == nil {
				continue
			}
			if certName, ok := cert.State["name"].(string); ok {
				certDesc := "Certified: " + certName
				if validUntil, ok := cert.State["valid_until"].(string); ok {
					certDesc += " (expires " + validUntil + ")"
				}
				parts = append(parts, certDesc+".")
			}
		}
	}

	// Tombstone
	if tombstoned, ok := block.State["tombstoned"].(bool); ok && tombstoned {
		parts = append(parts, "This block has been erased.")
	}

	return parts
}

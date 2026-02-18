package foodblock

import "strings"

// ForwardResult holds the result of a forward traversal.
type ForwardResult struct {
	Referencing []ForwardRef
	Count       int
}

// ForwardRef is a block and the ref role that references the target.
type ForwardRef struct {
	Block Block
	Role  string
}

// RecallResult holds the result of a recall trace.
type RecallResult struct {
	Affected []Block
	Depth    int
	Paths    [][]string
}

// Forward finds all blocks that reference a given hash in any ref field.
func Forward(hash string, resolveForward func(string) []Block) ForwardResult {
	blocks := resolveForward(hash)

	var referencing []ForwardRef
	for _, block := range blocks {
		for role, ref := range block.Refs {
			var hashes []string
			switch v := ref.(type) {
			case string:
				hashes = []string{v}
			case []interface{}:
				for _, item := range v {
					if s, ok := item.(string); ok {
						hashes = append(hashes, s)
					}
				}
			}
			for _, h := range hashes {
				if h == hash {
					referencing = append(referencing, ForwardRef{Block: block, Role: role})
				}
			}
		}
	}

	return ForwardResult{Referencing: referencing, Count: len(referencing)}
}

// Recall traces a contamination/recall path downstream via BFS.
func Recall(sourceHash string, resolveForward func(string) []Block, maxDepth int, types, roles []string) RecallResult {
	if maxDepth <= 0 {
		maxDepth = 50
	}

	visited := map[string]bool{sourceHash: true}
	var affected []Block
	var paths [][]string
	maxDepthReached := 0

	type entry struct {
		hash  string
		depth int
		path  []string
	}
	queue := []entry{{hash: sourceHash, depth: 0, path: []string{sourceHash}}}

	for len(queue) > 0 {
		e := queue[0]
		queue = queue[1:]

		if e.depth >= maxDepth {
			continue
		}

		blocks := resolveForward(e.hash)
		for _, block := range blocks {
			if block.Hash == "" || visited[block.Hash] {
				continue
			}

			// Check role filter
			if len(roles) > 0 {
				var matchingRoles []string
				for role, ref := range block.Refs {
					var hashes []string
					switch v := ref.(type) {
					case string:
						hashes = []string{v}
					case []interface{}:
						for _, item := range v {
							if s, ok := item.(string); ok {
								hashes = append(hashes, s)
							}
						}
					}
					for _, h := range hashes {
						if h == e.hash {
							matchingRoles = append(matchingRoles, role)
						}
					}
				}
				hasMatch := false
				for _, mr := range matchingRoles {
					for _, r := range roles {
						if mr == r {
							hasMatch = true
						}
					}
				}
				if !hasMatch {
					continue
				}
			}

			// Check type filter
			if len(types) > 0 {
				matchesType := false
				for _, t := range types {
					if strings.HasSuffix(t, ".*") {
						prefix := t[:len(t)-1]
						if strings.HasPrefix(block.Type, prefix) {
							matchesType = true
						}
					} else if block.Type == t {
						matchesType = true
					}
				}
				if !matchesType {
					continue
				}
			}

			visited[block.Hash] = true
			currentDepth := e.depth + 1
			blockPath := append(append([]string{}, e.path...), block.Hash)

			if currentDepth > maxDepthReached {
				maxDepthReached = currentDepth
			}

			affected = append(affected, block)
			paths = append(paths, blockPath)
			queue = append(queue, entry{hash: block.Hash, depth: currentDepth, path: blockPath})
		}
	}

	return RecallResult{Affected: affected, Depth: maxDepthReached, Paths: paths}
}

// Downstream finds all downstream substance blocks of a given ingredient.
func Downstream(ingredientHash string, resolveForward func(string) []Block) []Block {
	result := Recall(ingredientHash, resolveForward, 50, []string{"substance.*"}, nil)
	return result.Affected
}

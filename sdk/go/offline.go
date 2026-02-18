package foodblock

import "sort"

// OfflineQueue stores blocks created offline for later sync.
type OfflineQueue struct {
	blocks []Block
}

// NewOfflineQueue creates a new offline queue.
func NewOfflineQueue() *OfflineQueue {
	return &OfflineQueue{}
}

// Create creates a block and adds it to the offline queue.
func (q *OfflineQueue) Create(typ string, state, refs map[string]interface{}) Block {
	block := Create(typ, state, refs)
	q.blocks = append(q.blocks, block)
	return block
}

// Update creates an update block and adds it to the offline queue.
func (q *OfflineQueue) Update(previousHash, typ string, state, refs map[string]interface{}) Block {
	block := Update(previousHash, typ, state, refs)
	q.blocks = append(q.blocks, block)
	return block
}

// Blocks returns a copy of all queued blocks.
func (q *OfflineQueue) Blocks() []Block {
	result := make([]Block, len(q.blocks))
	copy(result, q.blocks)
	return result
}

// Len returns the number of queued blocks.
func (q *OfflineQueue) Len() int {
	return len(q.blocks)
}

// Clear empties the queue (e.g. after successful sync).
func (q *OfflineQueue) Clear() {
	q.blocks = nil
}

// Sorted returns blocks in dependency order for sync.
// Blocks that reference other blocks in the queue are placed after their dependencies.
func (q *OfflineQueue) Sorted() []Block {
	hashes := make(map[string]bool)
	for _, b := range q.blocks {
		hashes[b.Hash] = true
	}

	// Build dependency graph
	graph := make(map[string][]string)
	for _, block := range q.blocks {
		var deps []string
		for _, ref := range block.Refs {
			switch v := ref.(type) {
			case string:
				if hashes[v] {
					deps = append(deps, v)
				}
			case []interface{}:
				for _, item := range v {
					if s, ok := item.(string); ok && hashes[s] {
						deps = append(deps, s)
					}
				}
			}
		}
		graph[block.Hash] = deps
	}

	// Topological sort
	visited := make(map[string]bool)
	var result []Block
	blockMap := make(map[string]Block)
	for _, b := range q.blocks {
		blockMap[b.Hash] = b
	}

	var visit func(string)
	visit = func(hash string) {
		if visited[hash] {
			return
		}
		visited[hash] = true
		for _, dep := range graph[hash] {
			visit(dep)
		}
		if b, ok := blockMap[hash]; ok {
			result = append(result, b)
		}
	}

	// Sort hashes for deterministic ordering
	sortedHashes := make([]string, 0, len(q.blocks))
	for _, b := range q.blocks {
		sortedHashes = append(sortedHashes, b.Hash)
	}
	sort.Strings(sortedHashes)

	for _, hash := range sortedHashes {
		visit(hash)
	}

	return result
}

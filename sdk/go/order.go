package foodblock

import "sort"

// Causal order (protocol.md §1, §11). A block's causal past is every block reachable from it through its refs:
// whatever a block names comes before it. Blocks with no causal link are listed by lowest hash only so every reader
// lists them the same way; no rule of authority reads that order (invariant 7), and nobody's clock is read
// (invariant 6).

// CausesOf are the hashes a block names, through every ref.
func CausesOf(b Block) []string {
	out := []string{}
	for _, k := range sortedKeys(b.Refs) {
		for _, h := range list(b.Refs[k]) {
			if isHash(h) {
				out = append(out, h)
			}
		}
	}
	return uniq(out)
}

func pastOf(b Block, byHash *index) map[string]bool {
	past, todo := map[string]bool{}, CausesOf(b)
	for len(todo) > 0 {
		h := todo[len(todo)-1]
		todo = todo[:len(todo)-1]
		if past[h] {
			continue
		}
		past[h] = true
		if held, ok := byHash.get(h); ok {
			todo = append(todo, CausesOf(held)...)
		}
	}
	return past
}

// PastOf is every hash in a block's causal past among these blocks (the block itself is not in it).
func PastOf(b Block, blocks []Block) map[string]bool { return pastOf(b, indexOf(blocks)) }

func sees(later Block, earlier string, byHash *index) bool {
	return later.Type != "" && earlier != "" && pastOf(later, byHash)[earlier]
}

// Sees is whether `later` has `earlier` (a hash) in its causal past.
func Sees(later Block, earlier string, blocks []Block) bool {
	return sees(later, earlier, indexOf(blocks))
}

// HeadsAmong are the blocks no other block among them has in its causal past.
func HeadsAmong(blocks []Block) []Block {
	byHash, named := indexOf(blocks), map[string]bool{}
	for _, b := range blocks {
		for h := range pastOf(b, byHash) {
			named[h] = true
		}
	}
	out := []Block{}
	for _, b := range blocks {
		if !named[b.id()] {
			out = append(out, b)
		}
	}
	return out
}

// CausalOrder lists blocks causes first; each step places, of the blocks whose held causes are all placed, the one with
// the lowest hash.
func CausalOrder(blocks []Block) []Block {
	byHash := indexOf(blocks)
	waits, next := map[string]int{}, map[string][]string{}
	for _, b := range byHash.values() {
		n := 0
		for _, cause := range CausesOf(b) {
			if cause != b.Hash && byHash.has(cause) {
				n++
				next[cause] = append(next[cause], b.Hash)
			}
		}
		waits[b.Hash] = n
	}
	ready := []string{}
	for _, h := range byHash.order {
		if waits[h] == 0 {
			ready = append(ready, h)
		}
	}
	sort.Strings(ready)
	placed := []Block{}
	for len(placed) < len(byHash.order) {
		var h string
		if len(ready) > 0 {
			h, ready = ready[0], ready[1:]
		} else {
			// A cycle (only made-up data can have one) is broken at its lowest hash.
			left := []string{}
			for _, k := range byHash.order {
				if waits[k] > 0 {
					left = append(left, k)
				}
			}
			sort.Strings(left)
			h = left[0]
		}
		waits[h] = -1
		b, _ := byHash.get(h)
		placed = append(placed, b)
		for _, after := range next[h] {
			if waits[after] > 0 {
				waits[after]--
				if waits[after] == 0 {
					at := sort.SearchStrings(ready, after)
					ready = append(ready[:at], append([]string{after}, ready[at:]...)...)
				}
			}
		}
	}
	return placed
}

package foodblock

import (
	"errors"
	"sort"
)

// A key's own chain (protocol.md §1). Every block but a genesis sits in its signing key's chain: `state.seq` its
// number, `refs.prev` the key's previous block. A key's first block has seq 1 and its prev is the block that brought
// the key in (the genesis, or the key grant). Gaps show what is missing; two blocks with one seq prove a lie
// (invariant 3).

// Link is where a block goes in its key's chain.
type Link struct {
	Seq  int64  `json:"seq"`
	Prev string `json:"prev"`
}

// NextLink is where the next block for a key goes: after `last` (the key's latest block), or, with none, first after
// `broughtIn` (the hash of the genesis or key grant that brought the key in).
func NextLink(last *Block, broughtIn string) (Link, error) {
	if last != nil {
		seq, ok := intOf(last.State["seq"])
		if !ok {
			return Link{}, errors.New("chain: the last block has no seq; a key whose blocks have no seq starts again from the block that brought it in")
		}
		return Link{seq + 1, last.id()}, nil
	}
	if broughtIn == "" {
		return Link{}, errors.New("chain: a key's first block follows the block that brought the key in")
	}
	return Link{1, broughtIn}, nil
}

// Chain is one key's chain, checked: its head, its length, the missing seq numbers, the sets of hashes sharing a seq,
// and the blocks whose prev is not the block before them.
type Chain struct {
	Head          *Block     `json:"head"`
	Length        int64      `json:"length"`
	Gaps          []int64    `json:"gaps"`
	Equivocations [][]string `json:"equivocations"`
	Broken        []string   `json:"broken"`
	OK            bool       `json:"ok"`
}

// CheckChain checks one key's chain: blocks it signed (in any order) and the block that brought it in.
func CheckChain(blocks []Block, broughtIn string) Chain {
	bySeq := map[int64][]string{}
	blockOf := indexOf(blocks)
	for _, b := range blocks {
		seq, ok := intOf(b.State["seq"])
		if !ok || seq < 1 {
			continue
		}
		bySeq[seq] = uniq(append(bySeq[seq], b.id()))
	}
	var length int64
	for seq := range bySeq {
		if seq > length {
			length = seq
		}
	}
	c := Chain{Length: length, Gaps: []int64{}, Equivocations: [][]string{}, Broken: []string{}}
	for seq := int64(1); seq <= length; seq++ {
		here, ok := bySeq[seq]
		if !ok {
			c.Gaps = append(c.Gaps, seq)
			continue
		}
		if len(here) > 1 {
			c.Equivocations = append(c.Equivocations, sorted(here))
		}
		before := []string{broughtIn}
		if seq > 1 {
			before = bySeq[seq-1]
		}
		if len(before) == 1 {
			for _, h := range here {
				b, _ := blockOf.get(h)
				if !same(b.Refs["prev"], before[0]) {
					c.Broken = append(c.Broken, h)
				}
			}
		}
	}
	if top := bySeq[length]; len(top) == 1 {
		b, _ := blockOf.get(top[0])
		c.Head = &b
	}
	sort.Slice(c.Gaps, func(i, j int) bool { return c.Gaps[i] < c.Gaps[j] })
	c.OK = len(c.Gaps) == 0 && len(c.Equivocations) == 0 && len(c.Broken) == 0
	return c
}

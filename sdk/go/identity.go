package foodblock

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"
)

// Who someone is (protocol.md §2). Their genesis is the one block with no author: a public `actor` naming its own
// signing key, its encryption key, the hash of an offline recovery key and how far back that key may reach, signed by
// its own key. Its hash is their id. A key comes in by a `grant` of kind key. A rotation (`replaces` and `last_good`)
// voids the old key's blocks after its last good block, and is signed only by that key or by the recovery key
// (invariant 8). A key brought in by a void block is void, and so is every key it brought in. Two rotations of one key
// that do not see each other freeze the keys they bring in, until the recovery key settles it; two recovery rotations
// that do not see each other end the identity. Recovery reach is read from arrival on the reader's node (ArrivedAt),
// never from `at` (invariant 6). History is closed (invariant 16).

// ArrivedAt says when a block arrived on this node (a UTC time), or "".
type ArrivedAt func(hash string) string

// RecoveryKeyHash is the recovery key's hash, as a genesis names it: SHA-256 of its SPKI hex, as UTF-8 text.
func RecoveryKeyHash(publicKeyHex string) string {
	sum := sha256.Sum256([]byte(publicKeyHex))
	return hex.EncodeToString(sum[:])
}

func now() string { return formatTime(time.Now()) }

func signed(b Block, privateKey string) (Block, error) {
	sig, err := Sign(b, privateKey)
	b.Signature = sig
	return b, err
}

// GenesisOptions: Kind (default person), At (default now), EncryptionKey and RecoveryKey (required: X25519 public hex,
// and the recovery key's Ed25519 public key, of which only the hash is written), Reach (default P30D).
type GenesisOptions struct {
	Kind, At, EncryptionKey, RecoveryKey, Reach string
}

// Genesis is a new person, agent, machine or signing circle: their genesis, signed. It names the recovery key (only
// its hash is written) and its reach, and the encryption key if the identity will receive sealed blocks: a micro that
// only signs leaves it out and adds one later by a key grant.
func Genesis(keys Keypair, o GenesisOptions) (Block, error) {
	if o.RecoveryKey == "" {
		return Block{}, errors.New("identity: a 1.6 genesis names its recovery key")
	}
	if o.Kind == "" {
		o.Kind = "person"
	}
	if o.At == "" {
		o.At = now()
	}
	if o.Reach == "" {
		o.Reach = "P30D"
	}
	state := map[string]any{"kind": o.Kind, "at": o.At, "audience": "public", "public_key_sign": keys.PublicKeySign,
		"recovery_key_hash": RecoveryKeyHash(o.RecoveryKey), "recovery_reach": o.Reach}
	if o.EncryptionKey != "" {
		state["public_key_encrypt"] = o.EncryptionKey
	}
	b, err := Create("actor", state, nil)
	if err != nil {
		return Block{}, err
	}
	return signed(b, keys.PrivateKey)
}

// IsGenesis: an actor naming a signing key, with no author and no seq.
func IsGenesis(b Block) bool {
	return b.Type == "actor" && isStr(b.State["public_key_sign"]) && !truthy(b.Refs["author"]) && b.State["seq"] == nil
}

// Is16Genesis is a genesis with the recovery fields: a 1.6 genesis, which has no history.
func Is16Genesis(b Block) bool {
	return IsGenesis(b) && b.State["recovery_key_hash"] != nil && b.State["recovery_reach"] != nil
}

// GenesisOpens: a genesis is valid when its own key opens it.
func GenesisOpens(b Block) bool { return IsGenesis(b) && opens(b, str(b.State["public_key_sign"])) }

// KeySigner signs a key grant: a key the id holds (PrivateKey, its Last block, the block that brought it in), or the
// recovery key (PrivateKey and RecoveryKey, its public key), whose chain starts at the genesis.
type KeySigner struct {
	PrivateKey, BroughtIn, RecoveryKey string
	Last                               *Block
}

// KeyGrantOptions: a rotation names the key it Replaces and that key's LastGood block; Encrypt brings in an encryption
// key; Recovery adds recovery to an older genesis (once).
type KeyGrantOptions struct {
	Replaces, LastGood, At, Encrypt string
	After                           []string
	Recovery                        *struct{ Key, Reach string }
}

// KeyGrant is a key grant, signed: it brings newPublicKey ("" for none) into the id.
func KeyGrant(id, newPublicKey string, signer KeySigner, o KeyGrantOptions) (Block, error) {
	broughtIn := signer.BroughtIn
	if broughtIn == "" {
		broughtIn = id
	}
	place, err := NextLink(signer.Last, broughtIn)
	if err != nil {
		return Block{}, err
	}
	if o.At == "" {
		o.At = now()
	}
	state := map[string]any{"seq": place.Seq, "at": o.At, "audience": "public", "kind": "key"}
	if newPublicKey != "" {
		state["public_key_sign"] = newPublicKey
	}
	if o.Encrypt != "" {
		state["public_key_encrypt"] = o.Encrypt
	}
	if o.Replaces != "" {
		state["replaces"], state["last_good"] = o.Replaces, o.LastGood
	}
	if signer.RecoveryKey != "" {
		state["recovery_key"] = signer.RecoveryKey
	}
	if o.Recovery != nil {
		state["recovery_key_hash"], state["recovery_reach"] = RecoveryKeyHash(o.Recovery.Key), o.Recovery.Reach
	}
	refs := map[string]any{"author": id, "subject": id, "prev": place.Prev}
	if seen := sorted(uniq(o.After)); len(seen) > 0 {
		refs["after"] = seen
	}
	b, err := Create("grant", state, refs)
	if err != nil {
		return Block{}, err
	}
	return signed(b, signer.PrivateKey)
}

// ---- History (§2) ----

// historyCounts: whether a block without seq counts as its author's history. Never for a 1.6 genesis (it has none);
// while an older identity has written no 1.6 block, its history is open and counts; once it has, only what is in its
// first 1.6 block's causal past or manifest counts. What counts, counts in every fold under the rules it was written
// in, read through aliases (an old membership or grant stands). A reader that holds neither the genesis nor a 1.6
// block of the author has nothing that closes the history, so it reads it as open.
func historyCounts(b Block, id string, byHash *index) bool {
	if b.State["seq"] != nil {
		return false
	}
	if root, ok := byHash.get(id); ok && Is16Genesis(root) {
		return false
	}
	firsts := []Block{}
	for _, other := range byHash.values() {
		if seq, ok := intOf(other.State["seq"]); ok && seq == 1 && same(other.Refs["author"], id) && same(other.Refs["prev"], id) {
			firsts = append(firsts, other)
		}
	}
	// An older identity that has written no 1.6 block yet has not closed its history.
	if len(firsts) == 0 {
		return true
	}
	for _, first := range firsts {
		if pastOf(first, byHash)[b.id()] || contains(list(first.State["manifest"]), b.id()) {
			return true
		}
	}
	return false
}

// ---- Two blocks at one seq (§2) ----

// chainRoot: a key's place in its chain, read from the chain alone (no signature): the block that brought the key in,
// found by walking `prev` back to seq 1 (the recovery key's chain, which also starts at the genesis, begins with a
// block naming `recovery_key`). A chain with a gap is named by the first missing link and the seq above it.
func chainRoot(b Block, byHash *index) string {
	at := b
	top, _ := intOf(b.State["seq"])
	for steps := int64(0); steps <= top; steps++ {
		seq, _ := intOf(at.State["seq"])
		if seq == 1 {
			if truthy(at.State["recovery_key"]) {
				return "recovery " + refStr(at, "prev")
			}
			return refStr(at, "prev")
		}
		prev, ok := byHash.get(refStr(at, "prev"))
		prevSeq, whole := intOf(prev.State["seq"])
		if !ok || !whole || prevSeq != seq-1 {
			return fmt.Sprintf("%s@%d", refStr(at, "prev"), seq)
		}
		at = prev
	}
	return ""
}

// forksOf: where each key of each author first signed two blocks at one seq: "author root" → that seq. Read once per
// set of blocks.
func forksOf(byHash *index) map[string]int64 {
	if byHash.forks != nil {
		return byHash.forks
	}
	bySlot, order := map[string][]Block{}, []string{}
	for _, b := range byHash.values() {
		seq, whole := intOf(b.State["seq"])
		if !truthy(b.Refs["author"]) || !whole {
			continue
		}
		slot := fmt.Sprintf("%s %d", refStr(b, "author"), seq)
		if _, ok := bySlot[slot]; !ok {
			order = append(order, slot)
		}
		bySlot[slot] = append(bySlot[slot], b)
	}
	out := map[string]int64{}
	for _, slot := range order {
		group := bySlot[slot]
		if len(group) < 2 {
			continue
		}
		roots := map[string]int{}
		for _, b := range group {
			roots[refStr(b, "author")+" "+chainRoot(b, byHash)]++
		}
		seq, _ := intOf(group[0].State["seq"])
		for key, n := range roots {
			if prior, ok := out[key]; n > 1 && (!ok || prior > seq) {
				out[key] = seq
			}
		}
	}
	byHash.forks = out
	return out
}

func forked(b Block, byHash *index) bool {
	seq, whole := intOf(b.State["seq"])
	if !truthy(b.Refs["author"]) || !whole {
		return false
	}
	forks := forksOf(byHash)
	if len(forks) == 0 {
		return false
	}
	first, ok := forks[refStr(b, "author")+" "+chainRoot(b, byHash)]
	return ok && seq >= first
}

// Forked is whether a block is one of two at one seq of its key, or a later block of that key: proof of a lie, counted
// for nothing in every fold but the identity fold (§2, Two blocks at one seq; §11, Equivocations in folds).
func Forked(b Block, blocks []Block) bool { return forked(b, indexOf(blocks)) }

// counts: whether a block counts in a fold other than the identity fold: one with seq unless its key signed two
// blocks at one seq at or before it (its signature is the reader's own check); one without, as history.
func counts(b Block, byHash *index) bool {
	if IsGenesis(b) {
		return true
	}
	if b.State["seq"] != nil {
		return !forked(b, byHash)
	}
	return historyCounts(b, refStr(b, "author"), byHash)
}

// HistoryCounts is whether a block without seq counts as its author's history: open history counts; closed history
// counts only in the first 1.6 block's causal past or manifest; a 1.6 identity has none.
func HistoryCounts(b Block, id string, blocks []Block) bool {
	return historyCounts(b, id, indexOf(blocks))
}

// ---- Keys ----

// KeyEntry is one key an id has held: the key, the block that brought it in, the key that signed that block ("" for
// the genesis, "recovery" for the recovery key), and whether it is void or frozen.
type KeyEntry struct {
	Key    string `json:"key"`
	By     string `json:"by"`
	Signer string `json:"signer"`
	Void   bool   `json:"void"`
	Frozen bool   `json:"frozen"`
}

// Rotation is how one old key was rotated.
type Rotation struct {
	By       string
	All      []string
	LastGood string
	Recovery bool
	Floor    string
}

// Identity is what an id's keys are, read from its chain alone.
type Identity struct {
	Keys      []*KeyEntry
	Rotations map[string]Rotation
	Recovery  []string
	Ended     []string
}

func keyGrantsOf(id string, byHash *index) []Block {
	out := []Block{}
	for _, b := range byHash.values() {
		if b.Type == "grant" && b.State["kind"] == "key" && same(b.Refs["author"], id) && same(b.Refs["subject"], id) && isInt(b.State["seq"]) && b.State["status"] == nil {
			out = append(out, b)
		}
	}
	return CausalOrder(out)
}

// earliest are those of a set whose causal past holds no other of them.
func earliest(set []Block, byHash *index) []Block {
	out := []Block{}
	for _, one := range set {
		first := true
		for _, other := range set {
			if other.Hash != one.Hash && sees(one, other.Hash, byHash) {
				first = false
				break
			}
		}
		if first {
			out = append(out, one)
		}
	}
	return out
}

func hashesOfBlocks(blocks []Block) []string {
	out := []string{}
	for _, b := range blocks {
		out = append(out, b.id())
	}
	return out
}

type keyContext struct {
	byHash    *index
	rotations map[string]Rotation
	arrivedAt ArrivedAt
	id        string
}

func identityOf(id string, byHash *index, arrivedAt ArrivedAt) Identity {
	root, ok := byHash.get(id)
	if !ok || !GenesisOpens(root) {
		return Identity{Rotations: map[string]Rotation{}}
	}
	grants := keyGrantsOf(id, byHash)
	rotations := map[string]Rotation{}
	var result Identity
	// Rotations can void grants that came before them in causal order, so read until nothing changes.
	for pass := 0; pass <= len(grants)+1; pass++ {
		result = readKeys(id, root, grants, byHash, rotations, arrivedAt)
		unchanged := reflect.DeepEqual(result.Rotations, rotations)
		rotations = result.Rotations
		if unchanged && pass > 0 {
			break
		}
	}
	return result
}

// IdentityOf is what an id's keys are among these blocks. arrivedAt (may be nil) gives arrival times for recovery reach.
func IdentityOf(id string, blocks []Block, arrivedAt ArrivedAt) Identity {
	return identityOf(id, indexOf(blocks), arrivedAt)
}

func readKeys(id string, root Block, grants []Block, byHash *index, rotations map[string]Rotation, arrivedAt ArrivedAt) Identity {
	recoveryHashes := []string{}
	if h := str(root.State["recovery_key_hash"]); h != "" {
		recoveryHashes = append(recoveryHashes, h)
	}
	keys := []*KeyEntry{{Key: str(root.State["public_key_sign"]), By: root.Hash}}
	recovery := []string{}
	selfRotations, recoveryRotations := map[string][]Block{}, map[string][]Block{}
	olds := []string{}
	slots, slotOrder := map[string][]Block{}, []string{}
	ctx := keyContext{byHash, rotations, arrivedAt, id}
	for _, grant := range grants {
		state := grant.State
		rk := str(state["recovery_key"])
		byRecovery := rk != "" && contains(recoveryHashes, RecoveryKeyHash(rk)) && opens(grant, rk)
		var signer *KeyEntry
		if !byRecovery {
			for _, entry := range keys {
				if !entry.Void && !entry.Frozen && opens(grant, entry.Key) && speaks(entry, grant, ctx) {
					signer = entry
					break
				}
			}
		}
		if !byRecovery && signer == nil {
			continue
		}
		if byRecovery && !contains(recovery, rk) {
			recovery = append(recovery, rk)
		}
		// An older genesis adds recovery once, by a key grant naming it.
		if h := str(state["recovery_key_hash"]); h != "" && len(recoveryHashes) == 0 {
			recoveryHashes = append(recoveryHashes, h)
		}
		if replaces := str(state["replaces"]); replaces != "" {
			// A key is rotated only by itself or by the recovery key.
			if !byRecovery && signer.Key != replaces {
				continue
			}
			if !contains(olds, replaces) {
				olds = append(olds, replaces)
			}
			if byRecovery {
				recoveryRotations[replaces] = append(recoveryRotations[replaces], grant)
			} else {
				selfRotations[replaces] = append(selfRotations[replaces], grant)
			}
		}
		if pk := str(state["public_key_sign"]); pk != "" {
			by := "recovery"
			if !byRecovery {
				by = signer.Key
			}
			keys = append(keys, &KeyEntry{Key: pk, By: grant.Hash, Signer: by})
		}
		if !byRecovery {
			slot := fmt.Sprintf("%s %d", signer.Key, int64(jsNumber(state["seq"])))
			if _, ok := slots[slot]; !ok {
				slotOrder = append(slotOrder, slot)
			}
			slots[slot] = append(slots[slot], grant)
		}
	}
	freeze := func(grantHash string) {
		for _, entry := range keys {
			if entry.By == grantHash {
				entry.Frozen = true
			}
		}
	}
	next := map[string]Rotation{}
	all := []Block{}
	for _, old := range olds {
		all = append(all, recoveryRotations[old]...)
	}
	var ended []string
	if crossing := earliest(all, byHash); len(crossing) > 1 {
		ended = sorted(hashesOfBlocks(crossing))
	}
	for _, old := range olds {
		byRec, bySelf := earliest(recoveryRotations[old], byHash), earliest(selfRotations[old], byHash)
		if len(byRec) > 0 {
			chain := CausalOrder(recoveryRotations[old])
			rule := chain[len(chain)-1]
			for _, grant := range selfRotations[old] {
				if !sees(rule, grant.Hash, byHash) {
					freeze(grant.Hash)
				}
			}
			floor := ""
			if arrivedAt != nil {
				if arrived := arrivedAt(rule.Hash); arrived != "" {
					reach := str(root.State["recovery_reach"])
					if reach == "" {
						reach = recoveryReachOf(id, byHash)
					}
					floor = AddDuration(arrived, reach, -1)
				}
			}
			next[old] = Rotation{By: rule.Hash, All: sorted(append(hashesOfBlocks(selfRotations[old]), hashesOfBlocks(recoveryRotations[old])...)),
				LastGood: str(rule.State["last_good"]), Recovery: true, Floor: floor}
			continue
		}
		if len(bySelf) > 1 {
			for _, grant := range bySelf {
				freeze(grant.Hash)
			}
		}
		goods := []Block{}
		for _, grant := range bySelf {
			if good, ok := byHash.get(str(grant.State["last_good"])); ok {
				goods = append(goods, good)
			}
		}
		sort.SliceStable(goods, func(i, j int) bool { return jsNumber(goods[i].State["seq"]) < jsNumber(goods[j].State["seq"]) })
		lastGood := str(bySelf[0].State["last_good"])
		if len(goods) > 0 {
			lastGood = goods[0].Hash
		}
		hashes := sorted(hashesOfBlocks(bySelf))
		by := ""
		for i, h := range hashes {
			if i > 0 {
				by += ","
			}
			by += h
		}
		next[old] = Rotation{By: by, All: hashes, LastGood: lastGood}
	}
	// Two key grants at one seq of one key (a fork, rotating or not): Conflict applies. The keys they bring in freeze
	// until a recovery rotation of that key settles it; then those in its causal past speak.
	for _, slot := range slotOrder {
		pair := slots[slot]
		if len(pair) < 2 {
			continue
		}
		signer := slot[:strings.LastIndex(slot, " ")]
		var rule *Block
		if settle := recoveryRotations[signer]; len(settle) > 0 {
			chain := CausalOrder(settle)
			rule = &chain[len(chain)-1]
		}
		for _, grant := range pair {
			if rule == nil || !sees(*rule, grant.Hash, byHash) {
				freeze(grant.Hash)
			}
		}
	}
	// A key brought in by a void block is void, and so is every key it brought in.
	nextCtx := keyContext{byHash, next, arrivedAt, id}
	for _, entry := range keys[1:] {
		grant, _ := byHash.get(entry.By)
		var signer *KeyEntry
		if entry.Signer != "recovery" {
			for _, other := range keys {
				if other.Key == entry.Signer {
					signer = other
					break
				}
			}
		}
		if signer != nil && (signer.Void || !speaks(signer, grant, nextCtx)) {
			entry.Void = true
		}
		if signer != nil && signer.Frozen {
			entry.Frozen = true
		}
	}
	return Identity{Keys: keys, Rotations: next, Recovery: recovery, Ended: ended}
}

func recoveryReachOf(id string, byHash *index) string {
	for _, b := range byHash.values() {
		if b.Type == "grant" && same(b.Refs["author"], id) && truthy(b.State["recovery_reach"]) {
			return str(b.State["recovery_reach"])
		}
	}
	return ""
}

// speaks: whether a key speaks for a block: never rotated, or the block is at or before its last good block (or is
// the rotation itself), or a recovery rotation cannot reach it.
func speaks(entry *KeyEntry, b Block, ctx keyContext) bool {
	if entry.Void || entry.Frozen {
		return false
	}
	if b.State["seq"] == nil {
		return historyCounts(b, ctx.id, ctx.byHash)
	}
	rotation, ok := ctx.rotations[entry.Key]
	if !ok {
		return true
	}
	if contains(rotation.All, b.Hash) && (!rotation.Recovery || rotation.By == b.Hash) {
		return earliestRotation(b, rotation, ctx.byHash)
	}
	if b.Hash == rotation.LastGood {
		return true
	}
	if good, ok := ctx.byHash.get(rotation.LastGood); ok && isInt(good.State["seq"]) && jsNumber(b.State["seq"]) <= jsNumber(good.State["seq"]) {
		return true
	}
	return rotation.Recovery && beyondReach(b, rotation, ctx.byHash, ctx.arrivedAt)
}

// earliestRotation: the rotation itself stands; a later rotation of the same key that has seen it does not.
func earliestRotation(b Block, rotation Rotation, byHash *index) bool {
	for _, other := range rotation.All {
		if other != b.Hash && sees(b, other, byHash) {
			return false
		}
	}
	return true
}

// beyondReach: a recovery rotation cannot void a block that arrived, or that another identity built on and that
// arrived, before its reach began (the rotation's arrival, less recovery_reach). Without arrival times, everything is
// within reach.
func beyondReach(b Block, rotation Rotation, byHash *index, arrivedAt ArrivedAt) bool {
	if rotation.Floor == "" || arrivedAt == nil {
		return false
	}
	ones := []Block{b}
	for _, other := range byHash.values() {
		if !same(other.Refs["author"], b.Refs["author"]) && pastOf(other, byHash)[b.Hash] {
			ones = append(ones, other)
		}
	}
	for _, one := range ones {
		if at := arrivedAt(one.Hash); at != "" && at < rotation.Floor {
			return true
		}
	}
	return false
}

// KeyTimeline is every key an id has held.
func KeyTimeline(id string, blocks []Block, arrivedAt ArrivedAt) []*KeyEntry {
	return identityOf(id, indexOf(blocks), arrivedAt).Keys
}

// KeysOf are the id's keys that are not void.
func KeysOf(id string, blocks []Block, arrivedAt ArrivedAt) []string {
	out := []string{}
	for _, entry := range KeyTimeline(id, blocks, arrivedAt) {
		if !entry.Void {
			out = append(out, entry.Key)
		}
	}
	return out
}

func signedByAuthor(b Block, byHash *index, arrivedAt ArrivedAt) bool {
	if IsGenesis(b) {
		return GenesisOpens(b)
	}
	b.Hash = b.id()
	all := byHash.with(b)
	id := str(b.Refs["author"])
	state := identityOf(id, all, arrivedAt)
	if state.Ended != nil {
		stands := false
		for _, h := range state.Ended {
			end, _ := all.get(h)
			if h == b.Hash || pastOf(end, all)[b.Hash] {
				stands = true
			}
		}
		if !stands {
			return false
		}
	}
	rk := str(b.State["recovery_key"])
	if b.Type == "grant" && contains(state.Recovery, rk) && opens(b, rk) {
		return true
	}
	// The recovery key also signs defeats of a successor's trigger.
	if b.Type == "observe" && truthy(b.Refs["defeats"]) {
		for _, key := range state.Recovery {
			if opens(b, key) {
				return true
			}
		}
	}
	ctx := keyContext{all, state.Rotations, arrivedAt, id}
	for _, entry := range state.Keys {
		if opens(b, entry.Key) && speaks(entry, b, ctx) {
			return true
		}
	}
	return false
}

// SignedByAuthor is whether a signed block is its author's: its signature opens with one of the id's keys that speaks
// for it, or it is a key grant the recovery key signed. Two recovery rotations that cross end the identity: then only
// what either of them saw still stands.
func SignedByAuthor(b Block, blocks []Block, arrivedAt ArrivedAt) bool {
	return signedByAuthor(b, indexOf(blocks), arrivedAt)
}

// IdentityState is the identity fold (§11, What each fold returns): SignedByAuthor (hash → whether the block is the
// id's, for the genesis and every block naming it as author), Keys (sorted, not void), Frozen (sorted), Operators
// (sorted), History (none for a 1.6 genesis, open or closed).
type IdentityState struct {
	SignedByAuthor map[string]bool `json:"signed_by_author"`
	Keys           []string        `json:"keys"`
	Frozen         []string        `json:"frozen"`
	Operators      []string        `json:"operators"`
	History        string          `json:"history"`
}

// IdentityStateOf is the identity fold of an id among these blocks.
func IdentityStateOf(id string, blocks []Block, arrivedAt ArrivedAt) IdentityState {
	byHash := indexOf(blocks)
	out := IdentityState{SignedByAuthor: map[string]bool{}, Keys: []string{}, Frozen: []string{}}
	for _, b := range byHash.values() {
		if b.Hash == id || same(b.Refs["author"], id) {
			out.SignedByAuthor[b.Hash] = signedByAuthor(b, byHash, arrivedAt)
		}
	}
	for _, entry := range identityOf(id, byHash, arrivedAt).Keys {
		if entry.Void {
			continue
		}
		out.Keys = append(out.Keys, entry.Key)
		if entry.Frozen {
			out.Frozen = append(out.Frozen, entry.Key)
		}
	}
	out.Keys, out.Frozen = sorted(out.Keys), sorted(out.Frozen)
	out.Operators = OperatorsOf(id, blocks)
	firsts := false
	for _, b := range byHash.values() {
		if seq, ok := intOf(b.State["seq"]); ok && seq == 1 && same(b.Refs["author"], id) && same(b.Refs["prev"], id) {
			firsts = true
		}
	}
	root, ok := byHash.get(id)
	switch {
	case ok && Is16Genesis(root):
		out.History = "none"
	case firsts:
		out.History = "closed"
	default:
		out.History = "open"
	}
	return out
}

// SignerOf is which of these keys signed a block (its public key), or "".
func SignerOf(b Block, keys []*KeyEntry) string {
	for _, entry := range keys {
		if opens(b, entry.Key) {
			return entry.Key
		}
	}
	return ""
}

// KeyChain is one key's chain for an id.
type KeyChain struct {
	Key, By string
	Chain
}

func chainsOf(id string, byHash *index) []KeyChain {
	mine := []Block{}
	for _, b := range byHash.values() {
		if same(b.Refs["author"], id) && isInt(b.State["seq"]) {
			mine = append(mine, b)
		}
	}
	out := []KeyChain{}
	for _, entry := range identityOf(id, byHash, nil).Keys {
		signedBy := []Block{}
		for _, b := range mine {
			if opens(b, entry.Key) {
				signedBy = append(signedBy, b)
			}
		}
		out = append(out, KeyChain{entry.Key, entry.By, CheckChain(signedBy, entry.By)})
	}
	return out
}

// ChainsOf is each key's chain for an id. Blocks without seq sit in no chain.
func ChainsOf(id string, blocks []Block) []KeyChain { return chainsOf(id, indexOf(blocks)) }

// NextLinkFor is where an id's next block goes for one of its keys.
func NextLinkFor(id, publicKey string, blocks []Block) (Link, error) {
	for _, c := range ChainsOf(id, blocks) {
		if c.Key != publicKey {
			continue
		}
		if len(c.Equivocations) > 0 {
			return Link{}, errors.New("identity: this key has signed two blocks with one seq")
		}
		return NextLink(c.Head, c.By)
	}
	return Link{}, errors.New("identity: that key is not one of theirs")
}

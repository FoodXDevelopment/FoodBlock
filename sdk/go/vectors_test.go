package foodblock

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// Conformance: every section of spec/vectors.json and spec/canonical-vectors.json, run the way
// spec/run-vectors.cjs runs them against the reference SDK. A section this SDK cannot run would fail here by name;
// none is skipped.

const root = "../.."

func load(t *testing.T, parts ...string) any {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(append([]string{root}, parts...)...))
	if err != nil {
		t.Fatal(err)
	}
	v, err := decodeJSON(data)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

var V map[string]any

func vectors(t *testing.T) map[string]any {
	if V == nil {
		V = obj(load(t, "spec", "vectors.json"))
	}
	return V
}

func items(v any) []map[string]any {
	list, _ := arr(v)
	out := []map[string]any{}
	for _, item := range list {
		out = append(out, obj(item))
	}
	return out
}

func blockOf(v map[string]any) Block {
	inner := obj(v["block"])
	return Block{Hash: str(v["hash"]), Type: str(inner["type"]), State: orEmpty(obj(inner["state"])), Refs: orEmpty(obj(inner["refs"])), Signature: str(v["signature"])}
}

func blocksOf(v any) []Block {
	out := []Block{}
	for _, item := range items(v) {
		out = append(out, blockOf(item))
	}
	return out
}

func find(blocks []Block, hash string) Block {
	for _, b := range blocks {
		if b.Hash == hash {
			return b
		}
	}
	return Block{Hash: hash}
}

func pub(t *testing.T, signer any) string {
	return str(obj(obj(vectors(t)["keys"])[str(signer)])["public_key_sign"])
}

func key(t *testing.T, name any) map[string]any { return obj(obj(vectors(t)["keys"])[str(name)]) }

// toJSON is a value as plain JSON (structs by their tags), for comparing with a vector.
func toJSON(v any) any {
	data, _ := json.Marshal(v)
	out, _ := decodeJSON(data)
	return out
}

func eq(a, b any) bool { return equalJSON(toJSON(a), toJSON(b)) }

// subset: every key given must match; arrays of the same length elementwise; anything else by deep equality.
func subset(got any, want any) bool {
	g, w := toJSON(got), toJSON(want)
	if wl, ok := w.([]any); ok {
		gl, ok := g.([]any)
		if !ok || len(gl) != len(wl) {
			return false
		}
		for i := range wl {
			if !subset(gl[i], wl[i]) {
				return false
			}
		}
		return true
	}
	if wm, ok := w.(map[string]any); ok {
		gm, ok := g.(map[string]any)
		if !ok {
			return false
		}
		for k, v := range wm {
			if !subset(gm[k], v) {
				return false
			}
		}
		return true
	}
	return equalJSON(g, w)
}

// flat is a block as the vectors write it inline: { hash, type, state, refs, signature, suite? }.
func flat(m map[string]any) Block {
	data, _ := json.Marshal(m)
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var b Block
	_ = dec.Decode(&b)
	b.State, b.Refs = orEmpty(b.State), orEmpty(b.Refs)
	return b
}

type runner struct {
	t          *testing.T
	pass, fail int
}

func (r *runner) report(ok bool, name string, why ...string) {
	if ok {
		r.pass++
		return
	}
	r.fail++
	r.t.Errorf("✗ %s %s", name, strings.Join(why, " "))
}

func (r *runner) attempt(name string, fn func() bool) {
	defer func() {
		if e := recover(); e != nil {
			r.report(false, name, fmt.Sprint(e))
		}
	}()
	r.report(fn(), name)
}

// codesOf are the codes a refusal list carries, once each, in order.
func codesOf(found []Finding) []string {
	out := []string{}
	for _, f := range found {
		if !contains(out, f.Code) {
			out = append(out, f.Code)
		}
	}
	return out
}

func codes(b Block, held []Block) []string {
	return codesOf(Refusals(b.Type, b.State, b.Refs, CheckOptions{Held: byHashMap(held)}))
}

func byHashMap(blocks []Block) map[string]Block {
	out := map[string]Block{}
	for _, b := range blocks {
		out[b.Hash] = b
	}
	return out
}

func arrivalsOf(m map[string]any) ArrivedAt {
	if m == nil {
		return nil
	}
	return func(h string) string { return str(m[h]) }
}

func TestVectors(t *testing.T) {
	v := vectors(t)
	r := &runner{t: t}
	sections := []string{}
	for k := range v {
		sections = append(sections, k)
	}
	sort.Strings(sections)
	ran := map[string]bool{"$comment": true, "comment": true, "keys": true}

	// Canonical form: the adversarial cases.
	for _, c := range items(obj(load(t, "spec", "canonical-vectors.json"))["vectors"]) {
		b := obj(c["block"])
		hashOf := func(o map[string]any) string {
			h, _ := Hash(str(o["type"]), obj(o["state"]), obj(o["refs"]))
			return h
		}
		canon := func(o map[string]any) string {
			s, _ := Canonical(str(o["type"]), obj(o["state"]), obj(o["refs"]))
			return s
		}
		ok := true
		if c["same_as"] != nil {
			ok = ok && hashOf(b) == hashOf(obj(c["same_as"]))
		}
		if c["not_same_as"] != nil {
			ok = ok && hashOf(b) != hashOf(obj(c["not_same_as"]))
		}
		if c["canonical_contains"] != nil {
			ok = ok && strings.Contains(canon(b), str(c["canonical_contains"]))
		}
		if c["canonical"] != nil {
			ok = ok && canon(b) == str(c["canonical"])
		}
		if c["refused"] != nil {
			got := codesOf(Refusals(str(b["type"]), obj(b["state"]), obj(b["refs"])))
			for _, code := range list(c["refused"]) {
				ok = ok && contains(got, code)
			}
		}
		r.report(ok, "canonical: "+str(c["name"]))
	}
	ran["canonical"] = true
	for _, c := range items(v["canonical"]) {
		b := blockOf(c)
		cs, _ := Canonical(b.Type, b.State, b.Refs)
		h, _ := Hash(b.Type, b.State, b.Refs)
		r.report(cs == str(c["canonical"]) && h == str(c["hash"]), "canonical: "+str(c["name"]))
	}

	// Hashes: one block of every type, each valid against the blocks before it, its signature opens, one chain per author.
	ran["hashes"], ran["ledger"] = true, true
	byHash := map[string]Block{}
	ledger := append(items(obj(v["ledger"])["genesis"]), items(v["hashes"])...)
	for _, c := range ledger {
		byHash[str(c["hash"])] = blockOf(c)
	}
	before := []Block{}
	for _, c := range ledger {
		b := blockOf(c)
		if c["canonical"] != nil {
			cs, _ := Canonical(b.Type, b.State, b.Refs)
			h, _ := Hash(b.Type, b.State, b.Refs)
			r.report(cs == str(c["canonical"]) && h == str(c["hash"]), "hash: "+str(c["name"]))
		}
		h, _ := Hash(b.Type, b.State, b.Refs)
		r.report(h == b.Hash && Verify(b, b.Signature, pub(t, c["signer"])), "ledger: "+str(c["name"])+": hash and signature")
		wrong := Valid(b, before, nil, nil)
		r.report(len(wrong) == 0, "valid: "+str(c["name"]), codesOf(wrong)...)
		before = append(before, b)
	}
	authors := []string{}
	for _, c := range items(v["hashes"]) {
		if a := str(obj(obj(c["block"])["refs"])["author"]); a != "" && !contains(authors, a) {
			authors = append(authors, a)
		}
	}
	for _, id := range authors {
		mine := []Block{}
		for _, c := range items(v["hashes"]) {
			if same(obj(obj(c["block"])["refs"])["author"], id) {
				mine = append(mine, blockOf(c))
			}
		}
		r.report(CheckChain(mine, id).OK, fmt.Sprintf("chain: %s's %d blocks, no gaps, no equivocation", id[:8], len(mine)))
	}
	ran["audience"] = true
	for _, c := range items(v["audience"]) {
		r.report(SaltedHash(str(c["salt"]), str(c["recipient"])) == str(c["commitment"]), "audience: "+str(c["name"]))
	}

	// Every signed block in every story: its hash and its signature, and every block of a story passes the strict check.
	folds, refusals, sealed := obj(v["folds"]), obj(v["refusals"]), obj(v["sealed"])
	type story struct {
		group, name string
		blocks      any
	}
	stories := []story{}
	add := func(group string, list any) {
		for _, c := range items(list) {
			stories = append(stories, story{group, str(c["name"]), c["blocks"]})
		}
	}
	add("identity", v["identities"])
	add("deal", v["deals"])
	add("circle", v["circles"])
	foldNames := []string{}
	for k := range folds {
		foldNames = append(foldNames, k)
	}
	sort.Strings(foldNames)
	for _, k := range foldNames {
		add(k+" fold", folds[k])
	}
	stories = append(stories, story{"refusal", "stories", refusals["blocks"]})
	for _, c := range items(refusals["cases"]) {
		if c["blocks"] != nil {
			stories = append(stories, story{"refusal", str(c["name"]), c["blocks"]})
		}
	}
	stories = append(stories, story{"sealed", "stories", sealed["blocks"]})
	for _, s := range stories {
		wrong := []string{}
		for _, c := range items(s.blocks) {
			b := blockOf(c)
			byHash[b.Hash] = b
			// the suite comes from the key that signed the block
			open := str(key(t, c["signer"])["suite"])
			if open == "" {
				open = "std"
			}
			if h, _ := Hash(b.Type, b.State, b.Refs, open); h != b.Hash {
				wrong = append(wrong, str(c["name"])+": hash")
			}
			if !Verify(b, b.Signature, pub(t, c["signer"])) {
				wrong = append(wrong, str(c["name"])+": signature")
			}
			if found := Refusals(b.Type, b.State, b.Refs); len(found) > 0 {
				wrong = append(wrong, str(c["name"])+": "+strings.Join(codesOf(found), ", "))
			}
		}
		r.report(len(wrong) == 0, fmt.Sprintf("%s: %s: blocks hash, verify and pass the check", s.group, s.name), wrong...)
	}
	ran["identities"], ran["deals"], ran["circles"], ran["folds"], ran["refusals"], ran["sealed"] = true, true, true, true, true, true

	opensVector := func(c map[string]any) bool {
		b, ok := byHash[str(c["hash"])]
		return ok && Verify(b, str(c["signature"]), pub(t, c["signer"]))
	}
	ran["signatures"], ran["bad_signatures"] = true, true
	for _, c := range items(v["signatures"]) {
		r.report(opensVector(c), "signature: "+str(c["name"]))
	}
	for _, c := range items(v["bad_signatures"]) {
		r.report(!opensVector(c), "bad signature refused: "+str(c["name"]))
	}

	// Envelopes, sealed copies, headers.
	ran["envelopes"], ran["headers"] = true, true
	for _, c := range items(v["envelopes"]) {
		r.attempt("envelope: "+str(c["name"]), func() bool {
			opened, err := Open(obj(c["envelope"]), str(key(t, c["recipient"])["x25519_private"]))
			if err != nil {
				return false
			}
			m, err := Unwrap(opened)
			want := obj(c["opens_to"])
			return err == nil && m.Hash == str(want["hash"]) && m.Signature == str(want["signature"])
		})
	}
	for _, c := range items(sealed["cases"]) {
		r.attempt("sealed: "+str(c["name"]), func() bool {
			m, err := OpenCopy(obj(c["message"]), str(key(t, c["recipient"])["x25519_private"]))
			want := obj(c["opens_to"])
			return err == nil && m.Hash == str(want["hash"]) && m.Signature == str(want["signature"]) && eq(m.Reveals, want["reveals"]) && HeaderSignedBy(obj(c["message"]), pub(t, c["signer"]))
		})
	}
	for _, c := range items(v["headers"]) {
		head := cloneMap(obj(c["header"]))
		head["signature"] = c["header_signature"]
		r.report(eq(Header(byHash[str(c["hash"])]), c["header"]) && VerifyMessage(head, pub(t, c["signer"])), "header: "+str(c["name"]))
	}

	// Identities: which blocks are their author's, which keys speak, who operates an agent.
	for _, c := range items(v["identities"]) {
		held := blocksOf(c["blocks"])
		arrived := arrivalsOf(obj(c["arrivals"]))
		unknown := UnknownArrival(str(c["unknown_arrival"]))
		id := str(c["id"])
		for _, b := range held {
			if want, ok := obj(c["signed_by_author"])[b.Hash]; ok {
				r.report(SignedByAuthor(b, held, arrived, unknown) == want, fmt.Sprintf("identity: %s: %s", c["name"], b.Hash[:8]))
			}
		}
		if c["keys"] != nil {
			r.report(eq(sorted(KeysOf(id, held, arrived, unknown)), c["keys"]), fmt.Sprintf("identity: %s: the keys that speak", c["name"]))
		}
		if c["frozen"] != nil {
			frozen := []string{}
			for _, e := range KeyTimeline(id, held, nil, "") {
				if e.Frozen {
					frozen = append(frozen, e.Key)
				}
			}
			r.report(eq(sorted(frozen), c["frozen"]), fmt.Sprintf("identity: %s: the frozen keys", c["name"]))
		}
		if c["operators"] != nil {
			r.report(eq(OperatorsOf(id, held), c["operators"]), fmt.Sprintf("identity: %s: its operators", c["name"]))
		}
		{
			state := IdentityStateOf(id, held, arrived, unknown)
			ok := eq(state.Keys, c["keys"]) && (c["frozen"] == nil || eq(state.Frozen, c["frozen"]))
			for h, want := range obj(c["signed_by_author"]) {
				if got, there := state.SignedByAuthor[h]; there {
					ok = ok && got == want
				}
			}
			r.report(ok, fmt.Sprintf("identity: %s: the identity fold (signed_by_author, keys, frozen)", c["name"]))
		}
		// The limit is the principal's fence: sealed to the agent alone, never read by the grant check, read by the principal's node.
		if f := obj(c["fence"]); f != nil {
			limit, grant := find(held, str(f["block"])), find(held, str(f["grant"]))
			audience, _ := arr(limit.State["audience"])
			r.report(same(limit.Refs["for"], f["grant"]) && limit.State["kind"] == "limit" && eq(limit.State["limit"], f["limit"]) &&
				FindsSelf(limit, str(f["agent"]), str(f["salt"])) && !FindsSelf(limit, str(f["principal"]), str(f["salt"])) && len(audience) == 1,
				fmt.Sprintf("identity: %s: sealed to the agent alone", c["name"]))
			rest := []Block{}
			for _, b := range held {
				if b.Hash != limit.Hash {
					rest = append(rest, b)
				}
			}
			never := obj(grant.State["scope"])["limit"] == nil
			for h := range obj(c["under"]) {
				never = never && eq(WhyNotUnder(find(held, h), held), WhyNotUnder(find(held, h), rest))
			}
			r.report(never, fmt.Sprintf("identity: %s: the grant check never reads the limit", c["name"]))
			within := true
			for _, k := range items(f["within"]) {
				spent, _ := intOf(k["spent"])
				within = within && WithinLimit(limit, k["money"], int(spent)) == k["within"]
			}
			r.report(within, fmt.Sprintf("identity: %s: the principal's node checks the limit (WithinLimit)", c["name"]))
		}
		for h, ok := range obj(c["under"]) {
			r.report((len(WhyNotUnder(find(held, h), held)) == 0) == ok, fmt.Sprintf("identity: %s: a block under the grant speaks for its grantor", c["name"]))
		}
	}

	// Folds.
	stageOf := func(c map[string]any) Stage {
		held := blocksOf(c["blocks"])
		return PromiseStage(find(held, str(c["first"])), held)
	}
	for _, c := range append(items(v["deals"]), items(folds["promises"])...) {
		want := obj(c["expected"])
		r.attempt(fmt.Sprintf("promise fold: %s: %s", c["name"], want["stage"]), func() bool { return subset(stageOf(c), want) })
	}
	for _, c := range append(items(v["circles"]), items(folds["circles"])...) {
		r.attempt("circle fold: "+str(c["name"]), func() bool {
			held := blocksOf(c["blocks"])
			state := CircleStateOf(str(c["circle"]), held, nil)
			want := obj(c["expected"])
			var members any
			if _, isList := arr(want["members"]); isList {
				members = state.MemberIDs()
			} else {
				m := map[string]any{}
				for who, member := range state.Members {
					m[who] = sorted(member.Roles)
				}
				members = m
			}
			removed := []string{}
			for who := range state.Removed {
				removed = append(removed, who)
			}
			ok := eq(members, want["members"]) && eq(sorted(removed), want["removed"])
			if want["counted_to"] != nil {
				ok = ok && eq(state.Removed, want["counted_to"])
			}
			for h, may := range obj(c["may_act"]) {
				ok = ok && MayActAs(find(held, h), str(c["circle"]), held, "") == may
			}
			return ok
		})
	}
	for _, c := range items(folds["audience"]) {
		held := blocksOf(c["blocks"])
		for _, k := range items(c["cases"]) {
			r.attempt("audience fold: "+str(k["name"]), func() bool {
				return eq(MembersThen(find(held, str(k["block"])), str(k["recipient"]), held), k["members"])
			})
		}
	}
	for _, c := range items(folds["things"]) {
		held := blocksOf(c["blocks"])
		for _, k := range items(c["where"]) {
			r.attempt("where now: "+str(k["name"]), func() bool { return eq(WhereNow(find(held, str(k["thing"])), held), k["places"]) })
		}
		for _, k := range items(c["owners"]) {
			r.attempt("owner: "+str(k["name"]), func() bool {
				got := OwnershipOf(find(held, str(k["thing"])), held)
				return eq(nilIfEmpty(got.Owner), k["owner"]) && eq(got.Conflict, k["conflict"])
			})
		}
	}
	for _, c := range items(folds["successors"]) {
		r.attempt("successor: "+str(c["name"]), func() bool {
			held := blocksOf(c["blocks"])
			return subset(SuccessorView(find(held, str(c["grant"])), held, str(c["now"]), arrivalsOf(obj(c["arrivals"]))), c["expected"])
		})
	}
	for _, c := range items(folds["ballots"]) {
		held := blocksOf(c["blocks"])
		for _, k := range items(c["cases"]) {
			r.attempt("ballot: "+str(k["name"]), func() bool {
				return CountedIn(find(held, str(k["result"])), str(k["commitment"]), str(k["counter"])) == k["counted"]
			})
		}
	}
	for _, c := range items(folds["rekeys"]) {
		r.attempt("circle key: "+str(c["name"]), func() bool { return subset(CircleKeyOf(str(c["circle"]), blocksOf(c["blocks"])), c["expected"]) })
	}
	known := []string{"promises", "circles", "audience", "things", "successors", "rekeys", "ballots"}
	for _, k := range foldNames {
		r.report(contains(known, k), "fold section run: "+k)
	}

	// Refusals: what every node must refuse.
	refusalBlocks := map[string]Block{}
	for _, s := range stories {
		for _, b := range blocksOf(s.blocks) {
			refusalBlocks[b.Hash] = b
		}
	}
	pickBlocks := func(hashes any) []Block {
		out := []Block{}
		for _, h := range list(hashes) {
			out = append(out, refusalBlocks[h])
		}
		return out
	}
	for _, c := range items(refusals["cases"]) {
		r.attempt(fmt.Sprintf("refused (%s): %s", c["by"], c["name"]), func() bool {
			held := pickBlocks(c["held"])
			switch c["by"] {
			case "check":
				// The block's own parts are passed as they are written: a state that is not an object cannot be a Block.
				inner := obj(c["block"])
				found, _ := ask[[]Finding]("refusals", inner["type"], inner["state"], inner["refs"], held, nil)
				return eq(codesOf(found), c["codes"])
			case "valid":
				return eq(codesOf(Valid(flat(obj(c["block"])), held, nil, nil)), c["codes"])
			case "accept":
				var incoming []Block
				if c["inline"] != nil {
					for _, one := range items(c["inline"]) {
						incoming = append(incoming, flat(one))
					}
				} else {
					incoming = pickBlocks(c["incoming"])
				}
				got := Accept(incoming, held, AcceptOptions{TakesPairs: false})
				// The second of a pair is neither taken nor refused: it is listed in its pair.
				if c["equivocations"] != nil {
					return eq(hashesOfBlocks(got.Taken), c["taken"]) && len(got.Refused) == 0 && eq(got.Equivocations, c["equivocations"])
				}
				if c["waiting"] != nil {
					waiting := []string{}
					for _, w := range got.Waiting {
						waiting = append(waiting, w.Hash)
					}
					return eq(waiting, c["waiting"]) && len(got.Refused) == 0
				}
				if c["taken"] != nil {
					return eq(hashesOfBlocks(got.Taken), c["taken"])
				}
				seen := []string{}
				for _, one := range got.Refused {
					if !contains(seen, one.Code) {
						seen = append(seen, one.Code)
					}
				}
				if !eq(seen, c["codes"]) {
					return false
				}
				for _, h := range list(c["incoming"]) {
					refused := false
					for _, r := range got.Refused {
						refused = refused || r.Hash == h
					}
					if !refused {
						return false
					}
				}
				return true
			case "fold":
				return subset(stageOf(c), c["expected"])
			case "may_act_as":
				blocks := blocksOf(c["blocks"])
				return MayActAs(find(blocks, str(c["block"])), str(c["circle"]), blocks, "") == c["ok"]
			case "under":
				all := []Block{}
				for _, b := range refusalBlocks {
					all = append(all, b)
				}
				return (len(WhyNotUnder(refusalBlocks[str(c["block"])], all)) == 0) == c["live"]
			case "open":
				_, err := OpenCopy(obj(c["message"]), str(key(t, c["recipient"])["x25519_private"]))
				var coded *CodedError
				return errors.As(err, &coded) && eq([]string{coded.Code}, c["codes"])
			}
			return false
		})
	}

	// Messages between nodes: every answer signed by the node; a signed request carries a counter or a challenge, no time.
	ran["messages"], ran["cbor"], ran["door"] = true, true, true
	M := obj(v["messages"])
	node, nodeKey := str(M["node"]), pub(t, M["node_signer"])
	{
		p, c := obj(M["signed_pull"]), obj(M["signed_pull_challenge"])
		jem := []string{pub(t, p["signer"])}
		pm := obj(p["message"])
		highest, _ := intOf(p["highest"])
		counter, _ := intOf(pm["counter"])
		r.report(len(PullRefusals(pm, PullCheck{Node: node, Keys: jem, Highest: &highest})) == 0 && pm["at"] == nil, "message: a signed pull names the node and a counter above the highest seen, and carries no time")
		r.report(eq(codesOf(PullRefusals(pm, PullCheck{Node: node, Keys: jem, Highest: &counter})), []string{"replay"}), "message: a counter that is not above the highest seen is a replay")
		r.report(len(PullRefusals(obj(c["message"]), PullCheck{Node: node, Keys: jem, Issued: []string{str(c["challenge"])}})) == 0, "message: a challenge the node issued is taken")
		r.report(eq(codesOf(PullRefusals(obj(c["message"]), PullCheck{Node: node, Keys: jem})), []string{"replay"}), "message: a challenge the node did not issue, or has seen used, is a replay")
		r.report(eq(codesOf(PullRefusals(pm, PullCheck{Node: strings.Repeat("0", 64), Keys: jem, Highest: &highest})), []string{"wrong_node"}), "message: a signed pull for another node is refused")
		changed := cloneMap(pm)
		changed["since"] = 1
		r.report(eq(codesOf(PullRefusals(changed, PullCheck{Node: node, Keys: jem, Highest: &highest})), []string{"bad_signature"}), "message: a changed request no longer verifies")
		sp := obj(M["signed_push"])
		spHighest, _ := intOf(sp["highest"])
		r.report(len(PushRefusals(obj(sp["message"]), PullCheck{Node: node, Keys: []string{pub(t, sp["signer"])}, Highest: &spHighest})) == 0, "message: a signed push")
	}
	r.report(contains(KeysOf(node, blocksOf(sealed["blocks"]), nil, ""), nodeKey), "message: the node key is a key of its holder, brought in by a key grant")
	pa := obj(M["pull_answer"])
	paBlocks, _ := arr(obj(pa["message"])["blocks"])
	matchesN, _ := intOf(pa["matches"])
	r.report(AnswerSignedBy(obj(pa["message"]), []string{nodeKey}) && int64(len(paBlocks)) == matchesN, "message: a pull answer is signed by the node")
	push := obj(obj(M["push_answer"])["message"])
	r.report(AnswerSignedBy(push, []string{nodeKey}), "message: a push answer is signed by the node")
	{
		// Every key is always there; each refusal is { hash, code, detail } with a code from protocol.json; each pair
		// sorted. Rebuilt from its parts by the node's key, it is the same message, byte for byte.
		known := []string{}
		for _, group := range RefusalCodes {
			known = append(known, group...)
		}
		keys := []string{}
		for k := range push {
			keys = append(keys, k)
		}
		want := []string{}
		for _, k := range messageKeys("push_answer") {
			if _, has := push[k]; has || !contains(messageKeys("push_answer_optional"), k) {
				want = append(want, k)
			}
		}
		ok := eq(sorted(keys), sorted(want))
		rebuilt := Accepted{}
		for _, h := range list(push["taken"]) {
			rebuilt.Taken = append(rebuilt.Taken, Block{Hash: h})
		}
		for _, h := range list(push["waiting"]) {
			rebuilt.Waiting = append(rebuilt.Waiting, Waiting{Hash: h})
		}
		for _, one := range items(push["refused"]) {
			rk := []string{}
			for k := range one {
				rk = append(rk, k)
			}
			ok = ok && eq(sorted(rk), sorted(messageKeys("refusal"))) && contains(known, str(one["code"]))
			rebuilt.Refused = append(rebuilt.Refused, Refusal{str(one["hash"]), str(one["code"]), str(one["detail"])})
		}
		pairs, _ := arr(push["equivocations"])
		for _, pair := range pairs {
			p := list(pair)
			ok = ok && eq(p, sorted(p))
			rebuilt.Equivocations = append(rebuilt.Equivocations, p)
		}
		r.report(ok, "message: a push answer carries every key, refusals as { hash, code, detail }, equivocations as sorted pairs")
		again, err := PushAnswer(rebuilt, str(push["node"]), str(key(t, M["node_signer"])["private_key"]))
		a, _ := CanonicalJSON(again)
		b, _ := CanonicalJSON(push)
		r.report(err == nil && a == b && eq(again, push), "message: the push answer rebuilds byte for byte")
		Q := obj(M["push"])
		req := obj(Q["request"])
		msgs, _ := arr(req["messages"])
		built := PushRequest(msgs, obj(req["for"]))
		r.report(eq(built, req) && eq(obj(req["for"])[str(Q["hash"])], Q["recipients"]) && len(list(Q["recipients"])) == 2, "message: a push names the list of ids each sealed copy is for")
	}
	changed := cloneMap(push)
	changed["taken"] = []any{}
	r.report(!AnswerSignedBy(changed, []string{nodeKey}), "message: a changed answer no longer verifies")
	disc := obj(M["discovery"])
	r.report(len(WellKnownErrors(disc)) == 0 && eq(M["announcement"], Announcement(disc)) && obj(disc["endpoints"])["challenge"] != nil, "message: discovery names the challenge endpoint, and its local announcement")

	// The compact form: block <-> CBOR bytes, text keys and key table 1; the id is the hash of the canonical JSON.
	C := obj(v["cbor"])
	signed := func(c map[string]any) Block {
		b := blockOf(c)
		b.Hash, b.Signature = str(c["hash"]), str(c["signature"])
		return b
	}
	unhex := func(h any) []byte { b, _ := hex.DecodeString(str(h)); return b }
	cborCases := items(C["cases"])
	for _, c := range cborCases {
		b := signed(c)
		text, _ := CborEncode(b, false)
		short, _ := CborEncode(b, true)
		back, err := CborDecode(unhex(c["cbor_short"]))
		backText, err2 := CborDecode(unhex(c["cbor"]))
		cs, _ := Canonical(b.Type, b.State, b.Refs)
		h, _ := Hash(b.Type, b.State, b.Refs)
		canonicalBytes, _ := intOf(c["canonical_bytes"])
		r.report(hex.EncodeToString(text) == str(c["cbor"]) && hex.EncodeToString(short) == str(c["cbor_short"]) &&
			err == nil && err2 == nil && eq(back, b) && eq(backText, b) && h == str(c["hash"]) && int64(len(cs)) == canonicalBytes, "cbor: "+str(c["name"]))
	}
	loose := obj(C["loose"])
	got, err := CborDecode(unhex(loose["cbor"]))
	r.report(err == nil && got.Hash == str(loose["hash"]), "cbor: "+str(loose["name"]))
	{
		pushC := obj(C["push"])
		blocks := []Block{}
		for _, h := range list(pushC["hashes"]) {
			for _, c := range cborCases {
				if str(c["hash"]) == h {
					blocks = append(blocks, signed(c))
				}
			}
		}
		enc, _ := CborEncodePush(blocks, false)
		dec, err := CborDecodePush(unhex(pushC["cbor_short"]))
		r.report(hex.EncodeToString(enc) == str(pushC["cbor"]) && err == nil && eq(dec, blocks), "cbor: "+str(pushC["name"]))
	}
	for _, h := range items(C["headers"]) {
		enc, _ := CborEncodeHeader(obj(h["header"]), false)
		dec, err := CborDecodeHeader(unhex(h["cbor_short"]))
		r.report(hex.EncodeToString(enc) == str(h["cbor"]) && err == nil && eq(dec, h["header"]), "cbor: "+str(h["name"]))
	}
	for _, c := range items(C["refused"]) {
		_, err := CborDecode(unhex(c["cbor"]))
		r.report(err != nil, "cbor refused: "+str(c["name"]))
	}

	// The door: one case per rule. `expect` is a subset match (exact: true, deep equality); `codes` compares the
	// refusal codes of the returned list; `error` means the call must fail.
	for _, d := range items(v["door"]) {
		args, _ := arr(d["args"])
		r.attempt("door: "+str(d["name"]), func() bool {
			got, err := ask[any](str(d["op"]), args...)
			if err != nil {
				want := obj(d["error"])
				var coded *CodedError
				if want == nil || !errors.As(err, &coded) {
					return false
				}
				return (want["code"] == nil || coded.Code == str(want["code"])) && (want["kind"] == nil || coded.Kind == str(want["kind"]))
			}
			if d["error"] != nil {
				return false
			}
			if d["codes"] != nil {
				found := []Finding{}
				rows, _ := arr(got)
				for _, row := range rows {
					found = append(found, Finding{Code: str(obj(row)["code"])})
				}
				return eq(codesOf(found), d["codes"])
			}
			if d["exact"] == true {
				return eq(got, d["expect"])
			}
			return subset(got, d["expect"])
		})
	}

	// Every section is run; a new one fails here until this SDK runs it.
	for _, s := range sections {
		r.report(ran[s], "section run: "+s)
	}
	t.Logf("%d passed, %d failed", r.pass, r.fail)
}

func TestKeysRebuildFromSeeds(t *testing.T) {
	for name, k := range obj(vectors(t)["keys"]) {
		k := obj(k)
		suite := str(k["suite"])
		if suite == "" {
			suite = "std"
		}
		kp, err := KeypairFromSeed(str(k["seed"]), suite)
		if err != nil || kp.PublicKeySign != str(k["public_key_sign"]) || kp.PrivateKey != str(k["private_key"]) || SuiteOfKey(kp.PublicKeySign) != suite {
			t.Errorf("%s: the signing key from its seed", name)
		}
		if priv := str(k["x25519_private"]); priv != "" {
			if pk, _ := EncryptionKeyOf(priv, suite); pk != str(k["public_key_encrypt"]) {
				t.Errorf("%s: the encryption key", name)
			}
		}
	}
}

// canonical.md Rule 1: object keys sort by UTF-16 code units, as JavaScript sorts. A set is written sorted, never sorted for you.
func TestUTF16Order(t *testing.T) {
	state := map[string]any{"\U0001F35E": 1, "｡": 2, "a": 3}
	refs := map[string]any{"\U0001F35E": "x", "｡": "y", "sees": []any{"a", "\U0001F35E bread", "｡ dot"}}
	c, _ := Canonical("t.a", state, refs)
	want := `{"refs":{"sees":["a","` + "\U0001F35E" + ` bread","` + "｡" + ` dot"],"` + "\U0001F35E" + `":"x","` + "｡" + `":"y"},"state":{"a":3,"` + "\U0001F35E" + `":1,"` + "｡" + `":2},"type":"t.a"}`
	if c != want {
		t.Errorf("got %s", c)
	}
}

// The Rust core carries spec/protocol.json; it equals the repository's spec/ file. No other spec copy exists.
func TestCoreCarriesTheSpec(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(root, "spec", "protocol.json"))
	theirs, _ := decodeJSON(data)
	if err != nil || !equalJSON(Protocol, theirs) {
		t.Errorf("the core's built-in protocol.json differs from spec/protocol.json")
	}
}

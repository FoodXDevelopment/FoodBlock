package foodblock

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// Conformance: every section of spec/vectors.json, spec/canonical-vectors.json and test/vectors.json, run the way
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

// subset: every key the vector expects is what was got (a missing key is null).
func subset(got any, want map[string]any) bool {
	g := obj(toJSON(got))
	for k, v := range want {
		if !eq(g[k], v) {
			return false
		}
	}
	return true
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

func strict(b Block, held map[string]Block) []string {
	return Check(b.Type, b.State, b.Refs, CheckOptions{Held: held})
}

// codesOf are the codes a refusal list carries, once each, in protocol.json's order.
func codesOf(found []Finding) []string {
	out := []string{}
	for _, f := range found {
		if !contains(out, f.Code) {
			out = append(out, f.Code)
		}
	}
	return out
}

func codes(b Block, held map[string]Block) []string {
	return codesOf(Refusals(b.Type, b.State, b.Refs, CheckOptions{Held: held}))
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
		b := blockOf(c)
		h, _ := Hash(b.Type, b.State, b.Refs)
		cs, _ := Canonical(b.Type, b.State, b.Refs)
		ok := true
		if c["same_as"] != nil {
			o := obj(c["same_as"])
			h2, _ := Hash(str(o["type"]), obj(o["state"]), obj(o["refs"]))
			ok = ok && h == h2
		}
		if c["not_same_as"] != nil {
			o := obj(c["not_same_as"])
			h2, _ := Hash(str(o["type"]), obj(o["state"]), obj(o["refs"]))
			ok = ok && h != h2
		}
		if c["canonical_contains"] != nil {
			ok = ok && strings.Contains(cs, str(c["canonical_contains"]))
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

	// Hashes and the write check. A block written in the draft words is refused by the check and reads as its 1.6 form.
	ran["hashes"] = true
	for _, c := range items(v["hashes"]) {
		b := blockOf(c)
		cs, _ := Canonical(b.Type, b.State, b.Refs)
		h, _ := Hash(b.Type, b.State, b.Refs)
		r.report(cs == str(c["canonical"]) && h == str(c["hash"]), "hash: "+str(c["name"]))
		if c["draft_words"] == nil {
			wrong := strict(b, nil)
			r.report(len(wrong) == 0, "write check: "+str(c["name"]), wrong...)
			continue
		}
		r.report(eq(codes(b, nil), c["draft_words"]), "strict check refuses the draft words, with its codes: "+str(c["name"]), strings.Join(codes(b, nil), ","))
		read := ReadAs(b)
		r.report(eq(map[string]any{"type": read.Type, "state": read.State, "refs": read.Refs}, c["reads_as"]), "reads as 1.6: "+str(c["name"]))
	}
	// Each author's blocks form one key chain.
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
		r.report(CheckChain(mine, id).OK, fmt.Sprintf("chain: %s's %d blocks", id[:8], len(mine)))
	}
	ran["audience"] = true
	for _, c := range items(v["audience"]) {
		r.report(SaltedHash(str(c["salt"]), str(c["recipient"])) == str(c["commitment"]), "audience: "+str(c["name"]))
	}

	// Every signed block in every story: its hash, its signature, and (for a 1.6 block) the write check.
	byHash := map[string]Block{}
	for _, c := range items(v["hashes"]) {
		byHash[str(c["hash"])] = blockOf(c)
	}
	folds, refusals, reads, sealed := obj(v["folds"]), obj(v["refusals"]), obj(v["reads"]), obj(v["sealed"])
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
	add("draft words", reads["groups"])
	for _, s := range stories {
		wrong := []string{}
		for _, c := range items(s.blocks) {
			b := blockOf(c)
			byHash[b.Hash] = b
			if h, _ := Hash(b.Type, b.State, b.Refs); h != b.Hash {
				wrong = append(wrong, str(c["name"])+": hash")
			}
			if !Verify(b, b.Signature, pub(t, c["signer"])) {
				wrong = append(wrong, str(c["name"])+": signature")
			}
			if s.group != "draft words" && b.State["seq"] != nil {
				if w := strict(b, nil); len(w) > 0 {
					wrong = append(wrong, str(c["name"])+": "+strings.Join(w, "; "))
				}
			}
		}
		r.report(len(wrong) == 0, fmt.Sprintf("%s: %s: blocks hash, verify and pass the write check", s.group, s.name), wrong...)
	}
	ran["identities"], ran["deals"], ran["circles"], ran["folds"], ran["refusals"], ran["reads"], ran["sealed"] = true, true, true, true, true, true, true

	opensVector := func(c map[string]any) bool {
		b, ok := byHash[str(c["hash"])]
		return ok && Verify(b, str(c["signature"]), pub(t, c["signer"]))
	}
	ran["signatures"], ran["bad_signatures"] = true, true
	for _, c := range items(v["signatures"]) {
		r.report(opensVector(c), "signature: "+str(c["name"]))
		// Ed25519 is deterministic: the signature is reproduced from the key.
		sig, _ := Sign(byHash[str(c["hash"])], str(key(t, c["signer"])["private_key"]))
		r.report(sig == str(c["signature"]), "signature reproduced: "+str(c["name"]))
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
			return err == nil && m.Hash == str(want["hash"]) && m.Signature == str(want["signature"]) && m.Version == str(want["version"])
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
		var arrived ArrivedAt
		if arrivals := obj(c["arrivals"]); arrivals != nil {
			arrived = func(h string) string { return str(arrivals[h]) }
		}
		id := str(c["id"])
		for _, b := range held {
			if want, ok := obj(c["signed_by_author"])[b.Hash]; ok {
				r.report(SignedByAuthor(b, held, arrived) == want, fmt.Sprintf("identity: %s: %s", c["name"], b.Hash[:8]))
			}
		}
		if c["keys"] != nil {
			r.report(eq(sorted(KeysOf(id, held, arrived)), c["keys"]), fmt.Sprintf("identity: %s: the keys that speak", c["name"]))
		}
		if c["frozen"] != nil {
			frozen := []string{}
			for _, e := range KeyTimeline(id, held, nil) {
				if e.Frozen {
					frozen = append(frozen, e.Key)
				}
			}
			r.report(eq(sorted(frozen), c["frozen"]), fmt.Sprintf("identity: %s: the frozen keys", c["name"]))
		}
		if c["operators"] != nil {
			r.report(eq(OperatorsOf(id, held), c["operators"]), fmt.Sprintf("identity: %s: its operators", c["name"]))
		}
		if c["history"] != nil {
			state := IdentityStateOf(id, held, arrived)
			ok := state.History == str(c["history"]) && eq(state.Keys, c["keys"]) && (c["frozen"] == nil || eq(state.Frozen, c["frozen"]))
			for h, want := range obj(c["signed_by_author"]) {
				ok = ok && state.SignedByAuthor[h] == want
			}
			r.report(ok, fmt.Sprintf("identity: %s: the identity fold (signed_by_author, keys, frozen, history)", c["name"]))
		}
		for h, ok := range obj(c["under"]) {
			r.report((len(WhyNotUnder(find(held, h), held)) == 0) == ok, fmt.Sprintf("identity: %s: a block under the grant speaks for its grantor", c["name"]))
		}
	}

	// Folds.
	stageOf := func(c map[string]any) Stage {
		held := blocksOf(c["blocks"])
		return PromiseStage(find(held, str(c["first"])), held, StageOptions{Now: str(c["now"])})
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
			arrivals := obj(c["arrivals"])
			return subset(SuccessorState(find(held, str(c["grant"])), held, str(c["now"]), func(h string) string { return str(arrivals[h]) }), obj(c["expected"]))
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
		r.attempt("circle key: "+str(c["name"]), func() bool { return subset(CircleKeyOf(str(c["circle"]), blocksOf(c["blocks"])), obj(c["expected"])) })
	}
	known := []string{"promises", "circles", "audience", "things", "successors", "rekeys", "ballots"}
	for _, k := range foldNames {
		r.report(contains(known, k), "fold section run: "+k)
	}

	// Refusals: what every node must refuse.
	refusalBlocks := map[string]Block{}
	for _, b := range blocksOf(refusals["blocks"]) {
		refusalBlocks[b.Hash] = b
	}
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
			switch c["by"] {
			case "check":
				held := map[string]Block{}
				for _, b := range pickBlocks(c["held"]) {
					held[b.Hash] = b
				}
				return eq(codes(blockOf(c), held), c["codes"])
			case "accept":
				got := Accept(pickBlocks(c["incoming"]), pickBlocks(c["held"]))
				// The second of a pair is neither taken nor refused: it is listed in its pair.
				if c["equivocations"] != nil {
					return eq(hashesOfBlocks(got.Taken), c["taken"]) && len(got.Refused) == 0 && eq(got.Equivocations, c["equivocations"])
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
				return subset(stageOf(c), obj(c["expected"]))
			case "open":
				_, err := OpenCopy(obj(c["message"]), str(key(t, c["recipient"])["x25519_private"]))
				var coded *CodedError
				return errors.As(err, &coded) && eq([]string{coded.Code}, c["codes"])
			}
			return false
		})
	}

	// Alias reads: one per row, and the earlier deal and circle written in the draft words.
	marks := func(read Block) map[string]any {
		out := map[string]any{"type": read.Type, "state": read.State, "refs": read.Refs}
		if read.Settles != nil {
			out["settles"] = read.Settles
		}
		if read.Outside != nil {
			out["outside"] = read.Outside
		}
		if read.Retired {
			out["retired"] = true
		}
		return out
	}
	for _, c := range items(reads["cases"]) {
		inner := obj(c["block"])
		b, _ := Create(str(inner["type"]), obj(inner["state"]), obj(inner["refs"]))
		r.report(eq(marks(ReadAs(b)), c["reads_as"]), "reads: "+str(c["name"]))
	}
	for _, g := range items(reads["groups"]) {
		for _, c := range items(g["blocks"]) {
			b := blockOf(c)
			read := ReadAs(b)
			r.report(eq(map[string]any{"type": read.Type, "state": read.State, "refs": read.Refs}, c["reads_as"]) && read.Hash == b.Hash, fmt.Sprintf("reads: %s: %s", g["name"], c["name"]))
		}
		if end := obj(g["older_end"]); end != nil {
			read, want := ReadAs(blockOf(end)), obj(end["reads_as"])
			r.report(read.Type == str(want["type"]) && same(read.State["status"], want["status"]) && same(read.State["stop"], want["stop"]) && same(read.Refs["updates"], want["updates"]),
				"reads: an older end (defeats) reads as an updates with status stopped")
		}
	}

	// Messages between nodes: every answer signed by the node.
	ran["messages"] = true
	M := obj(v["messages"])
	node, nodeKey := str(M["node"]), pub(t, M["node_signer"])
	sp := obj(M["signed_pull"])
	pullMessage := obj(sp["message"])
	check := PullCheck{Node: node, Now: str(sp["now"]), Keys: []string{pub(t, sp["signer"])}}
	r.report(len(PullErrors(pullMessage, check)) == 0, "message: a signed pull names the node, a fresh nonce and at, and is signed by its asker")
	replay := check
	replay.Seen = func(string) bool { return true }
	r.report(len(PullErrors(pullMessage, replay)) > 0, "message: a signed pull replayed is refused")
	other := cloneMap(pullMessage)
	other["node"] = strings.Repeat("0", 64)
	r.report(len(PullErrors(other, check)) > 0, "message: a signed pull for another node is refused")
	r.report(contains(KeysOf(node, blocksOf(sealed["blocks"]), nil), nodeKey), "message: the node key is a key of its holder, brought in by a key grant")
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
		ok := eq(sorted(keys), sorted(messageKeys("push_answer")))
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
	}
	changed := cloneMap(push)
	changed["taken"] = []any{}
	r.report(!AnswerSignedBy(changed, []string{nodeKey}), "message: a changed answer no longer verifies")
	r.report(len(WellKnownErrors(obj(M["discovery"]))) == 0 && eq(M["announcement"], Announcement(obj(M["discovery"]))), "message: discovery and its local announcement")

	// Every section is run; a new one fails here until this SDK runs it.
	for _, s := range sections {
		r.report(ran[s], "section run: "+s)
	}
	t.Logf("%d passed, %d failed", r.pass, r.fail)
}

func TestKeysRebuildFromSeeds(t *testing.T) {
	for name, k := range obj(vectors(t)["keys"]) {
		k := obj(k)
		if seed := str(k["ed25519_seed"]); seed != "" {
			kp, err := KeypairFromSeed(seed)
			if err != nil || kp.PublicKeySign != str(k["public_key_sign"]) || (k["private_key"] != nil && kp.PrivateKey != str(k["private_key"])) {
				t.Errorf("%s: the signing key from its seed", name)
			}
		}
		if priv := str(k["x25519_private"]); priv != "" {
			if pk, _ := EncryptionKeyOf(priv); pk != str(k["public_key_encrypt"]) {
				t.Errorf("%s: the encryption key", name)
			}
		}
		if h := str(k["hash"]); h != "" && RecoveryKeyHash(str(k["public_key_sign"])) != h {
			t.Errorf("%s: the recovery key's hash", name)
		}
	}
}

// test/vectors.json: the older cross-language vectors. Same canonical form and hash; a legacy-read shape is refused
// on write.
func TestOlderVectors(t *testing.T) {
	all := items(load(t, "test", "vectors.json"))
	if len(all) == 0 {
		t.Fatal("no older vectors")
	}
	for _, c := range all {
		cs, err := Canonical(str(c["type"]), orEmpty(obj(c["state"])), orEmpty(obj(c["refs"])))
		h, _ := Hash(str(c["type"]), orEmpty(obj(c["state"])), orEmpty(obj(c["refs"])))
		if err != nil || cs != str(c["expected_canonical"]) || h != str(c["expected_hash"]) {
			t.Errorf("%s: canonical %q", c["name"], cs)
		}
		if c["section"] == "legacy-read" && len(Check(str(c["type"]), obj(c["state"]), obj(c["refs"]))) == 0 {
			t.Errorf("%s: a legacy shape is refused on write", c["name"])
		}
	}
}

// canonical.md Rule 1: keys and refs string arrays sort by UTF-16 code units, as JavaScript sorts.
func TestUTF16Order(t *testing.T) {
	state := map[string]any{"\U0001F35E": 1, "｡": 2, "a": 3}
	refs := map[string]any{"\U0001F35E": "x", "｡": "y", "sees": []any{"\U0001F35E bread", "｡ dot", "a"}}
	c, _ := Canonical("t.a", state, refs)
	want := `{"refs":{"sees":["a","` + "\U0001F35E" + ` bread","` + "｡" + ` dot"],"` + "\U0001F35E" + `":"x","` + "｡" + `":"y"},"state":{"a":3,"` + "\U0001F35E" + `":1,"` + "｡" + `":2},"type":"t.a"}`
	if c != want {
		t.Errorf("got %s", c)
	}
	if h, _ := Hash("t.a", state, refs); h != "7ae546cb1398d598d07c4e7873a9547775b5fb7eb53ea7b3e739215a32bb630f" {
		t.Errorf("hash %s", h)
	}
}

// The package carries exact copies of spec/protocol.json and spec/aliases.json (test/sync-spec.cjs makes them).
func TestSpecCopies(t *testing.T) {
	for _, name := range []string{"protocol.json", "aliases.json"} {
		mine, _ := specFiles.ReadFile("spec/" + name)
		theirs, err := os.ReadFile(filepath.Join(root, "spec", name))
		if err != nil || !bytes.Equal(mine, theirs) {
			t.Errorf("sdk/go/spec/%s differs from spec/%s: run node test/sync-spec.cjs", name, name)
		}
	}
}

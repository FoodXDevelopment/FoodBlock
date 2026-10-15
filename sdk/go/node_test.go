package foodblock

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// What a peer does beyond the vectors: write in its key chain, seal a private copy, pull and push.

type person struct {
	keys    Keypair
	enc     EncryptionKeypair
	genesis Block
	held    []Block
	n       int
}

func newPerson(t *testing.T) *person {
	t.Helper()
	keys, _ := GenerateKeypair()
	enc, _ := GenerateEncryptionKeypair()
	recovery, _ := GenerateKeypair()
	g, err := Genesis(keys, GenesisOptions{EncryptionKey: enc.PublicKeyEncrypt, RecoveryKey: recovery.PublicKeySign, At: "2026-10-15T09:00:00.000Z"})
	if err != nil {
		t.Fatal(err)
	}
	if wrong := Check(g.Type, g.State, g.Refs); len(wrong) > 0 {
		t.Fatal(wrong)
	}
	return &person{keys: keys, enc: enc, genesis: g, held: []Block{g}}
}

func (p *person) say(t *testing.T, typ string, state, refs map[string]any, audience ...string) Block {
	t.Helper()
	p.n++
	b, err := Write(typ, state, refs, WriteOptions{ComposeOptions: ComposeOptions{Author: p.genesis.Hash, Audience: audience,
		At: formatTime(time.Date(2026, 10, 15, 9, 0, p.n, 0, time.UTC))}, Key: p.keys, Held: p.held})
	if err != nil {
		t.Fatal(err)
	}
	p.held = append(p.held, b)
	return b
}

func TestWriteChainsChecksAndSigns(t *testing.T) {
	ann := newPerson(t)
	eggs := ann.say(t, "thing", map[string]any{"kind": "eggs", "name": "Free-range eggs"}, nil)
	offer := ann.say(t, "promise", map[string]any{"terms": map[string]any{"price": Money(450, "GBP"), "quantity": Amount("2", "{tray}"), "expires": "2026-10-20T00:00:00.000Z"}},
		map[string]any{"from": ann.genesis.Hash, "what": eggs.Hash})
	if seq, _ := intOf(offer.State["seq"]); seq != 2 || offer.Refs["prev"] != eggs.Hash {
		t.Errorf("the offer follows the eggs in the key's chain: %v %v", offer.State["seq"], offer.Refs["prev"])
	}
	if !SignedByAuthor(offer, ann.held, nil) {
		t.Error("signed by its author")
	}
	if s := PromiseStage(offer, ann.held); s.Stage != "offered" {
		t.Errorf("stage %s", s.Stage)
	}
	_, err := Write("thing", map[string]any{"kind": "flour", "amount": map[string]any{"value": 1.5, "unit": "kg"}}, nil,
		WriteOptions{ComposeOptions: ComposeOptions{Author: ann.genesis.Hash}, Key: ann.keys, Held: ann.held})
	var refused *Refused
	if !errors.As(err, &refused) || len(refused.Refusals) == 0 || refused.Refusals[0].Code != "float" {
		t.Errorf("a float is refused: %v", err)
	}
	if !IsA(Block{Type: "place.venue", State: map[string]any{}, Refs: map[string]any{}}, "thing", "venue") {
		t.Error("a place reads as a thing")
	}
}

func TestSealedCopyRoundTrip(t *testing.T) {
	ann, bob := newPerson(t), newPerson(t)
	note := ann.say(t, "observe", map[string]any{"kind": "note", "text": "for Bob"}, nil, bob.genesis.Hash)
	if !FindsSelf(note, bob.genesis.Hash, note.Salts[bob.genesis.Hash]) {
		t.Fatal("Bob finds himself in the audience")
	}
	message, err := SealCopy(note, SealOptions{Keys: []string{bob.enc.PublicKeyEncrypt}, Reveals: []any{RevealFor(note.Salts, bob.genesis.Hash)}, PrivateKey: ann.keys.PrivateKey})
	if err != nil {
		t.Fatal(err)
	}
	if _, has := obj(obj(message["envelope"])["recipients"].([]any)[0])["key_hash"]; has {
		t.Error("an envelope names no recipient")
	}
	opened, err := OpenCopy(message, bob.enc.X25519Private)
	if err != nil || opened.Hash != note.Hash || !Verify(opened, opened.Signature, ann.keys.PublicKeySign) || !HeaderSignedBy(message, ann.keys.PublicKeySign) {
		t.Fatalf("Bob opens it: %v", err)
	}
	if _, err := OpenCopy(message, ann.enc.X25519Private); err == nil {
		t.Error("nobody else opens it")
	}
	// The older alg is still read.
	env, _ := Seal(map[string]any{"a": 1}, []string{bob.enc.PublicKeyEncrypt}, AlgRaw, nil)
	if v, err := Open(env, bob.enc.X25519Private); err != nil || !eq(v, map[string]any{"a": 1}) {
		t.Error("the raw alg opens")
	}
}

func TestPullAndPush(t *testing.T) {
	ann, node := newPerson(t), newPerson(t)
	one := ann.say(t, "observe", map[string]any{"kind": "note", "text": "two trays"}, nil)
	two := ann.say(t, "observe", map[string]any{"kind": "note", "text": "one tray"}, nil)
	early := Accept([]Block{ann.genesis, two}, nil)
	if len(early.Waiting) != 1 || early.Waiting[0].Hash != two.Hash || early.Waiting[0].Needs[0] != one.Hash {
		t.Errorf("a block whose prev is missing waits: %+v", early)
	}
	late := Accept([]Block{one, two}, []Block{ann.genesis})
	if len(late.Taken) != 2 {
		t.Errorf("taken once the prev is here: %+v", late.Refused)
	}
	link := Link{1, ann.genesis.Hash}
	other, _ := Write("observe", map[string]any{"kind": "note", "text": "five trays"}, nil,
		WriteOptions{ComposeOptions: ComposeOptions{Author: ann.genesis.Hash, Link: &link, At: "2026-10-15T09:10:00.000Z"}, Key: ann.keys, Held: ann.held})
	lie := Accept([]Block{other}, []Block{ann.genesis, one})
	// The second of a pair is neither taken nor refused: only listed with the first.
	if len(lie.Equivocations) != 1 || len(lie.Refused) != 0 || len(lie.Taken) != 0 {
		t.Errorf("two blocks from one key with one seq prove a lie: %+v", lie)
	}
	answer, _ := PushAnswer(late, node.genesis.Hash, node.keys.PrivateKey)
	if !AnswerSignedBy(answer, []string{node.keys.PublicKeySign}) {
		t.Error("the push answer is signed by the node")
	}

	request, _ := SignPull(map[string]any{"filter": map[string]any{"author": ann.genesis.Hash}, "heads": true}, SignPullOptions{Asker: ann.genesis.Hash, Node: node.genesis.Hash, PrivateKey: ann.keys.PrivateKey})
	if wrong := PullErrors(request, PullCheck{Node: node.genesis.Hash, Keys: []string{ann.keys.PublicKeySign}}); len(wrong) > 0 {
		t.Error(wrong)
	}
	log := []Arrival{{N: 1, Block: ann.genesis}, {N: 2, Block: one}, {N: 3, Block: two}}
	pulled, _ := AnswerPull(log, request, AnswerOptions{Node: node.genesis.Hash, PrivateKey: node.keys.PrivateKey})
	blocks, _ := arr(pulled["blocks"])
	if len(blocks) != 1 || !AnswerSignedBy(pulled, []string{node.keys.PublicKeySign}) {
		t.Errorf("heads only, signed: %v", pulled)
	}
	got, _ := Unwrap(obj(blocks[0])["message"])
	if got.Hash != two.Hash {
		t.Error("the head is the latest note")
	}
	if !WaitedTooLong("2026-10-15T09:00:00.000Z", "2026-10-16T09:00:00.001Z", 24*time.Hour) {
		t.Error("a waiting block expires")
	}
	doc := WellKnown(Discovery{Node: node.genesis.Hash, Holds: []string{ann.genesis.Hash}, Endpoints: map[string]string{"pull": "https://n.example/pull", "push": "https://n.example/push"}})
	if wrong := WellKnownErrors(doc); len(wrong) > 0 {
		t.Error(wrong)
	}
}

func TestKeyGrantAndGrammar(t *testing.T) {
	ann := newPerson(t)
	phone, _ := GenerateKeypair()
	grant, err := KeyGrant(ann.genesis.Hash, phone.PublicKeySign, KeySigner{PrivateKey: ann.keys.PrivateKey}, KeyGrantOptions{At: "2026-10-15T09:01:00.000Z"})
	if err != nil || len(Check(grant.Type, grant.State, grant.Refs)) > 0 {
		t.Fatal(err, Check(grant.Type, grant.State, grant.Refs))
	}
	held := append(ann.held, grant)
	if keys := KeysOf(ann.genesis.Hash, held, nil); len(keys) != 2 {
		t.Errorf("the phone's key speaks: %v", keys)
	}
	for text, ok := range map[string]bool{"P30D": true, "PT5M": true, "P1Y2M": true, "P": false, "PT": false, "P1DT": false, "P1.5D": false} {
		if matchesGrammar("duration", text) != ok {
			t.Errorf("duration %s", text)
		}
	}
	if AddDuration("2026-01-31T00:00:00.000Z", "P1M", 1) != "2026-03-03T00:00:00.000Z" {
		t.Error("months count by the UTC calendar, as JavaScript's Date")
	}
}

func TestCustodyTheLimitFence(t *testing.T) {
	fence := LimitFence(strings.Repeat("a", 64), strings.Repeat("b", 64), map[string]any{"minor": 5000, "currency": "GBP"}, "P7D")
	state := fence["state"]
	if !WithinLimit(state, map[string]any{"minor": 3000, "currency": "GBP"}, 2000) || WithinLimit(state, map[string]any{"minor": 3001, "currency": "GBP"}, 2000) {
		t.Error("spent and asked together stay within the limit, or not")
	}
	keys, _ := GenerateKeypair()
	g, err := Genesis(keys, GenesisOptions{RecoveryKey: keys.PublicKeySign, At: "2026-10-15T09:00:00.000Z", Custodian: strings.Repeat("c", 64)})
	if err != nil || g.State["custodian"] != strings.Repeat("c", 64) {
		t.Errorf("a custodial genesis names its custodian: %v", err)
	}
}

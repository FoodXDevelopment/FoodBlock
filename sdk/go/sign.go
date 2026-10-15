package foodblock

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
)

// Signing (protocol.md, Encoding): Ed25519 over the canonical UTF-8 string of { type, state, refs }. A signing key is
// its SPKI DER bytes in lowercase hex; a private key its PKCS#8 DER bytes in hex (a raw 32-byte seed is read too); a
// signature the 64-byte signature in lowercase hex. Sign signs; Seal (envelope.go) encrypts. A signed message part
// is signed over its canonical JSON without its `signature` key.

const (
	pkcs8Ed25519 = "302e020100300506032b657004220420"
	spkiEd25519  = "302a300506032b6570032100"
)

// Keypair is a signing key: { public_key_sign, private_key } in hex.
type Keypair struct {
	PublicKeySign string `json:"public_key_sign"`
	PrivateKey    string `json:"private_key"`
}

// KeypairFromSeed is the signing key a 32-byte seed (hex) gives: how the vectors' keys are rebuilt.
func KeypairFromSeed(seedHex string) (Keypair, error) {
	seed, err := hex.DecodeString(seedHex)
	if err != nil || len(seed) != ed25519.SeedSize {
		return Keypair{}, errors.New("FoodBlock: a seed is 32 bytes of hex")
	}
	pub := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	return Keypair{spkiEd25519 + hex.EncodeToString(pub), pkcs8Ed25519 + strings.ToLower(seedHex)}, nil
}

// GenerateKeypair is a new signing key.
func GenerateKeypair() (Keypair, error) {
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		return Keypair{}, err
	}
	return KeypairFromSeed(hex.EncodeToString(seed))
}

func privateKey(h string) (ed25519.PrivateKey, error) {
	h = strings.ToLower(h)
	if strings.HasPrefix(h, pkcs8Ed25519) && len(h) == 96 {
		h = h[len(pkcs8Ed25519):]
	}
	seed, err := hex.DecodeString(h)
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, errors.New("FoodBlock: a private key is PKCS#8 DER hex")
	}
	return ed25519.NewKeyFromSeed(seed), nil
}

func publicKey(h string) (ed25519.PublicKey, error) {
	h = strings.ToLower(h)
	if !strings.HasPrefix(h, spkiEd25519) || len(h) != 88 {
		return nil, errors.New("FoodBlock: a signing key is SPKI DER hex")
	}
	raw, err := hex.DecodeString(h[len(spkiEd25519):])
	if err != nil {
		return nil, err
	}
	return ed25519.PublicKey(raw), nil
}

func signBytes(data string, privateKeyHex string) (string, error) {
	key, err := privateKey(privateKeyHex)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(ed25519.Sign(key, []byte(data))), nil
}

func verifyBytes(data, signature, publicKeyHex string) bool {
	key, err := publicKey(publicKeyHex)
	if err != nil {
		return false
	}
	sig, err := hex.DecodeString(signature)
	return err == nil && len(sig) == ed25519.SignatureSize && ed25519.Verify(key, []byte(data), sig)
}

// Sign is the author's signature over a block's canonical form, in hex. It checks nothing: Write checks, then signs.
func Sign(b Block, privateKeyHex string) (string, error) {
	c, err := Canonical(b.Type, b.State, b.Refs)
	if err != nil {
		return "", err
	}
	return signBytes(c, privateKeyHex)
}

// Verify is whether a signature is this key's over exactly this block. It never fails loudly.
func Verify(b Block, signature, publicKeySign string) bool {
	c, err := Canonical(b.Type, b.State, b.Refs)
	return err == nil && verifyBytes(c, signature, publicKeySign)
}

// SignMessage is a message part, signed: the part with `signature` added, over its canonical JSON without it.
func SignMessage(part map[string]any, privateKeyHex string) (map[string]any, error) {
	rest := withoutSignature(part)
	c, err := CanonicalJSON(rest)
	if err != nil {
		return nil, err
	}
	sig, err := signBytes(c, privateKeyHex)
	if err != nil {
		return nil, err
	}
	rest["signature"] = sig
	return rest, nil
}

// VerifyMessage is whether a signed message part's `signature` is this key's.
func VerifyMessage(part map[string]any, publicKeySign string) bool {
	sig, ok := part["signature"].(string)
	if !ok {
		return false
	}
	c, err := CanonicalJSON(withoutSignature(part))
	return err == nil && verifyBytes(c, sig, publicKeySign)
}

func withoutSignature(part map[string]any) map[string]any {
	rest := make(map[string]any, len(part))
	for k, v := range part {
		if k != "signature" {
			rest[k] = v
		}
	}
	return rest
}

// opens is whether a signed block opens with this key.
func opens(b Block, publicKeySign string) bool {
	return b.Signature != "" && publicKeySign != "" && Verify(b, b.Signature, publicKeySign)
}

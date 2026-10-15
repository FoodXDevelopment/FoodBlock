package foodblock

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
)

// The envelope (protocol.md, Encoding): a sealed copy's plaintext is encrypted with AES-256-GCM under a random 32-byte
// content key and a 12-byte nonce, no additional data. A fresh X25519 key per envelope agrees a secret with each
// recipient's key; the key derived from that secret (HKDF-SHA256 salted with the ephemeral public key's bytes then the
// recipient's, info from protocol.json; or, under AlgRaw, the raw secret) seals the content key with its own 12-byte
// nonce. The envelope names no recipient: each recipient tries every entry. An older envelope's `key_hash` is ignored.

// EncryptionKeypair is an X25519 key: { public_key_encrypt, x25519_private }, raw 32 bytes each, hex.
type EncryptionKeypair struct {
	PublicKeyEncrypt string `json:"public_key_encrypt"`
	X25519Private    string `json:"x25519_private"`
}

// GenerateEncryptionKeypair is a new encryption key.
func GenerateEncryptionKeypair() (EncryptionKeypair, error) {
	k, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return EncryptionKeypair{}, err
	}
	return EncryptionKeypair{hex.EncodeToString(k.PublicKey().Bytes()), hex.EncodeToString(k.Bytes())}, nil
}

func x25519Private(h string) (*ecdh.PrivateKey, error) {
	raw, err := hex.DecodeString(h)
	if err != nil || len(raw) != 32 {
		return nil, errors.New("envelope: an X25519 private key is 32 bytes")
	}
	return ecdh.X25519().NewPrivateKey(raw)
}

func x25519Public(h string) (*ecdh.PublicKey, error) {
	raw, err := hex.DecodeString(h)
	if err != nil || len(raw) != 32 {
		return nil, errors.New("envelope: an X25519 public key is 32 bytes")
	}
	return ecdh.X25519().NewPublicKey(raw)
}

// EncryptionKeyOf is the public encryption key of an X25519 private key (hex).
func EncryptionKeyOf(privateHex string) (string, error) {
	k, err := x25519Private(privateHex)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(k.PublicKey().Bytes()), nil
}

func sealingKey(alg string, secret, ephemeral, recipient []byte) ([]byte, error) {
	switch alg {
	case AlgRaw:
		return secret, nil
	case Alg:
		return hkdf.Key(sha256.New, secret, append(append([]byte{}, ephemeral...), recipient...), hkdfInfo, 32)
	}
	return nil, errors.New("envelope: unknown alg " + alg)
}

func gcm(key, nonce, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return aead.Seal(nil, nonce, data, nil), nil
}

func ungcm(key, nonce, sealed []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return aead.Open(nil, nonce, sealed, nil)
}

// Fixed holds the random parts of an envelope, hex, only to reproduce a vector.
type Fixed struct {
	Ephemeral, ContentKey, Nonce string
	KeyNonces                    []string
}

func random(n int, fixed string) ([]byte, error) {
	if fixed != "" {
		return hex.DecodeString(fixed)
	}
	b := make([]byte, n)
	_, err := rand.Read(b)
	return b, err
}

// Seal encrypts a value (as JSON) to recipients' encryption keys: { alg, ephemeral_key, nonce, ciphertext,
// recipients: [{ encrypted_key }] }. alg "" is Alg; fixed is nil except to reproduce a vector.
func Seal(value any, recipientKeys []string, alg string, fixed *Fixed) (map[string]any, error) {
	if len(recipientKeys) == 0 {
		return nil, errors.New("envelope: at least one recipient key")
	}
	if alg == "" {
		alg = Alg
	}
	if fixed == nil {
		fixed = &Fixed{}
	}
	contentKey, err := random(32, fixed.ContentKey)
	if err != nil {
		return nil, err
	}
	nonce, err := random(12, fixed.Nonce)
	if err != nil {
		return nil, err
	}
	var ephemeral *ecdh.PrivateKey
	if fixed.Ephemeral != "" {
		ephemeral, err = x25519Private(fixed.Ephemeral)
	} else {
		ephemeral, err = ecdh.X25519().GenerateKey(rand.Reader)
	}
	if err != nil {
		return nil, err
	}
	ephemeralRaw := ephemeral.PublicKey().Bytes()
	recipients := []any{}
	for i, key := range recipientKeys {
		pub, err := x25519Public(key)
		if err != nil {
			return nil, err
		}
		secret, err := ephemeral.ECDH(pub)
		if err != nil {
			return nil, err
		}
		keyNonceHex := ""
		if i < len(fixed.KeyNonces) {
			keyNonceHex = fixed.KeyNonces[i]
		}
		keyNonce, err := random(12, keyNonceHex)
		if err != nil {
			return nil, err
		}
		sk, err := sealingKey(alg, secret, ephemeralRaw, pub.Bytes())
		if err != nil {
			return nil, err
		}
		sealed, err := gcm(sk, keyNonce, contentKey)
		if err != nil {
			return nil, err
		}
		recipients = append(recipients, map[string]any{"encrypted_key": base64.StdEncoding.EncodeToString(append(sealed, keyNonce...))})
	}
	var plaintext bytes.Buffer
	enc := json.NewEncoder(&plaintext)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(value); err != nil {
		return nil, err
	}
	ciphertext, err := gcm(contentKey, nonce, bytes.TrimRight(plaintext.Bytes(), "\n"))
	if err != nil {
		return nil, err
	}
	return map[string]any{"alg": alg, "ephemeral_key": hex.EncodeToString(ephemeralRaw), "nonce": base64.StdEncoding.EncodeToString(nonce),
		"ciphertext": base64.StdEncoding.EncodeToString(ciphertext), "recipients": recipients}, nil
}

// Open opens an envelope with a recipient's X25519 private key: the value inside (JSON, numbers kept exact). Every
// entry is tried; none names its recipient.
func Open(envelope map[string]any, privateHex string) (any, error) {
	private, err := x25519Private(privateHex)
	if err != nil {
		return nil, err
	}
	ephemeral, err := x25519Public(str(envelope["ephemeral_key"]))
	if err != nil {
		return nil, err
	}
	secret, err := private.ECDH(ephemeral)
	if err != nil {
		return nil, err
	}
	alg := str(envelope["alg"])
	if alg == "" {
		alg = AlgRaw
	}
	key, err := sealingKey(alg, secret, ephemeral.Bytes(), private.PublicKey().Bytes())
	if err != nil {
		return nil, err
	}
	nonce, err1 := base64.StdEncoding.DecodeString(str(envelope["nonce"]))
	ciphertext, err2 := base64.StdEncoding.DecodeString(str(envelope["ciphertext"]))
	if err1 != nil || err2 != nil {
		return nil, errors.New("envelope: nonce and ciphertext are base64")
	}
	entries, _ := arr(envelope["recipients"])
	for _, entry := range entries {
		sealed, err := base64.StdEncoding.DecodeString(str(obj(entry)["encrypted_key"]))
		if err != nil || len(sealed) < 12+16 {
			continue
		}
		contentKey, err := ungcm(key, sealed[len(sealed)-12:], sealed[:len(sealed)-12])
		if err != nil {
			continue
		}
		plaintext, err := ungcm(contentKey, nonce, ciphertext)
		if err != nil {
			return nil, err
		}
		return decodeJSON(plaintext)
	}
	return nil, errors.New("envelope: no entry opens with this key")
}

// decodeJSON reads JSON with its numbers kept exactly as written.
func decodeJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	err := dec.Decode(&v)
	return v, err
}

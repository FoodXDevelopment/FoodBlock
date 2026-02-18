package foodblock

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"

	"golang.org/x/crypto/curve25519"
)

// EncryptionEnvelope is the encrypted payload per Section 7.2.
type EncryptionEnvelope struct {
	Alg          string             `json:"alg"`
	EphemeralKey string             `json:"ephemeral_key"`
	Recipients   []EncryptRecipient `json:"recipients"`
	Nonce        string             `json:"nonce"`
	Ciphertext   string             `json:"ciphertext"`
}

// EncryptRecipient holds a per-recipient encrypted content key.
type EncryptRecipient struct {
	KeyHash      string `json:"key_hash"`
	EncryptedKey string `json:"encrypted_key"`
}

// GenerateEncryptionKeypair generates an X25519 keypair for encryption.
// Returns publicKey and privateKey as hex strings (raw 32-byte format).
func GenerateEncryptionKeypair() (publicKeyHex, privateKeyHex string, err error) {
	var privateKey [32]byte
	if _, err := rand.Read(privateKey[:]); err != nil {
		return "", "", err
	}
	publicKey, err := curve25519.X25519(privateKey[:], curve25519.Basepoint)
	if err != nil {
		return "", "", err
	}
	return hex.EncodeToString(publicKey), hex.EncodeToString(privateKey[:]), nil
}

// Encrypt encrypts a value for multiple recipients using envelope encryption.
// Uses X25519 key agreement + AES-256-GCM symmetric encryption.
func Encrypt(value interface{}, recipientPublicKeys []string) (*EncryptionEnvelope, error) {
	if len(recipientPublicKeys) == 0 {
		return nil, errors.New("FoodBlock: at least one recipient public key is required")
	}

	plaintext, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}

	// Generate random content key (256-bit)
	contentKey := make([]byte, 32)
	if _, err := rand.Read(contentKey); err != nil {
		return nil, err
	}

	// Generate nonce for content encryption
	nonce := make([]byte, 12)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	// Encrypt value with content key using AES-256-GCM
	block, err := aes.NewCipher(contentKey)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ciphertext := aead.Seal(nil, nonce, plaintext, nil)

	// Generate ephemeral X25519 keypair
	var ephPriv [32]byte
	if _, err := rand.Read(ephPriv[:]); err != nil {
		return nil, err
	}
	ephPub, err := curve25519.X25519(ephPriv[:], curve25519.Basepoint)
	if err != nil {
		return nil, err
	}

	// Encrypt content key for each recipient
	recipients := make([]EncryptRecipient, 0, len(recipientPublicKeys))
	for _, pubKeyHex := range recipientPublicKeys {
		pubKeyBytes, err := hex.DecodeString(pubKeyHex)
		if err != nil {
			return nil, errors.New("FoodBlock: invalid recipient public key hex")
		}

		// Derive shared secret via ECDH
		sharedSecret, err := curve25519.X25519(ephPriv[:], pubKeyBytes)
		if err != nil {
			return nil, err
		}

		// Encrypt content key with shared secret
		keyNonce := make([]byte, 12)
		if _, err := rand.Read(keyNonce); err != nil {
			return nil, err
		}

		keyBlock, err := aes.NewCipher(sharedSecret)
		if err != nil {
			return nil, err
		}
		keyAead, err := cipher.NewGCM(keyBlock)
		if err != nil {
			return nil, err
		}
		encryptedKey := keyAead.Seal(nil, keyNonce, contentKey, nil)
		// Append nonce to encrypted key (same as JS)
		encryptedKey = append(encryptedKey, keyNonce...)

		// Compute key_hash
		keyHashBytes := sha256.Sum256(pubKeyBytes)
		keyHash := hex.EncodeToString(keyHashBytes[:])

		recipients = append(recipients, EncryptRecipient{
			KeyHash:      keyHash,
			EncryptedKey: base64.StdEncoding.EncodeToString(encryptedKey),
		})
	}

	return &EncryptionEnvelope{
		Alg:          "x25519-aes-256-gcm",
		EphemeralKey: hex.EncodeToString(ephPub),
		Recipients:   recipients,
		Nonce:        base64.StdEncoding.EncodeToString(nonce),
		Ciphertext:   base64.StdEncoding.EncodeToString(ciphertext),
	}, nil
}

// Decrypt decrypts an encryption envelope.
func Decrypt(envelope *EncryptionEnvelope, privateKeyHex, publicKeyHex string) (interface{}, error) {
	pubKeyBytes, err := hex.DecodeString(publicKeyHex)
	if err != nil {
		return nil, errors.New("FoodBlock: invalid public key hex")
	}
	privKeyBytes, err := hex.DecodeString(privateKeyHex)
	if err != nil {
		return nil, errors.New("FoodBlock: invalid private key hex")
	}

	// Find matching recipient
	keyHashBytes := sha256.Sum256(pubKeyBytes)
	keyHash := hex.EncodeToString(keyHashBytes[:])

	var recipient *EncryptRecipient
	for i := range envelope.Recipients {
		if envelope.Recipients[i].KeyHash == keyHash {
			recipient = &envelope.Recipients[i]
			break
		}
	}
	if recipient == nil {
		return nil, errors.New("FoodBlock: no matching recipient entry found for this key")
	}

	// Reconstruct ephemeral public key
	ephPubBytes, err := hex.DecodeString(envelope.EphemeralKey)
	if err != nil {
		return nil, err
	}

	// Derive shared secret
	sharedSecret, err := curve25519.X25519(privKeyBytes, ephPubBytes)
	if err != nil {
		return nil, err
	}

	// Decrypt content key
	encryptedKeyBuf, err := base64.StdEncoding.DecodeString(recipient.EncryptedKey)
	if err != nil {
		return nil, err
	}

	keyNonce := encryptedKeyBuf[len(encryptedKeyBuf)-12:]
	keyData := encryptedKeyBuf[:len(encryptedKeyBuf)-12]

	keyBlock, err := aes.NewCipher(sharedSecret)
	if err != nil {
		return nil, err
	}
	keyAead, err := cipher.NewGCM(keyBlock)
	if err != nil {
		return nil, err
	}
	contentKey, err := keyAead.Open(nil, keyNonce, keyData, nil)
	if err != nil {
		return nil, errors.New("FoodBlock: failed to decrypt content key")
	}

	// Decrypt ciphertext
	ciphertextBuf, err := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	if err != nil {
		return nil, err
	}
	contentNonce, err := base64.StdEncoding.DecodeString(envelope.Nonce)
	if err != nil {
		return nil, err
	}

	contentBlock, err := aes.NewCipher(contentKey)
	if err != nil {
		return nil, err
	}
	contentAead, err := cipher.NewGCM(contentBlock)
	if err != nil {
		return nil, err
	}
	plaintext, err := contentAead.Open(nil, contentNonce, ciphertextBuf, nil)
	if err != nil {
		return nil, errors.New("FoodBlock: failed to decrypt ciphertext")
	}

	var result interface{}
	if err := json.Unmarshal(plaintext, &result); err != nil {
		return nil, err
	}
	return result, nil
}

package foodblock

import (
	"encoding/hex"
	"testing"
)

func TestGenerateEncryptionKeypair(t *testing.T) {
	pub, priv, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair returned error: %v", err)
	}

	// Both keys should be 64-char hex strings (32 bytes)
	if len(pub) != 64 {
		t.Errorf("public key length = %d, want 64", len(pub))
	}
	if len(priv) != 64 {
		t.Errorf("private key length = %d, want 64", len(priv))
	}

	// Verify they are valid hex
	if _, err := hex.DecodeString(pub); err != nil {
		t.Errorf("public key is not valid hex: %v", err)
	}
	if _, err := hex.DecodeString(priv); err != nil {
		t.Errorf("private key is not valid hex: %v", err)
	}

	// Public and private keys must differ
	if pub == priv {
		t.Errorf("public key should not equal private key")
	}
}

func TestEncryptDecryptRoundtrip(t *testing.T) {
	pub, priv, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair returned error: %v", err)
	}

	original := "hello foodblock"
	envelope, err := Encrypt(original, []string{pub})
	if err != nil {
		t.Fatalf("Encrypt returned error: %v", err)
	}

	if envelope.Alg != "x25519-aes-256-gcm" {
		t.Errorf("envelope.Alg = %q, want %q", envelope.Alg, "x25519-aes-256-gcm")
	}
	if len(envelope.Recipients) != 1 {
		t.Errorf("len(envelope.Recipients) = %d, want 1", len(envelope.Recipients))
	}

	decrypted, err := Decrypt(envelope, priv, pub)
	if err != nil {
		t.Fatalf("Decrypt returned error: %v", err)
	}

	// json.Unmarshal returns strings as-is from JSON
	decStr, ok := decrypted.(string)
	if !ok {
		t.Fatalf("decrypted value is %T, want string", decrypted)
	}
	if decStr != original {
		t.Errorf("decrypted = %q, want %q", decStr, original)
	}
}

func TestEncryptMultipleRecipients(t *testing.T) {
	pub1, priv1, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair (1) error: %v", err)
	}
	pub2, priv2, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair (2) error: %v", err)
	}

	original := map[string]interface{}{"secret": "data"}
	envelope, err := Encrypt(original, []string{pub1, pub2})
	if err != nil {
		t.Fatalf("Encrypt returned error: %v", err)
	}

	if len(envelope.Recipients) != 2 {
		t.Fatalf("len(envelope.Recipients) = %d, want 2", len(envelope.Recipients))
	}

	// Recipient 1 can decrypt
	dec1, err := Decrypt(envelope, priv1, pub1)
	if err != nil {
		t.Fatalf("Decrypt with key 1 returned error: %v", err)
	}
	m1, ok := dec1.(map[string]interface{})
	if !ok {
		t.Fatalf("dec1 is %T, want map[string]interface{}", dec1)
	}
	if m1["secret"] != "data" {
		t.Errorf("dec1[\"secret\"] = %v, want %q", m1["secret"], "data")
	}

	// Recipient 2 can decrypt independently
	dec2, err := Decrypt(envelope, priv2, pub2)
	if err != nil {
		t.Fatalf("Decrypt with key 2 returned error: %v", err)
	}
	m2, ok := dec2.(map[string]interface{})
	if !ok {
		t.Fatalf("dec2 is %T, want map[string]interface{}", dec2)
	}
	if m2["secret"] != "data" {
		t.Errorf("dec2[\"secret\"] = %v, want %q", m2["secret"], "data")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	pub1, _, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair (1) error: %v", err)
	}
	_, priv2, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair (2) error: %v", err)
	}
	pub3, _, err := GenerateEncryptionKeypair()
	if err != nil {
		t.Fatalf("GenerateEncryptionKeypair (3) error: %v", err)
	}

	envelope, err := Encrypt("secret", []string{pub1})
	if err != nil {
		t.Fatalf("Encrypt returned error: %v", err)
	}

	// Decrypt with wrong private key but matching public key hash won't match recipient
	_, err = Decrypt(envelope, priv2, pub3)
	if err == nil {
		t.Errorf("Decrypt with wrong key should return error, got nil")
	}
}

func TestEncryptEmptyRecipients(t *testing.T) {
	_, err := Encrypt("hello", []string{})
	if err == nil {
		t.Errorf("Encrypt with empty recipients should return error, got nil")
	}

	_, err = Encrypt("hello", nil)
	if err == nil {
		t.Errorf("Encrypt with nil recipients should return error, got nil")
	}
}

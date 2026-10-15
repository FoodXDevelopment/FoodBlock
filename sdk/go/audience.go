package foodblock

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
)

// The commitment (protocol.md §9): the one privacy primitive. A salted hash, SHA-256 of the salt's hex followed by the
// value, as UTF-8. The salt (or the salt and the value) travels beside the block only to whoever it is for, in their
// own copy (`reveals`). A salt is fresh per block per recipient, never reused.

// NewSalt is 16 random bytes in hex: a salt, or a block's nonce.
func NewSalt() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// SaltedHash is the commitment to a value under a salt.
func SaltedHash(saltHex, value string) string {
	sum := sha256.Sum256([]byte(saltHex + value))
	return hex.EncodeToString(sum[:])
}

// Commit is an audience for these recipients (people, circles, `circle#role`): the sorted commitments, and each
// recipient's salt. A salt is fresh unless one is given (only to reproduce a vector).
func Commit(recipients []string, given map[string]string) ([]string, map[string]string, error) {
	who := uniq(recipients)
	if len(who) == 0 {
		return nil, nil, errors.New("audience: an audience names at least one recipient")
	}
	salts := map[string]string{}
	for _, one := range who {
		if one == "" {
			return nil, nil, errors.New("audience: an audience names at least one recipient")
		}
		if s := given[one]; s != "" {
			salts[one] = s
		} else {
			salts[one] = NewSalt()
		}
	}
	commitments := []string{}
	for _, one := range who {
		commitments = append(commitments, SaltedHash(salts[one], one))
	}
	commitments = uniq(commitments)
	sort.Strings(commitments)
	return commitments, salts, nil
}

// FindsSelf is whether a recipient holding this salt finds itself in a block's audience.
func FindsSelf(b Block, recipient, saltHex string) bool {
	return saltHex != "" && contains(list(b.State["audience"]), SaltedHash(saltHex, recipient)) && !isStr(b.State["audience"])
}

// RevealFor is the reveal a recipient's copy carries for its audience entry: { salt, value } (its own id).
func RevealFor(salts map[string]string, recipient string) map[string]any {
	return map[string]any{"salt": salts[recipient], "value": recipient}
}

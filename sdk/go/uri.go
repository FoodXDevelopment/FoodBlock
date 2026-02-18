package foodblock

import (
	"errors"
	"strings"
)

const uriPrefix = "fb:"

// ToURI converts a block or hash to a FoodBlock URI.
func ToURI(block *Block, alias string) string {
	if alias != "" && block != nil && block.Type != "" {
		return uriPrefix + block.Type + "/" + alias
	}
	if block != nil {
		return uriPrefix + block.Hash
	}
	return uriPrefix
}

// ToURIFromHash converts a hash string to a FoodBlock URI.
func ToURIFromHash(hash string) string {
	return uriPrefix + hash
}

// URIResult holds the parsed result of a FoodBlock URI.
type URIResult struct {
	Hash  string
	Type  string
	Alias string
}

// FromURI parses a FoodBlock URI.
func FromURI(uri string) (URIResult, error) {
	if !strings.HasPrefix(uri, uriPrefix) {
		return URIResult{}, errors.New("FoodBlock: invalid URI, must start with \"" + uriPrefix + "\"")
	}
	body := uri[len(uriPrefix):]

	slashIdx := strings.Index(body, "/")
	dotIdx := strings.Index(body, ".")
	if slashIdx != -1 && dotIdx != -1 && dotIdx < slashIdx {
		return URIResult{
			Type:  body[:slashIdx],
			Alias: body[slashIdx+1:],
		}, nil
	}

	return URIResult{Hash: body}, nil
}

package foodblock

import "errors"

// Registry maps human-readable names to block hashes.
type Registry struct {
	aliases map[string]string
}

// NewRegistry creates a new alias registry.
func NewRegistry() *Registry {
	return &Registry{aliases: make(map[string]string)}
}

// Set registers an alias for a hash.
func (r *Registry) Set(alias, hash string) *Registry {
	r.aliases[alias] = hash
	return r
}

// Resolve resolves an alias (prefixed with @) to a hash. Pass-through for raw hashes.
func (r *Registry) Resolve(aliasOrHash string) (string, error) {
	if len(aliasOrHash) > 0 && aliasOrHash[0] == '@' {
		name := aliasOrHash[1:]
		hash, ok := r.aliases[name]
		if !ok {
			return "", errors.New("FoodBlock: unresolved alias \"@" + name + "\"")
		}
		return hash, nil
	}
	return aliasOrHash, nil
}

// ResolveRefs resolves all @aliases in a refs map.
func (r *Registry) ResolveRefs(refs map[string]interface{}) (map[string]interface{}, error) {
	resolved := make(map[string]interface{})
	for key, value := range refs {
		switch v := value.(type) {
		case string:
			h, err := r.Resolve(v)
			if err != nil {
				return nil, err
			}
			resolved[key] = h
		case []interface{}:
			arr := make([]interface{}, len(v))
			for i, item := range v {
				if s, ok := item.(string); ok {
					h, err := r.Resolve(s)
					if err != nil {
						return nil, err
					}
					arr[i] = h
				} else {
					arr[i] = item
				}
			}
			resolved[key] = arr
		default:
			resolved[key] = value
		}
	}
	return resolved, nil
}

// Create creates a block resolving @aliases in refs. Optionally registers an alias for the new block.
func (r *Registry) Create(typ string, state, refs map[string]interface{}, alias string) (Block, error) {
	resolvedRefs, err := r.ResolveRefs(refs)
	if err != nil {
		return Block{}, err
	}
	block := Create(typ, state, resolvedRefs)
	if alias != "" {
		r.aliases[alias] = block.Hash
	}
	return block, nil
}

// UpdateBlock creates an update block resolving @aliases.
func (r *Registry) UpdateBlock(previousHash, typ string, state, refs map[string]interface{}, alias string) (Block, error) {
	resolvedPrev, err := r.Resolve(previousHash)
	if err != nil {
		return Block{}, err
	}
	resolvedRefs, err := r.ResolveRefs(refs)
	if err != nil {
		return Block{}, err
	}
	block := Update(resolvedPrev, typ, state, resolvedRefs)
	if alias != "" {
		r.aliases[alias] = block.Hash
	}
	return block, nil
}

// Aliases returns all registered aliases.
func (r *Registry) Aliases() map[string]string {
	result := make(map[string]string)
	for k, v := range r.aliases {
		result[k] = v
	}
	return result
}

// Has checks if an alias exists.
func (r *Registry) Has(alias string) bool {
	_, ok := r.aliases[alias]
	return ok
}

// Size returns the number of registered aliases.
func (r *Registry) Size() int {
	return len(r.aliases)
}

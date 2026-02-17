package foodblock

import (
	"crypto/ed25519"
	"encoding/hex"
	"errors"
)

// Agent represents a FoodBlock AI agent with signing capability.
type Agent struct {
	Block      Block
	PublicKey  []byte
	PrivateKey []byte
	AuthorHash string
}

// CreateAgent creates a new AI agent with an Ed25519 keypair.
func CreateAgent(name, operatorHash string, opts map[string]interface{}) (*Agent, error) {
	if name == "" {
		return nil, errors.New("FoodBlock Agent: name is required")
	}
	if operatorHash == "" {
		return nil, errors.New("FoodBlock Agent: operatorHash is required — every agent must have an operator")
	}

	pub, priv, _ := ed25519.GenerateKey(nil)

	state := map[string]interface{}{"name": name}
	if opts != nil {
		if model, ok := opts["model"]; ok {
			state["model"] = model
		}
		if caps, ok := opts["capabilities"]; ok {
			state["capabilities"] = caps
		}
	}

	block := Create("actor.agent", state, map[string]interface{}{"operator": operatorHash})

	return &Agent{
		Block:      block,
		PublicKey:  []byte(pub),
		PrivateKey: []byte(priv),
		AuthorHash: block.Hash,
	}, nil
}

// Sign signs a block on behalf of this agent.
func (a *Agent) Sign(block Block) SignedBlock {
	return Sign(block, a.AuthorHash, a.PrivateKey)
}

// CreateDraft creates a draft block on behalf of this agent.
func (a *Agent) CreateDraft(typ string, state map[string]interface{}, refs map[string]interface{}) (Block, SignedBlock) {
	if state == nil {
		state = map[string]interface{}{}
	}
	if refs == nil {
		refs = map[string]interface{}{}
	}
	state["draft"] = true
	refs["agent"] = a.AuthorHash
	block := Create(typ, state, refs)
	signed := a.Sign(block)
	return block, signed
}

// ApproveDraft creates an approved version of a draft block.
func ApproveDraft(draftBlock Block) Block {
	approvedState := make(map[string]interface{})
	for k, v := range draftBlock.State {
		if k != "draft" {
			approvedState[k] = v
		}
	}

	approvedRefs := make(map[string]interface{})
	var agentHash interface{}
	for k, v := range draftBlock.Refs {
		if k == "agent" {
			agentHash = v
		} else {
			approvedRefs[k] = v
		}
	}
	approvedRefs["updates"] = draftBlock.Hash
	if agentHash != nil {
		approvedRefs["approved_agent"] = agentHash
	}

	return Create(draftBlock.Type, approvedState, approvedRefs)
}

// LoadAgent restores an agent from saved credentials.
func LoadAgent(authorHash string, publicKey, privateKey []byte) (*Agent, error) {
	if authorHash == "" || privateKey == nil {
		return nil, errors.New("FoodBlock Agent: authorHash and privateKey are required")
	}
	return &Agent{
		PublicKey:  publicKey,
		PrivateKey: privateKey,
		AuthorHash: authorHash,
	}, nil
}

// PublicKeyHex returns the public key as a hex string.
func (a *Agent) PublicKeyHex() string {
	return hex.EncodeToString(a.PublicKey)
}

// PrivateKeyHex returns the private key seed as a hex string.
func (a *Agent) PrivateKeyHex() string {
	if len(a.PrivateKey) == ed25519.PrivateKeySize {
		return hex.EncodeToString(a.PrivateKey[:ed25519.SeedSize])
	}
	return hex.EncodeToString(a.PrivateKey)
}

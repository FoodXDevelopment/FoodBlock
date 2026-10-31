package foodblock

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// The one door into the Rust core (sdk/rust, src/door.rs). The core is the same WebAssembly file every other SDK
// carries (sdk/javascript/core/foodblock.wasm, embedded here as foodblock.wasm) and runs in wazero, a pure Go runtime:
// no cgo, no C compiler, no native library, one artifact on every platform (wasm.go). An op's name and its arguments
// as a JSON array go in; { "ok": value } or { "error": kind, "message", "code", "reasons", "refusals" } comes out.
// Every function of this package is a call through ask, so the protocol has one implementation, not a copy.

// Refused is the write check saying no: every refusal ({ code, detail }, codes from protocol.json refusals.codes.block)
// and their details (Wrong) in the same order.
type Refused struct {
	Refusals []Finding
	Wrong    []string
}

func (r *Refused) Error() string {
	out := "write: refused: "
	for i, f := range r.Refusals {
		if i > 0 {
			out += "; "
		}
		out += f.Code + ": " + f.Detail
	}
	return out
}

// CodedError is a failure the core names: Kind (argument, json, crypto, internal, ...) and, when it is one of
// protocol.json's refusals.codes, its Code (a sealed copy's block over the size limit).
type CodedError struct{ Code, Message, Kind string }

func (e *CodedError) Error() string { return e.Message }

// raw calls the core and returns the `ok` value as JSON.
func raw(op string, args ...any) (json.RawMessage, error) {
	var in bytes.Buffer
	enc := json.NewEncoder(&in)
	enc.SetEscapeHTML(false)
	if args == nil {
		args = []any{}
	}
	if err := enc.Encode(args); err != nil {
		return nil, err
	}
	text, err := callCore(op, bytes.TrimSpace(in.Bytes()))
	if err != nil {
		return nil, err
	}
	var answer struct {
		Ok       json.RawMessage `json:"ok"`
		Error    string          `json:"error"`
		Message  string          `json:"message"`
		Code     string          `json:"code"`
		Refusals []Finding       `json:"refusals"`
	}
	if err := json.Unmarshal(text, &answer); err != nil {
		return nil, err
	}
	switch {
	case answer.Error == "refused" && len(answer.Refusals) > 0:
		return nil, &Refused{answer.Refusals, details(answer.Refusals)}
	case answer.Error != "":
		return nil, &CodedError{Code: answer.Code, Message: answer.Message, Kind: answer.Error}
	}
	return answer.Ok, nil
}

// ask calls the core and reads the answer as T (numbers stay json.Number, as everywhere in this package).
func ask[T any](op string, args ...any) (T, error) {
	var out T
	data, err := raw(op, args...)
	if err != nil {
		return out, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	err = dec.Decode(&out)
	return out, err
}

// must is for questions that cannot fail (a yes or no, a list). When the core fails anyway (a trap, an argument it
// refuses, an answer that does not decode), must panics: a failed call is never read as an answer, because the zero
// answer ("no refusals", "live", false) is often the permissive one (security J). Kotlin, Python and Swift throw.
func must[T any](op string, args ...any) T {
	out, err := ask[T](op, args...)
	if err != nil {
		panic(fmt.Errorf("foodblock: %s: %w", op, err))
	}
	return out
}

// sure is a (value, error) answer read as a value that cannot fail: it panics as must does.
func sure[T any](v T, err error) T {
	if err != nil {
		panic(fmt.Errorf("foodblock: %w", err))
	}
	return v
}

// nilIfFalse is a bool option: true as given, false as missing.
func nilIfFalse(b bool) any {
	if !b {
		return nil
	}
	return true
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func details(found []Finding) []string {
	out := []string{}
	for _, f := range found {
		out = append(out, f.Detail)
	}
	return out
}

// MarshalJSON writes a block as the core reads it: empty state and refs are {}, never null.
func (b Block) MarshalJSON() ([]byte, error) {
	type plain Block
	p := plain(b)
	p.State, p.Refs = orEmpty(p.State), orEmpty(p.Refs)
	return json.Marshal(p)
}

func orEmpty(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

// decodeJSON reads JSON with its numbers kept exactly as written.
func decodeJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	err := dec.Decode(&v)
	return v, err
}

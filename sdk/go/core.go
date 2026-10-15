package foodblock

/*
#cgo CFLAGS: -I${SRCDIR}/../rust/include
#cgo LDFLAGS: ${SRCDIR}/../rust/target/release/libfoodblock.a
#cgo darwin LDFLAGS: -framework Security -framework CoreFoundation
#cgo linux LDFLAGS: -lpthread -ldl -lm
#include <stdlib.h>
#include "foodblock.h"
*/
import "C"

import (
	"bytes"
	"encoding/json"
	"errors"
	"unsafe"
)

// The one door into the Rust core (sdk/rust, src/door.rs) through its C ABI (fb_call). An op's name and its arguments
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
	cop, cargs := C.CString(op), C.CString(in.String())
	defer C.free(unsafe.Pointer(cop))
	defer C.free(unsafe.Pointer(cargs))
	var out *C.char
	status := C.fb_call(cop, cargs, &out)
	defer C.fb_free(out)
	text := C.GoString(out)
	if status != C.FB_OK {
		return nil, errors.New(text)
	}
	var answer struct {
		Ok       json.RawMessage `json:"ok"`
		Error    string          `json:"error"`
		Message  string          `json:"message"`
		Code     string          `json:"code"`
		Refusals []Finding       `json:"refusals"`
	}
	if err := json.Unmarshal([]byte(text), &answer); err != nil {
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

// must is for questions that cannot fail (a yes or no, a list): a failure reads as the zero answer.
func must[T any](op string, args ...any) T {
	out, _ := ask[T](op, args...)
	return out
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

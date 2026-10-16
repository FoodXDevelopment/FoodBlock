package foodblock

import (
	"context"
	"crypto/rand"
	_ "embed"
	"errors"
	"sync"
	"time"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

// The Rust core as WebAssembly, run by wazero (pure Go). foodblock.wasm is an exact copy of
// sdk/javascript/core/foodblock.wasm (tools/version-sync.cjs --pack refreshes it; TestWasmIsTheSharedCore proves it).
// The host gives the core what it has none of: randomness and the clock (src/wasm.rs).
//
//go:embed foodblock.wasm
var coreWasm []byte

var (
	mu       sync.Mutex // one call at a time into one instance
	runtime  wazero.Runtime
	compiled wazero.CompiledModule
	instance api.Module
)

// start compiles the core once and makes a fresh instance of it (also after a trap, which poisons an instance).
func start(ctx context.Context) error {
	if runtime == nil {
		r := wazero.NewRuntime(ctx)
		_, err := r.NewHostModuleBuilder("env").
			NewFunctionBuilder().WithFunc(func(_ context.Context, m api.Module, ptr, n uint32) {
			if buf, ok := m.Memory().Read(ptr, n); ok {
				_, _ = rand.Read(buf)
			}
		}).Export("fb_random").
			NewFunctionBuilder().WithFunc(func() float64 { return float64(time.Now().UnixMilli()) }).Export("fb_now_ms").
			Instantiate(ctx)
		if err != nil {
			return err
		}
		c, err := r.CompileModule(ctx, coreWasm)
		if err != nil {
			return err
		}
		runtime, compiled = r, c
	}
	m, err := runtime.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName(""))
	if err != nil {
		return err
	}
	instance = m
	return nil
}

var errInternal = errors.New("foodblock: an internal error stopped the call")

// callCore runs one op of the door: the op name and the JSON arguments in, the JSON answer out.
func callCore(op string, args []byte) ([]byte, error) {
	mu.Lock()
	defer mu.Unlock()
	ctx := context.Background()
	if instance == nil {
		if err := start(ctx); err != nil {
			return nil, err
		}
	}
	out, err := invoke(ctx, []byte(op), args)
	if err != nil { // a trap: the core stopped mid-call. Start again from a clean instance and say so.
		instance = nil
		return nil, errInternal
	}
	return out, nil
}

func invoke(ctx context.Context, op, args []byte) ([]byte, error) {
	alloc, dealloc := instance.ExportedFunction("fb_alloc"), instance.ExportedFunction("fb_dealloc")
	put := func(data []byte) (uint32, error) {
		got, err := alloc.Call(ctx, uint64(len(data)))
		if err != nil {
			return 0, err
		}
		if !instance.Memory().Write(uint32(got[0]), data) {
			return 0, errInternal
		}
		return uint32(got[0]), nil
	}
	o, err := put(op)
	if err != nil {
		return nil, err
	}
	a, err := put(args)
	if err != nil {
		return nil, err
	}
	got, err := instance.ExportedFunction("fb_call").Call(ctx, uint64(o), uint64(len(op)), uint64(a), uint64(len(args)))
	if err != nil {
		return nil, err
	}
	size, err := instance.ExportedFunction("fb_out_len").Call(ctx)
	if err != nil {
		return nil, err
	}
	view, ok := instance.Memory().Read(uint32(got[0]), uint32(size[0]))
	if !ok {
		return nil, errInternal
	}
	answer := append([]byte(nil), view...)
	for _, free := range [][2]uint64{{got[0], size[0]}, {uint64(o), uint64(len(op))}, {uint64(a), uint64(len(args))}} {
		if _, err := dealloc.Call(ctx, free[0], free[1]); err != nil {
			return nil, err
		}
	}
	return answer, nil
}

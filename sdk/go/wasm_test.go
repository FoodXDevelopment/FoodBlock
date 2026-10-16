package foodblock

import (
	"bytes"
	"os"
	"sync"
	"testing"
)

// The embedded core is byte for byte the one every other SDK carries (inside this repository; a copy elsewhere has no
// sibling to compare with).
func TestWasmIsTheSharedCore(t *testing.T) {
	shared, err := os.ReadFile("../javascript/core/foodblock.wasm")
	if err != nil {
		t.Skip("not inside the repository")
	}
	if !bytes.Equal(shared, coreWasm) {
		t.Fatal("sdk/go/foodblock.wasm differs from sdk/javascript/core/foodblock.wasm: run `node tools/version-sync.cjs --pack`")
	}
}

// Many goroutines share one core.
func TestCoreIsSafeForManyGoroutines(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				if _, err := GenerateKeypair(); err != nil {
					t.Error(err)
					return
				}
			}
		}()
	}
	wg.Wait()
}

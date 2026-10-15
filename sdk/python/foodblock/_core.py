"""The one door into the Rust core (sdk/rust, src/door.rs). An op's name and its arguments as a JSON array go in;
`{ "ok": value }` or `{ "error": kind, "message", "code", "reasons", "refusals" }` comes out. Every function of this
package is a call through `call`, so the protocol has one implementation, not a copy.

The shared library (`libfoodblock`, built by `cargo rustc --release --features ffi --crate-type cdylib` in sdk/rust)
is found from the `FOODBLOCK_LIB` environment variable, else beside this file, else in sdk/rust/target/release."""

import ctypes
import json
import os
import sys

_NAME = {"darwin": "libfoodblock.dylib", "win32": "foodblock.dll"}.get(sys.platform, "libfoodblock.so")


def _load():
    here = os.path.dirname(os.path.abspath(__file__))
    wanted = [os.environ.get("FOODBLOCK_LIB"), os.path.join(here, _NAME),
              os.path.join(here, "..", "..", "rust", "target", "release", _NAME)]
    for path in filter(None, wanted):
        if os.path.exists(path):
            lib = ctypes.CDLL(path)
            lib.fb_call.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p)]
            lib.fb_call.restype = ctypes.c_int
            lib.fb_free.argtypes = [ctypes.c_void_p]
            lib.fb_free.restype = None
            return lib
    raise ImportError(f"foodblock: {_NAME} not found. Build the Rust core: cd sdk/rust && "
                      "cargo rustc --release --features ffi --crate-type cdylib, or set FOODBLOCK_LIB")


_lib = _load()


class FoodBlockError(ValueError):
    """A call the core could not answer. `kind`: argument, json, crypto, profile (not in this build) or internal;
    `code` is the protocol.json `refusals.codes` code when the error is one of them."""

    def __init__(self, kind, message, code=None, reasons=()):
        super().__init__(message)
        self.kind, self.code, self.reasons = kind, code, list(reasons)


class Refused(FoodBlockError):
    """The write check refused a block; `refused` lists every finding ({code, detail}), `wrong` their details."""

    def __init__(self, refused, message=None):
        super().__init__("refused", message or "write: refused: " + "; ".join(f"{one['code']}: {one['detail']}" for one in refused))
        self.refused = refused
        self.wrong = [one["detail"] for one in refused]


def call(op, *args):
    out = ctypes.c_void_p()
    status = _lib.fb_call(op.encode("utf-8"), json.dumps(list(args), ensure_ascii=False, allow_nan=False).encode("utf-8"), ctypes.byref(out))
    try:
        text = ctypes.string_at(out.value).decode("utf-8") if out.value else ""
    finally:
        _lib.fb_free(out)
    if status != 0:
        raise FoodBlockError("internal", text or f"foodblock: status {status}")
    answer = json.loads(text)
    if "ok" in answer:
        return answer["ok"]
    refused = answer.get("refusals") or []
    if answer.get("error") == "refused" and refused:
        raise Refused(refused, answer.get("message"))
    raise FoodBlockError(answer.get("error", "internal"), answer.get("message", ""), answer.get("code"), answer.get("reasons") or [])

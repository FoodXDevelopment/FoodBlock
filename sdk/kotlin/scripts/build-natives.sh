#!/usr/bin/env bash
# Builds the Rust core (sdk/rust, --features jni) as a native library for every platform this computer can reach, into
# sdk/kotlin/natives/. Gradle only packages what is there (the jar's resources native/<id>/, the AAR's jniLibs);
# CI builds the rest on the platforms that can (.github/workflows/packages.yml). Never publishes.
#
#   scripts/build-natives.sh [jvm|android|all]        (default all; PROFILE=micro|edge|node, default node)
#
# JVM ids (the loader picks by os.name + os.arch):  macos-arm64 macos-x64 linux-x64 linux-arm64 windows-x64
# Android ABIs (natives/android/<abi>/):            arm64-v8a armeabi-v7a x86_64
# What is not buildable here is skipped with a line saying what it needs.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; KOTLIN="$HERE/.."; RUST="$KOTLIN/../rust"; OUT="$KOTLIN/natives"
PROFILE="${PROFILE:-node}"; WHAT="${1:-all}"; API=24
built=(); skipped=()

cargo_for() { # <rust target> -> builds the cdylib, prints its directory; env for the linker comes from the caller
  (cd "$RUST" && cargo rustc --release --no-default-features --features "jni,$PROFILE" --crate-type cdylib --target "$1" 2>&1 | tail -1) >&2
}
have_target() { rustup target list --installed 2>/dev/null | grep -qx "$1"; }
jvm() { # <id> <rust target> <file> [linker-env-name linker]
  local id="$1" target="$2" file="$3"
  have_target "$target" || { skipped+=("$id: rustup target add $target"); return; }
  if [ -n "${4:-}" ]; then command -v "$5" >/dev/null || { skipped+=("$id: needs the linker $5"); return; }; export "$4=$5"; fi
  cargo_for "$target"
  if [ -f "$RUST/target/$target/release/$file" ]; then mkdir -p "$OUT/$id"; cp "$RUST/target/$target/release/$file" "$OUT/$id/$file"; built+=("$id")
  else skipped+=("$id: the build failed"); fi
}
android() {
  local ndk="${ANDROID_NDK_HOME:-}"
  if [ -z "$ndk" ]; then for base in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [ -n "$base" ] && [ -d "$base/ndk" ] && ndk="$base/ndk/$(ls "$base/ndk" | sort -V | tail -1)" && break; done; fi
  [ -d "$ndk" ] || { skipped+=("android: no NDK (set ANDROID_NDK_HOME)"); return; }
  local bin; bin="$(echo "$ndk"/toolchains/llvm/prebuilt/*/bin)"
  for row in "arm64-v8a aarch64-linux-android aarch64-linux-android" "armeabi-v7a armv7-linux-androideabi armv7a-linux-androideabi" "x86_64 x86_64-linux-android x86_64-linux-android"; do
    set -- $row; local abi="$1" target="$2" clang="$3"
    have_target "$target" || { skipped+=("android $abi: rustup target add $target"); continue; }
    if command -v cargo-ndk >/dev/null; then # cargo-ndk sets the NDK linker itself
      (cd "$RUST" && cargo ndk -t "$abi" -p "$API" -o "$OUT/android" rustc --release --no-default-features --features "jni,$PROFILE" --crate-type cdylib 2>&1 | tail -1) >&2
    else # the same thing by hand: the NDK's clang as linker and C compiler
      local up; up="$(echo "$target" | tr 'a-z-' 'A-Z_')"
      export "CARGO_TARGET_${up}_LINKER=$bin/${clang}${API}-clang" "CC_$(echo "$target" | tr - _)=$bin/${clang}${API}-clang" "AR_$(echo "$target" | tr - _)=$bin/llvm-ar"
      cargo_for "$target"
      if [ -f "$RUST/target/$target/release/libfoodblock.so" ]; then mkdir -p "$OUT/android/$abi"; cp "$RUST/target/$target/release/libfoodblock.so" "$OUT/android/$abi/"; fi
    fi
    [ -f "$OUT/android/$abi/libfoodblock.so" ] && built+=("android $abi") || skipped+=("android $abi: the build failed")
  done
}

if [ "$WHAT" = jvm ] || [ "$WHAT" = all ]; then
  case "$(uname -s)" in
    Darwin) # one Mac builds both Mac slices; Linux and Windows need their own linkers (or CI)
      jvm macos-arm64 aarch64-apple-darwin libfoodblock.dylib
      jvm macos-x64 x86_64-apple-darwin libfoodblock.dylib
      skipped+=("linux-x64, linux-arm64, windows-x64: built on their own runners (CI)") ;;
    Linux)
      jvm linux-x64 x86_64-unknown-linux-gnu libfoodblock.so
      jvm linux-arm64 aarch64-unknown-linux-gnu libfoodblock.so CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER aarch64-linux-gnu-gcc
      jvm windows-x64 x86_64-pc-windows-gnu foodblock.dll CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER x86_64-w64-mingw32-gcc ;;
    MINGW*|MSYS*|CYGWIN*) jvm windows-x64 x86_64-pc-windows-msvc foodblock.dll ;;
  esac
fi
if [ "$WHAT" = android ] || [ "$WHAT" = all ]; then android; fi
echo "built:   ${built[*]:-nothing}"; for s in "${skipped[@]:-}"; do [ -n "$s" ] && echo "skipped: $s"; done
exit 0

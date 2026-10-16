#!/usr/bin/env bash
# Builds sdk/swift/CFoodBlock.xcframework: the Rust core (sdk/rust, C ABI) as a static library for iOS devices, the iOS
# simulator (arm64 + x86_64) and macOS (arm64 + x86_64), with the C header and its module map. The root Package.swift
# uses it as a binaryTarget (a local build is preferred over the release download; no unsafeFlags anywhere).
#
#   sdk/swift/scripts/build-xcframework.sh            build, zip and print the SwiftPM checksum
#   sdk/swift/scripts/build-xcframework.sh --macos    macOS slice only (fast; enough for `swift test`)
#
# Needs a Rust toolchain with the Apple targets (rustup target add aarch64-apple-ios aarch64-apple-ios-sim
# x86_64-apple-ios aarch64-apple-darwin x86_64-apple-darwin) and Xcode. Never publishes.
set -euo pipefail
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export IPHONEOS_DEPLOYMENT_TARGET=16.0 MACOSX_DEPLOYMENT_TARGET=13.0
HERE="$(cd "$(dirname "$0")" && pwd)"; SWIFT="$HERE/.."; RUST="$SWIFT/../rust"
OUT="$SWIFT/CFoodBlock.xcframework"; WORK="$SWIFT/.build/xcframework"
ONLY_MACOS=0; [ "${1:-}" = "--macos" ] && ONLY_MACOS=1

build() { # one Rust target -> its static library
  rustup target list --installed | grep -qx "$1" || { echo "missing Rust target $1: rustup target add $1" >&2; exit 1; }
  (cd "$RUST" && cargo rustc --release --features ffi --crate-type staticlib --target "$1" 2>&1 | tail -1) >&2
  echo "$RUST/target/$1/release/libfoodblock.a"
}
rm -rf "$WORK" "$OUT"; mkdir -p "$WORK/headers" "$WORK/ios" "$WORK/sim" "$WORK/mac"
cp "$RUST/include/foodblock.h" "$WORK/headers/foodblock.h"
printf 'module CFoodBlock {\n    header "foodblock.h"\n    export *\n}\n' > "$WORK/headers/module.modulemap"

MAC=$(lipo -create "$(build aarch64-apple-darwin)" "$(build x86_64-apple-darwin)" -output "$WORK/mac/libfoodblock.a" && echo "$WORK/mac/libfoodblock.a")
SLICES=(-library "$MAC" -headers "$WORK/headers")
if [ "$ONLY_MACOS" = 0 ]; then
  IOS=$(build aarch64-apple-ios)
  SIM=$(lipo -create "$(build aarch64-apple-ios-sim)" "$(build x86_64-apple-ios)" -output "$WORK/sim/libfoodblock.a" && echo "$WORK/sim/libfoodblock.a")
  SLICES+=(-library "$IOS" -headers "$WORK/headers" -library "$SIM" -headers "$WORK/headers")
fi
xcodebuild -create-xcframework "${SLICES[@]}" -output "$OUT"
if [ "$ONLY_MACOS" = 0 ]; then
  (cd "$SWIFT" && rm -f CFoodBlock.xcframework.zip && ditto -c -k --sequesterRsrc --keepParent CFoodBlock.xcframework CFoodBlock.xcframework.zip)
  echo "zip:      $SWIFT/CFoodBlock.xcframework.zip"
  echo "checksum: $(cd "$SWIFT" && swift package compute-checksum CFoodBlock.xcframework.zip)"
fi

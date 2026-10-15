// swift-tools-version: 5.9
import PackageDescription

// A thin layer over the one Rust core (../rust). Build the core's static library first:
//     (cd ../rust && cargo rustc --release --features ffi --crate-type staticlib)
// The Swift target links that exact file (target/release/libfoodblock.a), so a dynamic copy beside it is never picked up.
let package = Package(
    name: "FoodBlock",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "FoodBlock", targets: ["FoodBlock"]),
    ],
    targets: [
        // The C ABI header (include/foodblock.h, linked in as a symlink), as a Clang module.
        .systemLibrary(name: "CFoodBlock", path: "Sources/CFoodBlock"),
        .target(name: "FoodBlock", dependencies: ["CFoodBlock"], path: "Sources/FoodBlock",
                linkerSettings: [.unsafeFlags(["-Xlinker", "../rust/target/release/libfoodblock.a"]),
                                 .linkedFramework("Security"), .linkedFramework("CoreFoundation")]),
        .testTarget(name: "FoodBlockTests", dependencies: ["FoodBlock"], path: "Tests"),
    ]
)

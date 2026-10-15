// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FoodBlock",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "FoodBlock", targets: ["FoodBlock"]),
    ],
    targets: [
        // Sources/spec holds exact copies of spec/protocol.json and spec/aliases.json (test/sync-spec.cjs makes them).
        .target(name: "FoodBlock", path: "Sources", resources: [.copy("spec")]),
        .testTarget(name: "FoodBlockTests", dependencies: ["FoodBlock"], path: "Tests"),
    ]
)

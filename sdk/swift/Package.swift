// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FoodBlock",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "FoodBlock", targets: ["FoodBlock"]),
    ],
    targets: [
        .target(name: "FoodBlock", path: "Sources"),
        .testTarget(name: "FoodBlockTests", dependencies: ["FoodBlock"], path: "Tests"),
    ]
)

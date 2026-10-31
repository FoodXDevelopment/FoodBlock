// swift-tools-version: 5.9
import Foundation
import PackageDescription

// FoodBlock for Swift (iOS 16+, macOS 13+). SwiftPM fetches this file from the root of the repository, so the manifest
// lives here; the sources are in sdk/swift. The Rust core (sdk/rust) comes as an XCFramework binaryTarget:
//   * built here:    sdk/swift/scripts/build-xcframework.sh   (used when sdk/swift/CFoodBlock.xcframework exists)
//   * from a release: the zip below, which a release uploads and whose checksum is the one the script prints.
// No unsafe build flags, so the package can be a dependency of other packages.
let version = "1.7.0"                                                                         // tools/version-sync.cjs
let checksum = "0000000000000000000000000000000000000000000000000000000000000000"             // set at release
let local = Context.packageDirectory + "/sdk/swift/CFoodBlock.xcframework"

let core: Target = FileManager.default.fileExists(atPath: local)
    ? .binaryTarget(name: "CFoodBlock", path: "sdk/swift/CFoodBlock.xcframework")
    : .binaryTarget(name: "CFoodBlock",
                    url: "https://github.com/FoodXDevelopment/foodblock/releases/download/\(version)/CFoodBlock.xcframework.zip",
                    checksum: checksum)

let package = Package(
    name: "FoodBlock",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "FoodBlock", targets: ["FoodBlock"]),
    ],
    targets: [
        core,
        .target(name: "FoodBlock", dependencies: ["CFoodBlock"], path: "sdk/swift/Sources/FoodBlock",
                linkerSettings: [.linkedFramework("Security"), .linkedFramework("CoreFoundation")]),
        .testTarget(name: "FoodBlockTests", dependencies: ["FoodBlock"], path: "sdk/swift/Tests"),
    ]
)

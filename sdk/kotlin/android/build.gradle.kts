// The AAR: the same Kotlin sources as :foodblock, plus the Rust core cross-compiled for Android with the NDK.
plugins {
    id("com.android.library")
    kotlin("android")
}

val ndk = "29.0.14206865"
val profile = providers.gradleProperty("foodblock.profile").getOrElse("node")

android {
    namespace = "world.foodx.foodblock"
    compileSdk = 35
    ndkVersion = ndk
    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }
    sourceSets["main"].java.srcDirs(rootDir.resolve("foodblock/src/main/kotlin"))
    sourceSets["main"].jniLibs.srcDirs(layout.buildDirectory.dir("jniLibs"))
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
}

// One Rust build per Android ABI: (ABI, Rust target, NDK clang prefix).
val rust = rootDir.resolve("../rust")
val abis = listOf(
    Triple("arm64-v8a", "aarch64-linux-android", "aarch64-linux-android"),
    Triple("x86_64", "x86_64-linux-android", "x86_64-linux-android"),
)
val host = if (System.getProperty("os.name").lowercase().contains("mac")) "darwin-x86_64" else "linux-x86_64"
val cargoAndroid = tasks.register("cargoAndroid") {
    description = "Builds libfoodblock.so (sdk/rust, --features jni) for every Android ABI into build/jniLibs."
}
for ((abi, target, clang) in abis) {
    val build = tasks.register<Exec>("cargo-$abi") {
        val bin = android.sdkDirectory.resolve("ndk/$ndk/toolchains/llvm/prebuilt/$host/bin")
        val env = target.uppercase().replace('-', '_')
        workingDir = rust
        environment("CARGO_TARGET_${env}_LINKER", bin.resolve("${clang}${android.defaultConfig.minSdk}-clang").path)
        environment("CC_${target.replace('-', '_')}", bin.resolve("${clang}${android.defaultConfig.minSdk}-clang").path)
        environment("AR_${target.replace('-', '_')}", bin.resolve("llvm-ar").path)
        commandLine("cargo", "rustc", "--release", "--target", target, "--no-default-features",
            "--features", "jni,$profile", "--crate-type", "cdylib")
        inputs.dir(rust.resolve("src"))
        inputs.dir(rust.resolve("spec"))
        inputs.property("profile", profile)
        outputs.file(rust.resolve("target/$target/release/libfoodblock.so"))
    }
    val copy = tasks.register<Copy>("jniLibs-$abi") {
        dependsOn(build)
        from(rust.resolve("target/$target/release/libfoodblock.so"))
        into(layout.buildDirectory.dir("jniLibs/$abi"))
    }
    cargoAndroid.configure { dependsOn(copy) }
}
tasks.named("preBuild") { dependsOn(cargoAndroid) }

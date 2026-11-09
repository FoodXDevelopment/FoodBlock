// The AAR: the same Kotlin sources as :foodblock, plus the Rust core cross-compiled for Android (arm64-v8a, armeabi-v7a,
// x86_64). The libraries are built by scripts/build-natives.sh into sdk/kotlin/natives/android/<abi>/ (cargo-ndk when
// it is installed, the NDK's clang otherwise; CI does the same); this file only packages them.
plugins {
    id("com.android.library")
    kotlin("android")
}

val ndk = "29.0.14206865"
val abis = listOf("arm64-v8a", "armeabi-v7a", "x86_64")
val natives = rootDir.resolve("natives/android")

android {
    namespace = "world.foodx.foodblock"
    compileSdk = 35
    ndkVersion = ndk
    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
        ndk { abiFilters += abis }
    }
    sourceSets["main"].java.srcDirs(rootDir.resolve("foodblock/src/main/kotlin"))
    sourceSets["main"].jniLibs.srcDirs(natives)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.12.0")
}

tasks.named("preBuild") {
    doFirst {
        val missing = abis.filter { !natives.resolve("$it/libfoodblock.so").isFile }
        if (missing.isNotEmpty()) throw GradleException("No native library for $missing in $natives. Run scripts/build-natives.sh android.")
    }
}

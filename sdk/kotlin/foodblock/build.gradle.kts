plugins {
    kotlin("jvm")
    `java-library`
    `maven-publish`
}

java {
    withSourcesJar()
    withJavadocJar()
}

// Maven coordinates: world.foodx:foodblock:<protocol version>.0 (group and version are set in the root build file).
// Publishing is done by the release process, never by a build: `./gradlew :foodblock:publishToMavenLocal` is the dry run.
publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            artifactId = "foodblock"
            pom {
                name.set("FoodBlock")
                description.set("FoodBlock for the JVM: a thin layer over the one Rust core.")
                url.set("https://www.foodx.network/developers")
                licenses { license { name.set("CC0 1.0 Universal"); url.set("https://creativecommons.org/publicdomain/zero/1.0/") } }
                developers { developer { id.set("foodx"); name.set("FoodX"); email.set("developers@foodx.com") } }
                scm {
                    url.set("https://github.com/FoodXDevelopment/FoodBlock")
                    connection.set("scm:git:https://github.com/FoodXDevelopment/FoodBlock.git")
                }
            }
        }
    }
}

kotlin { jvmToolchain(17) }

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    testImplementation(kotlin("test"))
}

// The one implementation: the Rust core in sdk/rust, as a JNI library. The jar bundles one copy per platform under
// native/<id>/ (the loader, Native.kt, picks the one for the computer it runs on). The copies are built by
// scripts/build-natives.sh into sdk/kotlin/natives/<id>/ (CI builds each on its own platform); this file only packages
// what is there. A release asks for all five: -Pfoodblock.allNatives=true.
val rust = rootDir.resolve("../rust")
val natives = rootDir.resolve("natives")
val jvmIds = listOf("macos-arm64", "macos-x64", "linux-x64", "linux-arm64", "windows-x64")
val profile = providers.gradleProperty("foodblock.profile").getOrElse("node")
val osName = System.getProperty("os.name").lowercase()
val libName = when {
    osName.contains("mac") -> "libfoodblock.dylib"
    osName.contains("win") -> "foodblock.dll"
    else -> "libfoodblock.so"
}

val cargoHost = tasks.register<Exec>("cargoHost") {
    description = "Builds the Rust core (sdk/rust) with --features jni for this computer."
    workingDir = rust
    commandLine("cargo", "rustc", "--locked", "--release", "--no-default-features", "--features", "jni,$profile", "--crate-type", "cdylib")
    inputs.dir(rust.resolve("src"))
    inputs.dir(rust.resolve("spec"))
    inputs.file(rust.resolve("Cargo.toml"))
    inputs.property("profile", profile)
    outputs.file(rust.resolve("target/release/$libName"))
}

// natives/<id>/ -> resources native/<id>/ in the jar.
val stageNatives = tasks.register<Copy>("stageNatives") {
    description = "Copies the native libraries in sdk/kotlin/natives into the jar's resources (native/<id>/)."
    into(layout.buildDirectory.dir("generated/natives/native"))
    for (id in jvmIds) from(natives.resolve(id)) { into(id) }
    doFirst {
        val missing = jvmIds.filter { !natives.resolve(it).isDirectory }
        if (providers.gradleProperty("foodblock.allNatives").isPresent && missing.isNotEmpty())
            throw GradleException("foodblock.allNatives: no native library for $missing. Run scripts/build-natives.sh, or download the CI artifacts into natives/.")
        if (missing.size == jvmIds.size) logger.warn("No native library in $natives: the jar will not run anywhere. Run scripts/build-natives.sh.")
    }
}
sourceSets.main { resources.srcDir(layout.buildDirectory.dir("generated/natives")) }
tasks.processResources { dependsOn(stageNatives) }

tasks.test {
    dependsOn(cargoHost)
    useJUnitPlatform()
    exclude("**/BundledLoaderTest*")
    systemProperty("foodblock.library", rust.resolve("target/release/$libName").absolutePath)
    systemProperty("foodblock.repo", rootDir.resolve("../..").canonicalPath)
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

// The jar as a user gets it: no foodblock.library, so the loader must find the bundled copy for this computer.
val testBundled = tasks.register<Test>("testBundled") {
    description = "Runs the loader test against the jar's bundled native library (needs natives/<this platform>/)."
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform()
    include("**/BundledLoaderTest*")
    testLogging { events("passed", "failed", "skipped"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

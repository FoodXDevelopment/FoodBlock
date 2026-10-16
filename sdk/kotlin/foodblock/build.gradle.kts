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
                description.set("FoodBlock 1.6 for the JVM: a thin layer over the one Rust core.")
                url.set("https://www.foodx.world/developers")
                licenses { license { name.set("MIT License"); url.set("https://opensource.org/licenses/MIT") } }
                developers { developer { id.set("foodx"); name.set("FoodX"); email.set("developers@foodx.com") } }
                scm {
                    url.set("https://github.com/FoodXDevelopment/foodblock")
                    connection.set("scm:git:https://github.com/FoodXDevelopment/foodblock.git")
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

// The one implementation: the Rust core in sdk/rust, built for this computer with its JNI door.
val rust = rootDir.resolve("../rust")
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
    commandLine("cargo", "rustc", "--release", "--no-default-features", "--features", "jni,$profile", "--crate-type", "cdylib")
    inputs.dir(rust.resolve("src"))
    inputs.dir(rust.resolve("spec"))
    inputs.file(rust.resolve("Cargo.toml"))
    inputs.property("profile", profile)
    outputs.file(rust.resolve("target/release/$libName"))
}

tasks.test {
    dependsOn(cargoHost)
    useJUnitPlatform()
    systemProperty("foodblock.library", rust.resolve("target/release/$libName").absolutePath)
    systemProperty("foodblock.repo", rootDir.resolve("../..").canonicalPath)
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

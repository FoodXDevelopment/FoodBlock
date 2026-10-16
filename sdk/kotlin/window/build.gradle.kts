plugins {
    kotlin("jvm")
    `java-library`
}
kotlin { jvmToolchain(17) }
dependencies {
    api(project(":foodblock"))
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    compileOnly("org.xerial:sqlite-jdbc:3.50.3.0")
    testImplementation("org.xerial:sqlite-jdbc:3.50.3.0")
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}
tasks.test {
    // the foodblock module's tests are given the native library path; the window's tests need the same core
    dependsOn(":foodblock:cargoHost")
    useJUnitPlatform()
    val rust = rootDir.resolve("../rust")
    val lib = if (System.getProperty("os.name").lowercase().contains("mac")) "libfoodblock.dylib" else "libfoodblock.so"
    systemProperty("foodblock.library", rust.resolve("target/release/$lib").absolutePath)
    systemProperty("foodblock.repo", rootDir.resolve("../..").canonicalPath)
    testLogging { events("passed", "failed", "skipped"); showStandardStreams = true; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

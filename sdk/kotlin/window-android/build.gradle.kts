// The Android parts of the window SDK: Credential Manager passkeys and the SQLite queue over android.database.sqlite. Everything else is :window (the JVM).
plugins {
    id("com.android.library")
    kotlin("android")
}
android {
    namespace = "world.foodx.foodblock.window.android"
    compileSdk = 35
    defaultConfig { minSdk = 24 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
kotlin { jvmToolchain(17) }
dependencies {
    api(project(":window"))
    api("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")  // passkeys on Android 13 and below
}

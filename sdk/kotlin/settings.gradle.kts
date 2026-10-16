// FoodBlock for Kotlin: the JVM library (:foodblock) and, where an Android SDK is found, its AAR (:android).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "foodblock-kotlin"
include(":foodblock")
include(":window")

val androidSdk = listOfNotNull(
    System.getenv("ANDROID_HOME"),
    System.getenv("ANDROID_SDK_ROOT"),
    file("local.properties").takeIf { it.exists() }?.readLines()
        ?.firstOrNull { it.startsWith("sdk.dir=") }?.substringAfter("="),
).firstOrNull { it.isNotBlank() }
if (androidSdk != null && file(androidSdk).isDirectory) { include(":android"); include(":window-android") }

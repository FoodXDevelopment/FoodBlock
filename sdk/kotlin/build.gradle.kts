plugins {
    kotlin("jvm") version "2.1.21" apply false
    kotlin("android") version "2.1.21" apply false
    id("com.android.library") version "8.10.1" apply false
}

// The library's version is the packages' one number (sdk/javascript/package.json; tools/version-sync.cjs), as for every FoodBlock SDK.
val protocol = groovy.json.JsonSlurper().parse(rootDir.resolve("../javascript/package.json")) as Map<*, *>
allprojects {
    group = "world.foodx"
    version = "${protocol["version"]}"
}

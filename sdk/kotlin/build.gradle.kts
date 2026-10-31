plugins {
    kotlin("jvm") version "2.4.21" apply false
    kotlin("android") version "2.4.21" apply false
    id("com.android.library") version "9.5.0" apply false
}

// The library's version is the protocol's (spec/protocol.json `version`), as for every FoodBlock SDK.
val protocol = groovy.json.JsonSlurper().parse(rootDir.resolve("../../spec/protocol.json")) as Map<*, *>
allprojects {
    group = "world.foodx"
    version = "${protocol["version"]}.0"
}

plugins {
    kotlin("jvm") version "2.1.21" apply false
    kotlin("android") version "2.1.21" apply false
    id("com.android.library") version "8.10.1" apply false
}

// The library's version is the protocol's (spec/protocol.json `version`), as for every FoodBlock SDK.
val protocol = groovy.json.JsonSlurper().parse(rootDir.resolve("../../spec/protocol.json")) as Map<*, *>
allprojects {
    group = "world.foodx"
    version = "${protocol["version"]}.0"
}

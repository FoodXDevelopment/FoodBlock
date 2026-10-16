package world.foodx.foodblock

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The loader names the platform the way the jar names its bundled copies. */
class LoaderTest {
    @Test fun platformIdsMatchTheBundledFolders() {
        assertEquals("macos-arm64", Native.platformId("Mac OS X", "aarch64"))
        assertEquals("macos-x64", Native.platformId("Mac OS X", "x86_64"))
        assertEquals("linux-x64", Native.platformId("Linux", "amd64"))
        assertEquals("linux-arm64", Native.platformId("Linux", "aarch64"))
        assertEquals("windows-x64", Native.platformId("Windows 11", "amd64"))
    }
}

/** Run by `testBundled` only: with no `foodblock.library` the jar's own copy for this computer must load and answer. */
class BundledLoaderTest {
    @Test fun theBundledLibraryLoadsAndAnswers() {
        assertTrue(Native.loadedFrom.startsWith("bundled:"), "loaded from ${Native.loadedFrom}")
        assertEquals(Native.platformId(), Native.loadedFrom.removePrefix("bundled:"))
        assertEquals(64, FoodBlock.hash("observe", kotlinx.serialization.json.JsonObject(emptyMap()), kotlinx.serialization.json.JsonObject(emptyMap())).length)
    }
}

package world.foodx.foodblock.window

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** The phone cannot reach the host: a write waits in the queue, a read comes from the cache. */
class OfflineException(cause: Throwable? = null) : IOException("offline", cause)
/** The host answered with a refusal (status and reason). */
class RefusedByHost(val status: Int, val reason: String) : RuntimeException("refused $status: $reason")
/** A window problem that is not the host's or the network's (not signed in, a draft that differs from what was asked, ...). */
class WindowException(message: String) : RuntimeException(message)

data class Response(val status: Int, val body: JsonObject)

/** How the window reaches its host: one call, JSON in and out. A transport that cannot reach the host throws [OfflineException]. */
interface Transport {
    suspend fun send(method: String, path: String, body: JsonObject?, token: String?): Response
}

/** HttpURLConnection, which Android and the JVM both have. The credential travels in the Authorization header, never in a URL. */
class HttpTransport(private val base: String, private val timeoutMs: Int = 15000) : Transport {
    override suspend fun send(method: String, path: String, body: JsonObject?, token: String?): Response = withContext(Dispatchers.IO) {
        val c = URL(base.trimEnd('/') + "/" + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method; c.connectTimeout = timeoutMs; c.readTimeout = timeoutMs
            c.setRequestProperty("content-type", "application/json")
            if (token != null) c.setRequestProperty("authorization", "Bearer $token")
            if (body != null) { c.doOutput = true; c.outputStream.use { it.write(body.toString().toByteArray()) } }
            val status = c.responseCode
            val text = (if (status >= 400) c.errorStream else c.inputStream)?.use { String(it.readBytes()) } ?: "{}"
            Response(status, runCatching { Json.parseToJsonElement(text) as JsonObject }.getOrElse { JsonObject(emptyMap()) })
        } catch (e: java.net.ConnectException) { throw OfflineException(e)
        } catch (e: java.net.UnknownHostException) { throw OfflineException(e)
        } catch (e: java.net.SocketTimeoutException) { throw OfflineException(e)
        } catch (e: java.net.NoRouteToHostException) { throw OfflineException(e)
        } finally { c.disconnect() }
    }
}

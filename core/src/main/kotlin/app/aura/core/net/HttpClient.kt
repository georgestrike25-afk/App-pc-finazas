package app.aura.core.net

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class HttpResponse(val code: Int, val body: String)

class HttpException(val code: Int, message: String) : IOException(message)

/** Cliente HTTP mínimo; se inyecta para poder sustituirlo en pruebas. Es bloqueante. */
fun interface HttpClient {
    @Throws(IOException::class)
    fun get(url: String): HttpResponse
}

/**
 * Implementación sobre [HttpURLConnection]: disponible en Android y en la JVM sin dependencias
 * adicionales, lo que mantiene el APK ligero.
 */
class UrlConnectionHttpClient(
    private val userAgent: String,
    private val connectTimeoutMillis: Int = 10_000,
    private val readTimeoutMillis: Int = 15_000,
) : HttpClient {
    override fun get(url: String): HttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = connectTimeoutMillis
            connection.readTimeout = readTimeoutMillis
            connection.setRequestProperty("User-Agent", userAgent)
            connection.setRequestProperty("Accept", "application/json")
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return HttpResponse(code, body)
        } finally {
            connection.disconnect()
        }
    }
}

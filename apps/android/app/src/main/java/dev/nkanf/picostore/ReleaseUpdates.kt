package dev.nkanf.picostore

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

internal object ReleaseUpdates {
    const val DOWNLOAD_URL = "https://github.com/nkanf-dev/pico-store-lab/releases/latest"

    fun newerVersion(current: String): String? {
        val connection = URL("https://api.github.com/repos/nkanf-dev/pico-store-lab/releases/latest")
            .openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("User-Agent", "PICO-Store-Lab-Android")
        try {
            check(connection.responseCode == 200)
            val bytes = ByteArray(1_048_577)
            var length = 0
            connection.inputStream.use { input ->
                while (length < bytes.size) {
                    val count = input.read(bytes, length, bytes.size - length)
                    if (count < 0) break
                    length += count
                }
            }
            check(length <= 1_048_576)
            val version = JSONObject(String(bytes, 0, length, Charsets.UTF_8)).getString("tag_name").removePrefix("v")
            require(Regex("[0-9]+\\.[0-9]+\\.[0-9]+").matches(version))
            val remote = version.split('.').map { it.toInt() }
            val installed = current.split('.').map { it.toInt() }
            for (index in 0..2) {
                if (remote[index] > installed[index]) return version
                if (remote[index] < installed[index]) return null
            }
            return null
        } finally { connection.disconnect() }
    }
}

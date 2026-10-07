package com.rishi076.smartcare.androidstorage

import android.os.SystemClock
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException

/** Bounded single-connection estimate using Cloudflare's documented measurement endpoints. */
object SpeedTester {
    @Volatile private var activeId: String? = null
    @Volatile private var cancelled = false
    @Volatile private var connection: HttpURLConnection? = null
    fun cancel(id: String) {
        // Do not perform socket I/O on the synchronous JS call. The worker checks
        // this flag between reads; a blocked request has an eight-second timeout.
        synchronized(this) { if (activeId == id) cancelled = true }
    }
    private fun check(deadline: Long) {
        if (cancelled) throw IOException("Speed test cancelled.")
        if (SystemClock.elapsedRealtime() > deadline) throw IOException("Speed test exceeded its 60-second limit.")
    }
    fun run(id: String, progress: (String, Int) -> Unit): Map<String, Any> {
        synchronized(this) { check(activeId == null) { "A speed test is already running." }; activeId = id; cancelled = false }
        val deadline = SystemClock.elapsedRealtime() + 60000
        var totalBytes = 0L
        try {
            fun request(bytes: Int, upload: Boolean = false): Pair<Long, Double> {
                check(deadline)
                val url = if (upload) "https://speed.cloudflare.com/__up" else "https://speed.cloudflare.com/__down?bytes=$bytes&nonce=${System.nanoTime()}"
                val conn = URL(url).openConnection() as HttpURLConnection
                connection = conn
                conn.connectTimeout = 8000; conn.readTimeout = 8000; conn.useCaches = false
                conn.setRequestProperty("Cache-Control", "no-cache")
                conn.setRequestProperty("Accept-Encoding", "identity")
                val started = SystemClock.elapsedRealtimeNanos()
                try {
                    if (upload) {
                        conn.requestMethod = "POST"; conn.doOutput = true; conn.setFixedLengthStreamingMode(bytes)
                        conn.setRequestProperty("Content-Type", "application/octet-stream")
                        conn.outputStream.use { output ->
                            val buffer = ByteArray(8192); var sent = 0
                            while (sent < bytes) { check(deadline); val size = minOf(buffer.size, bytes - sent); output.write(buffer, 0, size); sent += size; totalBytes += size }
                        }
                    }
                    if (conn.responseCode !in 200..299) throw IOException("Measurement server returned ${conn.responseCode}.")
                    var received = 0L
                    conn.inputStream.use { input ->
                        val buffer = ByteArray(8192)
                        while (true) {
                            check(deadline); val n = input.read(buffer); if (n < 0) break
                            received += n; totalBytes += n
                            if (received > (if (upload) 65536L else bytes.toLong() + 65536)) throw IOException("Unexpected measurement response size.")
                        }
                    }
                    if (!upload && received != bytes.toLong()) throw IOException("Incomplete download measurement.")
                    return Pair(if (upload) bytes.toLong() else received, (SystemClock.elapsedRealtimeNanos() - started) / 1000000.0)
                } finally { conn.disconnect(); connection = null }
            }
            progress("Warming connection", 0); request(16384)
            val latencies = mutableListOf<Double>()
            for (i in 0 until 5) { progress("Measuring request latency", 5 + i * 5); latencies.add(request(0).second) }
            val download = mutableListOf<Double>()
            for (i in 0 until 3) { progress("Measuring download", 30 + i * 10); val result = request(2097152); download.add(result.first * 8.0 / (result.second * 1000)) }
            val upload = mutableListOf<Double>()
            for (i in 0 until 3) { progress("Measuring upload", 65 + i * 10); val result = request(524288, true); upload.add(result.first * 8.0 / (result.second * 1000)) }
            check(deadline); progress("Complete", 100)
            fun median(values: List<Double>) = values.sorted()[values.size / 2]
            return mapOf("latencyMs" to median(latencies), "downloadMbps" to median(download), "uploadMbps" to median(upload), "transferredBytes" to totalBytes, "provider" to "Cloudflare", "method" to "Bounded single-connection estimate")
        } finally { connection?.disconnect(); connection = null; synchronized(this) { activeId = null } }
    }
}

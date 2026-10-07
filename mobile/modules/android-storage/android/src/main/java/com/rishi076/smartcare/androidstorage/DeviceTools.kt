package com.rishi076.smartcare.androidstorage

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.InputStream

/** User-requested, local tools. Never retains message content, app activity or image bytes in JS. */
object DeviceTools {
    fun battery(ctx: Context): Map<String, Any?> {
        val intent = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return mapOf("available" to false)
        val manager = ctx.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val current = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        val health = when (intent.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
            BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheated"
            BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
            BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over voltage"
            BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
            BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "Unspecified failure"
            else -> "Unknown"
        }
        val temperature = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        val voltage = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
        return mapOf("available" to true, "levelPercent" to if (level >= 0 && scale > 0) level * 100.0 / scale else null,
            "charging" to (intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0),
            "temperatureC" to if (temperature != Int.MIN_VALUE) temperature / 10.0 else null,
            "voltageMv" to if (voltage > 0) voltage else null,
            "currentMa" to if (current != Int.MIN_VALUE && current != Int.MAX_VALUE && current != 0) current / 1000.0 else null,
            "healthStatus" to health)
    }

    fun wifi(ctx: Context): Map<String, Any?> {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        if (caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) != true) return mapOf("connected" to false, "security" to "Unknown")
        val info = (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
        val type = if (Build.VERSION.SDK_INT >= 31) info.currentSecurityType else -1
        val security = when (type) {
            0 -> "Open"
            1 -> "WEP"
            2 -> "WPA/WPA2 Personal"
            3 -> "WPA/WPA2 Enterprise"
            4 -> "WPA3 Personal"
            5 -> "WPA3 Enterprise 192-bit"
            6 -> "Enhanced Open (OWE)"
            7 -> "WAPI Personal"
            8 -> "WAPI Enterprise"
            9 -> "WPA3 Enterprise"
            10 -> "OSEN"
            11 -> "Passpoint"
            12 -> "Passpoint R3"
            13 -> "DPP"
            else -> "Unknown"
        }
        return mapOf("connected" to true, "security" to security, "linkSpeedMbps" to info.linkSpeed.takeIf { it > 0 },
            "warning" to when (type) { 0 -> "This network does not encrypt Wi-Fi traffic."; 1 -> "WEP is obsolete and provides weak protection."; -1 -> "Security information is unavailable on this device or with current permissions."; else -> "Encryption does not establish that this hotspot is trustworthy." })
    }

    fun dataUsage(ctx: Context, start: Long, end: Long): Map<String, Any?> {
        require(end > start && end - start <= 93L * 86400000) { "Choose a period of 1–93 days." }
        val manager = ctx.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
        val totals = mutableMapOf<Int, LongArray>()
        val unavailable = mutableListOf<String>()
        for ((type, offset, label) in listOf(Triple(ConnectivityManager.TYPE_MOBILE, 0, "Mobile"), Triple(ConnectivityManager.TYPE_WIFI, 2, "Wi-Fi"))) {
            try {
                val stats = manager.querySummary(type, null, start, end) ?: error("Statistics unavailable")
                try {
                    val bucket = NetworkStats.Bucket()
                    while (stats.hasNextBucket()) {
                        stats.getNextBucket(bucket)
                        if (bucket.uid < 0) continue
                        val values = totals.getOrPut(bucket.uid) { LongArray(4) }
                        values[offset] += bucket.rxBytes
                        values[offset + 1] += bucket.txBytes
                    }
                } finally { stats.close() }
            } catch (_: Exception) { unavailable.add(label) }
        }
        val pm = ctx.packageManager
        val rows = totals.map { (uid, bytes) ->
            val packages = pm.getPackagesForUid(uid)?.toList() ?: emptyList()
            val labels = packages.take(3).map { pkg -> try { pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg } }
            mapOf("uid" to uid, "label" to (labels.joinToString(" / ").ifEmpty { "System / UID $uid" } + if (packages.size > 3) " (+${packages.size - 3} apps)" else ""),
                "packages" to packages, "mobileBytes" to bytes[0] + bytes[1], "wifiBytes" to bytes[2] + bytes[3],
                "totalBytes" to bytes.sum(), "sharedUid" to (packages.size > 1))
        }.sortedByDescending { (it["totalBytes"] as Long) }
        return mapOf("apps" to rows, "unavailable" to unavailable, "start" to start, "end" to end)
    }

    private fun open(ctx: Context, uri: String): InputStream? {
        val parsed = Uri.parse(uri)
        return when (parsed.scheme) { "content" -> ctx.contentResolver.openInputStream(parsed); "file" -> File(parsed.path ?: return null).inputStream(); null -> File(uri).inputStream(); else -> null }
    }
    fun discardDraft(ctx: Context, uri: String): Boolean {
        val parsed = Uri.parse(uri)
        if (parsed.scheme != "file") return false
        val file = File(parsed.path ?: return false).canonicalFile
        val directory = File(ctx.cacheDir, "photo-compression").canonicalFile
        if (file.parentFile != directory || !file.name.startsWith("compressed-")) return false
        return !file.exists() || file.delete()
    }
    @Synchronized fun compress(ctx: Context, uri: String, quality: Int, maxSide: Int): Map<String, Any?> {
        require(quality in 40..95 && maxSide in 640..1920) { "Invalid compression settings." }
        val owned = mutableListOf<Bitmap>()
        val outputDir = File(ctx.cacheDir, "photo-compression").apply { mkdirs() }
        // Reclaim only our own abandoned drafts after process death, never user media.
        outputDir.listFiles()?.filter { it.name.startsWith("compressed-") && it.lastModified() < System.currentTimeMillis() - 86400000 }?.forEach { it.delete() }
        val output = File.createTempFile("compressed-", ".jpg", outputDir)
        try {
            val originalBytes = open(ctx, uri)?.use { input ->
                val buffer = ByteArray(8192); var total = 0L
                while (true) { val n = input.read(buffer); if (n < 0) break; total += n }
                total
            } ?: error("Cannot read original photo.")
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            open(ctx, uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            require(bounds.outMimeType == "image/jpeg" && bounds.outWidth > 0 && bounds.outHeight > 0) { "Only readable JPEG photos are supported." }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight).toLong() / sample > maxSide.toLong()) sample *= 2
            val estimatedBytes = maxOf(1, bounds.outWidth / sample).toLong() * maxOf(1, bounds.outHeight / sample) * 4
            val runtime = Runtime.getRuntime()
            val available = runtime.maxMemory() - (runtime.totalMemory() - runtime.freeMemory())
            require(available > estimatedBytes * 3 + 16777216) { "Not enough memory to prepare this photo. Close the preview and retry." }
            val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 }
            val decoded = open(ctx, uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: error("Could not decode photo.")
            owned.add(decoded)
            require(decoded.allocationByteCount <= 16777216) { "Photo exceeds memory limit." }
            val orientation = open(ctx, uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } ?: 1
            val matrix = Matrix().apply {
                when (orientation) {
                    2 -> setScale(-1f, 1f); 3 -> setRotate(180f); 4 -> setScale(1f, -1f)
                    5 -> { setRotate(90f); postScale(-1f, 1f) }; 6 -> setRotate(90f)
                    7 -> { setRotate(-90f); postScale(-1f, 1f) }; 8 -> setRotate(-90f)
                }
            }
            val upright = if (matrix.isIdentity) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
            if (upright !== decoded) owned.add(upright)
            val factor = minOf(1.0, maxSide.toDouble() / maxOf(upright.width, upright.height))
            val scaled = if (factor < 1) Bitmap.createScaledBitmap(upright, maxOf(1, (upright.width * factor).toInt()), maxOf(1, (upright.height * factor).toInt()), true) else upright
            if (scaled !== upright) owned.add(scaled)
            output.outputStream().use { require(scaled.compress(Bitmap.CompressFormat.JPEG, quality, it)) { "Compression failed." } }
            val outputBytes = output.length()
            if (outputBytes >= originalBytes) { output.delete(); return mapOf("uri" to null, "originalBytes" to originalBytes, "sizeBytes" to outputBytes, "width" to scaled.width, "height" to scaled.height) }
            return mapOf("uri" to Uri.fromFile(output).toString(), "originalBytes" to originalBytes, "sizeBytes" to outputBytes, "width" to scaled.width, "height" to scaled.height)
        } catch (error: OutOfMemoryError) { output.delete(); throw java.io.IOException("Not enough memory to prepare this photo.", error) }
          catch (error: Exception) { output.delete(); throw error }
        finally { for (bitmap in owned.asReversed()) if (!bitmap.isRecycled) bitmap.recycle() }
    }
}

package com.phonecleaner.app.androidstorage

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.storage.StorageManager
import android.os.StatFs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * AndroidStorageModule — Exposes Android storage + package APIs to JS.
 *
 * Exposed methods (all return plain Maps for type consistency):
 *   getStorageStats() → { totalBytes, usedBytes, freeBytes }
 *   getInstalledApps() → AppInfo[]
 *   uninstallApp(packageName) → Boolean (async, launches system uninstall intent)
 */
class AndroidStorageModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("AndroidStorage")

        Function("getStorageStats") {
            val ctx = appContext.reactContext
            if (ctx == null) {
                return@Function mapOf(
                    "totalBytes" to 0L,
                    "usedBytes" to 0L,
                    "freeBytes" to 0L,
                )
            }

            try {
                val sm = ctx.getSystemService(Context.STORAGE_SERVICE) as StorageManager
                val volume = sm.primaryStorageVolume
                val path = volume.directory?.path ?: "/storage/emulated/0"
                val stat = StatFs(path)
                val total = stat.totalBytes
                val free = stat.availableBytes
                val used = total - free

                mapOf(
                    "totalBytes" to total,
                    "usedBytes" to used,
                    "freeBytes" to free,
                )
            } catch (e: Exception) {
                // Fallback: use external storage directory directly
                try {
                    val stat = StatFs(android.os.Environment.getExternalStorageDirectory().path)
                    val total = stat.totalBytes
                    val free = stat.availableBytes
                    mapOf(
                        "totalBytes" to total,
                        "usedBytes" to (total - free),
                        "freeBytes" to free,
                    )
                } catch (e2: Exception) {
                    mapOf(
                        "totalBytes" to 0L,
                        "usedBytes" to 0L,
                        "freeBytes" to 0L,
                    )
                }
            }
        }

        Function("getInstalledApps") {
            val ctx = appContext.reactContext
            if (ctx == null) {
                return@Function emptyList<Map<String, Any>>()
            }

            try {
                val pm = ctx.packageManager
                // getInstalledApplications returns apps visible per Android 11+ package
                // visibility rules. Launcher apps are visible by default.
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                apps
                    .filter { it.sourceDir != null }
                    .map { info ->
                        val isSystem = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                        val sourceFile = info.sourceDir?.let { java.io.File(it) }
                        mapOf(
                            "packageName" to (info.packageName ?: ""),
                            "label" to (pm.getApplicationLabel(info).toString()),
                            "sizeBytes" to (sourceFile?.length() ?: 0L),
                            // cacheBytes requires StorageStatsManager + PACKAGE_USAGE_STATS
                            // (privileged permission). APK size is a reasonable approximation.
                            "cacheBytes" to 0L,
                            "lastUsedAt" to 0.0,
                            "isSystem" to isSystem,
                            "iconUri" to null,
                        )
                    }
                    .filter { (it["sizeBytes"] as Long) > 0 }
                    .sortedByDescending { it["sizeBytes"] as Long }
            } catch (e: Exception) {
                emptyList<Map<String, Any>>()
            }
        }

        AsyncFunction("uninstallApp") { packageName: String ->
            val ctx = appContext.reactContext
            if (ctx == null) {
                return@AsyncFunction false
            }
            try {
                val intent = android.content.Intent(
                    android.content.Intent.ACTION_DELETE,
                    android.net.Uri.parse("package:$packageName"),
                ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
                true
            } catch (e: Exception) {
                false
            }
        }

        AsyncFunction("scanJunkFiles") {
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            val junkList = mutableListOf<Map<String, Any>>()

            try {
                // 1. App internal and external cache directories
                val cacheDirs = mutableListOf<java.io.File>()
                ctx.cacheDir?.let { cacheDirs.add(it) }
                ctx.externalCacheDir?.let { cacheDirs.add(it) }
                ctx.externalCacheDirs?.forEach { it?.let { d -> cacheDirs.add(d) } }

                for (cDir in cacheDirs) {
                    if (cDir.exists() && cDir.isDirectory) {
                        cDir.walkTopDown().maxDepth(3).forEach { file ->
                            if (file.isFile && file.length() > 0) {
                                junkList.add(
                                    mapOf(
                                        "id" to ("junk_" + file.absolutePath.hashCode()),
                                        "path" to file.absolutePath,
                                        "name" to file.name,
                                        "sizeBytes" to file.length(),
                                        "category" to "junk",
                                        "subType" to "cache",
                                        "modifiedAt" to file.lastModified(),
                                    )
                                )
                            }
                        }
                    }
                }

                // 2. Obsolete APKs, .tmp, .log files in Download directory
                val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                if (downloadDir != null && downloadDir.exists() && downloadDir.isDirectory) {
                    downloadDir.walkTopDown().maxDepth(3).forEach { file ->
                        if (file.isFile && file.length() > 0) {
                            val lower = file.name.lowercase()
                            val subType = when {
                                lower.endsWith(".apk") -> "apk"
                                lower.endsWith(".tmp") || lower.endsWith(".temp") -> "temp"
                                lower.endsWith(".log") -> "log"
                                else -> null
                            }
                            if (subType != null) {
                                junkList.add(
                                    mapOf(
                                        "id" to ("junk_" + file.absolutePath.hashCode()),
                                        "path" to file.absolutePath,
                                        "name" to file.name,
                                        "sizeBytes" to file.length(),
                                        "category" to "junk",
                                        "subType" to subType,
                                        "modifiedAt" to file.lastModified(),
                                    )
                                )
                            }
                        }
                    }
                }

                // 3. Thumbnails
                val dcimThumbs = java.io.File(android.os.Environment.getExternalStorageDirectory(), "DCIM/.thumbnails")
                if (dcimThumbs.exists() && dcimThumbs.isDirectory) {
                    dcimThumbs.listFiles()?.forEach { file ->
                        if (file.isFile && file.length() > 0) {
                            junkList.add(
                                mapOf(
                                    "id" to ("junk_" + file.absolutePath.hashCode()),
                                    "path" to file.absolutePath,
                                    "name" to file.name,
                                    "sizeBytes" to file.length(),
                                    "category" to "junk",
                                    "subType" to "thumbnail",
                                    "modifiedAt" to file.lastModified(),
                                )
                            )
                        }
                    }
                }
            } catch (_: Exception) {}

            junkList
        }

        AsyncFunction("scanWhatsAppMedia") {
            val waList = mutableListOf<Map<String, Any>>()
            try {
                val candidateDirs = listOf(
                    java.io.File(android.os.Environment.getExternalStorageDirectory(), "Android/media/com.whatsapp/WhatsApp/Media"),
                    java.io.File(android.os.Environment.getExternalStorageDirectory(), "WhatsApp/Media")
                )

                for (base in candidateDirs) {
                    if (base.exists() && base.isDirectory) {
                        base.listFiles()?.forEach { subFolder ->
                            if (subFolder.isDirectory && !subFolder.name.startsWith(".")) {
                                subFolder.walkTopDown().maxDepth(3).forEach { file ->
                                    if (file.isFile && file.length() > 0 && !file.name.startsWith(".")) {
                                        val isSent = file.absolutePath.contains("/Sent/", ignoreCase = true)
                                        val mime = when {
                                            file.name.lowercase().endsWith(".jpg") || file.name.lowercase().endsWith(".jpeg") || file.name.lowercase().endsWith(".png") -> "image/jpeg"
                                            file.name.lowercase().endsWith(".mp4") || file.name.lowercase().endsWith(".3gp") -> "video/mp4"
                                            file.name.lowercase().endsWith(".opus") || file.name.lowercase().endsWith(".mp3") || file.name.lowercase().endsWith(".m4a") -> "audio/mpeg"
                                            else -> "application/octet-stream"
                                        }
                                        waList.add(
                                            mapOf(
                                                "id" to ("wa_" + file.absolutePath.hashCode()),
                                                "path" to file.absolutePath,
                                                "name" to file.name,
                                                "sizeBytes" to file.length(),
                                                "category" to "whatsapp",
                                                "subType" to subFolder.name,
                                                "isSent" to isSent,
                                                "mimeType" to mime,
                                                "modifiedAt" to file.lastModified(),
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {}
            waList
        }

        AsyncFunction("scanDownloads") {
            val dlList = mutableListOf<Map<String, Any>>()
            try {
                val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                if (downloadDir != null && downloadDir.exists() && downloadDir.isDirectory) {
                    downloadDir.walkTopDown().maxDepth(2).forEach { file ->
                        if (file.isFile && file.length() > 0 && !file.name.startsWith(".")) {
                            dlList.add(
                                mapOf(
                                    "id" to ("dl_" + file.absolutePath.hashCode()),
                                    "path" to file.absolutePath,
                                    "name" to file.name,
                                    "sizeBytes" to file.length(),
                                    "category" to "downloads",
                                    "modifiedAt" to file.lastModified(),
                                )
                            )
                        }
                    }
                }
            } catch (_: Exception) {}
            dlList
        }

        AsyncFunction("deleteNativeFiles") { paths: List<String> ->
            var deletedCount = 0
            var freedBytes = 0L
            for (p in paths) {
                try {
                    val file = java.io.File(p)
                    if (file.exists() && file.isFile) {
                        val len = file.length()
                        if (file.delete()) {
                            deletedCount++
                            freedBytes += len
                        }
                    }
                } catch (_: Exception) {}
            }
            mapOf("deletedCount" to deletedCount, "freedBytes" to freedBytes)
        }
    }
}

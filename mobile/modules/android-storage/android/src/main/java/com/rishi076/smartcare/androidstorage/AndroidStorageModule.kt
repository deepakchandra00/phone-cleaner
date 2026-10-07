package com.rishi076.smartcare.androidstorage

import android.app.ActivityManager
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.app.usage.StorageStatsManager
import android.content.ClipboardManager
import android.content.ClipData
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Debug
import android.os.Build
import android.os.Environment
import android.os.Process
import android.os.StatFs
import android.os.storage.StorageManager
import android.provider.MediaStore
import android.provider.Settings
import android.media.MediaScannerConnection
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.ModuleDefinition
import com.rishi076.smartcare.hashworker.PhotoHasher
import java.io.InputStream
import java.security.MessageDigest

/**
 * AndroidStorageModule — Exposes Android storage, package, and file deletion APIs to JS.
 */
class AndroidStorageModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("AndroidStorage")

        Events("speedTestProgress")
        AsyncFunction("runSpeedTest") { id: String ->
            SpeedTester.run(id) { stage, percent -> sendEvent("speedTestProgress", mapOf("id" to id, "stage" to stage, "percent" to percent)) }
        }
        Function("cancelSpeedTest") { id: String -> SpeedTester.cancel(id) }
        Function("getDeviceToolsVersion") { 1 }
        Function("getBatteryStatus") { DeviceTools.battery(appContext.reactContext ?: error("App unavailable")) }
        AsyncFunction("getWifiStatus") { DeviceTools.wifi(appContext.reactContext ?: error("App unavailable")) }
        AsyncFunction("getAppDataUsage") { start: Double, end: Double ->
            val ctx = appContext.reactContext ?: error("App unavailable")
            check(hasUsageAccess(ctx)) { "Enable Usage access before viewing other apps' data usage." }
            DeviceTools.dataUsage(ctx, start.toLong(), end.toLong())
        }
        AsyncFunction("discardCompressedPhoto") { uri: String -> DeviceTools.discardDraft(appContext.reactContext ?: error("App unavailable"), uri) }
        AsyncFunction("compressPhoto") { uri: String, quality: Int, maxSide: Int ->
            DeviceTools.compress(appContext.reactContext ?: error("App unavailable"), uri, quality, maxSide)
        }
        Function("getNotificationPackages") {
            try { CleanerNotificationListener.connected?.packages() ?: emptyList<Map<String, Any>>() }
            catch (_: Exception) { emptyList<Map<String, Any>>() }
        }
        AsyncFunction("dismissSelectedNotifications") { packages: List<String> ->
            val listener = CleanerNotificationListener.connected
            try { mapOf("available" to (listener != null), "requestedCount" to (listener?.dismissSelected(packages.toSet()) ?: 0)) }
            catch (_: Exception) { mapOf("available" to false, "requestedCount" to 0) }
        }

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
                val path = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    volume.directory?.path ?: "/storage/emulated/0"
                } else {
                    Environment.getExternalStorageDirectory().path
                }
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
                try {
                    val stat = StatFs(Environment.getExternalStorageDirectory().path)
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

        Function("isExternalStorageManager") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Environment.isExternalStorageManager()
            } else {
                true
            }
        }

        AsyncFunction("requestManageAllFilesAccess") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val activity = appContext.currentActivity
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val uri = Uri.parse("package:${ctx.packageName}")
                    val intent = Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        uri
                    )
                    if (activity != null) {
                        activity.startActivity(intent)
                    } else {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        ctx.startActivity(intent)
                    }
                    true
                } catch (_: Exception) {
                    try {
                        val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                        if (activity != null) {
                            activity.startActivity(intent)
                        } else {
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            ctx.startActivity(intent)
                        }
                        true
                    } catch (_: Exception) {
                        try {
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${ctx.packageName}")
                            }
                            if (activity != null) {
                                activity.startActivity(intent)
                            } else {
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                ctx.startActivity(intent)
                            }
                            true
                        } catch (_: Exception) {
                            false
                        }
                    }
                }
            } else {
                true
            }
        }

        Function("isUsageAccessGranted") {
            val ctx = appContext.reactContext
            ctx != null && hasUsageAccess(ctx)
        }

        Function("getUsageAccessStatus") {
            val ctx = appContext.reactContext
            if (ctx == null) {
                mapOf("granted" to false, "declared" to false, "packageName" to "")
            } else {
                val declared = try {
                    ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.GET_PERMISSIONS)
                        .requestedPermissions?.contains("android.permission.PACKAGE_USAGE_STATS") == true
                } catch (_: Exception) { false }
                mapOf("granted" to hasUsageAccess(ctx), "declared" to declared, "packageName" to ctx.packageName)
            }
        }

        AsyncFunction("requestUsageAccess") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val activity = appContext.currentActivity
            try {
                // The documented settings action accepts no data URI; OEMs may not
                // resolve the action when an undocumented package URI is attached.
                val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                if (activity != null) activity.startActivity(intent)
                else { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(intent) }
                true
            } catch (_: Exception) { false }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("openAppSettings") { packageName: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val activity = appContext.currentActivity
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                if (activity != null) activity.startActivity(intent)
                else { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(intent) }
                true
            } catch (_: Exception) { false }
        }.runOnQueue(Queues.MAIN)

        Function("getNotificationCleanupStatus") {
            val ctx = appContext.reactContext
            val listener = CleanerNotificationListener.connected
            mapOf(
                "enabled" to (ctx != null && NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)),
                "connected" to (listener != null),
                "clearableCount" to try { listener?.clearableCount() ?: 0 } catch (_: Exception) { 0 }
            )
        }

        AsyncFunction("requestNotificationCleanupAccess") {
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            try {
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                val activity = appContext.currentActivity
                if (activity != null) activity.startActivity(intent)
                else { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(intent) }
                true
            } catch (_: Exception) { false }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("dismissClearableNotifications") {
            val listener = CleanerNotificationListener.connected
            try {
                mapOf("available" to (listener != null), "requestedCount" to (listener?.dismissClearable() ?: 0))
            } catch (_: Exception) { mapOf("available" to false, "requestedCount" to 0) }
        }

        Function("getAppMemoryDiagnostics") {
            val runtime = Runtime.getRuntime()
            mapOf(
                "javaHeapUsedBytes" to (runtime.totalMemory() - runtime.freeMemory()),
                "javaHeapMaxBytes" to runtime.maxMemory(),
                "nativeHeapAllocatedBytes" to Debug.getNativeHeapAllocatedSize()
            )
        }

        Function("getMemoryInfo") {
            val ctx = appContext.reactContext
            if (ctx == null) {
                return@Function mapOf(
                    "totalMemBytes" to 0L,
                    "availMemBytes" to 0L,
                    "usedMemBytes" to 0L,
                    "usedPercent" to 0,
                    "lowMemory" to false
                )
            }
            try {
                val actManager = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                val memInfo = ActivityManager.MemoryInfo()
                actManager.getMemoryInfo(memInfo)
                val total = memInfo.totalMem
                val avail = memInfo.availMem
                val used = Math.max(0L, total - avail)
                val percent = if (total > 0) ((used.toDouble() / total.toDouble()) * 100).toInt() else 0
                mapOf(
                    "totalMemBytes" to total,
                    "availMemBytes" to avail,
                    "usedMemBytes" to used,
                    "usedPercent" to percent,
                    "lowMemory" to memInfo.lowMemory
                )
            } catch (_: Exception) {
                mapOf(
                    "totalMemBytes" to 0L,
                    "availMemBytes" to 0L,
                    "usedMemBytes" to 0L,
                    "usedPercent" to 0,
                    "lowMemory" to false
                )
            }
        }

        AsyncFunction("getInstalledApps") {
            val ctx = appContext.reactContext
            if (ctx == null) {
                return@AsyncFunction emptyList<Map<String, Any>>()
            }

            try {
                val pm = ctx.packageManager
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)

                var storageStatsManager: StorageStatsManager? = null
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        storageStatsManager = ctx.getSystemService(Context.STORAGE_STATS_SERVICE) as? StorageStatsManager
                    } catch (_: Exception) {}
                }

                val lastUsedByPackage = mutableMapOf<String, Long>()
                if (hasUsageAccess(ctx)) {
                    try {
                        val now = System.currentTimeMillis()
                        val manager = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
                        manager.queryUsageStats(UsageStatsManager.INTERVAL_YEARLY, now - 365L * 24 * 60 * 60 * 1000, now)?.forEach { usage ->
                            val previous = lastUsedByPackage[usage.packageName] ?: 0L
                            if (usage.lastTimeUsed > previous) lastUsedByPackage[usage.packageName] = usage.lastTimeUsed
                        }
                    } catch (_: Exception) { /* usage remains unknown */ }
                }

                apps
                    .filter { it.sourceDir != null }
                    .map { info ->
                        val isSystem = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                        val sourceFile = info.sourceDir?.let { java.io.File(it) }
                        var appBytes = sourceFile?.length() ?: 0L
                        var cacheBytes = 0L

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && storageStatsManager != null) {
                            try {
                                val stats = storageStatsManager.queryStatsForPackage(
                                    StorageManager.UUID_DEFAULT,
                                    info.packageName,
                                    Process.myUserHandle()
                                )
                                appBytes = stats.appBytes
                                cacheBytes = stats.cacheBytes
                            } catch (_: Exception) {
                                // Requires PACKAGE_USAGE_STATS permission; silently keep APK size
                            }
                        }

                        mapOf(
                            "packageName" to (info.packageName ?: ""),
                            "label" to (pm.getApplicationLabel(info).toString()),
                            "sizeBytes" to appBytes,
                            "cacheBytes" to cacheBytes,
                            "lastUsedAt" to (lastUsedByPackage[info.packageName] ?: 0L),
                            "installedAt" to try { pm.getPackageInfo(info.packageName, 0).firstInstallTime } catch (_: Exception) { 0L },
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
                val intent = Intent(
                    Intent.ACTION_DELETE,
                    Uri.parse("package:$packageName"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
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
                val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
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

                // 3. Thumbnails in DCIM, Pictures, and Movies
                val thumbDirs = listOf(
                    java.io.File(Environment.getExternalStorageDirectory(), "DCIM/.thumbnails"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Pictures/.thumbnails"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Movies/.thumbnails"),
                )
                for (tDir in thumbDirs) {
                    if (tDir.exists() && tDir.isDirectory) {
                        tDir.listFiles()?.forEach { file ->
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
                }

                // 4. Visible app cache in Android/data/*/cache/ — the primary source of
                // "visible cache" shown in Android Settings > Storage. Only accessible
                // with MANAGE_EXTERNAL_STORAGE (Android 11+).
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
                    val androidDataDir = java.io.File(Environment.getExternalStorageDirectory(), "Android/data")
                    if (androidDataDir.exists() && androidDataDir.isDirectory) {
                        try {
                            androidDataDir.listFiles()?.forEach { pkgDir ->
                                if (pkgDir.isDirectory) {
                                    val cacheDir = java.io.File(pkgDir, "cache")
                                    if (cacheDir.exists() && cacheDir.isDirectory) {
                                        try {
                                            cacheDir.walkTopDown().maxDepth(4).forEach { file ->
                                                if (file.isFile && file.length() > 0) {
                                                    junkList.add(
                                                        mapOf(
                                                            "id" to ("cache_" + file.absolutePath.hashCode()),
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
                                        } catch (_: Exception) {}
                                    }
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }

                // 5. WhatsApp .nomedia and temp files in common media dirs
                try {
                    val waTempDirs = listOf(
                        java.io.File(Environment.getExternalStorageDirectory(), "Android/media/com.whatsapp/WhatsApp/Media/.Statuses"),
                        java.io.File(Environment.getExternalStorageDirectory(), "WhatsApp/Media/.Statuses"),
                    )
                    for (tDir in waTempDirs) {
                        if (tDir.exists() && tDir.isDirectory) {
                            tDir.walkTopDown().maxDepth(2).forEach { file ->
                                if (file.isFile && file.length() > 0 && !file.name.startsWith(".")) {
                                    junkList.add(
                                        mapOf(
                                            "id" to ("wa_status_" + file.absolutePath.hashCode()),
                                            "path" to file.absolutePath,
                                            "name" to file.name,
                                            "sizeBytes" to file.length(),
                                            "category" to "junk",
                                            "subType" to "temp",
                                            "modifiedAt" to file.lastModified(),
                                        )
                                    )
                                }
                            }
                        }
                    }
                } catch (_: Exception) {}
            } catch (_: Exception) {}

            junkList
        }

        AsyncFunction("scanWhatsAppMedia") {
            val waList = mutableListOf<Map<String, Any>>()
            try {
                val candidateDirs = listOf(
                    java.io.File(Environment.getExternalStorageDirectory(), "Android/media/com.whatsapp/WhatsApp/Media"),
                    java.io.File(Environment.getExternalStorageDirectory(), "WhatsApp/Media"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Android/media/com.whatsapp.w4b/WhatsApp Business/Media"),
                    java.io.File(Environment.getExternalStorageDirectory(), "WhatsApp Business/Media")
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
                                            file.name.lowercase().endsWith(".pdf") -> "application/pdf"
                                            file.name.lowercase().endsWith(".doc") || file.name.lowercase().endsWith(".docx") -> "application/msword"
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
                val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
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

        AsyncFunction("scanEmptyFolders") {
            val emptyList = mutableListOf<Map<String, Any>>()
            val hasManagerAccess = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

            try {
                val root = Environment.getExternalStorageDirectory()
                if (root != null && root.exists() && root.isDirectory) {
                    fun checkDir(dir: java.io.File, depth: Int) {
                        if (depth > 5) return
                        if (dir.name.startsWith(".") && dir.name != ".thumbnails") return
                        val path = dir.absolutePath
                        // Skip Android/data & Android/obb unless we have full storage manager access
                        if (!hasManagerAccess && (path.contains("/Android/data") || path.contains("/Android/obb"))) return

                        val children = dir.listFiles() ?: return
                        if (children.isEmpty()) {
                            val lower = dir.name.lowercase()
                            val isRootStandard = listOf("dcim", "pictures", "movies", "music", "download", "downloads", "documents", "android", "alarms", "notifications", "ringtones", "podcasts")
                                .contains(lower)
                            if (!isRootStandard && dir != root) {
                                emptyList.add(
                                    mapOf(
                                        "id" to ("empty_" + path.hashCode()),
                                        "path" to path,
                                        "name" to dir.name,
                                        "sizeBytes" to 4096L,
                                        "category" to "empty_folder",
                                        "modifiedAt" to dir.lastModified()
                                    )
                                )
                            }
                        } else {
                            for (child in children) {
                                if (child.isDirectory) {
                                    checkDir(child, depth + 1)
                                }
                            }
                        }
                    }
                    checkDir(root, 0)
                }
            } catch (_: Exception) {}
            emptyList
        }

        AsyncFunction("deleteEmptyFolders") { paths: List<String> ->
            var count = 0
            for (p in paths) {
                try {
                    val f = java.io.File(p)
                    if (f.exists() && f.isDirectory && (f.listFiles()?.isEmpty() == true)) {
                        if (f.delete()) count++
                    }
                } catch (_: Exception) {}
            }
            mapOf("deletedCount" to count)
        }

        AsyncFunction("scanTrashedFiles") {
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            val trashedList = mutableListOf<Map<String, Any>>()
            val seenPaths = mutableSetOf<String>()

            // 1. MediaStore IS_TRASHED query (Android 11+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val uri = MediaStore.Files.getContentUri("external")
                    val projection = arrayOf(
                        MediaStore.Files.FileColumns._ID,
                        MediaStore.Files.FileColumns.DATA,
                        MediaStore.Files.FileColumns.DISPLAY_NAME,
                        MediaStore.Files.FileColumns.SIZE,
                        MediaStore.Files.FileColumns.DATE_MODIFIED
                    )
                    val selection = "${MediaStore.MediaColumns.IS_TRASHED} = 1"
                    ctx.contentResolver.query(uri, projection, selection, null, null)?.use { cursor ->
                        val idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
                        val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
                        val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
                        val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
                        val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
                        while (cursor.moveToNext()) {
                            val path = cursor.getString(dataCol) ?: ""
                            val name = cursor.getString(nameCol) ?: "trashed_media"
                            val size = cursor.getLong(sizeCol)
                            val mod = cursor.getLong(dateCol) * 1000L
                            if (size > 0 && !seenPaths.contains(path)) {
                                seenPaths.add(path)
                                trashedList.add(
                                    mapOf(
                                        "id" to ("trash_ms_" + cursor.getLong(idCol)),
                                        "path" to path,
                                        "name" to name,
                                        "sizeBytes" to size,
                                        "category" to "trash",
                                        "modifiedAt" to mod
                                    )
                                )
                            }
                        }
                    }
                } catch (_: Exception) {}
            }

            // 2. Physical filesystem scan for .trashed-* files and trash directories
            try {
                val candidateDirs = listOf(
                    java.io.File(Environment.getExternalStorageDirectory(), "DCIM"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Pictures"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Movies"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Download"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Android/media/com.whatsapp/WhatsApp/Media")
                )
                for (dir in candidateDirs) {
                    if (dir.exists() && dir.isDirectory) {
                        dir.walkTopDown().maxDepth(4).forEach { file ->
                            if (file.isFile && (file.name.startsWith(".trashed-") || file.parentFile?.name?.equals(".trash", ignoreCase = true) == true) && file.length() > 0) {
                                val p = file.absolutePath
                                if (!seenPaths.contains(p)) {
                                    seenPaths.add(p)
                                    trashedList.add(
                                        mapOf(
                                            "id" to ("trash_" + p.hashCode()),
                                            "path" to p,
                                            "name" to file.name,
                                            "sizeBytes" to file.length(),
                                            "category" to "trash",
                                            "modifiedAt" to file.lastModified()
                                        )
                                    )
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {}

            trashedList
        }

        AsyncFunction("scanBrowserCaches") {
            val browserList = mutableListOf<Map<String, Any>>()
            val seenPaths = mutableSetOf<String>()

            try {
                val dlDirs = listOf(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    java.io.File(Environment.getExternalStorageDirectory(), "Download/Chrome"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Download/Browser"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Download/Opera")
                )
                for (dir in dlDirs) {
                    if (dir != null && dir.exists() && dir.isDirectory) {
                        dir.walkTopDown().maxDepth(3).forEach { file ->
                            if (file.isFile && file.length() > 0) {
                                val lower = file.name.lowercase()
                                if (lower.endsWith(".tmp") || lower.endsWith(".crdownload") || lower.endsWith(".download")) {
                                    val p = file.absolutePath
                                    if (!seenPaths.contains(p)) {
                                        seenPaths.add(p)
                                        browserList.add(
                                            mapOf(
                                                "id" to ("browser_" + p.hashCode()),
                                                "path" to p,
                                                "name" to file.name,
                                                "sizeBytes" to file.length(),
                                                "category" to "browser",
                                                "modifiedAt" to file.lastModified()
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {}

            browserList
        }

        AsyncFunction("scanApkFiles") {
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            val apkList = mutableListOf<Map<String, Any>>()
            val seenPaths = mutableSetOf<String>()
            val pm = ctx.packageManager

            fun processApkFile(file: java.io.File) {
                if (!file.exists() || !file.isFile || file.length() <= 0) return
                val path = file.absolutePath
                if (seenPaths.contains(path)) return
                seenPaths.add(path)

                var appLabel = file.name
                var packageName: String? = null
                var versionName: String? = null
                var isInstalled = false

                try {
                    val archiveInfo = pm.getPackageArchiveInfo(path, 0)
                    if (archiveInfo != null) {
                        archiveInfo.applicationInfo?.sourceDir = path
                        archiveInfo.applicationInfo?.publicSourceDir = path
                        packageName = archiveInfo.packageName
                        versionName = archiveInfo.versionName
                        val label = archiveInfo.applicationInfo?.loadLabel(pm)?.toString()
                        if (!label.isNullOrBlank()) {
                            appLabel = label
                        }

                        if (packageName != null) {
                            try {
                                pm.getPackageInfo(packageName, 0)
                                isInstalled = true
                            } catch (_: Exception) {
                                isInstalled = false
                            }
                        }
                    }
                } catch (_: Exception) {}

                apkList.add(
                    mapOf(
                        "id" to ("apk_" + path.hashCode()),
                        "path" to path,
                        "name" to file.name,
                        "appLabel" to appLabel,
                        "packageName" to (packageName ?: ""),
                        "versionName" to (versionName ?: ""),
                        "isInstalled" to isInstalled,
                        "sizeBytes" to file.length(),
                        "category" to "apks",
                        "subType" to if (isInstalled) "installed_apk" else "obsolete_apk",
                        "modifiedAt" to file.lastModified()
                    )
                )
            }

            try {
                val uri = MediaStore.Files.getContentUri("external")
                val projection = arrayOf(
                    MediaStore.Files.FileColumns._ID,
                    MediaStore.Files.FileColumns.DATA,
                    MediaStore.Files.FileColumns.DISPLAY_NAME,
                    MediaStore.Files.FileColumns.SIZE,
                    MediaStore.Files.FileColumns.DATE_MODIFIED
                )
                val selection = "${MediaStore.Files.FileColumns.DATA} LIKE '%.apk' OR ${MediaStore.Files.FileColumns.MIME_TYPE} = ?"
                val selectionArgs = arrayOf("application/vnd.android.package-archive")

                ctx.contentResolver.query(uri, projection, selection, selectionArgs, null)?.use { cursor ->
                    val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATA)
                    while (cursor.moveToNext()) {
                        val path = cursor.getString(dataCol)
                        if (!path.isNullOrBlank()) {
                            processApkFile(java.io.File(path))
                        }
                    }
                }

                val candidateDirs = listOf(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    java.io.File(Environment.getExternalStorageDirectory(), "Download"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Downloads"),
                    java.io.File(Environment.getExternalStorageDirectory(), "APK"),
                    java.io.File(Environment.getExternalStorageDirectory(), "apks"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Telegram/Telegram Documents"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Android/media/org.telegram.messenger/Telegram/Telegram Documents"),
                    java.io.File(Environment.getExternalStorageDirectory(), "WhatsApp/Media/WhatsApp Documents"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Bluetooth"),
                    java.io.File(Environment.getExternalStorageDirectory(), "ShareMe"),
                    java.io.File(Environment.getExternalStorageDirectory(), "Xender")
                )

                for (dir in candidateDirs) {
                    if (dir != null && dir.exists() && dir.isDirectory) {
                        dir.walkTopDown().maxDepth(3).forEach { f ->
                            if (f.isFile && f.name.lowercase().endsWith(".apk")) {
                                processApkFile(f)
                            }
                        }
                    }
                }
            } catch (_: Exception) {}

            apkList
        }

        AsyncFunction("openFile") { uriOrPath: String, mimeType: String? ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val activity = appContext.currentActivity
            try {
                val raw = if (uriOrPath.startsWith("file://")) uriOrPath.removePrefix("file://") else uriOrPath
                val cleanPath = Uri.decode(raw)
                val uri = if (uriOrPath.startsWith("content://")) {
                    Uri.parse(uriOrPath)
                } else {
                    val file = java.io.File(cleanPath)
                    try {
                        FileProvider.getUriForFile(
                            ctx,
                            "${ctx.packageName}.fileprovider",
                            file
                        )
                    } catch (_: Exception) {
                        try {
                            Uri.fromFile(file)
                        } catch (_: Exception) {
                            Uri.parse(uriOrPath)
                        }
                    }
                }

                val determinedMime = if (!mimeType.isNullOrBlank() && mimeType != "*/*") {
                    mimeType
                } else {
                    when {
                        cleanPath.endsWith(".jpg", ignoreCase = true) || cleanPath.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
                        cleanPath.endsWith(".png", ignoreCase = true) -> "image/png"
                        cleanPath.endsWith(".webp", ignoreCase = true) -> "image/webp"
                        cleanPath.endsWith(".gif", ignoreCase = true) -> "image/gif"
                        cleanPath.endsWith(".mp4", ignoreCase = true) -> "video/mp4"
                        cleanPath.endsWith(".mkv", ignoreCase = true) -> "video/x-matroska"
                        cleanPath.endsWith(".3gp", ignoreCase = true) -> "video/3gpp"
                        cleanPath.endsWith(".mp3", ignoreCase = true) -> "audio/mpeg"
                        cleanPath.endsWith(".opus", ignoreCase = true) || cleanPath.endsWith(".ogg", ignoreCase = true) -> "audio/ogg"
                        cleanPath.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                        cleanPath.endsWith(".apk", ignoreCase = true) -> "application/vnd.android.package-archive"
                        else -> "*/*"
                    }
                }

                val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, determinedMime)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(viewIntent, "Open with")
                if (activity != null) {
                    activity.startActivity(chooser)
                } else {
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    ctx.startActivity(chooser)
                }
                true
            } catch (_: Exception) {
                false
            }
        }

        AsyncFunction("scanMediaStoreVideos") {
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            val videoList = mutableListOf<Map<String, Any>>()

            try {
                val projection = arrayOf(
                    MediaStore.Video.Media._ID,
                    MediaStore.Video.Media.DATA,
                    MediaStore.Video.Media.SIZE,
                    MediaStore.Video.Media.DISPLAY_NAME,
                    MediaStore.Video.Media.DATE_MODIFIED,
                    MediaStore.Video.Media.DURATION,
                    MediaStore.Video.Media.MIME_TYPE,
                    MediaStore.Video.Media.WIDTH,
                    MediaStore.Video.Media.HEIGHT
                )

                val uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                val cursor = ctx.contentResolver.query(
                    uri,
                    projection,
                    null,
                    null,
                    "${MediaStore.Video.Media.DATE_MODIFIED} DESC"
                )

                cursor?.use { c ->
                    val idCol = c.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                    val dataCol = c.getColumnIndex(MediaStore.Video.Media.DATA)
                    val sizeCol = c.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                    val nameCol = c.getColumnIndex(MediaStore.Video.Media.DISPLAY_NAME)
                    val dateCol = c.getColumnIndex(MediaStore.Video.Media.DATE_MODIFIED)
                    val durCol = c.getColumnIndex(MediaStore.Video.Media.DURATION)
                    val mimeCol = c.getColumnIndex(MediaStore.Video.Media.MIME_TYPE)
                    val widthCol = c.getColumnIndex(MediaStore.Video.Media.WIDTH)
                    val heightCol = c.getColumnIndex(MediaStore.Video.Media.HEIGHT)

                    while (c.moveToNext()) {
                        val id = c.getLong(idCol)
                        val contentUri = ContentUris.withAppendedId(uri, id).toString()
                        val filePath = if (dataCol != -1) c.getString(dataCol) else null
                        var size = c.getLong(sizeCol)

                        if (size <= 0 && filePath != null) {
                            try {
                                val f = java.io.File(filePath)
                                if (f.exists() && f.isFile) {
                                    size = f.length()
                                }
                            } catch (_: Exception) {}
                        }

                        val name = (if (nameCol != -1) c.getString(nameCol) else null)
                            ?: (filePath?.let { java.io.File(it).name })
                            ?: "video_$id.mp4"
                        val modSec = if (dateCol != -1) c.getLong(dateCol) else 0L
                        val durMs = if (durCol != -1) c.getLong(durCol) else 0L
                        val mime = (if (mimeCol != -1) c.getString(mimeCol) else null) ?: "video/mp4"
                        val width = if (widthCol != -1) c.getInt(widthCol) else 0
                        val height = if (heightCol != -1) c.getInt(heightCol) else 0

                        videoList.add(
                            mapOf(
                                "id" to id.toString(),
                                "uri" to contentUri,
                                "path" to (filePath ?: contentUri),
                                "name" to name,
                                "sizeBytes" to size,
                                "modifiedAt" to (if (modSec > 10000000000L) modSec else modSec * 1000L),
                                "durationSec" to (durMs / 1000.0),
                                "mimeType" to mime,
                                "width" to width,
                                "height" to height
                            )
                        )
                    }
                }
            } catch (_: Exception) {}

            videoList
        }

        AsyncFunction("getMediaMetadata") { uris: List<String> ->
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
            uris.mapNotNull { value ->
                try {
                    val uri = Uri.parse(value)
                    if (uri.scheme == "content") {
                        ctx.contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DATA, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.MIME_TYPE), null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) mapOf("uri" to value, "path" to cursor.getString(0), "sizeBytes" to cursor.getLong(1), "mimeType" to cursor.getString(2)) else null
                        }
                    } else {
                        val file = java.io.File(if (uri.scheme == "file") uri.path ?: value else value)
                        if (file.exists()) mapOf("uri" to value, "path" to file.absolutePath, "sizeBytes" to file.length(), "mimeType" to null) else null
                    }
                } catch (_: Exception) { null }
            }
        }

        AsyncFunction("locateFile") { uriOrPath: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            try {
                var path: String? = if (uriOrPath.startsWith("content://")) null
                    else if (uriOrPath.startsWith("file://")) Uri.parse(uriOrPath).path else uriOrPath
                if (path == null && uriOrPath.startsWith("content://")) {
                    ctx.contentResolver.query(Uri.parse(uriOrPath), arrayOf(MediaStore.MediaColumns.DATA), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) path = cursor.getString(0)
                    }
                }
                val parent = path?.let { java.io.File(it).parentFile } ?: return@AsyncFunction false
                val parentPath = parent.absolutePath
                val primaryRoot = Environment.getExternalStorageDirectory().absolutePath
                val documentId = when {
                    parentPath == primaryRoot -> "primary:"
                    parentPath.startsWith("$primaryRoot/") -> "primary:" + parentPath.removePrefix("$primaryRoot/")
                    parentPath.startsWith("/storage/") -> {
                        val parts = parentPath.removePrefix("/storage/").split("/", limit = 2)
                        parts[0] + ":" + (parts.getOrNull(1) ?: "")
                    }
                    else -> return@AsyncFunction false
                }
                val folderUri = android.provider.DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", documentId)
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, folderUri)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(intent)
                true
            } catch (_: Exception) {
                false
            }
        }

        AsyncFunction("deleteNativeFiles") { paths: List<String> ->
            val ctx = appContext.reactContext
            var deletedCount = 0
            var freedBytes = 0L
            val deletedPaths = mutableListOf<String>()
            val failedPaths = mutableListOf<String>()

            for (p in paths) {
                try {
                    val rawClean = if (p.startsWith("file://")) p.removePrefix("file://") else p
                    val cleanPath = Uri.decode(rawClean)
                    var deleted = false
                    var len = 0L

                    if (p.startsWith("content://")) {
                        if (ctx != null) {
                            try {
                                val uri = Uri.parse(p)
                                // Capture file size BEFORE deletion (file won't exist after)
                                try {
                                    ctx.contentResolver.query(
                                        uri,
                                        arrayOf(MediaStore.MediaColumns.SIZE),
                                        null, null, null
                                    )?.use { cursor ->
                                        if (cursor.moveToFirst()) {
                                            len = cursor.getLong(0)
                                        }
                                    }
                                } catch (_: Exception) {}
                                val rows = ctx.contentResolver.delete(uri, null, null)
                                deleted = rows > 0
                            } catch (_: Exception) {
                                deleted = false
                            }
                        }
                    } else {
                        val file = java.io.File(cleanPath)
                        if (file.exists()) {
                            if (file.isFile) {
                                len = file.length()
                                deleted = file.delete()
                            } else if (file.isDirectory) {
                                // Only empty folders may be removed; never recursively delete new contents.
                                deleted = file.listFiles()?.isEmpty() == true && file.delete()
                            }
                        }

                        // Scoped Storage fallback: on Android 11+, if file.delete() failed,
                        // attempt ContentResolver deletion via MediaStore
                        if (!deleted && ctx != null) {
                            try {
                                val cr = ctx.contentResolver
                                val where = "${MediaStore.MediaColumns.DATA} = ?"
                                val args = arrayOf(cleanPath)

                                // Try all MediaStore collections in order
                                val collections = mutableListOf(
                                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                                    MediaStore.Files.getContentUri("external"),
                                )
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    collections.add(MediaStore.Downloads.EXTERNAL_CONTENT_URI)
                                }

                                for (collection in collections) {
                                    try {
                                        val r = cr.delete(collection, where, args)
                                        if (r > 0 || !file.exists()) {
                                            deleted = true
                                            break
                                        }
                                    } catch (_: Exception) {}
                                }

                                // Last resort: query for the content URI by path, then delete that URI
                                if (!deleted) {
                                    for (collection in collections) {
                                        try {
                                            val projection = arrayOf(MediaStore.MediaColumns._ID)
                                            cr.query(collection, projection, where, args, null)?.use { cursor ->
                                                if (cursor.moveToFirst()) {
                                                    val id = cursor.getLong(0)
                                                    val contentUri = android.content.ContentUris.withAppendedId(collection, id)
                                                    val r = cr.delete(contentUri, null, null)
                                                    if (r > 0) {
                                                        deleted = true
                                                    }
                                                }
                                            }
                                            if (deleted) break
                                        } catch (_: Exception) {}
                                    }
                                }
                            } catch (_: Exception) {}
                        }

                        // When deleted from disk, notify MediaScanner to drop phantom records in MediaStore
                        if (deleted && ctx != null) {
                            try {
                                MediaScannerConnection.scanFile(ctx, arrayOf(cleanPath), null, null)
                            } catch (_: Exception) {}
                        }
                    }

                    if (deleted) {
                        deletedCount++
                        if (len == 0L) {
                            // Try to get file size if we didn't capture it earlier
                            try { len = java.io.File(cleanPath).length() } catch (_: Exception) {}
                        }
                        freedBytes += len
                        deletedPaths.add(p)
                    } else {
                        failedPaths.add(p)
                    }
                } catch (_: Exception) {
                    failedPaths.add(p)
                }
            }
            mapOf(
                "deletedCount" to deletedCount,
                "freedBytes" to freedBytes,
                "deletedPaths" to deletedPaths,
                "failedPaths" to failedPaths,
            )
        }

        Function("copyToClipboard") { text: String ->
            val ctx = appContext.reactContext ?: return@Function false
            try {
                val clipboard = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                val clip = ClipData.newPlainText("File Path", text)
                clipboard?.setPrimaryClip(clip)
                true
            } catch (_: Exception) {
                false
            }
        }

        AsyncFunction("verifyFilesExistence") { targets: List<String> ->
            val ctx = appContext.reactContext
            val result = mutableMapOf<String, Boolean>()
            for (target in targets) {
                try {
                    if (target.startsWith("content://")) {
                        val uri = Uri.parse(target)
                        var exists = false
                        ctx?.contentResolver?.query(
                            uri,
                            arrayOf(MediaStore.MediaColumns._ID),
                            null,
                            null,
                            null
                        )?.use { cursor ->
                            exists = cursor.moveToFirst()
                        }
                        result[target] = exists
                    } else {
                        val rawClean = if (target.startsWith("file://")) target.removePrefix("file://") else target
                        val clean = Uri.decode(rawClean)
                        val f = java.io.File(clean)
                        result[target] = f.exists()
                    }
                } catch (_: Exception) {
                    result[target] = false
                }
            }
            result
        }

        AsyncFunction("hashFile") { path: String ->
            computeSha256(path)
        }

        AsyncFunction("hashFiles") { paths: List<String> ->
            paths.map { path ->
                mapOf("path" to path, "hash" to computeSha256(path))
            }
        }

        AsyncFunction("computeDHash") { path: String ->
            computeDHash(path)
        }

        Function("getPhotoHashVersion") { PhotoHasher.VERSION }

        AsyncFunction("hashPhotos") { paths: List<String> ->
            paths.map { path ->
                mapOf(
                    "path" to path,
                    "sha256" to computeSha256(path),
                    "dhash" to computeDHash(path)
                )
            }
        }
    }

    private fun hasUsageAccess(ctx: Context): Boolean {
        return try {
            val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
            } else {
                appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
            }
            mode == AppOpsManager.MODE_ALLOWED
        } catch (_: Exception) { false }
    }

    private fun getInputStream(path: String): InputStream? {
        return try {
            if (path.startsWith("content://")) {
                val ctx = appContext.reactContext ?: return null
                ctx.contentResolver.openInputStream(Uri.parse(path))
            } else {
                val cleanPath = if (path.startsWith("file://")) Uri.parse(path).path ?: return null else path
                val file = java.io.File(cleanPath)
                if (file.exists() && file.isFile && file.canRead()) {
                    file.inputStream()
                } else {
                    // Fallback to MediaStore query for Android 11+ Scoped Storage
                    val ctx = appContext.reactContext ?: return null
                    val projection = arrayOf(MediaStore.Images.Media._ID)
                    val selection = "${MediaStore.Images.Media.DATA} = ?"
                    val selectionArgs = arrayOf(cleanPath)
                    ctx.contentResolver.query(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        projection,
                        selection,
                        selectionArgs,
                        null
                    )?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val id = cursor.getLong(0)
                            val contentUri = ContentUris.withAppendedId(
                                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                                id
                            )
                            ctx.contentResolver.openInputStream(contentUri)
                        } else null
                    }
                }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun computeSha256(path: String): String? {
        val stream = getInputStream(path) ?: return null
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            stream.use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read <= 0) break
                    digest.update(buffer, 0, read)
                }
            }
            Base64.encodeToString(digest.digest(), Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }

    private fun computeDHash(path: String): String? = PhotoHasher.dHash { getInputStream(path) }
}

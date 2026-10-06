package com.phonecleaner.app.androidstorage

import android.app.usage.StorageStatsManager
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Process
import android.os.StatFs
import android.os.storage.StorageManager
import android.provider.MediaStore
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * AndroidStorageModule — Exposes Android storage, package, and file deletion APIs to JS.
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val uri = Uri.parse("package:${ctx.packageName}")
                    val intent = Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        uri
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    ctx.startActivity(intent)
                    true
                } catch (_: Exception) {
                    try {
                        val intent = Intent(
                            Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION
                        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        ctx.startActivity(intent)
                        true
                    } catch (_: Exception) {
                        false
                    }
                }
            } else {
                true
            }
        }

        Function("getInstalledApps") {
            val ctx = appContext.reactContext
            if (ctx == null) {
                return@Function emptyList<Map<String, Any>>()
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

        AsyncFunction("openFile") { uriOrPath: String, mimeType: String? ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            try {
                val uri = if (uriOrPath.startsWith("content://")) {
                    Uri.parse(uriOrPath)
                } else {
                    val cleanPath = if (uriOrPath.startsWith("file://")) uriOrPath.removePrefix("file://") else uriOrPath
                    val file = java.io.File(cleanPath)
                    try {
                        FileProvider.getUriForFile(
                            ctx,
                            "${ctx.packageName}.fileprovider",
                            file
                        )
                    } catch (_: Exception) {
                        Uri.fromFile(file)
                    }
                }

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, mimeType ?: "*/*")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(intent)
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

        AsyncFunction("locateFile") { uriOrPath: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            try {
                val cleanPath = if (uriOrPath.startsWith("file://")) uriOrPath.removePrefix("file://") else uriOrPath
                val file = java.io.File(cleanPath)
                val targetFile = if (file.exists()) file else null
                val parentDir = targetFile?.parentFile ?: if (cleanPath.startsWith("/")) java.io.File(cleanPath).parentFile else null

                // Strategy 1: Open file manager pointing to folder
                if (parentDir != null && parentDir.exists()) {
                    val folderUri = try {
                        FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", parentDir)
                    } catch (_: Exception) {
                        Uri.fromFile(parentDir)
                    }

                    val folderIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(folderUri, "resource/folder")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    if (folderIntent.resolveActivity(ctx.packageManager) != null) {
                        ctx.startActivity(folderIntent)
                        return@AsyncFunction true
                    }

                    val dirIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(folderUri, "vnd.android.document/directory")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    if (dirIntent.resolveActivity(ctx.packageManager) != null) {
                        ctx.startActivity(dirIntent)
                        return@AsyncFunction true
                    }
                }

                // Strategy 2: If content:// uri or couldn't open folder directly, open via ACTION_VIEW
                val fileUri = if (uriOrPath.startsWith("content://")) {
                    Uri.parse(uriOrPath)
                } else if (targetFile != null) {
                    try {
                        FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", targetFile)
                    } catch (_: Exception) {
                        Uri.fromFile(targetFile)
                    }
                } else {
                    Uri.parse(uriOrPath)
                }

                val viewIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(fileUri, "*/*")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(viewIntent)
                true
            } catch (e: Exception) {
                false
            }
        }

        AsyncFunction("deleteNativeFiles") { paths: List<String> ->
            var deletedCount = 0
            var freedBytes = 0L
            val deletedPaths = mutableListOf<String>()
            val failedPaths = mutableListOf<String>()

            for (p in paths) {
                try {
                    val cleanPath = if (p.startsWith("file://")) p.removePrefix("file://") else p
                    val file = java.io.File(cleanPath)
                    if (file.exists() && file.isFile) {
                        val len = file.length()
                        val deleted = file.delete()
                        if (deleted && !file.exists()) {
                            deletedCount++
                            freedBytes += len
                            deletedPaths.add(p)
                        } else {
                            failedPaths.add(p)
                        }
                    } else {
                        // File not found or not a regular file
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
    }
}

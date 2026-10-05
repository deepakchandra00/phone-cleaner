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
    }
}

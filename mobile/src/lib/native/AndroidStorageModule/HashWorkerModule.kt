package com.phonecleaner.app.hashworker

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

/**
 * HashWorker — batched SHA-256 hashing on a background thread.
 *
 * Exposed methods:
 *   hashFiles(paths: String[]) → [{ path, hash }] (async, runs off the JS thread)
 *   hashFile(path: String) → String (single)
 *
 * Used by the duplicate-detection pipeline Stage 3 (exact hash) to avoid
 * the JS bridge overhead for thousands of files. Streams files in 64KB
 * chunks — never loads full file into memory.
 */
class HashWorkerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("HashWorker")

        AsyncFunction("hashFile") { path: String ->
            val file = java.io.File(path)
            if (!file.exists()) return@AsyncFunction null
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read <= 0) break
                    digest.update(buffer, 0, read)
                }
            }
            Base64.encodeToString(digest.digest(), Base64.NO_WRAP)
        }

        AsyncFunction("hashFiles") { paths: List<String> ->
            paths.map { path ->
                val file = java.io.File(path)
                val hash = if (!file.exists()) null else {
                    val digest = MessageDigest.getInstance("SHA-256")
                    file.inputStream().use { input ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            digest.update(buffer, 0, read)
                        }
                    }
                    Base64.encodeToString(digest.digest(), Base64.NO_WRAP)
                }
                mapOf("path" to path, "hash" to hash)
            }
        }
    }
}

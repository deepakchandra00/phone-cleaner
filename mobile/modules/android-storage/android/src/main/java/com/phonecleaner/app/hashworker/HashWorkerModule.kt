package com.phonecleaner.app.hashworker

import android.net.Uri
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream
import java.security.MessageDigest

/**
 * HashWorker — batched SHA-256 and perceptual difference hashing (dHash) on a background thread.
 * Supports both direct filesystem paths and content:// MediaStore URIs.
 * Uses the shared decoder with bounded dimensions and guaranteed bitmap cleanup.
 */
class HashWorkerModule : Module() {

    private fun getInputStream(path: String): InputStream? {
        return try {
            if (path.startsWith("content://")) {
                val ctx = appContext.reactContext ?: return null
                ctx.contentResolver.openInputStream(Uri.parse(path))
            } else {
                val cleanPath = if (path.startsWith("file://")) Uri.parse(path).path ?: return null else path
                val file = java.io.File(cleanPath)
                if (file.exists() && file.isFile) file.inputStream() else null
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

    /**
     * Computes a 64-bit difference hash (dHash) for an image.
     * Uses inJustDecodeBounds to pre-sample the image down to ~64px during decoding,
     * with a strict maximum decoded size and EXIF orientation normalization.
     */
    private fun computeDHash(path: String): String? = PhotoHasher.dHash { getInputStream(path) }

    override fun definition() = ModuleDefinition {
        Name("HashWorker")

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
}

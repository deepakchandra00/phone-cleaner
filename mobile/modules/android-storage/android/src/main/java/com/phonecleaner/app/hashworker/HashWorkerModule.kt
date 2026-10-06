package com.phonecleaner.app.hashworker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream
import java.security.MessageDigest

/**
 * HashWorker — batched SHA-256 and perceptual difference hashing (dHash) on a background thread.
 * Supports both direct filesystem paths and content:// MediaStore URIs.
 * Uses two-pass bounded decoding to ensure zero OOM crashes even on 100MP+ photos.
 */
class HashWorkerModule : Module() {

    private fun getInputStream(path: String): InputStream? {
        return try {
            if (path.startsWith("content://")) {
                val ctx = appContext.reactContext ?: return null
                ctx.contentResolver.openInputStream(Uri.parse(path))
            } else {
                val cleanPath = if (path.startsWith("file://")) path.removePrefix("file://") else path
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
     * reducing RAM consumption from ~100MB to ~20KB per high-resolution photo.
     */
    private fun computeDHash(path: String): String? {
        return try {
            // Pass 1: Decode dimensions only
            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            getInputStream(path)?.use { input ->
                BitmapFactory.decodeStream(input, null, boundsOptions)
            } ?: return null

            val origWidth = boundsOptions.outWidth
            val origHeight = boundsOptions.outHeight
            if (origWidth <= 0 || origHeight <= 0) return null

            // Determine downsample factor (target ~64px)
            var sampleSize = 1
            val targetSize = 64
            while ((origWidth / (sampleSize * 2)) >= targetSize && (origHeight / (sampleSize * 2)) >= targetSize) {
                sampleSize *= 2
            }

            // Pass 2: Decode memory-efficient thumbnail
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }
            val downsampled = getInputStream(path)?.use { input ->
                BitmapFactory.decodeStream(input, null, decodeOptions)
            } ?: return null

            // Scale down to exact 9 cols x 8 rows
            val scaledBitmap = Bitmap.createScaledBitmap(downsampled, 9, 8, true)
            if (scaledBitmap != downsampled) {
                downsampled.recycle()
            }

            var hash = 0L
            for (y in 0 until 8) {
                for (x in 0 until 8) {
                    val leftPixel = scaledBitmap.getPixel(x, y)
                    val rightPixel = scaledBitmap.getPixel(x + 1, y)

                    val leftLum = (0.299 * ((leftPixel shr 16) and 0xFF) +
                            0.587 * ((leftPixel shr 8) and 0xFF) +
                            0.114 * (leftPixel and 0xFF)).toInt()

                    val rightLum = (0.299 * ((rightPixel shr 16) and 0xFF) +
                            0.587 * ((rightPixel shr 8) and 0xFF) +
                            0.114 * (rightPixel and 0xFF)).toInt()

                    hash = (hash shl 1) or (if (leftLum > rightLum) 1L else 0L)
                }
            }
            scaledBitmap.recycle()

            String.format("%016x", hash)
        } catch (_: OutOfMemoryError) {
            System.gc()
            null
        } catch (_: Exception) {
            null
        }
    }

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

package com.rishi076.smartcare.hashworker

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import java.io.InputStream

/** Shared bounded decoder. Never intentionally decode a full-resolution photo. */
object PhotoHasher {
    const val VERSION = 2
    private const val MAX_SIDE = 128
    private const val MAX_BYTES = 512 * 512 * 4 // 1MB ceiling to accommodate driver row byte-alignment

    fun dHash(open: () -> InputStream?): String? {
        val owned = mutableListOf<Bitmap>()
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            val boundsStream = open() ?: return null
            // inJustDecodeBounds intentionally returns null; only the stream and dimensions indicate success.
            boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight).toLong() / sample > MAX_SIDE) sample *= 2
            val options = BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.RGB_565 }
            val decoded = open()?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
            owned.add(decoded)
            if (decoded.allocationByteCount > MAX_BYTES) return null
            val orientation = try {
                open()?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
                    ?: ExifInterface.ORIENTATION_NORMAL
            } catch (_: Exception) { ExifInterface.ORIENTATION_NORMAL }
            val matrix = Matrix().apply {
                when (orientation) {
                    ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
                    ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
                    ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
                    ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
                    ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(-90f); postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
                }
            }
            val upright = if (matrix.isIdentity) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
            if (upright !== decoded) owned.add(upright)
            val scaled = Bitmap.createScaledBitmap(upright, 9, 8, true)
            if (scaled !== upright) owned.add(scaled)
            var hash = 0L
            for (y in 0 until 8) for (x in 0 until 8) {
                fun luminance(pixel: Int): Int = (0.299 * ((pixel shr 16) and 255) + 0.587 * ((pixel shr 8) and 255) + 0.114 * (pixel and 255)).toInt()
                hash = (hash shl 1) or (if (luminance(scaled.getPixel(x,y)) > luminance(scaled.getPixel(x+1,y))) 1L else 0L)
            }
            java.lang.String.format(java.util.Locale.ROOT, "%016x", hash)
        } catch (_: OutOfMemoryError) { null }
          catch (_: Exception) { null }
        finally { for (bitmap in owned.asReversed()) if (!bitmap.isRecycled) bitmap.recycle() }
    }
}

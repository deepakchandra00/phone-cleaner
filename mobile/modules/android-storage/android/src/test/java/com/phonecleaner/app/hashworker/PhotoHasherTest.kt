package com.phonecleaner.app.hashworker

import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PhotoHasherTest {
    private fun image(width: Int, height: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
        for (y in 0 until height) for (x in 0 until width) {
            val value = (x * 17 + y * 23) % 256
            bitmap.setPixel(x,y,0xff000000.toInt() or (value shl 16) or (value shl 8) or value)
        }
        return bitmap
    }
    private fun jpeg(bitmap: Bitmap): ByteArray {
        val out = ByteArrayOutputStream()
        assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG,100,out))
        return out.toByteArray()
    }
    @Test fun validPhotoProducesAHashDespiteNullBoundsBitmap() {
        val bitmap=image(320,240)
        try {
            val data=jpeg(bitmap)
            val hash=PhotoHasher.dHash { ByteArrayInputStream(data) }
            assertNotNull("Bounds-only decoding returns no bitmap but valid dimensions must continue to hashing",hash)
            assertTrue(hash!!.matches(Regex("[0-9a-f]{16}")))
        } finally { bitmap.recycle() }
    }
    @Test fun extremeAspectRatioIsSampledAndInvalidInputsCloseTheirStreams() {
        val bitmap=image(4096,32)
        try { val data=jpeg(bitmap); assertNotNull(PhotoHasher.dHash { ByteArrayInputStream(data) }) }
        finally { bitmap.recycle() }
        var closes=0
        assertNull(PhotoHasher.dHash { object:ByteArrayInputStream(byteArrayOf(1,2,3)) {
            override fun close() { closes++; super.close() }
        } })
        assertEquals(1,closes)
        assertNull(PhotoHasher.dHash { null })
    }
    @Test fun exifRotationMatchesUprightContent() {
        val upright=image(96,64)
        val rotated=Bitmap.createBitmap(upright,0,0,upright.width,upright.height,Matrix().apply { setRotate(90f) },true)
        val file=File.createTempFile("phone-cleaner-rotation-", ".jpg")
        try {
            val data=jpeg(upright)
            val expected=PhotoHasher.dHash { ByteArrayInputStream(data) }!!
            file.writeBytes(jpeg(rotated))
            ExifInterface(file).apply { setAttribute(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_ROTATE_270.toString()); saveAttributes() }
            val actual=PhotoHasher.dHash { file.inputStream() }!!
            val distance=expected.indices.sumOf { Integer.bitCount(expected[it].digitToInt(16) xor actual[it].digitToInt(16)) }
            assertTrue("Orientation-normalized visual hashes should match",distance<=8)
        } finally { upright.recycle(); rotated.recycle(); file.delete() }
    }
}

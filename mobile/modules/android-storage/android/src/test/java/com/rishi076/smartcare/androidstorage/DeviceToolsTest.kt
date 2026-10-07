package com.rishi076.smartcare.androidstorage

import android.graphics.Bitmap
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DeviceToolsTest {
    @Test fun compressionCreatesBoundedSeparateCopyWithoutChangingOriginalOrKeepingGps() {
        val ctx = RuntimeEnvironment.getApplication()
        val file = File.createTempFile("original-", ".jpg",ctx.cacheDir)
        val bitmap = Bitmap.createBitmap(1600,1200,Bitmap.Config.ARGB_8888)
        val random = java.util.Random(42)
        for (y in 0 until bitmap.height) for (x in 0 until bitmap.width) bitmap.setPixel(x,y,0xff000000.toInt() or random.nextInt(0xffffff))
        var copy: File? = null
        try {
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG,100,it) }
            ExifInterface(file).apply { setAttribute(ExifInterface.TAG_ORIENTATION,"6");setLatLong(1.0,2.0);saveAttributes() }
            val before = MessageDigest.getInstance("SHA-256").digest(file.readBytes())
            val result = DeviceTools.compress(ctx,Uri.fromFile(file).toString(),60,1280)
            copy = File(Uri.parse(result["uri"] as String).path!!)
            assertTrue(copy!!.exists())
            assertNotEquals(file.absolutePath,copy!!.absolutePath)
            assertTrue((result["width"] as Int) <= 1280 && (result["height"] as Int) <= 1280)
            assertTrue(copy!!.length() < file.length())
            assertEquals(file.length(),result["originalBytes"])
            assertArrayEquals(before,MessageDigest.getInstance("SHA-256").digest(file.readBytes()))
            assertNull(ExifInterface(copy!!).getAttribute(ExifInterface.TAG_GPS_LATITUDE))
            assertFalse(DeviceTools.discardDraft(ctx,Uri.fromFile(file).toString()))
            assertTrue(file.exists())
            assertTrue(DeviceTools.discardDraft(ctx,Uri.fromFile(copy).toString()))
            assertFalse(copy!!.exists())
        } finally { bitmap.recycle();file.delete();copy?.delete() }
    }
    @Test fun invalidPhotoAndSettingsDoNotLeavePreparedFiles() {
        val ctx=RuntimeEnvironment.getApplication()
        val source=File.createTempFile("invalid-", ".jpg",ctx.cacheDir).apply { writeText("invalid") }
        val directory=File(ctx.cacheDir,"photo-compression")
        val before=directory.list()?.size ?: 0
        try {
            assertThrows(IllegalArgumentException::class.java) { DeviceTools.compress(ctx,Uri.fromFile(source).toString(),80,1280) }
            assertThrows(IllegalArgumentException::class.java) { DeviceTools.compress(ctx,Uri.fromFile(source).toString(),1,1280) }
            assertEquals(before,directory.list()?.size ?: 0)
            assertEquals("invalid",source.readText())
        } finally {source.delete()}
    }
}

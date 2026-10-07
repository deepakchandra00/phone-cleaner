package com.rishi076.smartcare.androidstorage

import android.service.notification.NotificationListenerService

/** No notification content is persisted or uploaded. Operations are user initiated. */
class CleanerNotificationListener : NotificationListenerService() {
    companion object {
        @Volatile var connected: CleanerNotificationListener? = null
            private set
    }
    override fun onListenerConnected() { connected = this }
    override fun onListenerDisconnected() { if (connected === this) connected = null }
    override fun onDestroy() { if (connected === this) connected = null; super.onDestroy() }
    fun packages(): List<Map<String, Any>> = (activeNotifications ?: emptyArray())
        .filter { it.isClearable }.groupBy { it.packageName }.map { (pkg, notifications) ->
            val label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }
            mapOf("packageName" to pkg, "label" to label, "count" to notifications.size)
        }.sortedBy { it["label"].toString() }
    fun dismissSelected(packages: Set<String>): Int {
        val keys = activeNotifications?.filter { it.isClearable && it.packageName in packages }?.map { it.key }?.toTypedArray() ?: emptyArray()
        if (keys.isNotEmpty()) cancelNotifications(keys)
        return keys.size
    }
    fun clearableCount(): Int = activeNotifications?.count { it.isClearable } ?: 0
    fun dismissClearable(): Int {
        val keys = activeNotifications?.filter { it.isClearable }?.map { it.key }?.toTypedArray() ?: emptyArray()
        if (keys.isNotEmpty()) cancelNotifications(keys)
        return keys.size // Requests submitted; the system confirms removal asynchronously.
    }
}

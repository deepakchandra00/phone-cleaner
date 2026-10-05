package com.phonecleaner.app.safbridge

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * SAFBridge — wraps Android's Storage Access Framework for WhatsApp media
 * and arbitrary user-selected folders.
 *
 * Exposed methods:
 *   requestTreeUri() → opens ACTION_OPEN_DOCUMENT_TREE, persists permission
 *   listFiles(treeUri, folderPath) → FileEntry[]
 *   deleteDocument(treeUri, documentUri) → Boolean
 *
 * Used by the WhatsApp Cleaner and the file scanner for any path outside
 * MediaStore (e.g. /Android/media/com.whatsapp/).
 */
class SAFBridgeModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SAFBridge")

        AsyncFunction("listFiles") { treeUri: String, folderPath: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            val uri = Uri.parse(treeUri)
            val root = DocumentFile.fromTreeUri(ctx, uri) ?: return@AsyncFunction emptyList<Map<String, Any>>()
            val target = if (folderPath.isEmpty()) root else navigate(root, folderPath)
                ?: return@AsyncFunction emptyList<Map<String, Any>>()

            target.listFiles().map { doc ->
                mapOf(
                    "uri" to doc.uri.toString(),
                    "name" to (doc.name ?: ""),
                    "sizeBytes" to doc.length(),
                    "isDirectory" to doc.isDirectory,
                    "lastModified" to doc.lastModified(),
                    "mimeType" to (doc.type ?: "*/*"),
                )
            }
        }

        AsyncFunction("deleteDocument") { documentUri: String ->
            val ctx = appContext.reactContext ?: return@AsyncFunction false
            val uri = Uri.parse(documentUri)
            val deleted = DocumentsContract.deleteDocument(
                ctx.contentResolver,
                uri,
            )
            deleted
        }
    }

    private fun navigate(root: DocumentFile, path: String): DocumentFile? {
        var current = root
        for (segment in path.split("/").filter { it.isNotEmpty() }) {
            current = current.findFile(segment) ?: return null
        }
        return current
    }
}

import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { AndroidStorage, SAFBridge } from "android-storage";
import { StorageIndexService } from "@/db/StorageIndexService";
import type { StorageItem, DeleteStrategy } from "@/db/schema";

export interface DeleteResult {
  requestedCount: number;
  deletedCount: number;
  freedBytes: number;
  failedCount: number;
  permissionBlockedCount: number;
  failedItems?: StorageItem[];
  missingPermission?: "manage_external_storage" | "media_library" | "saf" | null;
}

type DeleteListener = (deletedIds: string[]) => void;

class DeleteCoordinatorImpl {
  private listeners = new Set<DeleteListener>();

  public addListener(listener: DeleteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(deletedIds: string[]): void {
    for (const listener of this.listeners) {
      try {
        listener(deletedIds);
      } catch (err) {
        console.warn("[DeleteCoordinator] Listener error:", err);
      }
    }
  }

  /**
   * Deletes a single storage item from the real Android storage,
   * then purges it from the SQLite index upon confirmation.
   */
  public async deleteItem(item: StorageItem): Promise<boolean> {
    const res = await this.deleteMany([item.id]);
    return res.deletedCount > 0;
  }

  /**
   * Batch deletes multiple items by IDs.
   *
   * Key design change: trusts the native layer's own deletion result
   * (deletedPaths / failedPaths returned by deleteNativeFiles) instead of
   * calling StorageVerifier immediately after deletion. The verifier was
   * always returning "still exists" because Android's MediaStore and the
   * filesystem both take a moment to flush after a delete — causing 0 freed
   * bytes every time even when files were actually removed.
   */
  public async deleteMany(ids: string[]): Promise<DeleteResult> {
    if (ids.length === 0) {
      return { requestedCount: 0, deletedCount: 0, freedBytes: 0, failedCount: 0, permissionBlockedCount: 0 };
    }

    const items = StorageIndexService.getItemsByIds(ids);
    if (items.length === 0) {
      // Records already removed from DB — treat as already deleted
      StorageIndexService.deleteItemsByIds(ids);
      this.notify(ids);
      return { requestedCount: ids.length, deletedCount: ids.length, freedBytes: 0, failedCount: 0, permissionBlockedCount: 0 };
    }

    const hasManagerAccess = AndroidStorage.isExternalStorageManager();

    // Bins for routing each item to its best deletion strategy
    const nativePaths: string[] = [];       // deleteNativeFiles (own cache + MANAGE_EXTERNAL paths)
    const nativeItems: StorageItem[] = [];
    const mediaStoreIds: string[] = [];     // MediaLibrary.deleteAssetsAsync (media with consent dialog)
    const mediaStoreItems: StorageItem[] = [];
    const safItems: StorageItem[] = [];     // SAFBridge.deleteDocument
    const unsupportedItems: StorageItem[] = [];

    for (const item of items) {
      const isExternalPath = Boolean(
        item.path && (item.path.startsWith("/storage/") || item.path.startsWith("/sdcard/"))
      );
      const hasPath = Boolean(item.path);

      // With MANAGE_EXTERNAL_STORAGE + a real path → direct native delete (fastest)
      if (hasManagerAccess && hasPath && isExternalPath && item.source !== "saf") {
        nativePaths.push(item.path!);
        nativeItems.push(item);
        continue;
      }

      const strategy: DeleteStrategy =
        item.deleteStrategy ||
        (item.junkType === "empty_folder"
          ? "manage_external_storage"
          : item.source === "media_store"
          ? "media_store"
          : item.source === "saf"
          ? "document_uri"
          : isExternalPath
          ? "media_store" // external without manager access → MediaStore consent dialog
          : "filesystem");

      switch (strategy) {
        case "media_store": {
          // Normalize WhatsApp IDs which are prefixed with "wa_"
          const normalId =
            item.id.startsWith("wa_") && !isNaN(Number(item.id.slice(3)))
              ? item.id.slice(3)
              : item.id;
          mediaStoreIds.push(normalId);
          mediaStoreItems.push(item);
          break;
        }
        case "document_uri":
          safItems.push(item);
          break;
        case "filesystem":
          nativePaths.push(hasPath ? item.path! : item.uri);
          nativeItems.push(item);
          break;
        case "manage_external_storage":
          nativePaths.push(hasPath ? item.path! : item.uri);
          nativeItems.push(item);
          break;
        case "unsupported":
        default:
          unsupportedItems.push(item);
          break;
      }
    }

    let missingPermission: "manage_external_storage" | "media_library" | "saf" | null = null;
    let permissionBlockedCount = unsupportedItems.length;

    const confirmedDeletedIds = new Set<string>();
    const confirmedDeletedBytes = new Map<string, number>();

    // ── 1. Native filesystem delete ─────────────────────────────────────────
    // deleteNativeFiles: tries file.delete() → ContentResolver fallback → returns
    // { deletedPaths, failedPaths, deletedCount, freedBytes }
    if (nativePaths.length > 0) {
      try {
        const nativeResult = await AndroidStorage.deleteNativeFiles(nativePaths) as {
          deletedPaths?: string[];
          failedPaths?: string[];
          deletedCount: number;
          freedBytes: number;
        };

        const deletedPathSet = new Set<string>(nativeResult.deletedPaths ?? []);
        const hasStructuredResult = Boolean(nativeResult.deletedPaths);

        for (const item of nativeItems) {
          const itemPath = item.path || item.uri;
          const normalizedPath = itemPath.replace("file://", "");

          const wasDeleted = hasStructuredResult
            ? deletedPathSet.has(itemPath) ||
              deletedPathSet.has(normalizedPath) ||
              deletedPathSet.has(`file://${normalizedPath}`)
            : // Older native API didn't return deletedPaths — trust deletedCount > 0
              nativeResult.deletedCount > 0 &&
              !(nativeResult.failedPaths?.includes(itemPath) || nativeResult.failedPaths?.includes(normalizedPath));

          if (wasDeleted) {
            confirmedDeletedIds.add(item.id);
            confirmedDeletedBytes.set(item.id, item.sizeBytes);
          } else {
            permissionBlockedCount++;
            if (!hasManagerAccess) missingPermission = "manage_external_storage";
          }
        }
      } catch (err) {
        console.warn("[DeleteCoordinator] Native filesystem delete error:", err);
        // Fallback: FileSystem.deleteAsync for each item individually
        for (const item of nativeItems) {
          try {
            const target = item.path || item.uri;
            const fileUri = target.startsWith("/") ? `file://${target}` : target;
            await FileSystem.deleteAsync(fileUri, { idempotent: true });
            confirmedDeletedIds.add(item.id);
            confirmedDeletedBytes.set(item.id, item.sizeBytes);
          } catch {
            permissionBlockedCount++;
            if (!hasManagerAccess) missingPermission = "manage_external_storage";
          }
        }
      }
    }

    // ── 2. MediaStore batch delete ──────────────────────────────────────────
    // Shows Android's system delete consent dialog for media gallery items.
    // This is the correct path for photos/videos without MANAGE_EXTERNAL_STORAGE.
    if (mediaStoreIds.length > 0) {
      try {
        const ok = await MediaLibrary.deleteAssetsAsync(mediaStoreIds);
        if (ok) {
          for (const item of mediaStoreItems) {
            confirmedDeletedIds.add(item.id);
            confirmedDeletedBytes.set(item.id, item.sizeBytes);
          }
        } else {
          permissionBlockedCount += mediaStoreItems.length;
          missingPermission = "media_library";
        }
      } catch (err) {
        console.warn("[DeleteCoordinator] MediaLibrary delete error:", err);
        permissionBlockedCount += mediaStoreItems.length;
        missingPermission = "media_library";
      }
    }

    // ── 3. Storage Access Framework ─────────────────────────────────────────
    for (const item of safItems) {
      try {
        const ok = await SAFBridge.deleteDocument(item.uri);
        if (ok) {
          confirmedDeletedIds.add(item.id);
          confirmedDeletedBytes.set(item.id, item.sizeBytes);
        } else {
          permissionBlockedCount++;
          missingPermission = "saf";
        }
      } catch {
        permissionBlockedCount++;
        missingPermission = "saf";
      }
    }

    // ── 4. Finalize ─────────────────────────────────────────────────────────
    let freedBytes = 0;
    for (const id of confirmedDeletedIds) {
      freedBytes += confirmedDeletedBytes.get(id) ?? 0;
    }

    const confirmedArr = Array.from(confirmedDeletedIds);
    const failedCount = items.length - confirmedDeletedIds.size;

    if (confirmedArr.length > 0) {
      StorageIndexService.deleteItemsByIds(confirmedArr);
      this.notify(confirmedArr);
    }

    const effectiveMissingPermission =
      failedCount > 0 && !hasManagerAccess ? "manage_external_storage" : missingPermission;

    return {
      requestedCount: items.length,
      deletedCount: confirmedArr.length,
      freedBytes,
      failedCount,
      permissionBlockedCount: failedCount > 0 && !hasManagerAccess ? failedCount : permissionBlockedCount,
      failedItems: items.filter((i) => !confirmedDeletedIds.has(i.id)),
      missingPermission: effectiveMissingPermission,
    };
  }
}

export const DeleteCoordinator = new DeleteCoordinatorImpl();

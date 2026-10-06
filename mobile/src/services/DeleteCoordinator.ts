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

// In-memory item index: populated from scan result so DeleteCoordinator can
// delete items even when SQLite is cleared between scans (which happens at
// every scan to keep the DB fresh).
const inMemoryItemIndex = new Map<string, StorageItem>();

/** Register items from the scan result so deletion works even after SQLite clear. */
export function registerItemsForDeletion(items: StorageItem[]): void {
  for (const item of items) {
    inMemoryItemIndex.set(item.id, item);
  }
}

/** Clear the in-memory index when starting a fresh scan. */
export function clearDeletionIndex(): void {
  inMemoryItemIndex.clear();
}

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
   * Resolves StorageItem records for a list of IDs.
   * First queries SQLite; fills missing entries from the in-memory index
   * (populated from the last scan result). This ensures deletion works
   * even when SQLite was cleared at the start of the scan.
   */
  private resolveItems(ids: string[]): StorageItem[] {
    const sqliteItems = StorageIndexService.getItemsByIds(ids);
    if (sqliteItems.length === ids.length) return sqliteItems;

    const found = new Map<string, StorageItem>();
    for (const item of sqliteItems) found.set(item.id, item);

    for (const id of ids) {
      if (!found.has(id)) {
        const memItem = inMemoryItemIndex.get(id);
        if (memItem) found.set(id, memItem);
      }
    }

    return Array.from(found.values());
  }

  public async deleteItem(item: StorageItem): Promise<boolean> {
    const res = await this.deleteMany([item.id]);
    return res.deletedCount > 0;
  }

  /**
   * Batch deletes multiple items by IDs.
   *
   * Routing logic:
   *  - MANAGE_EXTERNAL_STORAGE + real path → deleteNativeFiles (fastest, most reliable)
   *  - media_store source / content:// URI → MediaLibrary.deleteAssetsAsync (system consent)
   *  - SAF source → SAFBridge.deleteDocument
   *  - internal/filesystem → deleteNativeFiles
   *
   * Trusts native return value (deletedPaths/failedPaths) rather than re-checking
   * file.exists() which fails due to Android async FS/MediaStore flush.
   */
  public async deleteMany(ids: string[]): Promise<DeleteResult> {
    if (ids.length === 0) {
      return { requestedCount: 0, deletedCount: 0, freedBytes: 0, failedCount: 0, permissionBlockedCount: 0 };
    }

    const items = this.resolveItems(ids);

    if (items.length === 0) {
      console.warn("[DeleteCoordinator] No items found in SQLite or memory index for IDs:", ids.slice(0, 5));
      return {
        requestedCount: ids.length,
        deletedCount: 0,
        freedBytes: 0,
        failedCount: ids.length,
        permissionBlockedCount: 0,
        missingPermission: null,
      };
    }

    const hasManagerAccess = AndroidStorage.isExternalStorageManager();

    const nativePaths: string[] = [];
    const nativeItems: StorageItem[] = [];
    const mediaStoreIds: string[] = [];
    const mediaStoreItems: StorageItem[] = [];
    const safItems: StorageItem[] = [];
    const unsupportedItems: StorageItem[] = [];

    for (const item of items) {
      const isExternalPath = Boolean(
        item.path && (item.path.startsWith("/storage/") || item.path.startsWith("/sdcard/"))
      );
      const hasPath = Boolean(item.path);

      // With full storage manager access and a real path, use native delete (fastest)
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
          ? "media_store"
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

    // ── 1. Native filesystem delete ───────────────────────────────────────
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
            : nativeResult.deletedCount > 0 &&
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
        console.warn("[DeleteCoordinator] Native delete error:", err);
        // Per-item FileSystem.deleteAsync fallback
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

    // ── 2. MediaStore batch delete (system consent dialog) ────────────────
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

    // ── 3. Storage Access Framework ───────────────────────────────────────
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

    // ── 4. Finalize ───────────────────────────────────────────────────────
    let freedBytes = 0;
    for (const id of confirmedDeletedIds) {
      freedBytes += confirmedDeletedBytes.get(id) ?? 0;
    }

    const confirmedArr = Array.from(confirmedDeletedIds);
    const failedCount = items.length - confirmedDeletedIds.size;

    if (confirmedArr.length > 0) {
      StorageIndexService.deleteItemsByIds(confirmedArr);
      for (const id of confirmedArr) inMemoryItemIndex.delete(id);
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

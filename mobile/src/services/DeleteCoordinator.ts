import { fileIdentity, uniqueFiles } from "@/lib/fileIdentity.ts";
import { withStorageOperation } from "@/lib/storageOperation";
import { StorageIndexService } from "@/db/StorageIndexService";
import type { DeleteStrategy, StorageItem } from "@/db/schema";
import { AndroidStorage, SAFBridge } from "android-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";

export interface DeleteResult {
  requestedCount: number;
  deletedCount: number;
  freedBytes: number;
  failedCount: number;
  permissionBlockedCount: number;
  failedItems?: StorageItem[];
  missingPermission?:
    "manage_external_storage" | "media_library" | "saf" | null;
}

const uniqueIds = (items: StorageItem[]) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
];

type DeleteListener = (
  deletedIds: string[],
  deletedItems: StorageItem[],
) => void;

class DeleteCoordinatorImpl {
  private deleting = false;
  private listeners = new Set<DeleteListener>();

  public addListener(listener: DeleteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(deletedIds: string[], deletedItems: StorageItem[]): void {
    for (const listener of this.listeners) {
      try {
        listener(deletedIds, deletedItems);
      } catch (err) {
        console.warn("[DeleteCoordinator] Listener error:", err);
      }
    }
  }

  // The atomically committed SQLite index is the sole source of deletion targets.
  // Scan/cleanup locking prevents replacing it during a deletion.
  private resolveItems(ids: string[]): StorageItem[] {
    return StorageIndexService.getItemsByIds(ids);
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
    if (this.deleting) throw new Error("Cleanup is already in progress.");
    this.deleting = true;
    try {
      return await withStorageOperation("cleanup", () =>
        this.performDelete(ids),
      );
    } finally {
      this.deleting = false;
    }
  }

  private async performDelete(ids: string[]): Promise<DeleteResult> {
    if (ids.length === 0) {
      return {
        requestedCount: 0,
        deletedCount: 0,
        freedBytes: 0,
        failedCount: 0,
        permissionBlockedCount: 0,
      };
    }

    ids = [...new Set(ids)];
    const resolvedItems = this.resolveItems(ids);
    const items = uniqueFiles(resolvedItems);
    const unresolvedCount = ids.length - resolvedItems.length;

    if (items.length === 0) {
      console.warn(
        "[DeleteCoordinator] No items found in SQLite or memory index for IDs:",
        ids.slice(0, 5),
      );
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
      if (!item.canDelete) {
        unsupportedItems.push(item);
        continue;
      }
      const isExternalPath = Boolean(
        item.path &&
        (item.path.startsWith("/storage/") || item.path.startsWith("/sdcard/")),
      );
      const hasPath = Boolean(item.path);

      // With full storage manager access and a real path, use native delete (fastest)
      if (
        hasManagerAccess &&
        hasPath &&
        isExternalPath &&
        item.source !== "saf"
      ) {
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

    let missingPermission:
      "manage_external_storage" | "media_library" | "saf" | null = null;
    let permissionBlockedCount = unsupportedItems.length;
    const confirmedDeletedIds = new Set<string>();
    const confirmedDeletedBytes = new Map<string, number>();

    // ── 1. Native filesystem delete ───────────────────────────────────────
    if (nativePaths.length > 0) {
      try {
        const nativeResult = (await AndroidStorage.deleteNativeFiles(
          nativePaths,
        )) as {
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
            : false;

          if (wasDeleted) {
            confirmedDeletedIds.add(item.id);
            confirmedDeletedBytes.set(item.id, item.sizeBytes);
          } else {
            permissionBlockedCount++;
            if (!hasManagerAccess)
              missingPermission = "manage_external_storage";
          }
        }
      } catch (err) {
        console.warn("[DeleteCoordinator] Native delete error:", err);
        // Per-item FileSystem.deleteAsync fallback
        for (const item of nativeItems) {
          try {
            const target = item.path || item.uri;
            const fileUri = target.startsWith("/")
              ? `file://${target}`
              : target;
            const before = await FileSystem.getInfoAsync(fileUri);
            if (!before.exists) continue;
            await FileSystem.deleteAsync(fileUri, { idempotent: false });
            const after = await FileSystem.getInfoAsync(fileUri);
            if (!after.exists) {
              confirmedDeletedIds.add(item.id);
              confirmedDeletedBytes.set(item.id, item.sizeBytes);
            }
          } catch {
            permissionBlockedCount++;
            if (!hasManagerAccess)
              missingPermission = "manage_external_storage";
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
    const failedCount =
      items.length + unresolvedCount - confirmedDeletedIds.size;

    if (confirmedArr.length > 0) {
      const identities = new Set(
        items
          .filter((item) => confirmedDeletedIds.has(item.id))
          .map(fileIdentity),
      );
      const aliases = StorageIndexService.getItemsByTargets([...identities]);
      const deletedRecords = uniqueIds([
        ...items.filter((item) => confirmedDeletedIds.has(item.id)),
        ...aliases,
      ]);
      const allDeletedIds = deletedRecords.map((item) => item.id);
      try {
        await StorageIndexService.deleteItemsByIds(allDeletedIds);
      } catch (error) {
        // Files were already confirmed deleted: retain that truth if the index fails.
        console.warn(
          "[DeleteCoordinator] Deleted files could not be reconciled in the index; rescan required",
          error,
        );
      }
      this.notify(allDeletedIds, deletedRecords);
    }

    const effectiveMissingPermission =
      failedCount > 0 && !hasManagerAccess
        ? "manage_external_storage"
        : missingPermission;

    return {
      requestedCount: items.length + unresolvedCount,
      deletedCount: confirmedArr.length,
      freedBytes,
      failedCount,
      permissionBlockedCount:
        failedCount > 0 && !hasManagerAccess
          ? failedCount
          : permissionBlockedCount,
      failedItems: items.filter((i) => !confirmedDeletedIds.has(i.id)),
      missingPermission: effectiveMissingPermission,
    };
  }
}

export const DeleteCoordinator = new DeleteCoordinatorImpl();

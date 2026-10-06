import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { AndroidStorage, SAFBridge } from "android-storage";
import { StorageIndexService } from "@/db/StorageIndexService";
import type { StorageItem } from "@/db/schema";

export interface DeleteResult {
  deletedCount: number;
  freedBytes: number;
  failedCount: number;
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
   * then purges it from the SQLite index.
   */
  public async deleteItem(item: StorageItem): Promise<boolean> {
    const res = await this.deleteMany([item.id]);
    return res.deletedCount > 0;
  }

  /**
   * Batch deletes multiple items by IDs. Dispatches each item to the appropriate
   * Android OS deletion API based on provenance (MediaStore vs. Native FileSystem).
   */
  public async deleteMany(ids: string[]): Promise<DeleteResult> {
    if (ids.length === 0) {
      return { deletedCount: 0, freedBytes: 0, failedCount: 0 };
    }

    const items = StorageIndexService.getItemsByIds(ids);
    if (items.length === 0) {
      // Just delete from DB if they don't exist
      StorageIndexService.deleteItemsByIds(ids);
      this.notify(ids);
      return { deletedCount: ids.length, freedBytes: 0, failedCount: 0 };
    }

    const mediaStoreIds: string[] = [];
    const filesystemPaths: string[] = [];
    const safUris: string[] = [];
    const otherUris: string[] = [];

    const deletedIds: string[] = [];
    let freedBytes = 0;
    let failedCount = 0;

    for (const item of items) {
      if (item.source === "media_store") {
        mediaStoreIds.push(item.id);
      } else if (item.source === "saf") {
        safUris.push(item.uri);
      } else if (item.path) {
        filesystemPaths.push(item.path);
      } else {
        otherUris.push(item.uri);
      }
    }

    // 1. Delete MediaStore assets via Android ContentResolver
    if (mediaStoreIds.length > 0) {
      try {
        const ok = await MediaLibrary.deleteAssetsAsync(mediaStoreIds);
        if (ok) {
          for (const item of items.filter((i) => mediaStoreIds.includes(i.id))) {
            deletedIds.push(item.id);
            freedBytes += item.sizeBytes;
          }
        } else {
          failedCount += mediaStoreIds.length;
        }
      } catch (err) {
        console.warn("[DeleteCoordinator] MediaLibrary delete error:", err);
        // Fallback: try deleting via native filesystem unlinker if path is present
        for (const item of items.filter((i) => mediaStoreIds.includes(i.id))) {
          if (item.path) {
            filesystemPaths.push(item.path);
          } else {
            failedCount++;
          }
        }
      }
    }

    // 2. Delete filesystem and WhatsApp files via fast native unlinker
    if (filesystemPaths.length > 0) {
      try {
        const nativeRes = await AndroidStorage.deleteNativeFiles(filesystemPaths);
        const deletedSet = new Set(nativeRes.deletedPaths);
        for (const item of items.filter((i) => i.path && filesystemPaths.includes(i.path))) {
          if (item.path && deletedSet.has(item.path)) {
            deletedIds.push(item.id);
            freedBytes += item.sizeBytes;
          } else {
            failedCount++;
          }
        }
      } catch (err) {
        console.warn("[DeleteCoordinator] Native filesystem delete error:", err);
        failedCount += filesystemPaths.length;
      }
    }

    // 3. Delete SAF documents
    for (const uri of safUris) {
      try {
        const ok = await SAFBridge.deleteDocument(uri);
        const item = items.find((i) => i.uri === uri);
        if (ok && item) {
          deletedIds.push(item.id);
          freedBytes += item.sizeBytes;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    // 4. Delete fallback file URIs
    for (const uri of otherUris) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        const item = items.find((i) => i.uri === uri);
        if (item) {
          deletedIds.push(item.id);
          freedBytes += item.sizeBytes;
        }
      } catch {
        failedCount++;
      }
    }

    // Purge deleted records from SQLite
    if (deletedIds.length > 0) {
      StorageIndexService.deleteItemsByIds(deletedIds);
      this.notify(deletedIds);
    }

    return {
      deletedCount: deletedIds.length,
      freedBytes,
      failedCount,
    };
  }
}

export const DeleteCoordinator = new DeleteCoordinatorImpl();

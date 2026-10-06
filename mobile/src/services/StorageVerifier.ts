import * as FileSystem from "expo-file-system/legacy";
import { AndroidStorage } from "android-storage";
import type { StorageItem } from "@/db/schema";

export class StorageVerifier {
  /**
   * Checks if a single file path or URI physically exists on the device.
   */
  static async exists(uriOrPath: string): Promise<boolean> {
    if (!uriOrPath) return false;
    try {
      const nativeCheck = await AndroidStorage.verifyFilesExistence([uriOrPath]);
      if (typeof nativeCheck[uriOrPath] === "boolean") {
        return nativeCheck[uriOrPath];
      }
    } catch {
      // Fallback below
    }

    try {
      const info = await FileSystem.getInfoAsync(uriOrPath);
      return info.exists;
    } catch {
      return false;
    }
  }

  /**
   * Verifies an array of items after a deletion attempt.
   * Returns:
   * - confirmedDeletedIds: items that no longer physically exist.
   * - remainingIds: items that still physically exist on disk (deletion failed/blocked).
   */
  static async verifyDeleted(items: StorageItem[]): Promise<{
    confirmedDeletedIds: string[];
    remainingIds: string[];
  }> {
    if (items.length === 0) {
      return { confirmedDeletedIds: [], remainingIds: [] };
    }

    const confirmedDeletedIds: string[] = [];
    const remainingIds: string[] = [];

    const targetMap = new Map<string, StorageItem>();
    const targets: string[] = [];

    for (const item of items) {
      const target = item.path || item.uri;
      if (target) {
        targets.push(target);
        targetMap.set(target, item);
      } else {
        confirmedDeletedIds.push(item.id);
      }
    }

    let existenceMap: Record<string, boolean> = {};
    try {
      existenceMap = await AndroidStorage.verifyFilesExistence(targets);
    } catch {
      existenceMap = {};
    }

    for (const [target, item] of targetMap.entries()) {
      let isStillHere = existenceMap[target];
      if (isStillHere === undefined) {
        try {
          const info = await FileSystem.getInfoAsync(target);
          isStillHere = info.exists;
        } catch {
          isStillHere = false;
        }
      }

      if (isStillHere) {
        remainingIds.push(item.id);
      } else {
        confirmedDeletedIds.push(item.id);
      }
    }

    return { confirmedDeletedIds, remainingIds };
  }
}

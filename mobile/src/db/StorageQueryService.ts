import { isSafeToCleanAutomatically } from "@/lib/safety";
import {
  StorageIndexService,
  type StorageQueryParams,
  type StorageQueryResult,
} from "./StorageIndexService";
import type { StorageItem, WhatsAppType } from "./schema";

/**
 * Canonical Query Service exposing domain queries over the SQLite Storage Index.
 */
export class StorageQueryService {
  public static getItems(params: StorageQueryParams): StorageQueryResult {
    return StorageIndexService.getItems(params);
  }

  public static getItemById(id: string): StorageItem | null {
    return StorageIndexService.getItemById(id);
  }

  public static getItemsByIds(ids: string[]): StorageItem[] {
    return StorageIndexService.getItemsByIds(ids);
  }

  public static getPhotos(
    limit = 100,
    offset = 0,
    sortBy: StorageQueryParams["sortBy"] = "size_desc",
  ): StorageQueryResult {
    return StorageIndexService.getItems({
      category: "photos",
      limit,
      offset,
      sortBy,
    });
  }

  public static getVideos(
    limit = 100,
    offset = 0,
    sortBy: StorageQueryParams["sortBy"] = "size_desc",
  ): StorageQueryResult {
    return StorageIndexService.getItems({
      category: "videos",
      limit,
      offset,
      sortBy,
    });
  }

  public static getLargeFiles(
    limit = 100,
    offset = 0,
    sortBy: StorageQueryParams["sortBy"] = "size_desc",
  ): StorageQueryResult {
    return StorageIndexService.getItems({
      isLarge: true,
      limit,
      offset,
      sortBy,
    });
  }

  public static getDownloads(
    limit = 100,
    offset = 0,
    sortBy: StorageQueryParams["sortBy"] = "date_desc",
  ): StorageQueryResult {
    return StorageIndexService.getItems({
      category: "downloads",
      limit,
      offset,
      sortBy,
    });
  }

  public static getWhatsAppFiles(
    whatsappType?: WhatsAppType,
    limit = 100,
    offset = 0,
    sortBy: StorageQueryParams["sortBy"] = "size_desc",
  ): StorageQueryResult {
    return StorageIndexService.getItems({
      source: "whatsapp",
      whatsappType,
      limit,
      offset,
      sortBy,
    });
  }

  public static getJunkFiles(
    limit = 100,
    offset = 0,
    sortBy: StorageQueryParams["sortBy"] = "size_desc",
  ): StorageQueryResult {
    return StorageIndexService.getItems({
      isJunk: true,
      limit,
      offset,
      sortBy,
    });
  }

  /**
   * Retrieves verified Smart Clean candidates:
   * Safe temporary caches, WhatsApp Sent duplicates, and obsolete APK installers.
   */
  public static getSmartCleanCandidates(limit = 300): StorageItem[] {
    const junk = StorageIndexService.getItems({ isJunk: true, limit });
    const waSent = StorageIndexService.getItems({ isSent: true, limit });
    const apks = StorageIndexService.getItems({ category: "apks", limit });

    const seen = new Set<string>();
    const candidates: StorageItem[] = [];

    for (const item of [...junk.items, ...waSent.items, ...apks.items]) {
      if (!seen.has(item.id) && isSafeToCleanAutomatically(item)) {
        seen.add(item.id);
        candidates.push(item);
      }
    }

    return candidates;
  }
}

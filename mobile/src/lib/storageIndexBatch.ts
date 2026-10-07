import type { StorageItem } from "../db/schema.ts";
export const STORAGE_UPSERT_SQL = `
      INSERT OR REPLACE INTO storage_items (
        id, uri, path, name, size_bytes, mime_type, extension,
        category, source, modified_at, is_large, is_junk, junk_type, junk_reason,
        duplicate_group_id, can_open, can_preview, can_delete, requires_permission,
        width, height, duration_ms, whatsapp_type, is_sent
      ) VALUES 
    `;

export const STORAGE_BATCH_SIZE = 32;
export function storageBatchSql(count: number): string {
  if (!Number.isInteger(count) || count < 1 || count > STORAGE_BATCH_SIZE)
    throw new Error("Invalid storage batch size");
  return (
    STORAGE_UPSERT_SQL +
    Array(count)
      .fill("(" + Array(24).fill("?").join(",") + ")")
      .join(",") +
    ";"
  );
}
export function storageItemBindings(
  item: StorageItem,
): (string | number | null)[] {
  return [
    item.id,
    item.uri,
    item.path ?? null,
    item.name,
    item.sizeBytes,
    item.mimeType ?? null,
    item.extension ?? null,
    item.category,
    item.source,
    item.modifiedAt,
    item.isLarge ? 1 : 0,
    item.isJunk ? 1 : 0,
    item.junkType ?? null,
    item.junkReason ?? null,
    item.duplicateGroupId ?? null,
    item.canOpen ? 1 : 0,
    item.canPreview ? 1 : 0,
    item.canDelete ? 1 : 0,
    item.requiresPermission ? 1 : 0,
    item.width ?? null,
    item.height ?? null,
    item.durationMs ?? null,
    item.whatsappType ?? null,
    item.isSent ? 1 : 0,
  ];
}

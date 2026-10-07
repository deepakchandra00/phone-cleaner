import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeToCleanAutomatically,
  rankBestPhotoToKeep,
} from "../lib/safety.ts";
import type { StorageItem } from "../db/schema.ts";
import type { ScannedFile } from "../lib/types.ts";

test("isSafeToCleanAutomatically policy enforcement", async (t) => {
  await t.test("never allows items with canDelete: false", () => {
    const item: Partial<StorageItem> = {
      name: "cache.tmp",
      isJunk: true,
      canDelete: false,
    };
    assert.equal(isSafeToCleanAutomatically(item as any), false);
  });

  await t.test("never allows personal camera photos or videos", () => {
    const photo: Partial<ScannedFile> = {
      id: "photo_1",
      name: "IMG_20261006_120000.jpg",
      path: "/storage/emulated/0/DCIM/Camera/IMG_20261006_120000.jpg",
      sizeBytes: 4_500_000,
      category: "photos",
      canDelete: true,
    };
    const video: Partial<ScannedFile> = {
      id: "vid_1",
      name: "VID_20261006_120000.mp4",
      path: "/storage/emulated/0/DCIM/Camera/VID_20261006_120000.mp4",
      sizeBytes: 150_000_000,
      category: "videos",
      canDelete: true,
    };
    assert.equal(isSafeToCleanAutomatically(photo as any), false);
    assert.equal(isSafeToCleanAutomatically(video as any), false);
  });

  await t.test("never allows documents or user downloads", () => {
    const doc: Partial<ScannedFile> = {
      id: "doc_1",
      name: "Tax_Return_2025.pdf",
      path: "/storage/emulated/0/Download/Tax_Return_2025.pdf",
      sizeBytes: 1_200_000,
      category: "documents",
      canDelete: true,
    };
    assert.equal(isSafeToCleanAutomatically(doc as any), false);
  });

  await t.test(
    "avoids false positives on user files containing 'thumb'",
    () => {
      const file1: Partial<ScannedFile> = {
        id: "t1",
        name: "thumbs_up_vacation.jpg",
        path: "/storage/emulated/0/DCIM/Camera/thumbs_up_vacation.jpg",
        sizeBytes: 2_000_000,
        category: "photos",
        canDelete: true,
      };
      const file2: Partial<ScannedFile> = {
        id: "t2",
        name: "thumbnail_design.png",
        path: "/storage/emulated/0/Download/thumbnail_design.png",
        sizeBytes: 800_000,
        category: "photos",
        canDelete: true,
      };
      assert.equal(isSafeToCleanAutomatically(file1 as any), false);
      assert.equal(isSafeToCleanAutomatically(file2 as any), false);
    },
  );

  await t.test(
    "requires verified cache directories, not filename suffixes",
    () => {
      const tmpFile: Partial<ScannedFile> = {
        id: "tmp_1",
        name: "update_stream.tmp",
        path: "/storage/emulated/0/Download/update_stream.tmp",
        sizeBytes: 10_000,
        canDelete: true,
      };
      const logFile: Partial<ScannedFile> = {
        id: "log_1",
        name: "crash_dump.log",
        path: "/storage/emulated/0/Android/crash_dump.log",
        sizeBytes: 50_000,
        canDelete: true,
      };
      const thumbCache: Partial<ScannedFile> = {
        id: "thumb_c",
        name: ".thumbdata4--1967290299",
        path: "/storage/emulated/0/DCIM/.thumbnails/.thumbdata4--1967290299",
        sizeBytes: 120_000_000,
        canDelete: true,
      };
      assert.equal(isSafeToCleanAutomatically(tmpFile as any), false);
      assert.equal(isSafeToCleanAutomatically(logFile as any), false);
      assert.equal(isSafeToCleanAutomatically(thumbCache as any), true);
    },
  );

  await t.test("requires manual review of APK installers", () => {
    const apkFile: Partial<ScannedFile> = {
      id: "apk_1",
      name: "whatsapp_v2.24.apk",
      path: "/storage/emulated/0/Download/whatsapp_v2.24.apk",
      sizeBytes: 45_000_000,
      category: "apks" as any,
      canDelete: true,
    };
    assert.equal(isSafeToCleanAutomatically(apkFile as any), false);
  });

  await t.test(
    "differentiates WhatsApp received media vs. WhatsApp Sent duplicates",
    () => {
      const received: Partial<ScannedFile> = {
        id: "wa_rec",
        name: "IMG-20261006-WA0001.jpg",
        path: "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/IMG-20261006-WA0001.jpg",
        sizeBytes: 1_200_000,
        isSent: false,
        canDelete: true,
      };
      const sent: Partial<ScannedFile> = {
        id: "wa_sent",
        name: "IMG-20261006-WA0002.jpg",
        path: "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/IMG-20261006-WA0002.jpg",
        sizeBytes: 1_200_000,
        isSent: true,
        canDelete: true,
      };
      assert.equal(isSafeToCleanAutomatically(received as any), false);
      assert.equal(isSafeToCleanAutomatically(sent as any), false);
    },
  );
});

test("rankBestPhotoToKeep deterministic photo ranking", async (t) => {
  await t.test(
    "ranks higher resolution photo over lower resolution photo",
    () => {
      const lowRes: ScannedFile = {
        id: "low_res",
        name: "thumb.jpg",
        uri: "file:///dcim/thumb.jpg",
        category: "photos",
        sizeBytes: 500_000,
        modifiedAt: 1000,
        width: 1080,
        height: 1920,
      };
      const highRes: ScannedFile = {
        id: "high_res",
        name: "original.jpg",
        uri: "file:///dcim/original.jpg",
        category: "photos",
        sizeBytes: 400_000,
        modifiedAt: 2000,
        width: 3000,
        height: 4000,
      };

      const { keepId } = rankBestPhotoToKeep([lowRes, highRes]);
      assert.equal(keepId, "high_res");
    },
  );

  await t.test("ranks higher file size when resolutions are identical", () => {
    const compressed: ScannedFile = {
      id: "compressed",
      name: "compressed.jpg",
      uri: "file:///dcim/compressed.jpg",
      category: "photos",
      sizeBytes: 1_500_000,
      modifiedAt: 2000,
      width: 4000,
      height: 3000,
    };
    const rawQuality: ScannedFile = {
      id: "raw_quality",
      name: "raw.jpg",
      uri: "file:///dcim/raw.jpg",
      category: "photos",
      sizeBytes: 8_200_000,
      modifiedAt: 1000,
      width: 4000,
      height: 3000,
    };

    const { keepId } = rankBestPhotoToKeep([compressed, rawQuality]);
    assert.equal(keepId, "raw_quality");
  });

  await t.test(
    "ranks earlier capture date when resolution and size are identical",
    () => {
      const copy1: ScannedFile = {
        id: "copy_original",
        name: "photo.jpg",
        uri: "file:///dcim/photo.jpg",
        category: "photos",
        sizeBytes: 3_000_000,
        modifiedAt: 1000,
        width: 1920,
        height: 1080,
      };
      const copy2: ScannedFile = {
        id: "copy_dup",
        name: "photo (1).jpg",
        uri: "file:///dcim/photo (1).jpg",
        category: "photos",
        sizeBytes: 3_000_000,
        modifiedAt: 2000,
        width: 1920,
        height: 1080,
      };

      const { keepId } = rankBestPhotoToKeep([copy2, copy1]);
      assert.equal(keepId, "copy_original");
    },
  );
});

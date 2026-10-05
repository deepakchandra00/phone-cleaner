import type {
  AppItem,
  CategoryKey,
  CategorySummary,
  DuplicateGroup,
  ScannedFile,
  ScanResult,
  StorageSummary,
} from "./types";

/**
 * Mock data engine.
 *
 * In production, every function here is replaced by a call to the native
 * `AndroidStorageModule` (Kotlin) that queries MediaStore / PackageManager /
 * StorageStatsManager. The function signatures remain identical so the UI
 * layer never changes — only the implementation swaps.
 *
 * Mocks are deterministic (seeded) so the UI is stable across reloads,
 * but realistic: 128 GB device, ~91% full, ~8.7 GB reclaimable, with
 * believable file names and sizes.
 */

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;

const TOTAL_BYTES = 128 * GB;
const USED_BYTES = 116.4 * GB;

let seed = 42;
function rand(): number {
  // Mulberry32 — deterministic PRNG so the demo is stable.
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function randPick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function resetSeed() {
  seed = 42;
}

export function getStorageSummary(): StorageSummary {
  const categories: CategorySummary[] = [
    {
      key: "photos",
      label: "Photos",
      bytes: 41.2 * GB,
      fileCount: 8421,
      cleanableBytes: 2.4 * GB,
      cleanableCount: 412,
    },
    {
      key: "videos",
      label: "Videos",
      bytes: 38.6 * GB,
      fileCount: 1284,
      cleanableBytes: 3.8 * GB,
      cleanableCount: 96,
    },
    {
      key: "apps",
      label: "Apps",
      bytes: 18.4 * GB,
      fileCount: 74,
      cleanableBytes: 1.1 * GB,
      cleanableCount: 12,
    },
    {
      key: "audio",
      label: "Audio",
      bytes: 6.2 * GB,
      fileCount: 540,
      cleanableBytes: 0.3 * GB,
      cleanableCount: 28,
    },
    {
      key: "documents",
      label: "Documents",
      bytes: 3.1 * GB,
      fileCount: 318,
      cleanableBytes: 0.2 * GB,
      cleanableCount: 14,
    },
    {
      key: "downloads",
      label: "Downloads",
      bytes: 4.8 * GB,
      fileCount: 167,
      cleanableBytes: 0.8 * GB,
      cleanableCount: 41,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      bytes: 8.4 * GB,
      fileCount: 2380,
      cleanableBytes: 2.1 * GB,
      cleanableCount: 540,
    },
    {
      key: "junk",
      label: "Junk",
      bytes: 1.8 * GB,
      fileCount: 3120,
      cleanableBytes: 1.8 * GB,
      cleanableCount: 3120,
    },
  ];

  const cleanableBytes = categories.reduce((s, c) => s + c.cleanableBytes, 0);

  return {
    totalBytes: TOTAL_BYTES,
    usedBytes: USED_BYTES,
    freeBytes: TOTAL_BYTES - USED_BYTES,
    usedPercent: Math.round((USED_BYTES / TOTAL_BYTES) * 100),
    cleanableBytes,
    categories,
  };
}

const PHOTO_NAMES = [
  "IMG_20241015_",
  "IMG_20241102_",
  "IMG_20241228_",
  "IMG_20250114_",
  "IMG_20250307_",
  "IMG_20250422_",
  "IMG_20250518_",
  "IMG_20250609_",
  "Screenshot_",
  "WhatsApp_Image_",
];

const VIDEO_SOURCES = ["Camera", "WhatsApp", "Downloads", "Telegram", "Instagram"];
const DOC_NAMES = [
  "report_final.pdf",
  "contract_v3.pdf",
  "invoice_2025.pdf",
  "presentation.pptx",
  "spreadsheet.xlsx",
  "resume.pdf",
  "bank_statement.pdf",
  "tax_2024.pdf",
];
const AUDIO_NAMES = [
  "podcast_episode.mp3",
  "voice_memo_001.m4a",
  "song_download.mp3",
  "audiobook_chapter.mp3",
  "recording_note.m4a",
];

function makePhoto(index: number): ScannedFile {
  const base = PHOTO_NAMES[index % PHOTO_NAMES.length];
  const dupGroup = rand() < 0.18 ? `dg-${randInt(0, 40)}` : undefined;
  return {
    id: `photo-${index}`,
    path: `/storage/emulated/0/DCIM/Camera/${base}${String(index).padStart(4, "0")}.jpg`,
    name: `${base}${String(index).padStart(4, "0")}.jpg`,
    category: "photos",
    sizeBytes: randInt(1, 6) * MB + randInt(100, 900) * KB,
    mimeType: "image/jpeg",
    modifiedAt: Date.now() - randInt(1, 400) * 86400000,
    width: randPick([4000, 4032, 3024, 3120, 3840]),
    height: randPick([3000, 3024, 4032, 4160, 5120]),
    duplicateGroupId: dupGroup,
    source: "Camera",
  };
}

function makeVideo(index: number): ScannedFile {
  const source = randPick(VIDEO_SOURCES);
  const ext = randPick([".mp4", ".mov", ".3gp"]);
  return {
    id: `video-${index}`,
    path: `/storage/emulated/0/Movies/${source}/VID_${index}${ext}`,
    name: `VID_${index}${ext}`,
    category: "videos",
    sizeBytes: randInt(40, 1800) * MB,
    mimeType: `video/${ext.slice(1)}`,
    modifiedAt: Date.now() - randInt(1, 365) * 86400000,
    width: randPick([1920, 1280, 3840, 1080]),
    height: randPick([1080, 720, 2160, 1920]),
    durationSec: randInt(5, 900),
    source,
  };
}

function makeDoc(index: number): ScannedFile {
  const name = randPick(DOC_NAMES);
  return {
    id: `doc-${index}`,
    path: `/storage/emulated/0/Documents/${name}`,
    name,
    category: "documents",
    sizeBytes: randInt(500, 60) * KB + randInt(1, 8) * MB,
    mimeType: name.endsWith(".pdf")
      ? "application/pdf"
      : name.endsWith(".pptx")
        ? "application/vnd.ms-powerpoint"
        : "application/vnd.ms-excel",
    modifiedAt: Date.now() - randInt(1, 600) * 86400000,
    source: "Documents",
  };
}

function makeAudio(index: number): ScannedFile {
  const name = randPick(AUDIO_NAMES);
  return {
    id: `audio-${index}`,
    path: `/storage/emulated/0/Music/${name}`,
    name,
    category: "audio",
    sizeBytes: randInt(2, 80) * MB,
    mimeType: name.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4",
    modifiedAt: Date.now() - randInt(1, 800) * 86400000,
    durationSec: randInt(60, 3600),
    source: "Music",
  };
}

function makeDownload(index: number): ScannedFile {
  const ext = randPick([".apk", ".zip", ".pdf", ".mp4", ".jpg", ".exe"]);
  return {
    id: `dl-${index}`,
    path: `/storage/emulated/0/Download/file_${index}${ext}`,
    name: `file_${index}${ext}`,
    category: "downloads",
    sizeBytes: randInt(5, 400) * MB,
    mimeType: "*/*",
    modifiedAt: Date.now() - randInt(1, 250) * 86400000,
    source: "Download",
  };
}

function makeWhatsApp(index: number): ScannedFile {
  const kind = randPick(["Images", "Video", "Documents", "Audio", "Stickers"]);
  const ext = kind === "Video" ? ".mp4" : kind === "Audio" ? ".m4a" : kind === "Documents" ? ".pdf" : ".jpg";
  const size =
    kind === "Video"
      ? randInt(20, 600) * MB
      : kind === "Audio"
        ? randInt(1, 20) * MB
        : kind === "Documents"
          ? randInt(1, 30) * MB
          : randInt(100, 800) * KB;
  return {
    id: `wa-${index}`,
    path: `/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp ${kind}/IMG-${index}${ext}`,
    name: `IMG-${index}${ext}`,
    category: "whatsapp",
    sizeBytes: size,
    mimeType: ext === ".mp4" ? "video/mp4" : ext === ".m4a" ? "audio/mp4" : ext === ".pdf" ? "application/pdf" : "image/jpeg",
    modifiedAt: Date.now() - randInt(1, 200) * 86400000,
    source: `WhatsApp ${kind}`,
  };
}

function makeJunk(index: number): ScannedFile {
  return {
    id: `junk-${index}`,
    path: `/data/data/com.example.app/cache/tmp_${index}.dat`,
    name: `tmp_${index}.dat`,
    category: "junk",
    sizeBytes: randInt(10, 800) * KB,
    mimeType: "application/octet-stream",
    modifiedAt: Date.now() - randInt(1, 30) * 86400000,
    source: "App Cache",
  };
}

export function getApps(): AppItem[] {
  resetSeed();
  const apps: { name: string; pkg: string; icon: string }[] = [
    { name: "WhatsApp", pkg: "com.whatsapp", icon: "chatbubble" },
    { name: "Instagram", pkg: "com.instagram.android", icon: "camera" },
    { name: "YouTube", pkg: "com.google.android.youtube", icon: "play" },
    { name: "Chrome", pkg: "com.android.chrome", icon: "globe" },
    { name: "Spotify", pkg: "com.spotify.music", icon: "musical" },
    { name: "Netflix", pkg: "com.netflix.mediaclient", icon: "film" },
    { name: "TikTok", pkg: "com.zhiliaoapp.musically", icon: "video" },
    { name: "Gmail", pkg: "com.google.android.gm", icon: "mail" },
    { name: "Maps", pkg: "com.google.android.apps.maps", icon: "map" },
    { name: "Drive", pkg: "com.google.android.apps.docs", icon: "cloud" },
    { name: "Telegram", pkg: "org.telegram.messenger", icon: "send" },
    { name: "Snapchat", pkg: "com.snapchat.android", icon: "camera" },
    { name: "Amazon", pkg: "com.amazon.mShop.android.shopping", icon: "cart" },
    { name: "Zoom", pkg: "us.zoom.videomeetings", icon: "video" },
    { name: "Duolingo", pkg: "com.duolingo", icon: "book" },
    { name: "MyFitnessPal", pkg: "com.myfitnesspal.android", icon: "activity" },
  ];
  return apps.map((a, i) => ({
    packageName: a.pkg,
    label: a.name,
    sizeBytes: randInt(60, 2400) * MB,
    cacheBytes: randInt(20, 400) * MB,
    lastUsedAt: Date.now() - randInt(1, 180) * 86400000,
    isSystem: false,
    iconUri: a.icon,
  }));
}

export function runScan(): Promise<ScanResult> {
  // Synchronous mock wrapped in a promise to mirror the async native call.
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = buildScanResult();
      resolve(result);
    }, 50);
  });
}

export function buildScanResult(): ScanResult {
  resetSeed();
  const summary = getStorageSummary();
  const photos = Array.from({ length: 60 }, (_, i) => makePhoto(i));
  const videos = Array.from({ length: 24 }, (_, i) => makeVideo(i));
  const docs = Array.from({ length: 18 }, (_, i) => makeDoc(i));
  const audio = Array.from({ length: 12 }, (_, i) => makeAudio(i));
  const downloads = Array.from({ length: 22 }, (_, i) => makeDownload(i));
  const whatsapp = Array.from({ length: 40 }, (_, i) => makeWhatsApp(i));
  const junk = Array.from({ length: 80 }, (_, i) => makeJunk(i));

  // Build duplicate groups from photos flagged with duplicateGroupId.
  const groupMap = new Map<string, ScannedFile[]>();
  for (const p of photos) {
    if (p.duplicateGroupId) {
      const arr = groupMap.get(p.duplicateGroupId) ?? [];
      arr.push(p);
      groupMap.set(p.duplicateGroupId, arr);
    }
  }
  const duplicateGroups: DuplicateGroup[] = [];
  for (const [gid, files] of groupMap) {
    if (files.length < 2) continue;
    const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
    // keep the largest, recoverable = total - keep
    const keep = files.reduce((a, b) => (b.sizeBytes > a.sizeBytes ? b : a));
    duplicateGroups.push({
      id: gid,
      kind: rand() < 0.7 ? "exact" : "similar",
      files: files.sort((a, b) => b.sizeBytes - a.sizeBytes),
      totalBytes,
      recoverableBytes: totalBytes - keep.sizeBytes,
      keepId: keep.id,
    });
  }

  const largeFiles = [...videos, ...downloads, ...docs, ...whatsapp]
    .filter((f) => f.sizeBytes > 100 * MB)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 40);

  const startedAt = Date.now() - 2400;
  return {
    startedAt,
    completedAt: Date.now(),
    durationMs: 2400,
    totalCleanableBytes: summary.cleanableBytes,
    filesScanned:
      summary.categories.reduce((s, c) => s + c.fileCount, 0),
    categories: summary.categories,
    allPhotos: photos,
    allVideos: videos,
    allAudio: audio,
    allDownloads: downloads,
    obsoleteApks: junk.filter((j) => j.name.endsWith(".apk")),
    largeFiles,
    duplicateGroups: duplicateGroups.sort((a, b) => b.recoverableBytes - a.recoverableBytes),
    apps: getApps().sort((a, b) => b.sizeBytes - a.sizeBytes),
    junkFiles: junk,
    whatsappFiles: whatsapp.sort((a, b) => b.sizeBytes - a.sizeBytes),
  };
}

/** Used by the duplicate detection pipeline display. */
export function getDuplicateStages() {
  return [
    { id: "size", label: "Group by file size", files: 12483, durationMs: 180 },
    { id: "dimensions", label: "Group by dimensions", files: 8421, durationMs: 420 },
    { id: "hash", label: "SHA-256 content hash", files: 2840, durationMs: 1240 },
    { id: "phash", label: "Perceptual hash (similar)", files: 412, durationMs: 980 },
  ];
}

export const MOCK_CATEGORY_LABELS: Record<CategoryKey, string> = {
  photos: "Photos",
  videos: "Videos",
  apps: "Apps",
  audio: "Audio",
  documents: "Documents",
  downloads: "Downloads",
  junk: "Junk",
  duplicates: "Duplicates",
  whatsapp: "WhatsApp",
  apks: "APKs",
  other: "Other",
};

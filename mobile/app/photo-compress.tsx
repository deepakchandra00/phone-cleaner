import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StorageIndexService } from "@/db/StorageIndexService";
import type { StorageItem } from "@/db/schema";
import { formatSizeCompact } from "@/lib/format";
import { withStorageOperation } from "@/lib/storageOperation";
import { DeviceTools, type CompressedPhoto } from "android-storage";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, AppState, FlatList, Pressable, Text, View } from "react-native";
type Draft = CompressedPhoto & { original: StorageItem; saved: boolean };
const removeDraft = async (uri: string | null) => {
  if (uri) await DeviceTools.discardDraft(uri);
};
export default function PhotoCompress() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Map<string, StorageItem>>(
    () => new Map(),
  );
  const [quality, setQuality] = useState(80);
  const [side, setSide] = useState(1920);
  const [showOptions, setShowOptions] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftRef = useRef<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{
    original: string;
    output: string;
  } | null>(null);
  const active = useRef(false),
    cancelled = useRef(false),
    working = useRef(false);
  const load = useCallback(() => {
    try {
      const result = StorageIndexService.getItems({
        category: "photos",
        jpegOnly: true,
        limit: 60,
        offset,
        sortBy: "size_desc",
      });
      setItems(result.items);
      setTotal(result.totalCount);
    } catch {
      setMessage("Photo index unavailable. Finish the current scan and retry.");
    }
  }, [offset]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      load();
      const sub = AppState.addEventListener("change", (state) => {
        if (state !== "active") cancelled.current = true;
      });
      return () => {
        active.current = false;
        cancelled.current = true;
        sub.remove();
      };
    }, [load]),
  );
  useFocusEffect(
    useCallback(
      () => () => {
        setPreview(null);
        for (const draft of draftRef.current) void removeDraft(draft.uri);
        draftRef.current = [];
        setDrafts([]);
      },
      [],
    ),
  );
  const compress = async () => {
    if (working.current || !selected.size) return;
    working.current = true;
    cancelled.current = false;
    setBusy(true);
    setMessage("");
    setPreview(null);
    const batch = [...selected.values()];
    for (const draft of draftRef.current) await removeDraft(draft.uri);
    draftRef.current = [];
    setDrafts([]);
    let skipped = 0,
      failed = 0,
      completed = 0;
    try {
      await withStorageOperation("compression", async () => {
        for (const original of batch) {
          if (cancelled.current || !active.current) break;
          try {
            const result = await DeviceTools.compress(
              original.uri,
              quality,
              side,
            );
            if (cancelled.current || !active.current) {
              await removeDraft(result.uri);
              break;
            }
            if (!result.uri) skipped++;
            else {
              draftRef.current.push({ ...result, original, saved: false });
              setDrafts([...draftRef.current]);
            }
          } catch {
            failed++;
          }
          completed++;
          if (active.current)
            setMessage(
              `Prepared ${completed} of ${batch.length}. ${skipped} did not save space; ${failed} could not be processed.`,
            );
        }
      });
      if (active.current)
        setMessage(
          `${cancelled.current ? "Stopped. " : ""}${draftRef.current.length} smaller copies ready to review. ${skipped} skipped; ${failed} failed. Originals are unchanged.`,
        );
    } catch (e) {
      if (active.current)
        setMessage(e instanceof Error ? e.message : "Compression unavailable.");
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  };
  const save = async () => {
    if (working.current) return;
    working.current = true;
    cancelled.current = false;
    setBusy(true);
    let saved = 0,
      failed = 0;
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        setMessage(
          "Saving permission was denied. Your originals and prepared copies are unchanged.",
        );
        return;
      }
      for (const draft of draftRef.current) {
        if (!active.current || cancelled.current) break;
        if (draft.saved || !draft.uri) continue;
        try {
          await MediaLibrary.createAssetAsync(draft.uri);
          draftRef.current = draftRef.current.map((value) =>
            value.original.id === draft.original.id
              ? { ...value, saved: true }
              : value,
          );
          saved++;
        } catch {
          failed++;
        }
      }
      if (active.current) {
        setDrafts([...draftRef.current]);
        setMessage(
          `${saved} new copies saved to your gallery. ${failed} failed. Originals are kept; failed copies can be retried.`,
        );
      }
    } catch {
      if (active.current)
        setMessage("Saving is unavailable. Try again from this screen.");
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  };
  const toggle = (item: StorageItem) =>
    setSelected((old) => {
      const next = new Map(old);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < 10) next.set(item.id, item);
      else
        Alert.alert(
          "Batch limit",
          "Select up to 10 photos at a time to keep memory use bounded.",
        );
      return next;
    });
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Compress photos"
        subtitle="Create smaller JPEG copies"
        showBack
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        windowSize={3}
        maxToRenderPerBatch={6}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const jpeg =
            item.mimeType === "image/jpeg" || /\.jpe?g$/i.test(item.name);
          return (
            <Pressable
              disabled={busy || !jpeg}
              onPress={() => toggle(item)}
              className="flex-row gap-3 p-3 border border-border rounded-xl mb-2"
            >
              <Image
                source={{ uri: item.uri }}
                style={{ width: 48, height: 48 }}
                cachePolicy="disk"
                decodeFormat="rgb"
                recyclingKey={item.id}
              />
              <View className="flex-1">
                <Text className="text-foreground" numberOfLines={1}>
                  {selected.has(item.id) ? "☑ " : "☐ "}
                  {item.name}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {formatSizeCompact(item.sizeBytes)} ·{" "}
                  {jpeg ? "JPEG" : "Format not supported"}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View className="gap-3 mb-4">
            <Text className="text-muted-foreground text-sm">
              Choose up to 10 photos. Preview smaller copies and keep your
              originals.
            </Text>
            {!DeviceTools.available() && (
              <Text className="text-destructive">
                Update SmartCare to use photo compression.
              </Text>
            )}
            <View className="flex-row gap-2">
              {[60, 80, 90].map((value) => (
                <Button
                  size="sm"
                  key={value}
                  disabled={busy}
                  className="flex-1"
                  variant={quality === value ? "primary" : "secondary"}
                  onPress={() => setQuality(value)}
                >
                  {value === 60
                    ? "Smaller"
                    : value === 80
                      ? "Balanced"
                      : "Sharper"}
                </Button>
              ))}
            </View>
            <Pressable
              disabled={busy}
              onPress={() => setShowOptions(!showOptions)}
              accessibilityRole="button"
            >
              <Text className="text-primary text-sm">
                {showOptions ? "Hide options" : "More options"}
              </Text>
            </Pressable>
            {showOptions && (
              <View className="flex-row gap-2">
                {[1280, 1920].map((value) => (
                  <Button
                    size="sm"
                    key={value}
                    disabled={busy}
                    className="flex-1"
                    variant={side === value ? "primary" : "secondary"}
                    onPress={() => setSide(value)}
                  >
                    {value === 1280 ? "Compact size" : "Larger size"}
                  </Button>
                ))}
              </View>
            )}
            <Button
              loading={busy}
              disabled={!selected.size || !DeviceTools.available()}
              onPress={() => void compress()}
            >
              Preview savings ({selected.size})
            </Button>
            {busy && (
              <Button
                variant="outline"
                onPress={() => {
                  cancelled.current = true;
                  setMessage("Stopping after the current photo finishes…");
                }}
              >
                Stop after current photo
              </Button>
            )}
            {!!message && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-muted-foreground"
              >
                {message}
              </Text>
            )}
            {drafts.map((draft) => (
              <Pressable
                key={draft.original.id}
                onPress={() => {
                  if (draft.uri)
                    setPreview({
                      original: draft.original.uri,
                      output: draft.uri,
                    });
                }}
                className="p-3 bg-muted rounded-xl"
              >
                <Text className="text-foreground" numberOfLines={1}>
                  {draft.original.name}{" "}
                  {draft.saved ? "· Saved" : "· Tap to compare"}
                </Text>
                <Text className="text-muted-foreground">
                  {formatSizeCompact(draft.originalBytes)} →{" "}
                  {formatSizeCompact(draft.sizeBytes)} · {draft.width}×
                  {draft.height}
                </Text>
              </Pressable>
            ))}
            {preview && (
              <View>
                <Text className="text-foreground">Original</Text>
                <Image
                  source={{ uri: preview.original }}
                  style={{ height: 180 }}
                  contentFit="contain"
                  cachePolicy="disk"
                  decodeFormat="rgb"
                />
                <Text className="text-foreground">Compressed copy</Text>
                <Image
                  source={{ uri: preview.output }}
                  style={{ height: 180 }}
                  contentFit="contain"
                  cachePolicy="disk"
                  decodeFormat="rgb"
                />
              </View>
            )}
            {!!drafts.filter((d) => !d.saved).length && (
              <Button
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Save smaller copies?",
                    "Originals stay in your gallery. New copies can have lower quality, omit location/camera metadata and use today's gallery date.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Save copies", onPress: () => void save() },
                    ],
                  )
                }
              >
                Save reviewed copies · keep originals
              </Button>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text className="text-muted-foreground text-center py-6">
            No JPEG photos to show. Scan your photos first.
          </Text>
        }
        ListFooterComponent={
          total > 60 ? (
            <View className="flex-row gap-2 mt-3">
              <Button
                className="flex-1"
                variant="outline"
                disabled={busy || offset === 0}
                onPress={() => setOffset(Math.max(0, offset - 60))}
              >
                Previous
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                disabled={busy || offset + 60 >= total}
                onPress={() => setOffset(offset + 60)}
              >
                Next
              </Button>
            </View>
          ) : null
        }
      />
    </View>
  );
}

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { formatSizeCompact } from "@/lib/format";
import { useAppStore } from "@/stores/useAppStore";
import { useFeatureGate } from "@/stores/usePremiumStore";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PhotoGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useAppStore((s) =>
    s.scanResult?.duplicateGroups.find((g) => g.id === id),
  );
  const selected = useAppStore((s) => s.selectedFileIds);
  const toggleFile = useAppStore((s) => s.toggleFile);
  const gate = useFeatureGate();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = (width - 40) / 3;
  useFocusEffect(
    useCallback(
      () => () => {
        void Image.clearMemoryCache().catch(() => {});
      },
      [],
    ),
  );
  if (!group)
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Photo group" showBack />
        <Text className="text-muted-foreground p-4">
          This group is no longer in the latest scan. Return to Photos to scan
          again.
        </Text>
      </View>
    );
  const count = group.files.filter(
    (f) => f.id !== group.keepId && selected.has(f.id),
  ).length;
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Compare photo copies"
        subtitle={`${group.files.length} photos · ${group.kind === "exact" ? "Identical files" : "Similar photos: review carefully"}`}
        showBack
      />
      <Text className="text-muted-foreground text-xs px-4 pb-3">
        One original stays protected. Tap copies to select them, then review
        before deleting.
      </Text>
      <FlatList
        data={group.files}
        keyExtractor={(f) => f.id}
        numColumns={3}
        extraData={selected}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={3}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 16 }}
        renderItem={({ item: f }) => {
          const keep = f.id === group.keepId,
            checked = selected.has(f.id);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: keep }}
              accessibilityLabel={`${keep ? "Protected original" : "Select copy"}: ${f.name}`}
              onPress={() => {
                if (keep) return;
                if (group.kind === "similar" && !gate.canUseSimilarPhotos) {
                  router.push("/premium");
                  return;
                }
                toggleFile(f.id, f.sizeBytes);
              }}
              style={{ width: tile, margin: 2 }}
              className="bg-card rounded-lg overflow-hidden"
            >
              <Image
                source={{
                  uri:
                    f.uri ||
                    (f.path.startsWith("/") ? `file://${f.path}` : f.path),
                }}
                style={{ width: tile, height: tile }}
                contentFit="cover"
                cachePolicy="disk"
                recyclingKey={f.id}
                transition={0}
                decodeFormat="rgb"
              />
              <View className="absolute top-1 left-1 rounded bg-card px-2 py-1">
                <Text className="text-primary text-xs font-bold">
                  {keep ? "KEEP" : checked ? "SELECTED" : "COPY"}
                </Text>
              </View>
              <Text
                className="text-foreground text-xs px-2 pt-2"
                numberOfLines={1}
              >
                {f.name}
              </Text>
              <Text className="text-muted-foreground text-xs px-2 pb-2">
                {formatSizeCompact(f.sizeBytes)}
              </Text>
            </Pressable>
          );
        }}
      />
      <View
        className="bg-card border-t border-border px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          disabled={!count}
          onPress={() => router.push("/review")}
          rightIcon={<Icon name="arrow-forward" size={18} color={"#fff"} />}
        >
          Review {count} selected copies
        </Button>
      </View>
    </View>
  );
}

import { useCallback, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FileDetailModal } from "@/components/FileDetailModal";
import { StorageIndexService } from "@/db/StorageIndexService";
import type { StorageItem } from "@/db/schema";
import { AndroidStorage } from "android-storage";
import { formatSizeCompact } from "@/lib/format";
import { ThemeColors } from "@/theme/colors";

export default function FolderScreen() {
  const { path, fileId } = useLocalSearchParams<{
    path: string;
    fileId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<StorageItem | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(
    (offset = 0) => {
      try {
        const result = StorageIndexService.getItems({
          parentPath: path,
          prioritizeId: fileId,
          sortBy: "name_asc",
          limit: 50,
          offset,
        });
        setFiles((current) =>
          offset === 0 ? result.items : [...current, ...result.items],
        );
        setTotal(result.totalCount);
        setError(false);
      } catch {
        setError(true);
      }
    },
    [path, fileId],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="File location" showBack />
      <View className="px-4 py-3 border-b border-border">
        <Text selectable className="text-foreground text-sm font-medium">
          {path}
        </Text>
        <Text className="text-muted-foreground text-xs mt-2">
          {total} scanned files in this folder. Tap a file for details. The
          highlighted file is the one you located.
        </Text>
      </View>
      <FlashList
        data={files}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        onEndReached={() => {
          if (files.length < total) load(files.length);
        }}
        onEndReachedThreshold={0.3}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open details for ${item.name}`}
            onPress={() => setDetail(item)}
            className={
              item.id === fileId
                ? "flex-row gap-3 p-4 my-1 bg-primary/10 rounded-xl border border-primary"
                : "flex-row gap-3 py-4 border-b border-border"
            }
          >
            <Icon
              name={item.id === fileId ? "location" : "document"}
              size={22}
              color={ThemeColors.primary}
            />
            <View className="flex-1">
              <Text className="text-foreground text-sm" numberOfLines={2}>
                {item.name}
              </Text>
              <Text className="text-muted-foreground text-xs mt-1">
                {formatSizeCompact(item.sizeBytes)}
                {item.id === fileId ? " · Located file" : ""}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text className="text-muted-foreground text-center p-6">
            {error
              ? "Unable to load the file index. Please retry."
              : "This folder has no indexed files. Run a new scan to refresh it."}
          </Text>
        }
      />
      <View
        className="px-4 pt-3 gap-2 border-t border-border"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        {error && <Button onPress={() => load()}>Retry</Button>}
        <Button
          variant="secondary"
          onPress={() => {
            const copied = AndroidStorage.copyToClipboard(path);
            Alert.alert(
              copied ? "Folder path copied" : "Copy unavailable",
              copied
                ? path
                : "You can select and copy the path at the top of this screen.",
            );
          }}
        >
          Copy folder path
        </Button>
      </View>
      <FileDetailModal
        item={detail}
        visible={Boolean(detail)}
        onClose={() => setDetail(null)}
        onDeleted={() => load()}
      />
    </View>
  );
}

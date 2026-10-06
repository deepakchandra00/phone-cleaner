import React, { useState } from "react";
import { View, Text, Modal, Pressable, ScrollView, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { Icon, CategoryIcons, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { AndroidStorage } from "android-storage";
import { DeleteCoordinator } from "@/services/DeleteCoordinator";
import { CategoryColors, ThemeColors } from "@/theme/colors";
import { formatSizeCompact } from "@/lib/format";
import type { StorageItem } from "@/db/schema";

interface FileDetailModalProps {
  item: StorageItem | null;
  visible: boolean;
  onClose: () => void;
  onDeleted?: (deletedId: string) => void;
}

export function FileDetailModal({ item, visible, onClose, onDeleted }: FileDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);

  if (!item) return null;

  const color = CategoryColors[item.category] ?? CategoryColors.other;
  const iconName = (CategoryIcons[item.category] ?? "document") as IconName;

  const isVisual =
    item.canPreview ||
    item.mimeType?.startsWith("image/") ||
    item.mimeType?.startsWith("video/") ||
    /\.(jpe?g|png|webp|gif|bmp|heic|mp4|mov|mkv|3gp)$/i.test(item.name || item.uri);

  const displayLocation = item.path
    ? item.path.replace(/^\/storage\/emulated\/0\/?/, "")
    : item.uri.replace(/^content:\/\/media\/external\//, "Media: ");

  const handleLocate = async () => {
    try {
      const target = item.path || item.uri;
      const located = await AndroidStorage.locateFile(target);
      if (!located) {
        await handleOpen();
      }
    } catch (err) {
      console.warn("[FileDetailModal] Could not locate file:", err);
      await handleOpen();
    }
  };

  const handleOpen = async () => {
    try {
      const target = item.path || item.uri;
      const opened = await AndroidStorage.openFile(target, item.mimeType);
      if (!opened) {
        if (item.uri.startsWith("file://") || item.uri.startsWith("content://")) {
          await Share.share({
            url: item.uri,
            title: item.name,
          });
        } else {
          const canOpen = await Linking.canOpenURL(item.uri);
          if (canOpen) {
            await Linking.openURL(item.uri);
          } else {
            Alert.alert("Unable to open file", "No compatible app was found on your device to open this file type.");
          }
        }
      }
    } catch (err) {
      console.warn("[FileDetailModal] Could not open file:", err);
      Alert.alert("Unable to open file", "No compatible application was found to open this file.");
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete file?",
      `Are you sure you want to permanently delete "${item.name}" (${formatSizeCompact(item.sizeBytes)})? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const ok = await DeleteCoordinator.deleteItem(item);
              if (ok) {
                onDeleted?.(item.id);
                onClose();
              } else {
                Alert.alert("Delete failed", "The file could not be deleted from the device.");
              }
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="bg-card rounded-t-3xl overflow-hidden max-h-[85%]"
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-border">
            <Text className="text-foreground font-bold text-base">File Details</Text>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-70"
            >
              <Icon name="close" size={18} color={ThemeColors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false}>
            {/* Visual Preview */}
            {isVisual ? (
              <View className="w-full h-56 rounded-2xl overflow-hidden bg-black/10 items-center justify-center mb-4 relative">
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="contain"
                  transition={200}
                />
                {item.mimeType?.startsWith("video/") && (
                  <View className="absolute bg-black/50 rounded-full p-3 items-center justify-center">
                    <Icon name="videocam" size={28} color="#fff" />
                  </View>
                )}
              </View>
            ) : (
              <View
                className="w-full h-36 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: `${color}15` }}
              >
                <Icon name={iconName} size={48} color={color} />
                <Text className="text-muted-foreground text-xs mt-2 uppercase font-semibold">
                  {item.extension ?? item.category}
                </Text>
              </View>
            )}

            {/* Title & Size */}
            <Text className="text-foreground font-bold text-lg" numberOfLines={2}>
              {item.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-1 mb-4">
              <Text className="text-primary font-bold text-base">
                {formatSizeCompact(item.sizeBytes)}
              </Text>
              <Text className="text-muted-foreground text-xs">•</Text>
              <Text className="text-muted-foreground text-xs uppercase font-medium">
                {item.source}
              </Text>
              {item.isJunk && (
                <View className="bg-destructive/10 px-2 py-0.5 rounded-full">
                  <Text className="text-destructive text-xs font-semibold">Junk file</Text>
                </View>
              )}
            </View>

            {/* Metadata Table */}
            <View className="bg-muted rounded-2xl p-4 gap-3 mb-6">
              <Pressable
                onPress={handleLocate}
                className="flex-row justify-between items-center active:opacity-70"
              >
                <Text className="text-muted-foreground text-xs">Location</Text>
                <View className="flex-row items-center gap-1 max-w-[68%]">
                  <Text className="text-primary text-xs font-medium text-right underline" numberOfLines={2}>
                    {displayLocation}
                  </Text>
                  <Icon name="folder-open-outline" size={14} color={ThemeColors.primary} />
                </View>
              </Pressable>
              <View className="flex-row justify-between">
                <Text className="text-muted-foreground text-xs">Modified</Text>
                <Text className="text-foreground text-xs font-medium">
                  {new Date(item.modifiedAt).toLocaleString()}
                </Text>
              </View>
              {item.mimeType && (
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground text-xs">MIME Type</Text>
                  <Text className="text-foreground text-xs font-medium">{item.mimeType}</Text>
                </View>
              )}
              {item.junkReason && (
                <View className="flex-row justify-between">
                  <Text className="text-muted-foreground text-xs">Reason</Text>
                  <Text className="text-warning-foreground text-xs font-medium max-w-[65%] text-right">
                    {item.junkReason}
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View className="gap-2.5">
              <View className="flex-row gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  leftIcon={<Icon name="folder-open-outline" size={18} color={ThemeColors.primary} />}
                  onPress={handleLocate}
                >
                  Locate file
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  leftIcon={<Icon name="open-outline" size={18} color={ThemeColors.primary} />}
                  onPress={handleOpen}
                >
                  Open / Share
                </Button>
              </View>
              {item.canDelete && (
                <Button
                  variant="destructive"
                  size="lg"
                  fullWidth
                  loading={deleting}
                  leftIcon={<Icon name="trash" size={18} color="#fff" />}
                  onPress={handleDelete}
                >
                  Delete File
                </Button>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

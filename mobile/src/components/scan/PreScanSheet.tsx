import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusColors, ThemeColors } from "@/theme/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STORAGE_KEY_INCLUDE_DUPS = "@phone_cleaner_scan_include_dups";

export interface PreScanOptions {
  includeDuplicates: boolean;
}

interface PreScanSheetProps {
  visible: boolean;
  onClose: () => void;
  onStartScan: (options: PreScanOptions) => void;
}

interface CategoryOption {
  key: string;
  title: string;
  description: string;
  icon: IconName;
  color: string;
  isDeep?: boolean;
}

const CATEGORIES: CategoryOption[] = [
  {
    key: "junk",
    title: "Junk & App Caches",
    description: "Temporary app files, logs, and visible cache candidates",
    icon: "trash",
    color: "#f59e0b",
  },
  {
    key: "apks",
    title: "Obsolete APK Installers",
    description: "Leftover installation packages from Downloads and storage",
    icon: "cube",
    color: "#3b82f6",
  },
  {
    key: "trash",
    title: "Empty Folders & System Trash",
    description: "Zero-byte folder clutter and accessible .trashed media",
    icon: "folder-open",
    color: "#8b5cf6",
  },
  {
    key: "whatsapp",
    title: "WhatsApp Media",
    description: "Sent videos, photos, and duplicate received media",
    icon: "logo-whatsapp",
    color: "#22c55e",
  },
  {
    key: "duplicates",
    title: "Duplicate & Similar Photos",
    description:
      "Content hashes for exact copies; visual hashes for similar photos",
    icon: "images",
    color: "#ec4899",
    isDeep: true,
  },
];

export function PreScanSheet({
  visible,
  onClose,
  onStartScan,
}: PreScanSheetProps) {
  const insets = useSafeAreaInsets();
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(STORAGE_KEY_INCLUDE_DUPS).then((val) => {
        if (val !== null) {
          setIncludeDuplicates(val === "true");
        }
      });
    }
  }, [visible]);

  const handleToggleDuplicates = () => {
    const nextVal = !includeDuplicates;
    setIncludeDuplicates(nextVal);
    AsyncStorage.setItem(STORAGE_KEY_INCLUDE_DUPS, String(nextVal)).catch(
      () => {},
    );
  };

  const handleStart = () => {
    onStartScan({ includeDuplicates });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="bg-card rounded-t-3xl border-t border-border px-5 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-border mb-3">
            <View>
              <Text className="text-foreground text-lg font-bold">
                What to scan?
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Choose scan depth before starting to save time
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="w-8 h-8 rounded-full bg-muted items-center justify-center"
            >
              <Icon
                name="close"
                size={18}
                color={ThemeColors.mutedForeground}
              />
            </Pressable>
          </View>

          {/* Categories List */}
          <ScrollView className="max-h-96" showsVerticalScrollIndicator={false}>
            <View className="gap-2.5 py-1">
              {CATEGORIES.map((cat) => {
                const isSelected =
                  cat.key === "duplicates" ? includeDuplicates : true;
                const isAlwaysOn = cat.key !== "duplicates";

                return (
                  <Pressable
                    key={cat.key}
                    disabled={isAlwaysOn}
                    onPress={
                      cat.key === "duplicates"
                        ? handleToggleDuplicates
                        : undefined
                    }
                    className={`flex-row items-center p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? "bg-card border-border"
                        : "bg-muted/40 border-border/40 opacity-75"
                    }`}
                  >
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: `${cat.color}15` }}
                    >
                      <Icon name={cat.icon} size={20} color={cat.color} />
                    </View>

                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-foreground text-sm font-semibold">
                          {cat.title}
                        </Text>
                        {cat.isDeep && (
                          <View className="bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                            <Text className="text-amber-500 text-[10px] font-bold">
                              Deep • 10-15s
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        className="text-muted-foreground text-xs mt-0.5"
                        numberOfLines={1}
                      >
                        {cat.description}
                      </Text>
                    </View>

                    {/* Checkbox indicator */}
                    <View
                      className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30 bg-transparent"
                      }`}
                    >
                      {isSelected && (
                        <Icon name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Timing Note */}
          <View className="flex-row items-center gap-2 bg-muted/50 rounded-xl p-2.5 my-3.5 border border-border/50">
            <Icon
              name="flash"
              size={16}
              color={
                includeDuplicates
                  ? ThemeColors.mutedForeground
                  : StatusColors.success
              }
            />
            <Text className="text-muted-foreground text-xs flex-1">
              {includeDuplicates
                ? "Full deep scan will inspect junk and analyze photo similarity (~15s)."
                : "Fast scan enabled: skips photo similarity and finishes in ~2 seconds."}
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onPress={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              rightIcon={<Icon name="arrow-forward" size={18} color="#fff" />}
              onPress={handleStart}
            >
              Start Scan
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

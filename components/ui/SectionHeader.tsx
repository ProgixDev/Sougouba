import { Pressable, View } from 'react-native';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Rendered as a pill beside the title. Hidden at zero — an empty section says that itself. */
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
}

/** "Populaires — Tout voir" row. The action only renders when it does something. */
export function SectionHeader({ title, count, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center gap-2 px-5">
      <Text variant="subtitle" weight="bold" className="text-[19px]">
        {title}
      </Text>
      {count !== undefined && count > 0 ? (
        <View className="px-2 py-0.5 rounded-full bg-primary/10">
          <Text variant="caption" weight="bold" tone="primary" className="text-[11px]">
            {count}
          </Text>
        </View>
      ) : null}
      <View className="flex-1" />
      {actionLabel && onAction ? (
        <Pressable hitSlop={8} accessibilityRole="button" onPress={onAction}>
          <Text variant="caption" weight="semibold" tone="muted">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useThemeColors } from '@/hooks/useColorScheme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const colors = useThemeColors();
  return (
    <View className="items-center justify-center px-8 py-16 gap-3">
      <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-2">
        <Icon size={36} color={colors.primary} strokeWidth={1.5} />
      </View>
      <Text variant="subtitle" weight="bold" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" className="text-center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-2">
          <Button label={actionLabel} variant="primary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

import { Pressable } from 'react-native';

import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={4}
      className={`h-10 px-4 rounded-full items-center justify-center border ${
        selected ? 'bg-primary border-primary' : 'bg-card border-border'
      }`}
    >
      <Text weight="medium" variant="caption" tone={selected ? 'inverted' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );
}

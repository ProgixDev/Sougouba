import { Image } from 'expo-image';
import { View } from 'react-native';

import { Text } from './Text';

export interface AvatarProps {
  uri?: string;
  fullName: string;
  size?: number;
}

export function Avatar({ uri, fullName, size = 44 }: AvatarProps) {
  const initials = fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessibilityLabel={fullName}
      />
    );
  }

  return (
    <View
      className="bg-primary items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityLabel={fullName}
    >
      <Text weight="bold" tone="inverted" style={{ fontSize: size * 0.4 }}>
        {initials}
      </Text>
    </View>
  );
}

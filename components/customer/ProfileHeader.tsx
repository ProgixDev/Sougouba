import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { vendorImages } from '@/data/images.generated';
import { useColorScheme, useThemeColors } from '@/hooks/useColorScheme';

export interface ProfileHeaderProps {
  fullName: string;
  email: string;
  /** Local file URI once the shopper picks one; falls back to initials. */
  avatarUrl?: string;
  /** e.g. "Membre depuis août 2026" — omitted for accounts with no join date. */
  memberSinceLabel?: string;
  onChangePhoto: () => void;
}

const COVER_HEIGHT = 168;
const AVATAR_SIZE = 96;
const AVATAR_RING = 4;

/**
 * The profile's opening block: a market cover, the shopper's portrait breaking
 * across its lower edge, then their name.
 *
 * The cover is a photograph of a market rather than a brand colour field —
 * this profile belongs to someone who shops these aisles, and the same imagery
 * carries the rest of the app. A scrim runs the full height so the name below
 * always lands on a settled surface no matter how bright the photo is.
 */
export function ProfileHeader({
  fullName,
  email,
  avatarUrl,
  memberSinceLabel,
  onChangePhoto,
}: ProfileHeaderProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { colorScheme } = useColorScheme();

  const scrim =
    colorScheme === 'dark'
      ? (['rgba(10,32,24,0.35)', 'rgba(10,32,24,0.92)'] as const)
      : (['rgba(10,32,24,0.10)', 'rgba(10,32,24,0.55)'] as const);

  return (
    <View>
      <View style={{ height: COVER_HEIGHT + insets.top }}>
        <Image
          source={vendorImages.vnd_teranga}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
        <LinearGradient
          colors={scrim}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
      </View>

      {/* Pulled up so the portrait sits astride the cover's edge. */}
      <View className="px-5" style={{ marginTop: -(AVATAR_SIZE / 2) }}>
        <View
          className="self-start rounded-full"
          style={{ padding: AVATAR_RING, backgroundColor: colors.background }}
        >
          <Avatar fullName={fullName} uri={avatarUrl} size={AVATAR_SIZE} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('customer.misc.changePhoto')}
            onPress={onChangePhoto}
            hitSlop={6}
            className="absolute bottom-0 right-0 w-9 h-9 items-center justify-center rounded-full border-[3px]"
            style={{ backgroundColor: colors.primary, borderColor: colors.background }}
          >
            <Camera size={16} color={colors.primaryForeground} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View className="mt-3 gap-0.5">
          <Text variant="title" weight="bold" numberOfLines={1} className="text-[26px] leading-[32px]">
            {fullName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {email}
          </Text>
          {memberSinceLabel ? (
            <Text variant="caption" tone="muted" className="text-[12px] mt-0.5">
              {memberSinceLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

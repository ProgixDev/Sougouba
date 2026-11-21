import { Image } from 'expo-image';
import { ImagePlus } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { mediaImageType } from '@/data/api/media';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useImagePicker, type PickedImage } from '@/hooks/useImagePicker';
import { useT } from '@/lib/i18n/useT';
import { mediaUrl } from '@/lib/media';

/**
 * A photo as a form holds it: the Storage path already saved (`''` for none),
 * or a photo just picked and not uploaded yet.
 */
export type PhotoValue = string | PickedImage;

export interface PhotoFieldProps {
  label: string;
  hint: string;
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
  /**
   * `square` for a product (cropped, as every product card draws it square),
   * `wide` for a shop cover (not cropped: iOS can only crop square, and the
   * banner is drawn `cover` anyway).
   */
  shape: 'square' | 'wide';
  disabled?: boolean;
}

const SQUARE_PREVIEW = 168;
const WIDE_PREVIEW_HEIGHT = 150;

/**
 * One photo field — a product's photo, a shop's cover.
 *
 * Only *picks*: the owning form uploads on save (`uploadMediaImage`), so
 * backing out leaves nothing in Storage. A format the API would refuse is
 * stopped here, at the pick, rather than at the end of the form.
 */
export function PhotoField({ label, hint, value, onChange, shape, disabled }: PhotoFieldProps) {
  const t = useT();
  const colors = useThemeColors();
  const { chooseSource } = useImagePicker();

  const uri = typeof value === 'string' ? mediaUrl(value) : value.uri;

  function choose() {
    chooseSource({
      title: label,
      square: shape === 'square',
      quality: 0.7,
      onPick: (image) => {
        if (!mediaImageType(image)) {
          Alert.alert(t('common.imagePicker.unsupportedTitle'), t('common.imagePicker.unsupportedBody'));
          return;
        }
        onChange(image);
      },
    });
  }

  const actions = (
    <>
      <Button label={t('common.imagePicker.change')} variant="outline" size="sm" disabled={disabled} onPress={choose} />
      <Button
        label={t('common.imagePicker.remove')}
        variant="ghost"
        size="sm"
        disabled={disabled}
        onPress={() => onChange('')}
      />
    </>
  );

  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        {label}
      </Text>

      {uri ? (
        shape === 'square' ? (
          <View className="flex-row items-center gap-4">
            <Image
              source={{ uri }}
              style={{ width: SQUARE_PREVIEW, height: SQUARE_PREVIEW, borderRadius: 20, backgroundColor: colors.muted }}
              contentFit="cover"
              transition={150}
              accessibilityLabel={label}
            />
            <View className="flex-1 gap-2">{actions}</View>
          </View>
        ) : (
          <View className="gap-2">
            <Image
              source={{ uri }}
              style={{ width: '100%', height: WIDE_PREVIEW_HEIGHT, borderRadius: 20, backgroundColor: colors.muted }}
              contentFit="cover"
              transition={150}
              accessibilityLabel={label}
            />
            <View className="flex-row gap-2">{actions}</View>
          </View>
        )
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={t('common.imagePicker.add')}
          disabled={disabled}
          onPress={choose}
          className="h-[140px] rounded-[20px] border-[1.5px] border-dashed bg-card items-center justify-center gap-2 px-6"
          style={{ borderColor: colors.borderStrong }}
        >
          <View className="w-11 h-11 rounded-full items-center justify-center bg-primary/10">
            <ImagePlus size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <Text variant="caption" weight="semibold" tone="primary">
            {t('common.imagePicker.add')}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px] text-center">
            {hint}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

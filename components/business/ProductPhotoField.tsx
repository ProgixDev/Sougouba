import { Image } from 'expo-image';
import { ImagePlus } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { productImageType } from '@/data/api/products';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useImagePicker, type PickedImage } from '@/hooks/useImagePicker';
import { useT } from '@/lib/i18n/useT';
import { mediaUrl } from '@/lib/media';

/**
 * A product's photo as the form holds it: the Storage path already saved
 * (`''` for none), or a photo just picked and not uploaded yet.
 */
export type ProductPhotoValue = string | PickedImage;

export interface ProductPhotoFieldProps {
  value: ProductPhotoValue;
  onChange: (value: ProductPhotoValue) => void;
  disabled?: boolean;
}

const PREVIEW_SIZE = 168;

/**
 * The photo at the top of the product form.
 *
 * Only *picks*: the upload happens when the form is saved, so a merchant who
 * backs out leaves nothing in Storage. Cropped square because every card that
 * shows a product draws it square.
 */
export function ProductPhotoField({ value, onChange, disabled }: ProductPhotoFieldProps) {
  const t = useT();
  const colors = useThemeColors();
  const { chooseSource } = useImagePicker();

  const uri = typeof value === 'string' ? mediaUrl(value) : value.uri;

  function choose() {
    chooseSource({
      title: t('business.productForm.photo'),
      square: true,
      quality: 0.7,
      onPick: (image) => {
        if (!productImageType(image)) {
          Alert.alert(t('business.productForm.photoUnsupportedTitle'), t('business.productForm.photoUnsupportedBody'));
          return;
        }
        onChange(image);
      },
    });
  }

  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        {t('business.productForm.photo')}
      </Text>

      {uri ? (
        <View className="flex-row items-center gap-4">
          <Image
            source={{ uri }}
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: 20, backgroundColor: colors.muted }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={t('business.productForm.photo')}
          />
          <View className="flex-1 gap-2">
            <Button
              label={t('business.productForm.photoChange')}
              variant="outline"
              size="sm"
              disabled={disabled}
              onPress={choose}
            />
            <Button
              label={t('business.productForm.photoRemove')}
              variant="ghost"
              size="sm"
              disabled={disabled}
              onPress={() => onChange('')}
            />
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('business.productForm.photoAdd')}
          disabled={disabled}
          onPress={choose}
          className="h-[140px] rounded-[20px] border-[1.5px] border-dashed bg-card items-center justify-center gap-2 px-6"
          style={{ borderColor: colors.borderStrong }}
        >
          <View className="w-11 h-11 rounded-full items-center justify-center bg-primary/10">
            <ImagePlus size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <Text variant="caption" weight="semibold" tone="primary">
            {t('business.productForm.photoAdd')}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px] text-center">
            {t('business.productForm.photoHint')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

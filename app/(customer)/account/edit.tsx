import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Camera, Mail, User as UserIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, BackHeader, Button, Input, Text } from '@/components/ui';
import { authApi } from '@/data/api';
import { mediaImageType } from '@/data/api/media';
import { ApiError } from '@/data/http';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useImagePicker, type PickedImage } from '@/hooks/useImagePicker';
import { mediaUrl } from '@/lib/media';
import { type ProfileValues, profileSchema } from '@/lib/validation/profile';
import { useT } from '@/lib/i18n/useT';
import { i18nResolver } from '@/lib/validation/resolver';
import { useSessionStore } from '@/store/useSessionStore';

export default function EditProfileScreen() {
  const t = useT();
  const colors = useThemeColors();
  const { chooseSource } = useImagePicker();
  const user = useSessionStore((s) => s.user);
  const updateUser = useSessionStore((s) => s.updateUser);

  // Held locally so leaving without saving discards the new portrait too: the
  // stored path, or a photo just picked and only uploaded on save.
  const [photo, setPhoto] = useState<string | PickedImage>(user?.avatarUrl ?? '');

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: i18nResolver(t, profileSchema),
    defaultValues: { fullName: user?.fullName ?? '', email: user?.email ?? '' },
  });

  function pickPhoto() {
    chooseSource({
      title: t('customer.account.edit.changePhoto'),
      square: true,
      quality: 0.8,
      onPick: (image) => {
        if (!mediaImageType(image)) {
          Alert.alert(t('common.imagePicker.unsupportedTitle'), t('common.imagePicker.unsupportedBody'));
          return;
        }
        setPhoto(image);
      },
    });
  }

  async function onSubmit(values: ProfileValues) {
    // The email is the sign-in identity and is not editable here. A newly
    // picked photo is uploaded first, then saved with the name in one call.
    let avatarUrl: string;
    try {
      avatarUrl = typeof photo === 'string' ? photo : await authApi.uploadAvatar(photo, mediaImageType(photo)!);
    } catch {
      Alert.alert(t('common.imagePicker.uploadFailed'));
      return;
    }
    try {
      await authApi.updateProfile({
        fullName: values.fullName.trim(),
        ...(avatarUrl !== (user?.avatarUrl ?? '') ? { avatarUrl } : {}),
      });
    } catch (error) {
      Alert.alert(
        t('common.genericError'),
        error instanceof ApiError && error.isClientError ? error.message : undefined
      );
      return;
    }
    updateUser({ fullName: values.fullName.trim(), avatarUrl: avatarUrl || undefined });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (router.canGoBack()) router.back();
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.account.edit.title')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="px-6 pt-4 pb-10 gap-7" keyboardShouldPersistTaps="handled">
          <View className="items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('customer.account.edit.changePhotoA11y')}
              onPress={pickPhoto}
            >
              <Avatar
                fullName={user?.fullName ?? '?'}
                uri={(typeof photo === 'string' ? mediaUrl(photo) : photo.uri) ?? undefined}
                size={104}
              />
              <View
                className="absolute bottom-0 right-0 w-9 h-9 items-center justify-center rounded-full border-[3px]"
                style={{ backgroundColor: colors.primary, borderColor: colors.background }}
              >
                <Camera size={16} color={colors.primaryForeground} strokeWidth={2.2} />
              </View>
            </Pressable>
            <Pressable onPress={pickPhoto} hitSlop={6} accessibilityRole="button">
              <Text variant="caption" weight="semibold" tone="primary">
                {t('customer.account.edit.changePhoto')}
              </Text>
            </Pressable>
          </View>

          <View className="gap-4">
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.field.fullName')}
                  icon={UserIcon}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.fullName?.message}
                  autoCapitalize="words"
                  textContentType="name"
                />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.field.email')}
                  icon={Mail}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={false}
                />
              )}
            />
          </View>

          <Text variant="caption" tone="muted">
              {t('customer.account.edit.emailHint')}
          </Text>

          <Button
            label={t('common.save')}
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

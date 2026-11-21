import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Camera, Mail, User as UserIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, BackHeader, Button, Input, Text } from '@/components/ui';
import { api, ApiError } from '@/data/http';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useImagePicker } from '@/hooks/useImagePicker';
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

  // Held locally so leaving without saving discards the new portrait too.
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl);

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
      onPick: (image) => setAvatarUrl(image.uri),
    });
  }

  async function onSubmit(values: ProfileValues) {
    // Only the name goes to the API. The email is the sign-in identity and is
    // not editable here; the photo is still a local file URI, and the API takes
    // an https URL — it stays on this device until photo upload exists.
    try {
      await api('/me', { method: 'PATCH', body: { fullName: values.fullName.trim() } });
    } catch (error) {
      Alert.alert(
        t('common.genericError'),
        error instanceof ApiError && error.isClientError ? error.message : undefined
      );
      return;
    }
    updateUser({ fullName: values.fullName.trim(), avatarUrl });
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
              <Avatar fullName={user?.fullName ?? '?'} uri={avatarUrl} size={104} />
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

import { Link } from 'expo-router';
import { Gift, Lock, Mail, User } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, Input, Text } from '@/components/ui';
import { authApi } from '@/data/api';
import { AuthError } from '@/data/api/auth';
import { type SignUpValues, signUpSchema } from '@/lib/validation/auth';
import { useT } from '@/lib/i18n/useT';
import { i18nResolver } from '@/lib/validation/resolver';
import { useSessionStore } from '@/store/useSessionStore';

export default function SignUpScreen() {
  const t = useT();
  const signUp = useSessionStore((s) => s.signUp);
  const signIn = useSessionStore((s) => s.signIn);
  const [formError, setFormError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: i18nResolver(t, signUpSchema),
    // Without these, RHF hands `undefined` to TextInput and the field flips
    // from uncontrolled to controlled on the first keystroke.
    defaultValues: { fullName: '', email: '', password: '', referralCode: '' },
  });

  async function onSubmit(values: SignUpValues) {
    setFormError(null);
    try {
      const user = await authApi.signUp(
        values.fullName,
        values.email,
        values.password,
        values.referralCode
      );
      signUp(user);
    } catch (e) {
      setFormError(
        e instanceof AuthError ? t(`auth.error.${e.code}`) : t('common.genericError')
      );
    }
  }

  async function continueWithOAuth(provider: 'google' | 'apple') {
    setFormError(null);
    setOauthLoading(provider);
    try {
      // OAuth is idempotent in the mock layer — it returns the existing demo
      // account if there is one. Treat it as a sign-in so a returning user
      // keeps the role they already picked instead of being re-gated.
      const user = await authApi.oauthContinue(provider);
      signIn(user);
    } catch (e) {
      setFormError(
        e instanceof AuthError ? t(`auth.error.${e.code}`) : t('common.genericError')
      );
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="px-6 pt-4 pb-10 gap-6" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <Text variant="title" weight="bold">
              {t('auth.signUp.title')}
            </Text>
            <Text variant="body" tone="muted">
              {t('auth.signUp.body')}
            </Text>
          </View>

          <View className="gap-4">
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.field.fullName')}
                  icon={User}
                  autoComplete="name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.fullName?.message}
                  required
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
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  required
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.field.password')}
                  icon={Lock}
                  isPassword
                  autoComplete="password-new"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  helperText={errors.password ? undefined : t('validation.password.tooShort')}
                  required
                />
              )}
            />
            <Controller
              control={control}
              name="referralCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.field.referralCode')}
                  icon={Gift}
                  autoCapitalize="characters"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.referralCode?.message}
                  helperText={t('auth.field.referralHint')}
                />
              )}
            />
          </View>

          {formError ? (
            <Text variant="caption" tone="destructive">
              {formError}
            </Text>
          ) : null}

          <Button label={t('auth.signUp.submit')} variant="primary" size="lg" fullWidth loading={isSubmitting} onPress={handleSubmit(onSubmit)} />

          <View className="flex-row items-center gap-3">
            <View className="flex-1 h-px bg-border" />
            <Text variant="caption" tone="muted">
              {t('auth.or')}
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          <View className="gap-3">
            <Button
              label={t('auth.oauth.google')}
              variant="outline"
              size="lg"
              fullWidth
              loading={oauthLoading === 'google'}
              onPress={() => continueWithOAuth('google')}
            />
            <Button
              label={t('auth.oauth.apple')}
              variant="outline"
              size="lg"
              fullWidth
              loading={oauthLoading === 'apple'}
              onPress={() => continueWithOAuth('apple')}
            />
          </View>

          <View className="flex-row items-center justify-center gap-1.5 mt-2">
            <Text variant="caption" tone="muted">
              {t('auth.signUp.hasAccount')}
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Text variant="caption" weight="bold" tone="primary">
                {t('auth.signIn.submit')}
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

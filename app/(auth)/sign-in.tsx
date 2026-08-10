import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, Input, Text } from '@/components/ui';
import { authApi } from '@/data/api';
import { AuthError } from '@/data/api/auth';
import { type SignInValues, signInSchema } from '@/lib/validation/auth';
import { useSessionStore } from '@/store/useSessionStore';

export default function SignInScreen() {
  const signIn = useSessionStore((s) => s.signIn);
  const [formError, setFormError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    // Without these, RHF hands `undefined` to TextInput and the field flips
    // from uncontrolled to controlled on the first keystroke.
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    try {
      const user = await authApi.mockSignIn(values.email, values.password);
      signIn(user);
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : 'Une erreur est survenue.');
    }
  }

  async function continueWithOAuth(provider: 'google' | 'apple') {
    setFormError(null);
    setOauthLoading(provider);
    try {
      const user = await authApi.mockOAuthContinue(provider);
      signIn(user);
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : 'Une erreur est survenue.');
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
              Content de vous revoir
            </Text>
            <Text variant="body" tone="muted">
              Connectez-vous pour continuer vos commandes.
            </Text>
          </View>

          <View className="gap-4">
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Adresse courriel"
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
                  label="Mot de passe"
                  icon={Lock}
                  isPassword
                  autoComplete="password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  required
                />
              )}
            />
            <Link href="/(auth)/forgot-password" asChild>
              <Text variant="caption" weight="semibold" tone="primary" className="self-end">
                Mot de passe oublié ?
              </Text>
            </Link>
          </View>

          {formError ? (
            <Text variant="caption" tone="destructive">
              {formError}
            </Text>
          ) : null}

          <Button label="Se connecter" variant="primary" size="lg" fullWidth loading={isSubmitting} onPress={handleSubmit(onSubmit)} />

          <View className="flex-row items-center gap-3">
            <View className="flex-1 h-px bg-border" />
            <Text variant="caption" tone="muted">
              ou
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          <View className="gap-3">
            <Button
              label="Continuer avec Google"
              variant="outline"
              size="lg"
              fullWidth
              loading={oauthLoading === 'google'}
              onPress={() => continueWithOAuth('google')}
            />
            <Button
              label="Continuer avec Apple"
              variant="outline"
              size="lg"
              fullWidth
              loading={oauthLoading === 'apple'}
              onPress={() => continueWithOAuth('apple')}
            />
          </View>

          <View className="flex-row items-center justify-center gap-1.5 mt-2">
            <Text variant="caption" tone="muted">
              Pas encore de compte ?
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Text variant="caption" weight="bold" tone="primary">
                Créer un compte
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

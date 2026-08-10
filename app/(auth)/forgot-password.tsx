import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Mail, MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, Input, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { delay } from '@/data/utils/delay';
import { type ForgotPasswordValues, forgotPasswordSchema } from '@/lib/validation/auth';

export default function ForgotPasswordScreen() {
  const colors = useThemeColors();
  const [sent, setSent] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    await delay(500, 800);
    setSent(values.email);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 px-6 pt-4">
        {sent ? (
          <View className="flex-1 items-center justify-center gap-4 pb-20">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
              <MailCheck size={36} color={colors.primary} strokeWidth={1.5} />
            </View>
            <Text variant="title" weight="bold" className="text-center">
              Vérifiez vos courriels
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              Si un compte existe pour {sent}, un lien de réinitialisation vient d’être envoyé.
            </Text>
            <View className="w-full mt-4">
              <Button label="Retour à la connexion" variant="primary" size="lg" fullWidth onPress={() => router.replace('/(auth)/sign-in')} />
            </View>
          </View>
        ) : (
          <View className="gap-6">
            <View className="gap-2">
              <Text variant="title" weight="bold">
                Mot de passe oublié
              </Text>
              <Text variant="body" tone="muted">
                Entrez votre adresse courriel — nous vous enverrons un lien pour le réinitialiser.
              </Text>
            </View>

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

            <Button label="Envoyer le lien" variant="primary" size="lg" fullWidth loading={isSubmitting} onPress={handleSubmit(onSubmit)} />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

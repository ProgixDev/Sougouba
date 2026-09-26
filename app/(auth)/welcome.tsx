import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { MotiView } from 'moti';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';

export default function AuthLandingScreen() {
  const t = useT();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        <MotiView
          from={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 500 }}
          className="items-center"
        >
          <Image
            source={require('@/assets/images/brand/mark.png')}
            style={{ width: 150, height: 150 * (1610 / 1817) }}
            contentFit="contain"
          />
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 150 }}
          className="items-center gap-3 mt-8"
        >
          <Text variant="title" weight="bold" className="text-center">
            {t('auth.welcome.title')}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {t('auth.welcome.body')}
          </Text>
        </MotiView>
      </View>

      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 500, delay: 250 }}
        className="px-8 pb-4 gap-3"
      >
        <Link href="/(auth)/sign-up" asChild>
          <Button label={t('auth.signUp.submit')} variant="primary" size="lg" fullWidth />
        </Link>
        <Link href="/(auth)/sign-in" asChild>
          <Button label={t('auth.signIn.submit')} variant="outline" size="lg" fullWidth />
        </Link>
      </MotiView>
    </SafeAreaView>
  );
}

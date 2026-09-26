import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { ChevronRight, Mail, ShieldCheck, Store } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MerchantSignupSheet } from '@/components/onboarding';
import { useT } from '@/lib/i18n/useT';
import { BackHeader, Reveal, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';

const SUPPORT_EMAIL = 'soutien@sougouba.ca';

export default function AboutScreen() {
  const t = useT();
  const colors = useThemeColors();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const [signupSheet, setSignupSheet] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.account.about.title')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-2 pb-10 gap-6">
        <Reveal>
          <View className="items-center gap-3 py-4">
            <Image
              source={require('@/assets/images/brand/mark.png')}
              style={{ width: 72, height: 72 }}
              contentFit="contain"
            />
            <View className="items-center gap-1">
              <Text variant="title" weight="bold" className="text-[22px]">
                Sougouba
              </Text>
              <Text variant="caption" tone="muted">
                {t('customer.account.about.version', { version })}
              </Text>
            </View>
          </View>
        </Reveal>

        <Reveal delay={70}>
          <View className="rounded-[20px] bg-card p-5 gap-2">
            <Text variant="caption" weight="bold">
              {t('customer.account.about.tagline')}
            </Text>
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('customer.account.about.body')}
            </Text>
          </View>
        </Reveal>

        <Reveal delay={120}>
          <View className="rounded-[20px] bg-card overflow-hidden">
            <LinkRow
              icon={Mail}
              label={t('customer.account.about.support')}
              detail={SUPPORT_EMAIL}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            />
            <View className="h-px bg-border ml-16" />
            {/* Not a mailto: shop registration is a form in the app followed by
                a manual approval. The sheet explains that; it is the same one
                the role gate shows, minus the part that commits an account —
                this reader is a shopper asking how selling works, not someone
                changing role. */}
            <LinkRow
              icon={Store}
              label={t('customer.account.about.registerShop')}
              detail={t('customer.account.about.registerShopDetail')}
              onPress={() => setSignupSheet(true)}
            />
          </View>
        </Reveal>

        <Reveal delay={170}>
          <View className="rounded-[20px] border border-border p-5 gap-2">
            <View className="flex-row items-center gap-2">
              <ShieldCheck size={15} color={colors.mutedForeground} strokeWidth={2} />
              <Text variant="label" tone="muted">
                {t('customer.account.about.prototypeLabel')}
              </Text>
            </View>
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('customer.account.about.prototypeBody')}
            </Text>
          </View>
        </Reveal>
      </ScrollView>

      <MerchantSignupSheet visible={signupSheet} onClose={() => setSignupSheet(false)} />
    </SafeAreaView>
  );
}

function LinkRow({
  icon: Icon,
  label,
  detail,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-3 p-4 active:opacity-70"
    >
      <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
        <Icon size={17} color={colors.mutedForeground} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" weight="semibold">
          {label}
        </Text>
        <Text variant="caption" tone="muted" className="text-[12px]">
          {detail}
        </Text>
      </View>
      <ChevronRight size={17} color={colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
}

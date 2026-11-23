import { router } from 'expo-router';
import { Clock3, ShieldCheck, Store } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { MERCHANT_SIGNUP_STEPS } from '@/lib/merchantOnboarding';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';

export interface PendingApprovalProps {
  /** `missing` has never filed anything; `pending` is waiting on a human. */
  state: 'missing' | 'pending';
}

/**
 * What a merchant account sees before its shop is live.
 *
 * Two states, and the difference is the whole reason this is not an error
 * message. "Missing" is a form nobody has filled; "pending" is a shop sitting in
 * the admin queue (CDC addendum v1.1, §02). Telling someone to wait when they
 * have not applied, or asking them to apply when they already have, are both
 * ways of looking broken.
 *
 * Registration itself used to live on the administration website and this screen
 * existed mostly to explain a redirect it could not perform. The form is in the
 * app now; what did not change is that a person approves it.
 *
 * Rendered by all five business tabs rather than each writing its own version —
 * they are all the same account in the same state.
 */
export function PendingApproval({ state }: PendingApprovalProps) {
  const t = useT();
  const colors = useThemeColors();
  const tabBarInset = useTabBarInset();

  const applied = state === 'pending';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        // The tab bar is positioned absolutely so content scrolls under its
        // blur; every scroll container inside `(tabs)` reserves this.
        contentContainerStyle={{ padding: 20, paddingBottom: tabBarInset + 28, gap: 20 }}
      >
        <View className="items-start gap-4 pt-6">
          <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
            {applied ? (
              <Clock3 size={30} color={colors.primary} strokeWidth={1.6} />
            ) : (
              <Store size={30} color={colors.primary} strokeWidth={1.6} />
            )}
          </View>
          <View className="gap-2">
            <Text variant="title" weight="bold" className="text-[26px]">
              {applied ? t('business.shopProfile.pendingTitle') : t('business.queue.registerShop')}
            </Text>
            <Text variant="body" tone="muted">
              {applied
                ? t('business.queue.pendingBody')
                : t('business.queue.missingBody')}
            </Text>
          </View>
        </View>

        <View className="rounded-[20px] bg-card p-5 gap-5">
          {MERCHANT_SIGNUP_STEPS.map((step, index) => (
            <View key={step} className="flex-row gap-3.5">
              <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center mt-0.5">
                <Text variant="caption" weight="bold" tone="primary" className="text-[12px]">
                  {index + 1}
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text variant="caption" weight="bold">
                  {t(`onboarding.merchant.${step}.title`)}
                </Text>
                <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                  {t(`onboarding.merchant.${step}.body`)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {applied ? (
          <View className="flex-row items-start gap-2.5 rounded-2xl border border-border p-4">
            <ShieldCheck
              size={15}
              color={colors.mutedForeground}
              strokeWidth={2}
              className="mt-0.5"
            />
            <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[19px]">
            {t('business.pending.body')}
            </Text>
          </View>
        ) : (
          <Button
            label={t('business.shopProfile.registerShop')}
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push(routes.businessSignup)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

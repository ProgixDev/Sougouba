import { router } from 'expo-router';
import { Store } from 'lucide-react-native';
import { View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';

/**
 * The shop is approved but offline: its monthly subscription is not in order,
 * so customers do not see it and no new order can reach it.
 *
 * Shown where a merchant looks first — the dashboard and the order queue —
 * because an empty queue otherwise reads as a quiet day. Orders already
 * received are still there to be prepared, which is why this sits above the
 * screen rather than replacing it the way `PendingApproval` does.
 *
 * It only points at the profile: the subscription is started and paid from the
 * plan card there, the one place in the app that opens Stripe for it.
 */
export function SubscriptionHoldBanner() {
  const t = useT();
  const colors = useThemeColors();

  return (
    <View
      className="mx-5 rounded-[20px] bg-card p-4 gap-3.5"
      style={{ borderWidth: 1, borderColor: `${colors.destructive}55` }}
      accessibilityRole="alert"
    >
      <View className="flex-row gap-3">
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: `${colors.destructive}14` }}
        >
          <Store size={18} color={colors.destructive} strokeWidth={2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="caption" weight="bold" className="text-[14px]">
            {t('business.subscriptionHold.title')}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
            {t('business.subscriptionHold.body')}
          </Text>
        </View>
      </View>
      <Button
        label={t('business.subscriptionHold.cta')}
        variant="primary"
        size="sm"
        fullWidth
        onPress={() => router.push(routes.businessProfile)}
      />
    </View>
  );
}

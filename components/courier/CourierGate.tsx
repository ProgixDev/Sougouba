import { router } from 'expo-router';
import { Clock3, FileText, ShieldCheck } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useDemoCourierApproval } from '@/hooks/useDemoCourierApproval';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { COURIER_SIGNUP_STEPS } from '@/lib/courierOnboarding';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';

export interface CourierGateProps {
  /** `missing` has never filled the form; `pending` is waiting on a human. */
  state: 'missing' | 'pending';
  /** Re-read the file after the demo approval, so the tabs leave this screen. */
  onApproved?: () => Promise<void> | void;
}

/**
 * What a courier account sees before it is cleared to take runs.
 *
 * Two states, not one — and the difference is the whole reason this screen is
 * not an error message. "Missing" is a form nobody has filled; "pending" is a
 * file sitting in the admin queue (CDC addendum v1.1, §04). Telling someone to
 * wait when they have not applied, or asking them to apply when they already
 * have, are both ways of looking broken.
 *
 * Rendered by all four courier tabs rather than each writing its own version:
 * they are the same account in the same state.
 */
export function CourierGate({ state, onApproved }: CourierGateProps) {
  const t = useT();
  const colors = useThemeColors();
  const tabBarInset = useTabBarInset();
  const { approve, approving } = useDemoCourierApproval(onApproved);

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
          <View className="w-16 h-16 rounded-full bg-secondary/10 items-center justify-center">
            {applied ? (
              <Clock3 size={30} color={colors.secondary} strokeWidth={1.6} />
            ) : (
              <FileText size={30} color={colors.secondary} strokeWidth={1.6} />
            )}
          </View>
          <View className="gap-2">
            <Text variant="title" weight="bold" className="text-[26px]">
              {t(applied ? 'courier.gateCopy.pendingTitle' : 'courier.gateCopy.completeTitle')}
            </Text>
            <Text variant="body" tone="muted">
              {applied
                ? t('courier.gateCopy.pendingBody')
                : t('courier.gateCopy.completeBody')}
            </Text>
          </View>
        </View>

        <View className="rounded-[20px] bg-card p-5 gap-5">
          {COURIER_SIGNUP_STEPS.map((step, index) => (
            <View key={step} className="flex-row gap-3.5">
              <View className="w-7 h-7 rounded-full bg-secondary/10 items-center justify-center mt-0.5">
                <Text variant="caption" weight="bold" tone="secondary" className="text-[12px]">
                  {index + 1}
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text variant="caption" weight="bold">
                  {t(`onboarding.courier.${step}.title`)}
                </Text>
                <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                  {t(`onboarding.courier.${step}.body`)}
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
              {t('courier.gate.pendingBody')}
            </Text>
          </View>
        ) : (
          <Button
            label="Remplir mon dossier"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push(routes.courierSignup)}
          />
        )}

        {/* Says what it is. Without the back-office there is no other way to
            reach the courier screens from an account created in the app, and a
            demo that cannot show them is worse than one honest button. */}
        {applied ? (
          <View className="gap-2 pt-2 border-t border-border">
            <Text variant="label" tone="muted" className="text-[10px]">
              {t('courier.gate.demoLabel')}
            </Text>
            <Button
              label={t('courier.gate.approve')}
              variant="outline"
              size="md"
              fullWidth
              loading={approving}
              onPress={approve}
            />
            <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
              {t('courier.gate.approveBody')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

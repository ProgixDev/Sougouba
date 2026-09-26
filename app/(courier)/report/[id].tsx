import { router, useLocalSearchParams } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, EmptyState, Input, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import type { CourierIssueReason, Order } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { canReportIssue, courierIssueKey, courierIssueReasons } from '@/lib/disputes';
import { useT } from '@/lib/i18n/useT';

/**
 * Something went wrong on the road.
 *
 * The reason list is the courier's own (`courierIssueReasons`), not the
 * shopper's — a courier does not report "articles manquants", they report that
 * nobody answered the door.
 *
 * Submitting does not end the run: the courier still has the order, and what
 * happens to it is a decision for whoever arbitrates, not for this screen. The
 * copy says so, because a report button that quietly cancelled a delivery would
 * be the worst possible surprise.
 */
export default function CourierReportScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<CourierIssueReason | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ordersApi.getOrderById(id).then((found) => {
      if (!active) return;
      setOrder(found ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function submit() {
    if (!order || !reason || busy) return;
    if (message.trim().length < 5) {
      setError(t('courier.reportErrors.describe'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const updated = await ordersApi.reportCourierIssue(order.id, {
        reason,
        message: message.trim(),
      });
      if (!updated) {
        setError(t('courier.reportErrors.failed'));
        return;
      }
      router.back();
    } finally {
      setBusy(false);
    }
  }

  const reportable = order ? canReportIssue(order) : false;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('courier.report.title')} />

      {loading ? (
        <View className="px-5 gap-4">
          <Skeleton height={40} radius={12} />
          <Skeleton height={180} radius={20} />
        </View>
      ) : !order ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={TriangleAlert}
            title={t('courier.reportState.notFoundTitle')}
            description={t('courier.delivery.notFound')}
          />
        </View>
      ) : !reportable ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={TriangleAlert}
            title={order.courierIssue ? t('courier.reportState.alreadyTitle') : t('courier.reportState.nothingTitle')}
            description={
              order.courierIssue
                ? t('courier.reportState.alreadyBody')
                : t('courier.reportState.nothingBody')
            }
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
          >
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('courier.report.note')}
            </Text>

            <View className="gap-2.5">
              {courierIssueReasons.map((key) => {
                const label = t(courierIssueKey(key));
                const selected = reason === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setReason(key)}
                    className={`h-14 rounded-2xl border-[1.5px] px-4 flex-row items-center ${
                      selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
                    }`}
                  >
                    <Text variant="caption" weight={selected ? 'bold' : 'medium'} className="flex-1">
                      {label}
                    </Text>
                    {selected ? (
                      <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
                        <Text
                          variant="caption"
                          weight="bold"
                          className="text-[11px]"
                          style={{ color: colors.primaryForeground }}
                        >
                          ✓
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={t('courier.report.whatHappened')}
              value={message}
              onChangeText={(text) => {
                setMessage(text);
                setError(null);
              }}
              multiline
              error={error ?? undefined}
              required
            />

            <Button
              label={t('courier.report.submit')}
              variant="primary"
              size="lg"
              fullWidth
              disabled={!reason}
              loading={busy}
              onPress={submit}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

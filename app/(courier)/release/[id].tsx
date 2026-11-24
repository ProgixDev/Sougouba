import { router, useLocalSearchParams } from 'expo-router';
import { Undo2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Button, EmptyState, Input, Skeleton, Text } from '@/components/ui';
import { ordersApi } from '@/data/api';
import type { Order, RunReleaseReason } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { canReleaseRun, runReleaseReasonKey, runReleaseReasons } from '@/lib/cancellation';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';

const MIN_NOTE = 5;

/**
 * Handing a run back before pickup.
 *
 * The opposite of the report screen next door: that one keeps the run open and
 * asks a person to decide; this one ends it for this courier, on the spot, and
 * the order goes to the next one. Which is why it is only offered while the bag
 * is still at the shop, and why the copy says plainly what is given up — the
 * pay for this run, and any chance of being offered it again.
 *
 * A reason is asked for; a sentence only for "other". A courier with a flat
 * tyre is standing at the roadside, not writing a report.
 */
export default function CourierReleaseScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<RunReleaseReason | null>(null);
  const [note, setNote] = useState('');
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
    if (reason === 'other' && note.trim().length < MIN_NOTE) {
      setError(t('courier.release.detailsRequired'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await ordersApi.releaseRun(order.id, { reason, ...(note.trim() ? { note: note.trim() } : {}) });
      // The run is no longer this courier's: its screen would only say "not
      // found". Back to the missions list, where the next offer arrives.
      router.replace(routes.courierMissions);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t('courier.release.failed'));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('courier.release.title')} />

      {loading ? (
        <View className="px-5 gap-4">
          <Skeleton height={40} radius={12} />
          <Skeleton height={180} radius={20} />
        </View>
      ) : !order ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState icon={Undo2} title={t('courier.reportState.notFoundTitle')} description={t('courier.delivery.notFound')} />
        </View>
      ) : !canReleaseRun(order) ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState icon={Undo2} title={t('courier.release.tooLateTitle')} description={t('courier.release.tooLateBody')} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
          >
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('courier.release.note')}
            </Text>

            <View className="gap-2.5">
              <Text variant="label" tone="muted">
                {t('courier.release.why')}
              </Text>
              {runReleaseReasons.map((key) => {
                const selected = reason === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setReason(key);
                      setError(null);
                    }}
                    className={`h-14 rounded-2xl border-[1.5px] px-4 flex-row items-center ${
                      selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
                    }`}
                  >
                    <Text variant="caption" weight={selected ? 'bold' : 'medium'} className="flex-1">
                      {t(runReleaseReasonKey(key))}
                    </Text>
                    {selected ? (
                      <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
                        <Text variant="caption" weight="bold" className="text-[11px]" style={{ color: colors.primaryForeground }}>
                          ✓
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={t('courier.release.details')}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                setError(null);
              }}
              multiline
              maxLength={500}
              error={error ?? undefined}
              required={reason === 'other'}
            />

            <Button
              label={t('courier.release.submit')}
              variant="destructive"
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

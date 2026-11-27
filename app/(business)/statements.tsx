import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';
import { FileText, ReceiptText } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MerchantPayoutCard } from '@/components/business';
import { BackHeader, EmptyState, Skeleton, Text } from '@/components/ui';
import { vendorsApi } from '@/data/api';
import type { MerchantStatement, StatementTotals } from '@/data/api/vendors';
import { ApiError } from '@/data/http';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useMerchantPayouts } from '@/hooks/useMerchantPayouts';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { formatCad, formatMonthYear } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { selectLocale, useLanguageStore } from '@/store/useLanguageStore';

/** `2026-11` → "novembre 2026". Mid-month at noon, so no time zone can tip it into a neighbouring month. */
const monthOf = (period: string) => formatMonthYear(`${period}-15T12:00:00`);

/**
 * The shop's money: when it is next paid and into which account, then its
 * monthly statements — what its orders were worth to it, what was sent, and
 * what is still owed (`api/src/billing/`).
 *
 * The payout card comes first because it holds the one thing a merchant must
 * do here: link a bank account. The month in progress follows, added up live —
 * otherwise a new shop would look at an empty screen until the 1st. Below it,
 * every statement issued; each opens as a PDF in the in-app browser, through a
 * short-lived link, exactly as an order's receipt does.
 */
export default function BusinessStatementsScreen() {
  const t = useT();
  const colors = useThemeColors();
  const locale = useLanguageStore(selectLocale);
  const { approved } = useOwnerVendor();
  const payouts = useMerchantPayouts(approved);
  const [data, setData] = useState<Awaited<ReturnType<typeof vendorsApi.getMyStatements>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!approved) return;
      let active = true;
      vendorsApi
        .getMyStatements()
        .then((loaded) => active && setData(loaded))
        .catch(() => active && setData(null))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [approved])
  );

  async function open(statement: MerchantStatement) {
    if (openingId) return;
    setError(null);
    setOpeningId(statement.id);
    try {
      const url = await vendorsApi.getStatementUrl(statement.id, locale);
      // Cleared before the browser opens: on iOS the promise below settles only
      // when the merchant closes it.
      setOpeningId(null);
      await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('business.statements.failed'));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('business.statements.title')} />
      <ScrollView contentContainerClassName="px-5 pb-10 gap-5" showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="gap-3">
            <Skeleton className="h-44 rounded-[20px]" />
            <Skeleton className="h-16 rounded-2xl" />
          </View>
        ) : (
          <>
            {approved ? <MerchantPayoutCard payouts={payouts} /> : null}

            {data ? (
              <View className="rounded-[20px] bg-card p-4 gap-3">
                <View className="gap-0.5">
                  <Text variant="label" tone="muted" className="text-[10px]">
                    {t('business.statements.currentMonth')}
                  </Text>
                  <Text variant="subtitle" weight="bold">
                    {monthOf(data.current.period)}
                  </Text>
                </View>
                <Figures totals={data.current.totals} />
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {t('business.statements.currentHint')}
                </Text>
              </View>
            ) : null}

            <View className="gap-3">
              <Text variant="label" tone="muted">
                {t('business.statements.issued')}
              </Text>
              {data && data.statements.length > 0 ? (
                <View className="rounded-2xl bg-card overflow-hidden">
                  {data.statements.map((statement, index) => {
                    const owed = statement.totals.balanceCad < 0;
                    return (
                      <Pressable
                        key={statement.id}
                        accessibilityRole="button"
                        accessibilityLabel={t('business.statements.openA11y', { month: monthOf(statement.period) })}
                        accessibilityState={{ busy: openingId === statement.id }}
                        onPress={() => void open(statement)}
                        className={`flex-row items-center gap-3 px-4 py-3.5 ${index > 0 ? 'border-t border-border' : ''} ${
                          openingId === statement.id ? 'opacity-50' : ''
                        }`}
                      >
                        <View className="w-9 h-9 items-center justify-center rounded-full bg-primary/10">
                          <FileText size={17} color={colors.primary} strokeWidth={2} />
                        </View>
                        <View className="flex-1 gap-0.5">
                          <Text variant="caption" weight="semibold">
                            {monthOf(statement.period)}
                          </Text>
                          <Text variant="caption" tone="muted" className="text-[12px]">
                            {t('business.statements.orders', { count: statement.totals.orderCount })}
                            {statement.number ? ` · ${statement.number}` : ''}
                          </Text>
                        </View>
                        <View className="items-end gap-0.5">
                          <Text variant="caption" weight="bold" tone={owed ? 'destructive' : 'default'}>
                            {formatCad(Math.abs(statement.totals.balanceCad))}
                          </Text>
                          <Text variant="caption" tone="muted" className="text-[11px]">
                            {owed ? t('business.statements.balanceOwed') : t('business.statements.balance')}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <EmptyState
                  icon={ReceiptText}
                  title={t('business.statements.emptyTitle')}
                  description={t('business.statements.emptyBody')}
                />
              )}
              {error ? (
                <Text variant="caption" tone="destructive" className="text-center">
                  {error}
                </Text>
              ) : null}
            </View>

            <Text variant="caption" tone="muted" className="text-[12px]">
              {t('business.statements.notInvoice')}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The month's money column: what the orders were worth to the shop, what came off, what was sent, what is left. */
function Figures({ totals }: { totals: StatementTotals }) {
  const t = useT();
  const owed = totals.balanceCad < 0;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="muted">
        {t('business.statements.orders', { count: totals.orderCount })}
      </Text>
      <Row label={t('business.statements.sales')} value={formatCad(totals.goodsCad + totals.gstCad + totals.qstCad)} />
      {totals.couponsCad > 0 ? <Row label={t('business.statements.coupons')} value={formatCad(-totals.couponsCad)} /> : null}
      <Row label={t('business.statements.commission')} value={formatCad(-totals.commissionCad)} />
      <Row label={t('business.statements.earned')} value={formatCad(totals.earnedCad)} />
      {totals.refundCount > 0 ? <Row label={t('business.statements.refunds')} value={formatCad(-totals.refundsCad)} /> : null}
      {totals.openingCad !== 0 ? <Row label={t('business.statements.opening')} value={formatCad(totals.openingCad)} /> : null}
      {totals.payoutCount > 0 ? <Row label={t('business.statements.paid')} value={formatCad(-totals.paidCad)} /> : null}
      <View className="h-px bg-border my-0.5" />
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="caption" weight="bold">
          {owed ? t('business.statements.balanceOwed') : t('business.statements.balance')}
        </Text>
        <Text variant="title" weight="bold" tone={owed ? 'destructive' : 'primary'} className="text-[20px]">
          {formatCad(Math.abs(totals.balanceCad))}
        </Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="caption" weight="semibold">
        {value}
      </Text>
    </View>
  );
}

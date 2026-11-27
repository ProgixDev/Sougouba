'use client';
import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/insights/Insights';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { ShopHoursCard, ShopInfoCard, ShopSectionsCard } from '@/components/merchant/ShopSettings';
import { SubscriptionCard } from '@/components/merchant/SubscriptionCard';
import { getMyShop, type Shop } from '@/lib/api/merchantCatalog';
import { t } from '@/lib/i18n';

const STATUS_NOTE: Partial<Record<Shop['status'], string>> = {
  pending: t('portal.shop.statusNote.pending'),
  suspended: t('portal.shop.statusNote.suspended'),
  rejected: t('portal.shop.statusNote.rejected'),
};

/**
 * The shop's own settings, on the web: its page, its hours, its shelves and
 * its subscription. What the mobile app's « Modifier ma boutique » does, with
 * room for a keyboard.
 */
export default function MerchantShopPage() {
  const toast = useToast();
  const [shop, setShop] = useState<Shop | null>(null);
  const [failed, setFailed] = useState(false);
  const [subscriptionKey, setSubscriptionKey] = useState(0);

  useEffect(() => {
    getMyShop().then(setShop).catch(() => setFailed(true));
  }, []);

  // Back from Stripe: say what happened, read the subscription again, and take
  // the marker out of the address so a reload does not say it twice. Read off
  // `window.location` rather than `useSearchParams`, which would force the
  // whole page behind a Suspense boundary for one query parameter.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get('abonnement');
    if (!state) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (state === 'cancel') toast('info', t('portal.shop.subscriptionUnchanged'));
    else setSubscriptionKey((key) => key + 1);
  }, [toast]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Store} title={t('nav.merchant.shop')} description={t('portal.shop.description')} />

      {failed ? (
        <Text variant="body" tone="destructive">
          {t('portal.shop.loadFailed')}
        </Text>
      ) : !shop ? (
        <Skeleton className="h-96 rounded-card" />
      ) : (
        <>
          {STATUS_NOTE[shop.status] && (
            <div className="rounded-card border border-border-strong bg-muted p-4">
              <Text variant="body">{STATUS_NOTE[shop.status]}</Text>
            </div>
          )}
          <ShopInfoCard shop={shop} onSaved={setShop} />
          <ShopHoursCard shop={shop} onSaved={setShop} />
          <ShopSectionsCard shop={shop} onChanged={(sections) => setShop({ ...shop, sections })} />
          <SubscriptionCard reloadKey={subscriptionKey} />
        </>
      )}
    </div>
  );
}

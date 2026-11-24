import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

import { ordersApi } from '@/data/api';
import { ApiError } from '@/data/http';
import type { ID } from '@/data/types';
import { useT } from '@/lib/i18n/useT';
import { selectLocale, useLanguageStore } from '@/store/useLanguageStore';

export interface OrderReceipt {
  /** Opens the receipt PDF in the in-app browser. */
  open: () => Promise<void>;
  /** True while the link is being fetched — not while the receipt is on screen. */
  opening: boolean;
  /** Why the last `open` failed, worded for the shopper. */
  error: string | null;
}

/**
 * The shopper's receipt for one order.
 *
 * The API draws the PDF; this asks it for a short-lived link and hands that to
 * the system's in-app browser (`SFSafariViewController` on iOS, a Custom Tab on
 * Android), which shows a PDF with its own save, share and print controls. No
 * file is downloaded into the app and nothing is kept: the link dies in
 * minutes, so every tap fetches a new one.
 *
 * The PDF is drawn in the language the app is showing, not the phone's — a
 * shopper who pinned English reads an English receipt.
 */
export function useOrderReceipt(orderId: ID | undefined): OrderReceipt {
  const t = useT();
  const locale = useLanguageStore(selectLocale);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async () => {
    if (!orderId || opening) return;
    setError(null);
    setOpening(true);
    try {
      const url = await ordersApi.getReceiptUrl(orderId, locale);
      // Cleared before the browser opens: on iOS the promise below only settles
      // when the shopper closes it, and a spinner left turning behind the
      // receipt would still be turning when they come back.
      setOpening(false);
      await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('customer.receipt.failed'));
    } finally {
      setOpening(false);
    }
  }, [orderId, opening, locale, t]);

  return { open, opening, error };
}

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { orderChatApi } from '@/data/api';
import type { ChatSide } from '@/data/api/orderChat';

/** Slower than the chat screen's own poll: this is a badge, and every message also arrives as a push. */
const POLL_MS = 15_000;

/**
 * Unread messages in an order's chat, for the badge on the button that opens
 * it. Polls only while the screen holding the button is focused and the chat
 * can still change; zero when disabled or when the request fails.
 */
export function useOrderChatUnread(side: ChatSide, orderId: string | undefined, enabled: boolean): number {
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !orderId) {
        setUnread(0);
        return;
      }
      let live = true;
      const check = () =>
        orderChatApi
          .getThread(side, orderId)
          .then((thread) => live && setUnread(thread.unread))
          .catch(() => undefined);
      void check();
      const timer = setInterval(check, POLL_MS);
      return () => {
        live = false;
        clearInterval(timer);
      };
    }, [side, orderId, enabled])
  );

  return unread;
}

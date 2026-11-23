import { router, useFocusEffect } from 'expo-router';
import { ArrowUp, ChevronLeft, Lock, RotateCcw } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Text } from '@/components/ui';
import { orderChatApi } from '@/data/api';
import type { ChatSide, OrderMessage, OrderThread } from '@/data/api/orderChat';
import { ApiError } from '@/data/http';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { orderReference } from '@/lib/orderRef';
import { dynamicRoutes } from '@/lib/routes';

/** How often an open thread looks for the other side's messages while on screen. */
const POLL_MS = 5_000;

const QUICK_CUSTOMER = ['comingDown', 'leaveAtDoor', 'twoMinutes', 'thanks'] as const;
const QUICK_COURIER = ['arrived', 'downstairs', 'cantFind', 'onMyWay'] as const;

/** A message as the screen holds it: the server's, or one still on its way. */
interface Bubble extends OrderMessage {
  pending?: boolean;
  failed?: boolean;
}

type Status = 'loading' | 'ready' | 'error';

/**
 * The chat between a shopper and the courier carrying their order — one
 * screen, mounted by both route groups with the caller's side.
 *
 * Polls while focused rather than holding a socket: the table is the API's
 * alone (no client can subscribe to it), a delivery chat is a few messages
 * over twenty minutes, and every message also arrives as a push.
 */
export function OrderChatScreen({ side, orderId }: { side: ChatSide; orderId: string }) {
  const t = useT();
  const colors = useThemeColors();
  const [status, setStatus] = useState<Status>('loading');
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [state, setState] = useState<OrderThread['state']>('waiting');
  const [counterpart, setCounterpart] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const sending = useRef(false);

  const apply = useCallback(
    (thread: OrderThread) => {
      setMessages((current) => [...thread.messages, ...current.filter((m) => m.failed)]);
      setState(thread.state);
      setCounterpart(thread.counterpart?.name ?? null);
      // On screen means read. Fire and forget: a missed receipt is retried on the next poll.
      if (thread.unread > 0) orderChatApi.markRead(side, orderId).catch(() => undefined);
    },
    [side, orderId]
  );

  const load = useCallback(async () => {
    try {
      apply(await orderChatApi.getThread(side, orderId));
      setStatus('ready');
    } catch {
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, [apply, side, orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => {
        if (!sending.current) void load();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  async function send(text: string, retryOf?: string) {
    const body = text.trim();
    if (!body || sending.current || state !== 'open') return;
    sending.current = true;
    setError(null);
    const pendingId = retryOf ?? `pending-${Date.now()}`;
    setMessages((current) => [
      ...current.filter((m) => m.id !== pendingId),
      { id: pendingId, from: side, body, createdAt: new Date().toISOString(), readAt: null, pending: true },
    ]);
    if (!retryOf) setDraft('');
    try {
      const thread = await orderChatApi.sendMessage(side, orderId, body);
      setMessages((current) => current.filter((m) => m.id !== pendingId));
      apply(thread);
    } catch (caught) {
      setMessages((current) => current.map((m) => (m.id === pendingId ? { ...m, pending: false, failed: true } : m)));
      if (caught instanceof ApiError && caught.isClientError) setError(caught.message);
      // A 409 means the order ended while the message was on its way.
      if (caught instanceof ApiError && caught.status === 409) void load();
    } finally {
      sending.current = false;
    }
  }

  const goBack = () => {
    if (router.canGoBack()) return router.back();
    router.replace({
      pathname: side === 'customer' ? dynamicRoutes.orderDetail : dynamicRoutes.courierDelivery,
      params: { id: orderId },
    });
  };

  const name = counterpart ?? t(side === 'customer' ? 'common.orderChat.courierFallback' : 'common.orderChat.customerFallback');
  // "Lu" under the last delivered message of one's own only, as messaging apps do.
  const lastOwnRead = [...messages].reverse().find((m) => m.from === side && !m.pending && !m.failed);
  const quickReplies =
    side === 'customer'
      ? QUICK_CUSTOMER.map((key) => t(`common.orderChat.quickCustomer.${key}`))
      : QUICK_COURIER.map((key) => t(`common.orderChat.quickCourier.${key}`));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center h-14 px-4 gap-2.5 border-b border-border">
        <Pressable
          hitSlop={10}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.ui.back')}
          className="w-10 h-10 items-center justify-center rounded-full -ml-2"
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Avatar fullName={name} size={34} />
        <View className="flex-1">
          <Text weight="bold" variant="body" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone="muted" className="text-[11px]">
            {`${t('common.order')} ${orderReference({ id: orderId })}`}
          </Text>
        </View>
      </View>

      {status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : status === 'error' ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text variant="body" tone="muted" className="text-center">
            {t('common.orderChat.loadFailed')}
          </Text>
          <Button label={t('common.retry')} variant="outline" size="sm" onPress={() => void load()} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView
            ref={scroll}
            className="flex-1"
            contentContainerClassName="px-4 pt-4 pb-4 gap-2"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          >
            <View className="flex-row items-center justify-center gap-1.5 pb-2">
              <Lock size={11} color={colors.mutedForeground} strokeWidth={2.2} />
              <Text variant="caption" tone="muted" className="text-[11px]">
                {t('common.orderChat.privacy')}
              </Text>
            </View>

            {messages.length === 0 ? (
              <Text variant="caption" tone="muted" className="text-center px-6 pt-6 text-[13px] leading-[19px]">
                {state === 'waiting'
                  ? t('common.orderChat.notYet')
                  : state === 'closed'
                    ? t('common.orderChat.closed')
                    : t('common.orderChat.empty')}
              </Text>
            ) : null}

            {messages.map((message) => {
              const mine = message.from === side;
              return (
                <View key={message.id} className={mine ? 'items-end pl-12 gap-1' : 'items-start pr-12 gap-1'}>
                  <View
                    className={
                      mine
                        ? `rounded-[20px] rounded-br-md px-4 py-2.5 ${message.failed || message.pending ? 'bg-primary/50' : 'bg-primary'}`
                        : 'rounded-[20px] rounded-bl-md px-4 py-2.5 bg-card border border-border'
                    }
                  >
                    <Text variant="body" tone={mine ? 'inverted' : undefined} className="text-[15px] leading-[21px]" selectable>
                      {message.body}
                    </Text>
                  </View>
                  {message.failed ? (
                    <Pressable
                      onPress={() => send(message.body, message.id)}
                      accessibilityRole="button"
                      hitSlop={6}
                      className="flex-row items-center gap-1"
                    >
                      <Text variant="caption" tone="destructive" className="text-[12px]">
                        {t('common.orderChat.failed')}
                      </Text>
                      <RotateCcw size={12} color={colors.primary} strokeWidth={2.2} />
                      <Text variant="caption" weight="semibold" tone="primary" className="text-[12px]">
                        {t('common.retry')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text variant="caption" tone="muted" className="text-[11px] px-1">
                      {formatTime(message.createdAt)}
                      {mine && message.id === lastOwnRead?.id && message.readAt ? ` · ${t('common.orderChat.read')}` : ''}
                    </Text>
                  )}
                </View>
              );
            })}

            {error ? (
              <Text variant="caption" tone="destructive" className="text-center px-6">
                {error}
              </Text>
            ) : null}
          </ScrollView>

          {state === 'open' ? (
            <View className="pt-2 pb-2 border-t border-border bg-card gap-2">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="px-4 gap-2"
              >
                {quickReplies.map((label) => (
                  <Pressable
                    key={label}
                    onPress={() => send(label)}
                    accessibilityRole="button"
                    className="h-9 px-3.5 rounded-full border border-primary/30 bg-primary/5 items-center justify-center active:opacity-70"
                  >
                    <Text variant="caption" weight="semibold" tone="primary" className="text-[13px]">
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View className="flex-row items-end gap-2 px-4">
                <View className="flex-1 min-h-[46px] max-h-[120px] rounded-[23px] bg-muted px-4 justify-center">
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t('common.orderChat.placeholder')}
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    maxLength={1000}
                    className="font-sans text-[15px] text-foreground py-3"
                    style={{ color: colors.foreground }}
                    accessibilityLabel={t('common.orderChat.placeholder')}
                  />
                </View>
                <Pressable
                  onPress={() => send(draft)}
                  disabled={!draft.trim()}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.orderChat.send')}
                  className={`w-[46px] h-[46px] rounded-full items-center justify-center ${draft.trim() ? 'bg-primary' : 'bg-muted'}`}
                >
                  <ArrowUp size={20} strokeWidth={2.4} color={draft.trim() ? colors.primaryForeground : colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          ) : state === 'closed' && messages.length > 0 ? (
            <View className="px-6 py-3 border-t border-border bg-card">
              <Text variant="caption" tone="muted" className="text-center text-[12px]">
                {t('common.orderChat.closed')}
              </Text>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

import { router } from 'expo-router';
import { ArrowUp, ChevronLeft, Mail, MessageCircleQuestion, RotateCcw, Sparkles } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { supportApi } from '@/data/api';
import type { SupportMessage } from '@/data/api/support';
import { ApiError } from '@/data/http';
import { useThemeColors } from '@/hooks/useColorScheme';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

type Status = 'loading' | 'ready' | 'unavailable' | 'error';

/** A message as the screen holds it: the server's, or one still on its way. */
interface Bubble extends SupportMessage {
  failed?: boolean;
}

const SUGGESTIONS = ['whereIsOrder', 'points', 'zones', 'problem'] as const;

/**
 * The support assistant.
 *
 * The server owns the conversation (`/support/conversations/current`); this
 * screen shows it and adds one thing the server cannot: the question appears
 * the moment it is sent, with the assistant visibly typing, instead of after a
 * round trip to the model. A question that fails stays on screen, marked, with
 * a retry — never silently dropped.
 *
 * The greeting is drawn here, not stored: it is the same for everyone, and
 * saving it would make every conversation start with a message nobody wrote.
 */
export default function SupportScreen() {
  const t = useT();
  const colors = useThemeColors();
  const fullName = useSessionStore((s) => s.user?.fullName);
  const firstName = fullName?.trim().split(/\s+/)[0];

  const [status, setStatus] = useState<Status>('loading');
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const conversation = await supportApi.getConversation();
      setMessages(conversation.messages);
      setStatus(conversation.available ? 'ready' : 'unavailable');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(text: string, retryOf?: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    setSending(true);
    const pendingId = retryOf ?? `pending-${Date.now()}`;
    setMessages((current) => [
      ...current.filter((m) => m.id !== pendingId),
      { id: pendingId, role: 'user', content, createdAt: new Date().toISOString() },
    ]);
    if (!retryOf) setDraft('');

    try {
      const conversation = await supportApi.sendMessage(content);
      setMessages(conversation.messages);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 503) {
        setStatus('unavailable');
      }
      setMessages((current) => current.map((m) => (m.id === pendingId ? { ...m, failed: true } : m)));
      setError(caught instanceof ApiError && caught.isClientError ? caught.message : null);
    } finally {
      setSending(false);
    }
  }

  async function startOver() {
    if (sending) return;
    setMessages([]);
    setError(null);
    try {
      await supportApi.closeConversation();
    } catch {
      // The next message would land in the old thread; reloading shows the truth.
      void load();
    }
  }

  const contactHuman = () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(routes.customerProfile));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* A header of its own rather than `BackHeader`: it carries the
          assistant's identity and the "new conversation" action. */}
      <View className="flex-row items-center h-14 px-4 gap-2 border-b border-border">
        <Pressable
          hitSlop={10}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.ui.back')}
          className="w-10 h-10 items-center justify-center rounded-full -ml-2"
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <AssistantMark size={34} />
        <View className="flex-1">
          <Text weight="bold" variant="body" numberOfLines={1}>
            {t('customer.account.support.title')}
          </Text>
        </View>
        {status === 'ready' && messages.length > 0 ? (
          <Pressable
            hitSlop={8}
            onPress={startOver}
            accessibilityRole="button"
            accessibilityLabel={t('customer.account.support.newConversationA11y')}
            className="flex-row items-center gap-1.5 h-9 px-3 rounded-full bg-muted active:opacity-70"
          >
            <RotateCcw size={14} color={colors.foreground} strokeWidth={2.2} />
            <Text variant="caption" weight="semibold" className="text-[13px]">
              {t('customer.account.support.newConversation')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : status === 'unavailable' && messages.length === 0 ? (
        <Unavailable onContact={contactHuman} />
      ) : status === 'error' ? (
        <View className="flex-1 items-center justify-center px-8 gap-4">
          <Text variant="body" tone="muted" className="text-center">
            {t('customer.account.support.loadFailed')}
          </Text>
          <Button label={t('customer.account.support.retry')} variant="outline" size="sm" onPress={load} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          className="flex-1"
        >
          <ScrollView
            ref={scroll}
            className="flex-1"
            contentContainerClassName="px-4 pt-5 pb-4 gap-3"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          >
            <AssistantBubble
              text={t('customer.account.support.greeting', { name: firstName ? ` ${firstName}` : '' })}
            />

            {messages.length === 0 ? (
              <View className="flex-row flex-wrap gap-2 pl-10 pt-1">
                {SUGGESTIONS.map((key, i) => (
                  <MotiView
                    key={key}
                    from={{ opacity: 0, translateY: 8 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 260, delay: 120 + i * 60 }}
                  >
                    <Pressable
                      onPress={() => send(t(`customer.account.support.suggestions.${key}`))}
                      accessibilityRole="button"
                      className="h-9 px-3.5 rounded-full border border-primary/30 bg-primary/5 items-center justify-center active:opacity-70"
                    >
                      <Text variant="caption" weight="semibold" tone="primary" className="text-[13px]">
                        {t(`customer.account.support.suggestions.${key}`)}
                      </Text>
                    </Pressable>
                  </MotiView>
                ))}
              </View>
            ) : null}

            {messages.map((message) =>
              message.role === 'assistant' ? (
                <AssistantBubble key={message.id} text={message.content} />
              ) : (
                <UserBubble
                  key={message.id}
                  text={message.content}
                  failed={message.failed}
                  onRetry={() => send(message.content, message.id)}
                />
              )
            )}

            {sending ? <TypingBubble label={t('customer.account.support.typing')} /> : null}

            {error ? (
              <Text variant="caption" tone="destructive" className="text-center px-6">
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View className="px-4 pt-2 pb-2 border-t border-border bg-card gap-2">
            <View className="flex-row items-end gap-2">
              <View className="flex-1 min-h-[46px] max-h-[120px] rounded-[23px] bg-muted px-4 justify-center">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('customer.account.support.placeholder')}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={1000}
                  editable={status === 'ready'}
                  className="font-sans text-[15px] text-foreground py-3"
                  style={{ color: colors.foreground }}
                  accessibilityLabel={t('customer.account.support.placeholder')}
                />
              </View>
              <Pressable
                onPress={() => send(draft)}
                disabled={!draft.trim() || sending || status !== 'ready'}
                accessibilityRole="button"
                accessibilityLabel={t('customer.account.support.send')}
                className={`w-[46px] h-[46px] rounded-full items-center justify-center ${
                  draft.trim() && !sending ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <ArrowUp
                  size={20}
                  strokeWidth={2.4}
                  color={draft.trim() && !sending ? colors.primaryForeground : colors.mutedForeground}
                />
              </Pressable>
            </View>
            <Pressable onPress={contactHuman} accessibilityRole="link" className="flex-row flex-wrap justify-center">
              <Text variant="caption" tone="muted" className="text-[11px] text-center">
                {t('customer.account.support.disclaimer')}{' '}
                <Text variant="caption" weight="semibold" tone="primary" className="text-[11px]">
                  {t('customer.account.support.contactHuman')}
                </Text>
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

/** The assistant's face: the brand green with a spark, so a reply never reads as coming from a person. */
function AssistantMark({ size }: { size: number }) {
  const colors = useThemeColors();
  return (
    <View
      className="items-center justify-center rounded-full bg-primary"
      style={{ width: size, height: size }}
    >
      <Sparkles size={size * 0.48} color={colors.primaryForeground} strokeWidth={2} />
    </View>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      className="flex-row items-end gap-2 pr-10"
    >
      <AssistantMark size={28} />
      <View className="flex-shrink rounded-[20px] rounded-bl-md bg-card px-4 py-3 border border-border">
        <Text variant="body" className="text-[15px] leading-[21px]" selectable>
          {text}
        </Text>
      </View>
    </MotiView>
  );
}

function UserBubble({ text, failed, onRetry }: { text: string; failed?: boolean; onRetry: () => void }) {
  const t = useT();
  const colors = useThemeColors();
  return (
    <View className="items-end pl-12 gap-1">
      <View className={`rounded-[20px] rounded-br-md px-4 py-3 ${failed ? 'bg-primary/40' : 'bg-primary'}`}>
        <Text variant="body" tone="inverted" className="text-[15px] leading-[21px]" selectable>
          {text}
        </Text>
      </View>
      {failed ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={6} className="flex-row items-center gap-1">
          <Text variant="caption" tone="destructive" className="text-[12px]">
            {t('customer.account.support.failed')}
          </Text>
          <RotateCcw size={12} color={colors.primary} strokeWidth={2.2} />
          <Text variant="caption" weight="semibold" tone="primary" className="text-[12px]">
            {t('customer.account.support.retry')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Three dots breathing in turn — the assistant is working, not stuck. */
function TypingBubble({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-end gap-2" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <AssistantMark size={28} />
      <View className="flex-row items-center gap-1.5 rounded-[20px] rounded-bl-md bg-card px-4 py-4 border border-border">
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.25, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 520, delay: i * 160, loop: true }}
            style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mutedForeground }}
          />
        ))}
      </View>
    </View>
  );
}

function Unavailable({ onContact }: { onContact: () => void }) {
  const t = useT();
  const colors = useThemeColors();
  return (
    <View className="flex-1 items-center justify-center px-8 gap-5">
      <MotiView
        from={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 16, stiffness: 160 }}
        className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center"
      >
        <MessageCircleQuestion size={34} color={colors.primary} strokeWidth={1.8} />
      </MotiView>
      <View className="gap-2">
        <Text variant="title" weight="bold" className="text-center">
          {t('customer.account.support.unavailableTitle')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {t('customer.account.support.unavailableBody')}
        </Text>
      </View>
      <Button
        label={t('customer.account.support.contactHuman')}
        variant="primary"
        icon={<Mail size={18} color={colors.primaryForeground} strokeWidth={2} />}
        onPress={onContact}
      />
      <Text variant="caption" tone="muted">
        {SUPPORT_EMAIL}
      </Text>
    </View>
  );
}

import { CircleX } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Input, Text } from '@/components/ui';
import type { CustomerCancelReason } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { customerCancelReasonKey, customerCancelReasons } from '@/lib/cancellation';
import { useT } from '@/lib/i18n/useT';

export interface CancelOrderSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Rejects with the server's own sentence when the order can no longer be cancelled. */
  onSubmit: (reason: CustomerCancelReason, note: string) => Promise<void>;
}

const MIN_NOTE = 5;

/**
 * Cancelling an order the shop has not accepted yet.
 *
 * A reason is asked for and a sentence is not — except for "other", which says
 * nothing on its own. The category is what the back office counts ("how many
 * cancel because the shop is slow to answer?"); a shopper who simply changed
 * their mind should not have to write an essay to get their money back.
 *
 * A refusal stays inside the sheet, in the server's words: the usual one is
 * that the shop accepted the order while this sheet was open, and closing on
 * that would leave the shopper believing it was cancelled.
 */
export function CancelOrderSheet({ visible, onClose, onSubmit }: CancelOrderSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [reason, setReason] = useState<CustomerCancelReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteRequired = reason === 'other';
  const ready = reason !== null && (!noteRequired || note.trim().length >= MIN_NOTE);

  function reset() {
    setReason(null);
    setNote('');
    setError(null);
  }

  function dismiss() {
    if (sending) return;
    reset();
    onClose();
  }

  async function submit() {
    if (!ready || !reason) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(reason, note.trim());
      reset();
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t('customer.cancel.failed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <View className="flex-1 justify-end">
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10, 32, 24, 0.45)',
          }}
        >
          <Pressable className="flex-1" accessibilityLabel={t('common.ui.close', { label: '' })} onPress={dismiss} />
        </MotiView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <MotiView
            from={{ translateY: 400 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 190, mass: 0.9 }}
            className="rounded-t-[28px] bg-card"
          >
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="px-5 pt-3 gap-4"
              style={{ maxHeight: 460 }}
            >
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 items-center justify-center rounded-full bg-destructive/10">
                  <CircleX size={21} color={colors.destructive} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="subtitle" weight="bold" className="text-[19px]">
                    {t('customer.cancel.title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[13px]">
                    {t('customer.cancel.note')}
                  </Text>
                </View>
              </View>

              <View className="gap-2.5">
                <Text variant="label" tone="muted">
                  {t('customer.cancel.why')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {customerCancelReasons.map((option) => (
                    <Chip
                      key={option}
                      label={t(customerCancelReasonKey(option))}
                      selected={reason === option}
                      onPress={() => {
                        setReason(option);
                        setError(null);
                      }}
                    />
                  ))}
                </View>
              </View>

              <Input
                label={t('customer.cancel.details')}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                autoCapitalize="sentences"
                maxLength={500}
                required={noteRequired}
                helperText={noteRequired ? t('customer.cancel.detailsRequired') : t('customer.cancel.detailsHint')}
              />

              {error ? (
                <Text variant="caption" tone="destructive" className="text-[13px] leading-[19px]">
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View className="px-5 pt-4 gap-2" style={{ paddingBottom: insets.bottom + 12 }}>
              <Button
                label={t('customer.cancel.submit')}
                variant="destructive"
                size="lg"
                fullWidth
                disabled={!ready}
                loading={sending}
                onPress={submit}
              />
              <Button label={t('customer.cancel.keep')} variant="ghost" size="lg" fullWidth onPress={dismiss} />
            </View>
          </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

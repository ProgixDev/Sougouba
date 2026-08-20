import { MessageSquareWarning } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Input, Text } from '@/components/ui';
import type { DisputeReason } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { disputeReasons } from '@/lib/disputes';

export interface DisputeSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: DisputeReason, message: string) => Promise<void>;
}

const MIN_MESSAGE = 10;

/**
 * Reporting a problem on a finished order.
 *
 * A reason *and* a description, because neither alone is enough: the category is
 * what a back-office can sort a queue by, and the sentence is the only thing
 * that tells a merchant which of the eleven items was missing.
 *
 * The submit button stays disabled until both are given rather than validating
 * after the fact — the shopper is already annoyed, and an error message telling
 * them to write more is a worse moment than a button that visibly waits.
 */
export function DisputeSheet({ visible, onClose, onSubmit }: DisputeSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const ready = reason !== null && message.trim().length >= MIN_MESSAGE;

  function dismiss() {
    if (sending) return;
    setReason(null);
    setMessage('');
    onClose();
  }

  async function submit() {
    if (!ready || !reason) return;
    setSending(true);
    try {
      await onSubmit(reason, message.trim());
      setReason(null);
      setMessage('');
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
          <Pressable className="flex-1" accessibilityLabel="Fermer" onPress={dismiss} />
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
                  <MessageSquareWarning size={21} color={colors.destructive} strokeWidth={2} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="subtitle" weight="bold" className="text-[19px]">
                    Signaler un problème
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[13px]">
                    Le commerce est informé et vous répondra ici.
                  </Text>
                </View>
              </View>

              <View className="gap-2.5">
                <Text variant="label" tone="muted">
                  Que s’est-il passé ?
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {disputeReasons.map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      selected={reason === option.key}
                      onPress={() => setReason(option.key)}
                    />
                  ))}
                </View>
              </View>

              <Input
                label="Décrivez le problème"
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                autoCapitalize="sentences"
                helperText="Précisez les articles concernés — cela accélère la réponse."
              />
            </ScrollView>

            <View className="px-5 pt-4 gap-2" style={{ paddingBottom: insets.bottom + 12 }}>
              <Button
                label="Envoyer le signalement"
                variant="primary"
                size="lg"
                fullWidth
                disabled={!ready}
                loading={sending}
                onPress={submit}
              />
              <Button label="Annuler" variant="ghost" size="lg" fullWidth onPress={dismiss} />
            </View>
          </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

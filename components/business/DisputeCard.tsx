import { MessageSquareWarning, Send } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Input, Text } from '@/components/ui';
import type { OrderDispute } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { disputeReasonLabel } from '@/lib/disputes';
import { formatDate, formatTime } from '@/lib/format';

export interface DisputeCardProps {
  dispute: OrderDispute;
  onReply: (message: string) => Promise<void>;
}

const MIN_REPLY = 5;

/**
 * The shopper's complaint, on the merchant's copy of the order.
 *
 * Rendered above the order's own details rather than below them: a merchant
 * opening a ticket with a complaint on it is opening it *because* of the
 * complaint, and burying that under the delivery address makes them hunt.
 *
 * The merchant can answer and nothing more. Deciding who is right, refunding, or
 * closing the case belongs to the platform back-office (CDC addendum v1.1, §04),
 * so this offers no button that would imply otherwise.
 */
export function DisputeCard({ dispute, onReply }: DisputeCardProps) {
  const colors = useThemeColors();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const answered = dispute.status === 'answered';

  async function send() {
    const text = message.trim();
    if (text.length < MIN_REPLY || sending) return;
    setSending(true);
    try {
      await onReply(text);
      setMessage('');
    } finally {
      setSending(false);
    }
  }

  return (
    <View className="rounded-[20px] border-[1.5px] border-destructive/30 bg-card p-4 gap-3.5">
      <View className="flex-row items-center gap-2.5">
        <View className="w-9 h-9 items-center justify-center rounded-full bg-destructive/10">
          <MessageSquareWarning size={18} color={colors.destructive} strokeWidth={2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="caption" weight="bold">
            {disputeReasonLabel(dispute.reason)}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px]">
            Signalé le {formatDate(dispute.openedAt)} à {formatTime(dispute.openedAt)}
          </Text>
        </View>
        <Badge
          label={answered ? 'Répondu' : 'À traiter'}
          tone={answered ? 'success' : 'warning'}
          size="sm"
        />
      </View>

      <Text variant="caption" className="text-[13px] leading-[19px]">
        {dispute.message}
      </Text>

      {answered ? (
        <View className="rounded-2xl bg-muted p-3 gap-1">
          <Text variant="label" tone="muted" className="text-[10px]">
            Votre réponse
          </Text>
          <Text variant="caption" className="text-[13px] leading-[19px]">
            {dispute.merchantReply}
          </Text>
        </View>
      ) : (
        <View className="gap-2.5">
          <Input
            label="Répondre au client"
            value={message}
            onChangeText={setMessage}
            multiline
            autoCapitalize="sentences"
          />
          <Button
            label="Envoyer la réponse"
            variant="primary"
            size="md"
            fullWidth
            disabled={message.trim().length < MIN_REPLY}
            loading={sending}
            icon={<Send size={16} color={colors.primaryForeground} strokeWidth={2.2} />}
            onPress={send}
          />
          <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
            Le litige reste ouvert jusqu’à son traitement par Sougouba.
          </Text>
        </View>
      )}
    </View>
  );
}

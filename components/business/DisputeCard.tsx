import { MessageSquareWarning, Send } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Input, Text } from '@/components/ui';
import type { OrderDispute } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { disputeReasonKey } from '@/lib/disputes';
import { useT } from '@/lib/i18n/useT';
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
  const t = useT();
  const colors = useThemeColors();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const answered = dispute.status !== 'open';

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
            {t(disputeReasonKey(dispute.reason))}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px]">
            {t('business.dispute.reportedAt', {
              date: formatDate(dispute.openedAt),
              time: formatTime(dispute.openedAt),
            })}
          </Text>
        </View>
        <Badge
          label={answered ? t('business.disputeStatus.answered') : t('business.disputeStatus.open')}
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
            {t('business.dispute.yourReply')}
          </Text>
          <Text variant="caption" className="text-[13px] leading-[19px]">
            {dispute.merchantReply}
          </Text>
        </View>
      ) : (
        <View className="gap-2.5">
          <Input
            label={t('business.dispute.reply')}
            value={message}
            onChangeText={setMessage}
            multiline
            autoCapitalize="sentences"
          />
          <Button
            label={t('business.dispute.send')}
            variant="primary"
            size="md"
            fullWidth
            disabled={message.trim().length < MIN_REPLY}
            loading={sending}
            icon={<Send size={16} color={colors.primaryForeground} strokeWidth={2.2} />}
            onPress={send}
          />
          <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
            {t('business.dispute.stillOpen')}
          </Text>
        </View>
      )}
    </View>
  );
}

import { Check, X } from 'lucide-react-native';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { Order } from '@/data/types';
import { formatDate, formatTime } from '@/lib/format';
import { orderProgression, orderStatusMeta, progressionIndex } from '@/lib/orderStatus';
import { neutral } from '@/theme/tokens';

export interface OrderStatusTimelineProps {
  order: Order;
}

/**
 * Vertical delivery tracker.
 *
 * Steps come from the canonical progression rather than from `statusHistory`, so
 * the shopper always sees what is still to come — a history-only rendering would
 * make a fresh order look like a one-step process. Timestamps are pulled from
 * history where a step has actually happened.
 *
 * A cancelled order gets its own single row: cancellation is an exit from the
 * flow, not a position on it, and drawing it as "step 4 of 6" would misrepresent
 * what happened.
 */
export function OrderStatusTimeline({ order }: OrderStatusTimelineProps) {
  const timeByStatus = Object.fromEntries(order.statusHistory.map((e) => [e.status, e.at]));

  if (order.status === 'cancelled') {
    const at = timeByStatus.cancelled;
    return (
      <View className="flex-row items-start gap-3">
        <View className="w-7 h-7 items-center justify-center rounded-full bg-destructive">
          <X size={15} color="#FFFFFF" strokeWidth={3} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="caption" weight="bold" tone="destructive">
            {orderStatusMeta.cancelled.label}
          </Text>
          {at ? (
            <Text variant="caption" tone="muted" className="text-[12px]">
              {formatDate(at)} · {formatTime(at)}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const currentIndex = progressionIndex(order.status);

  return (
    <View>
      {orderProgression.map((status, index) => {
        const done = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === orderProgression.length - 1;
        const at = timeByStatus[status];

        return (
          <View key={status} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={`w-7 h-7 items-center justify-center rounded-full ${
                  done ? 'bg-primary' : 'bg-muted'
                }`}
              >
                {done ? (
                  <Check size={15} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: neutral[400] }} />
                )}
              </View>
              {/* The connector belongs to the step above it, so the last row has none. */}
              {!isLast ? (
                <View
                  className={`w-0.5 flex-1 ${index < currentIndex ? 'bg-primary' : 'bg-border'}`}
                  style={{ minHeight: 26 }}
                />
              ) : null}
            </View>

            <View className={`flex-1 gap-0.5 ${isLast ? '' : 'pb-4'}`}>
              <Text
                variant="caption"
                weight={isCurrent ? 'bold' : 'medium'}
                tone={done ? 'default' : 'muted'}
              >
                {orderStatusMeta[status].label}
              </Text>
              {at ? (
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {formatDate(at)} · {formatTime(at)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

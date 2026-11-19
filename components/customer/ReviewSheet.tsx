import { Star } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input, StarRating, Text } from '@/components/ui';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';
import { mustard } from '@/theme/tokens';

export interface ReviewInput {
  vendorRating: number;
  courierRating?: number;
  comment?: string;
}

export interface ReviewSheetProps {
  visible: boolean;
  vendorName: string;
  /** Absent when nobody carried the order — the courier row is then not shown at all. */
  courierName?: string;
  onClose: () => void;
  onSubmit: (review: ReviewInput) => Promise<void>;
}

/**
 * Rating a delivered order.
 *
 * Sibling of `DisputeSheet`, and deliberately lighter: a dispute asks for a
 * reason and a sentence because someone has to act on it, whereas a review is a
 * favour the shopper is doing. So one tap is a complete answer — the shop's
 * stars — and everything else is optional. The courier's stars are left empty
 * rather than pre-filled: a default mark is an opinion nobody held.
 *
 * A review cannot be edited afterwards, which is why the button says "send"
 * and the sheet says so underneath it.
 */
export function ReviewSheet({ visible, vendorName, courierName, onClose, onSubmit }: ReviewSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [vendorRating, setVendorRating] = useState(0);
  const [courierRating, setCourierRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setVendorRating(0);
    setCourierRating(0);
    setComment('');
    setError(null);
  }

  function dismiss() {
    if (sending) return;
    reset();
    onClose();
  }

  async function submit() {
    if (vendorRating === 0) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit({
        vendorRating,
        courierRating: courierName && courierRating > 0 ? courierRating : undefined,
        comment: comment.trim() || undefined,
      });
      reset();
    } catch (e) {
      // The API's refusals are sentences written for the shopper ("déjà noté").
      setError(e instanceof ApiError ? e.message : t('common.genericError'));
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
              contentContainerClassName="px-5 pt-3 gap-5"
              style={{ maxHeight: 480 }}
            >
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 items-center justify-center rounded-full bg-primary/10">
                  <Star size={21} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="subtitle" weight="bold" className="text-[19px]">
                    {t('customer.review.title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[13px]">
                    {t('customer.review.note')}
                  </Text>
                </View>
              </View>

              <View className="gap-2.5">
                <Text variant="label" tone="muted">
                  {t('customer.review.shop', { name: vendorName })}
                </Text>
                <StarRating value={vendorRating} onChange={setVendorRating} />
              </View>

              {courierName ? (
                <View className="gap-2.5">
                  <Text variant="label" tone="muted">
                    {t('customer.review.courier', { name: courierName })}
                  </Text>
                  <StarRating value={courierRating} onChange={setCourierRating} />
                </View>
              ) : null}

              <Input
                label={t('customer.review.comment')}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={3}
                maxLength={1000}
                autoCapitalize="sentences"
                helperText={t('customer.review.commentHint')}
              />

              {error ? (
                <Text variant="caption" tone="destructive" className="text-[13px]">
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View className="px-5 pt-4 gap-2" style={{ paddingBottom: insets.bottom + 12 }}>
              <Button
                label={t('customer.review.submit')}
                variant="primary"
                size="lg"
                fullWidth
                disabled={vendorRating === 0}
                loading={sending}
                onPress={submit}
              />
              <Button label={t('common.cancel')} variant="ghost" size="lg" fullWidth onPress={dismiss} />
            </View>
          </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

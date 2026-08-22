import { Check, Clock3, Mail } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useEffect } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';

export interface ApplicationSubmittedProps {
  title: string;
  body: string;
  /** What happens next, in the order it happens. Two or three lines, no more. */
  next: string[];
  ctaLabel: string;
  onContinue: () => void;
}

/**
 * The end of a registration journey.
 *
 * Both signup forms used to finish on a bare `router.back()`: the applicant was
 * dropped onto whichever tab they came from, with nothing saying the file had
 * been sent. The gate screen behind it does eventually say "demande en
 * attente", but arriving there by being silently returned reads as a form that
 * failed, not one that succeeded.
 *
 * Shared by the merchant and the courier because the moment is the same one,
 * and because two copies would drift the day the wording changes. Built on the
 * shape `app/(customer)/order-confirmed/[id].tsx` established, including the
 * hardware-back override — there is deliberately nothing to go back to.
 */
export function ApplicationSubmitted({
  title,
  body,
  next,
  ctaLabel,
  onContinue,
}: ApplicationSubmittedProps) {
  const colors = useThemeColors();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onContinue();
      return true;
    });
    return () => sub.remove();
  }, [onContinue]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8 gap-6">
        <MotiView
          from={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 13, stiffness: 160 }}
          className="w-24 h-24 items-center justify-center rounded-full bg-primary/10"
        >
          <View className="w-16 h-16 items-center justify-center rounded-full bg-primary">
            <Check size={32} color="#FFFFFF" strokeWidth={3} />
          </View>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 180 }}
          className="items-center gap-3"
        >
          <Text variant="title" weight="bold" className="text-center">
            {title}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {body}
          </Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 400, delay: 300 }}
          className="w-full rounded-[20px] bg-card p-5 gap-4"
        >
          <View className="flex-row items-center gap-2">
            <Clock3 size={15} color={colors.primary} strokeWidth={2} />
            <Text variant="label" tone="muted">
              Ce qui suit
            </Text>
          </View>
          {next.map((line, index) => (
            <View key={line} className="flex-row gap-3.5">
              <View className="w-6 h-6 rounded-full bg-primary/10 items-center justify-center mt-0.5">
                <Text variant="caption" weight="bold" tone="primary" className="text-[11px]">
                  {index + 1}
                </Text>
              </View>
              <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[19px]">
                {line}
              </Text>
            </View>
          ))}
        </MotiView>

        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 400, delay: 420 }}
          className="flex-row items-center gap-2"
        >
          <Mail size={13} color={colors.mutedForeground} strokeWidth={2} />
          <Text variant="caption" tone="muted" className="text-[12px]">
            Une confirmation vous est envoyée par courriel.
          </Text>
        </MotiView>
      </View>

      <View className="px-6 pb-4">
        <Button label={ctaLabel} variant="primary" size="lg" fullWidth onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

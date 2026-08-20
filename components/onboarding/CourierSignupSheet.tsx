import { Bike } from 'lucide-react-native';
import { MotiView } from 'moti';
import { Modal, Pressable, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { COURIER_SIGNUP_STEPS } from '@/lib/courierOnboarding';

export interface CourierSignupSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Called once the courier has agreed to start. Omit where the sheet is purely
   * explanatory — the About screen shows it to someone only asking how
   * delivering works.
   */
  onContinue?: () => void;
}

/**
 * What happens when someone chooses "Je suis livreur".
 *
 * Sibling of `MerchantSignupSheet`, and deliberately the same shape so the two
 * paths off the role gate feel like one product. Both fill their file in the
 * app and both wait on a human before they can trade — and saying so before the
 * form rather than after it is the whole point of the sheet.
 */
export function CourierSignupSheet({ visible, onClose, onContinue }: CourierSignupSheetProps) {
  const colors = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(10, 32, 24, 0.45)' }}
        onPress={onClose}
      >
        <MotiView
          from={{ translateY: 40, opacity: 0 }}
          animate={{ translateY: 0, opacity: 1 }}
          transition={{ type: 'timing', duration: 240 }}
        >
          {/* Swallow taps so pressing inside the sheet does not dismiss it. */}
          <Pressable onPress={() => {}} className="rounded-t-[28px] bg-card px-6 pt-5 pb-9 gap-5">
            <View className="w-10 h-1 rounded-full bg-border self-center" />

            <View className="gap-3">
              <View className="w-14 h-14 items-center justify-center rounded-full bg-secondary/10">
                <Bike size={26} color={colors.secondary} strokeWidth={1.75} />
              </View>
              <View className="gap-2">
                <Text variant="subtitle" weight="bold" className="text-[21px]">
                  Livrer avec Sougouba
                </Text>
                <Text variant="body" tone="muted">
                  Trois étapes, directement dans l’application. Un administrateur valide ensuite
                  votre dossier avant votre première course.
                </Text>
              </View>
            </View>

            <View className="gap-4">
              {COURIER_SIGNUP_STEPS.map((step, index) => (
                <View key={step.title} className="flex-row gap-3.5">
                  <View className="w-7 h-7 rounded-full bg-secondary/10 items-center justify-center mt-0.5">
                    <Text variant="caption" weight="bold" tone="secondary" className="text-[12px]">
                      {index + 1}
                    </Text>
                  </View>
                  <View className="flex-1 gap-1">
                    <Text variant="caption" weight="bold">
                      {step.title}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                      {step.body}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View className="gap-2">
              <Button
                label="Commencer l’inscription"
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => {
                  onContinue?.();
                  if (!onContinue) onClose();
                }}
              />
              {onContinue ? (
                <Button label="Plus tard" variant="ghost" size="md" fullWidth onPress={onClose} />
              ) : null}
            </View>
          </Pressable>
        </MotiView>
      </Pressable>
    </Modal>
  );
}

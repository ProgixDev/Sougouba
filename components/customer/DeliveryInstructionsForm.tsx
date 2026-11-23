import { DoorOpen, Hand } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Input, Text } from '@/components/ui';
import type { DropoffOption } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';

export interface DeliveryInstructionsValue {
  unit: string;
  doorCode: string;
  deliveryNotes: string;
  dropoff: DropoffOption;
}

export const EMPTY_INSTRUCTIONS: DeliveryInstructionsValue = { unit: '', doorCode: '', deliveryNotes: '', dropoff: 'hand' };

/** A saved address's details as the form's strings — null reads as empty. */
export function instructionsFrom(address: {
  unit?: string | null;
  doorCode?: string | null;
  deliveryNotes?: string | null;
  dropoff?: DropoffOption;
} | null): DeliveryInstructionsValue {
  return {
    unit: address?.unit ?? '',
    doorCode: address?.doorCode ?? '',
    deliveryNotes: address?.deliveryNotes ?? '',
    dropoff: address?.dropoff ?? 'hand',
  };
}

/**
 * How the courier gets to the door: hand-over or leave-at-door, apartment and
 * floor, door code, and a free note. Same block at checkout and in the address
 * form, because it describes the address and is reused on every order to it.
 */
export function DeliveryInstructionsForm({
  value,
  onChange,
}: {
  value: DeliveryInstructionsValue;
  onChange: (next: DeliveryInstructionsValue) => void;
}) {
  const t = useT();
  const set = <K extends keyof DeliveryInstructionsValue>(key: K, v: DeliveryInstructionsValue[K]) => onChange({ ...value, [key]: v });

  return (
    <View className="gap-3">
      <View className="flex-row gap-2.5">
        <DropoffChoice
          icon={Hand}
          label={t('common.deliveryInstructions.hand')}
          selected={value.dropoff === 'hand'}
          onPress={() => set('dropoff', 'hand')}
        />
        <DropoffChoice
          icon={DoorOpen}
          label={t('common.deliveryInstructions.door')}
          selected={value.dropoff === 'door'}
          onPress={() => set('dropoff', 'door')}
        />
      </View>
      <Text variant="caption" tone="muted" className="text-[12px] leading-[17px]">
        {value.dropoff === 'door' ? t('common.deliveryInstructions.doorHint') : t('common.deliveryInstructions.handHint')}
      </Text>

      <Input
        label={t('common.deliveryInstructions.unit')}
        value={value.unit}
        onChangeText={(v) => set('unit', v)}
        maxLength={60}
        autoCapitalize="sentences"
      />
      <Input
        label={t('common.deliveryInstructions.doorCode')}
        value={value.doorCode}
        onChangeText={(v) => set('doorCode', v)}
        maxLength={30}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Input
        label={t('common.deliveryInstructions.notes')}
        value={value.deliveryNotes}
        onChangeText={(v) => set('deliveryNotes', v)}
        maxLength={300}
        multiline
      />
    </View>
  );
}

function DropoffChoice({
  icon: Icon,
  label,
  selected,
  onPress,
}: {
  icon: typeof Hand;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-1 flex-row items-center justify-center gap-2 h-12 rounded-2xl border-[1.5px] ${
        selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
      } active:opacity-80`}
    >
      <Icon size={17} color={selected ? colors.primary : colors.mutedForeground} strokeWidth={2} />
      <Text variant="caption" weight="semibold" tone={selected ? 'primary' : 'muted'} className="text-[13px]">
        {label}
      </Text>
    </Pressable>
  );
}

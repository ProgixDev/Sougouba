import { Check, ChevronDown } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/hooks/useColorScheme';

import { Text } from './Text';

export interface SelectOption {
  value: string;
  label: string;
  /** Second line under the label — a bank's institution number, say. */
  detail?: string;
}

export interface SelectFieldProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  /** Heading of the sheet. Defaults to `label`. */
  sheetTitle?: string;
}

/**
 * A single choice from a list too long to lay out as chips.
 *
 * `CitySelect` is the short-list case — four options, all visible, no tap spent
 * on a modal. This is the other one: a dozen banks do not fit, and a
 * `TextInput` is what we are replacing. The closed state deliberately borrows
 * the proportions of `components/ui/Input.tsx` so a form does not look like it
 * changes materials halfway down.
 *
 * Sheet chrome is the one `components/customer/FilterSheet.tsx` established —
 * scrim, spring-in panel, check on the selected row.
 */
export function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choisir',
  error,
  helperText,
  required,
  sheetTitle,
}: SelectFieldProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);

  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${selected?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-3 rounded-2xl border-[1.5px] bg-card px-4 h-[58px] ${
          error ? 'border-destructive' : 'border-border'
        }`}
      >
        <View className="flex-1 gap-0.5">
          <Text variant="caption" tone="muted" className="text-[11px]">
            {label}
            {required ? ' *' : ''}
          </Text>
          <Text
            variant="caption"
            weight={selected ? 'semibold' : 'regular'}
            tone={selected ? 'default' : 'muted'}
            numberOfLines={1}
          >
            {selected?.label ?? placeholder}
          </Text>
        </View>
        <ChevronDown size={18} color={colors.mutedForeground} strokeWidth={2} />
      </Pressable>

      {error ? (
        <Text variant="caption" tone="destructive" className="text-[12px]">
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted" className="text-[12px]">
          {helperText}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end">
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 180 }}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 32, 24, 0.45)' }]}
          >
            <Pressable
              className="flex-1"
              accessibilityLabel={`Fermer ${label}`}
              onPress={() => setOpen(false)}
            />
          </MotiView>

          <MotiView
            from={{ translateY: 420 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 190, mass: 0.9 }}
            className="rounded-t-[28px] bg-card overflow-hidden"
            style={{ maxHeight: '80%' }}
          >
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>

            <View className="px-5 pt-2 pb-3">
              <Text variant="subtitle" weight="bold" className="text-[20px]">
                {sheetTitle ?? label}
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: insets.bottom + 16,
              }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex-row items-center justify-between gap-3 py-3.5 ${
                      index > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        variant="body"
                        weight={isSelected ? 'semibold' : 'regular'}
                        tone={isSelected ? 'primary' : 'default'}
                      >
                        {option.label}
                      </Text>
                      {option.detail ? (
                        <Text variant="caption" tone="muted" className="text-[12px]">
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Check size={19} color={colors.primary} strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </MotiView>
        </View>
      </Modal>
    </View>
  );
}

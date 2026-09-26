import { Check } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import type { Vendor } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import {
  PRICE_BANDS,
  SORT_KEYS,
  activeFilterCount,
  emptyFilters,
  priceBandLabel,
  sortKey,
  type ProductFilters,
} from '@/lib/productFilters';
import { useT } from '@/lib/i18n/useT';

export interface FilterSheetProps {
  visible: boolean;
  filters: ProductFilters;
  vendors: Vendor[];
  /** How many products the draft selection would leave — the button says so. */
  resultCount: number;
  onApply: (filters: ProductFilters) => void;
  onClose: () => void;
  /** Live preview: the parent recounts as the draft changes. */
  onDraftChange: (filters: ProductFilters) => void;
}

/**
 * The search filter sheet.
 *
 * Edits a draft rather than the live filters, so nothing is committed until the
 * shopper presses the button — but the parent is told about every draft change,
 * because the button's job is to say how many products the current selection
 * leaves. Committing on close would make dismissing the sheet a destructive act;
 * committing on every tap would make the result count meaningless.
 */
export function FilterSheet({
  visible,
  filters,
  vendors,
  resultCount,
  onApply,
  onClose,
  onDraftChange,
}: FilterSheetProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(filters);

  // Reopening starts from what is actually in effect, not from the last
  // abandoned draft.
  useEffect(() => {
    if (visible) {
      setDraft(filters);
      onDraftChange(filters);
    }
    // `filters` is intentionally read only at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function update(patch: Partial<ProductFilters>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange(next);
  }

  const count = activeFilterCount(draft);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 32, 24, 0.45)' }]}
        >
          <Pressable className="flex-1" accessibilityLabel={t('customer.filters.close')} onPress={onClose} />
        </MotiView>

        <MotiView
          from={{ translateY: 420 }}
          animate={{ translateY: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 190, mass: 0.9 }}
          className="rounded-t-[28px] bg-card overflow-hidden"
          style={{ maxHeight: '86%' }}
        >
          <View className="items-center pt-3 pb-1">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="flex-row items-center justify-between px-5 pt-2 pb-4">
            <Text variant="subtitle" weight="bold" className="text-[20px]">
              Filtres
            </Text>
            {count > 0 || draft.sort !== 'relevance' ? (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                onPress={() => update(emptyFilters)}
              >
                <Text variant="caption" weight="semibold" tone="secondary">
                  Tout effacer
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-4 gap-7">
            <Group title={t('customer.sortBy')}>
              {SORT_KEYS.map((key) => (
                <OptionRow
                  key={key}
                  label={t(sortKey(key))}
                  selected={draft.sort === key}
                  onPress={() => update({ sort: key })}
                />
              ))}
            </Group>

            <Group title="Prix">
              <View className="flex-row flex-wrap gap-2">
                {PRICE_BANDS.map((band) => (
                  <SelectChip
                    key={band}
                    label={priceBandLabel(t, band)}
                    selected={draft.priceBand === band}
                    onPress={() => update({ priceBand: band })}
                  />
                ))}
              </View>
            </Group>

            <Group title="Commerce">
              <View className="flex-row flex-wrap gap-2">
                <SelectChip
                  label="Tous"
                  selected={draft.vendorId === null}
                  onPress={() => update({ vendorId: null })}
                />
                {vendors.map((vendor) => (
                  <SelectChip
                    key={vendor.id}
                    label={vendor.name}
                    selected={draft.vendorId === vendor.id}
                    onPress={() =>
                      update({ vendorId: draft.vendorId === vendor.id ? null : vendor.id })
                    }
                  />
                ))}
              </View>
            </Group>

            <Group title="Afficher seulement">
              <ToggleRow
                label={t('customer.filters.onSale')}
                value={draft.onSale}
                onValueChange={(next) => update({ onSale: next })}
              />
              <ToggleRow
                label={t('customer.filters.inStock')}
                value={draft.inStockOnly}
                onValueChange={(next) => update({ inStockOnly: next })}
              />
            </Group>
          </ScrollView>

          <View
            className="px-5 pt-3 border-t border-border"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Button
              label={t('customer.filters.applyCta', { count: resultCount })}
              variant="cta"
              size="lg"
              fullWidth
              disabled={resultCount === 0}
              onPress={() => onApply(draft)}
            />
          </View>
        </MotiView>
      </View>
    </Modal>
  );
}

/* The rows below live at module scope on purpose: declared inside the sheet they
   would be a fresh component type on every keystroke of the draft, remounting
   each Switch mid-interaction. */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        {title}
      </Text>
      <View className="gap-1">{children}</View>
    </View>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="flex-row items-center justify-between py-3"
    >
      <Text variant="body" weight={selected ? 'semibold' : 'regular'} tone={selected ? 'primary' : 'default'}>
        {label}
      </Text>
      {selected ? <Check size={19} color={colors.primary} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text variant="body" className="flex-1 pr-4">
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-10 px-4 rounded-full items-center justify-center border ${
        selected ? 'bg-primary border-primary' : 'bg-background border-border'
      }`}
    >
      <Text variant="caption" weight="medium" tone={selected ? 'inverted' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );
}

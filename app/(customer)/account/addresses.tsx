import * as Haptics from 'expo-haptics';
import { Home, MapPin, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressFormSheet } from '@/components/customer';
import { BackHeader, Badge, EmptyState, Reveal, Text } from '@/components/ui';
import type { Address } from '@/data/types';
import { useAddressBook } from '@/hooks/useAddressBook';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import type { AddressValues } from '@/lib/validation/profile';

export default function AddressesScreen() {
  const t = useT();
  const colors = useThemeColors();
  const book = useAddressBook();
  const { addresses, saving } = book;
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  async function save(values: AddressValues, existing: Address | null) {
    if (!(await book.save(values, existing))) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
  }

  function remove(address: Address) {
    Alert.alert(t('customer.confirmRemoveAddress'), `${address.label} — ${address.street}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('customer.account.addresses.delete'),
        style: 'destructive',
        onPress: () => book.remove(address),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.account.addresses.title')} />

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={t('customer.account.addresses.emptyTitle')}
          description={t('customer.account.addresses.emptyBody')}
          actionLabel={t('customer.account.addresses.add')}
          onAction={() => setEditing('new')}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pt-2 pb-6 gap-3"
        >
          {addresses.map((address, index) => (
            <Reveal key={address.id} index={index}>
              <View className="rounded-[20px] bg-card p-4 gap-3">
                <View className="flex-row items-start gap-3">
                  <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
                    <Home size={17} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text variant="caption" weight="bold" numberOfLines={1} className="flex-1">
                        {address.label}
                      </Text>
                      {address.isDefault ? <Badge label={t('customer.account.addresses.isDefault')} tone="primary" size="sm" /> : null}
                    </View>
                    <Text variant="caption" tone="muted" className="text-[13px]">
                      {address.street}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[13px]">
                      {address.city} {address.postalCode}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-4 pl-12">
                  <RowAction label={t('customer.account.addresses.edit')} onPress={() => setEditing(address)} />
                  {!address.isDefault ? (
                    <RowAction
                      label={t('customer.account.addresses.setDefault')}
                      onPress={() => book.makeDefault(address)}
                    />
                  ) : null}
                  <View className="flex-1" />
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.a11y.remove', { name: address.label })}
                    onPress={() => remove(address)}
                  >
                    <Trash2 size={17} color={colors.destructive} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            </Reveal>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing('new')}
            className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-border"
          >
            <Plus size={17} color={colors.primary} strokeWidth={2.4} />
            <Text variant="caption" weight="bold" tone="primary">
              {t('customer.account.addresses.add')}
            </Text>
          </Pressable>
        </ScrollView>
      )}

      <AddressFormSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        address={editing === 'new' ? null : editing}
        visible={editing !== null}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </SafeAreaView>
  );
}

function RowAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable hitSlop={6} accessibilityRole="button" onPress={onPress}>
      <Text variant="caption" weight="semibold" tone="primary" className="text-[13px]">
        {label}
      </Text>
    </Pressable>
  );
}

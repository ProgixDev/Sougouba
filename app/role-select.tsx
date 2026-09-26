import { Redirect, router } from 'expo-router';
import { Bike, Check, ShoppingBag, Store } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourierSignupSheet, MerchantSignupSheet } from '@/components/onboarding';
import { useT } from '@/lib/i18n/useT';
import { Button, Text } from '@/components/ui';
import { authApi } from '@/data/api';
import type { UserRole } from '@/data/types';
import { homeRouteForRole, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';
import { forest, terracotta } from '@/theme/tokens';
import type { LucideIcon } from 'lucide-react-native';

interface RoleOption {
  /** Also the catalogue key: the words are `common.roleSelect.<role>.*`. */
  role: UserRole;
  icon: LucideIcon;
  /** Icon disc tint. Identifies the role; selection is carried by the border and the check. */
  tint: { on: string; off: string };
}

const FOREST_TINT = { on: forest[600], off: forest[100] };

const options: RoleOption[] = [
  {
    role: 'customer',
    icon: ShoppingBag,
    tint: FOREST_TINT,
  },
  {
    role: 'business',
    icon: Store,
    tint: FOREST_TINT,
  },
  {
    // Terracotta rather than a third hue: the livreur is the one role that works
    // on the road, and the ramp already carries that warmth. The selection
    // affordance stays forest across all three so "chosen" reads the same way.
    role: 'courier',
    icon: Bike,
    tint: { on: terracotta[600], off: terracotta[100] },
  },
];

/**
 * One-time role gate. Lives at the top level rather than inside `(auth)` so the
 * `(auth)` guard can redirect *here* without redirecting into a stack it is
 * simultaneously refusing to render.
 */
export default function RoleSelectScreen() {
  const t = useT();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [merchantSheet, setMerchantSheet] = useState(false);
  const [courierSheet, setCourierSheet] = useState(false);
  const user = useSessionStore((s) => s.user);
  const setRole = useSessionStore((s) => s.setRole);

  // This screen has no parent guard, so it enforces its own preconditions.
  if (!user) {
    return <Redirect href={routes.onboarding} />;
  }
  if (user.role) {
    return <Redirect href={homeRouteForRole(user.role)} />;
  }

  async function confirm() {
    if (!selected || !user) return;
    // Both of the working roles are gated on a human reading a file, so both
    // explain that before the form rather than after it. The merchant branch is
    // no longer a hand-off to the administration site — registration is in the
    // app now — but the approval it ends in is unchanged.
    if (selected === 'business') return setMerchantSheet(true);
    // A courier registers in the app, but the file still waits on a human
    // (CDC addendum v1.1, §04). Same courtesy as the merchant branch: say so
    // before the form, not after it.
    if (selected === 'courier') return setCourierSheet(true);
    await commitRole(selected);
  }

  async function commitRole(role: UserRole) {
    if (!user) return;
    setSaving(true);
    try {
      // Write through to the mock backend too, so signing out and back in with
      // the same account restores the role instead of re-asking for it.
      await authApi.selectRole(user.id, role);
    } catch {
      // Mock layer only fails if the user vanished; the local session is still
      // the source of truth for navigation, so fall through and set it anyway.
    } finally {
      setSaving(false);
    }
    setRole(role);
    router.replace(homeRouteForRole(role));
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Scrollable since the third role landed: three cards plus the header
          overflow a small screen, and the Continuer button is pinned below. */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-6 pt-6 pb-4 gap-8"
      >
        <View className="gap-2">
          <Text variant="title" weight="bold">
            {t('common.roleSelect.title')}
          </Text>
          <Text variant="body" tone="muted">
            {t('common.roleSelect.body')}
          </Text>
        </View>

        <View className="gap-4">
          {options.map((opt, index) => {
            const isSelected = selected === opt.role;
            const Icon = opt.icon;
            return (
              <MotiView
                key={opt.role}
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 350, delay: index * 80 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(opt.role)}
                  className={`rounded-2xl border-[1.5px] p-5 flex-row items-center gap-4 bg-card ${
                    isSelected ? 'border-primary' : 'border-border'
                  }`}
                  style={isSelected ? SELECTED_SHADOW : undefined}
                >
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center"
                    style={{ backgroundColor: isSelected ? opt.tint.on : opt.tint.off }}
                  >
                    <Icon
                      size={26}
                      color={isSelected ? '#FFFFFF' : opt.tint.on}
                      strokeWidth={1.75}
                    />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text weight="bold" variant="body">
                      {t(`common.roleSelect.${opt.role}.title`)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t(`common.roleSelect.${opt.role}.body`)}
                    </Text>
                  </View>
                  {isSelected ? (
                    <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : null}
                </Pressable>
              </MotiView>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-6 pb-4 pt-3">
        <Button
          label={t('common.continue')}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!selected}
          loading={saving}
          onPress={confirm}
        />
      </View>

      <MerchantSignupSheet
        visible={merchantSheet}
        onClose={() => setMerchantSheet(false)}
        onContinue={() => {
          setMerchantSheet(false);
          // The account now exists as a merchant with no shop filed — which is
          // precisely what the business tabs render as "Inscrivez votre
          // boutique", and then as "Demande en attente" once the form is sent.
          commitRole('business');
        }}
      />

      <CourierSignupSheet
        visible={courierSheet}
        onClose={() => setCourierSheet(false)}
        onContinue={() => {
          setCourierSheet(false);
          // Same parking spot as a merchant without a shop: the role is real,
          // the file is not approved yet, and the courier tabs say so.
          commitRole('courier');
        }}
      />
    </SafeAreaView>
  );
}

const SELECTED_SHADOW = {
  shadowColor: '#246B47',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.14,
  shadowRadius: 10,
  elevation: 3,
};

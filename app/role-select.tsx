import { Redirect, router } from 'expo-router';
import { Check, ShoppingBag, Store } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { authApi } from '@/data/api';
import type { UserRole } from '@/data/types';
import { homeRouteForRole, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';
import { forest } from '@/theme/tokens';
import type { LucideIcon } from 'lucide-react-native';

const options: { role: UserRole; icon: LucideIcon; title: string; description: string }[] = [
  {
    role: 'customer',
    icon: ShoppingBag,
    title: 'Je suis client',
    description: 'Je veux commander des produits auprès de commerces près de chez moi.',
  },
  {
    role: 'business',
    icon: Store,
    title: 'Je suis commerçant',
    description: 'Je veux vendre mes produits et gérer ma boutique sur Sougouba.',
  },
];

/**
 * One-time role gate. Lives at the top level rather than inside `(auth)` so the
 * `(auth)` guard can redirect *here* without redirecting into a stack it is
 * simultaneously refusing to render.
 */
export default function RoleSelectScreen() {
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    try {
      // Write through to the mock backend too, so signing out and back in with
      // the same account restores the role instead of re-asking for it.
      await authApi.mockSelectRole(user.id, selected);
    } catch {
      // Mock layer only fails if the user vanished; the local session is still
      // the source of truth for navigation, so fall through and set it anyway.
    } finally {
      setSaving(false);
    }
    setRole(selected);
    router.replace(homeRouteForRole(selected));
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 px-6 pt-6 gap-8">
        <View className="gap-2">
          <Text variant="title" weight="bold">
            Vous êtes...
          </Text>
          <Text variant="body" tone="muted">
            Ce choix détermine votre expérience Sougouba — il ne peut pas être changé plus tard.
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
                    style={{ backgroundColor: isSelected ? forest[600] : forest[100] }}
                  >
                    <Icon size={26} color={isSelected ? '#FFFFFF' : forest[600]} strokeWidth={1.75} />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text weight="bold" variant="body">
                      {opt.title}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {opt.description}
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
      </View>

      <View className="px-6 pb-4">
        <Button
          label="Continuer"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!selected}
          loading={saving}
          onPress={confirm}
        />
      </View>
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

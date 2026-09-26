import * as Haptics from 'expo-haptics';
import { Languages } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useThemeColors } from '@/hooks/useColorScheme';
import { type AppLocale, SUPPORTED_LOCALES } from '@/lib/i18n';
import { useT } from '@/lib/i18n/useT';
import { selectLocale, useLanguageStore } from '@/store/useLanguageStore';
import { Text } from './Text';

/** Each language named in itself, so someone who cannot read the other one can still find theirs. */
const NATIVE_NAME: Record<AppLocale, string> = { fr: 'Français', en: 'English' };

/**
 * The language control, for the Préférences block beside the dark-mode switch.
 *
 * A segmented control rather than a `Switch`: a switch would have to cast one
 * language as "on", which makes the other the default in a way the product does
 * not mean. And not a row leading to its own screen — `account/notifications.tsx`
 * earns a screen because it is four toggles each carrying a sentence; this is a
 * binary choice with nothing to explain.
 *
 * The segment labels are the language *codes*, which are the same in both
 * languages, so the control does not resize the moment you use it. The spoken
 * names go on `accessibilityLabel`, where a screen reader wants them.
 */
export interface LanguageToggleProps {
  /**
   * Row layout. Defaults to a self-padded row, which suits the customer
   * profile's edge-to-edge `Section` list; the merchant and courier profiles pad
   * their own card, so they pass a version without `p-4`.
   */
  className?: string;
}

export function LanguageToggle({
  className = 'flex-row items-center gap-3 p-4',
}: LanguageToggleProps) {
  const t = useT();
  const colors = useThemeColors();
  const locale = useLanguageStore(selectLocale);
  const setPreference = useLanguageStore((state) => state.setPreference);

  return (
    <View className={className}>
      <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
        <Languages size={17} color={colors.primary} strokeWidth={2} />
      </View>
      <Text variant="caption" weight="semibold" className="flex-1">
        {t('common.preferences.language')}
      </Text>
      <View className="flex-row rounded-full bg-muted p-0.5" accessibilityRole="radiogroup">
        {SUPPORTED_LOCALES.map((code) => {
          const active = locale === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={NATIVE_NAME[code]}
              onPress={() => {
                if (active) return;
                Haptics.selectionAsync().catch(() => {});
                setPreference(code);
              }}
              className={`px-3.5 py-1.5 rounded-full ${active ? 'bg-card' : ''}`}
            >
              <Text
                variant="caption"
                weight={active ? 'bold' : 'regular'}
                tone={active ? 'default' : 'muted'}
                className="text-[13px]"
              >
                {code.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

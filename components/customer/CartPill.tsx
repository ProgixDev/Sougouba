import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { forest, mustard } from '@/theme/tokens';

export interface CartPillProps {
  /** Shouty and short — "AJOUTER AU PANIER", "VOIR LE PANIER". */
  label: string;
  /** A second line under the label ("3 articles"), or the transient "Ajouté ✓". */
  caption?: string;
  /** Shown in the dark chip at the right. */
  price?: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Changing this replays the pop — pass the cart count, or an add counter. */
  bumpKey?: number;
  leading?: ReactNode;
}

/**
 * The cart's one button shape: a bold mustard pill with the amount in a dark
 * chip, so "what this costs" is read before "what this does".
 *
 * Shared by the floating cart bar and the product page's add button on purpose:
 * the thing you press to add and the thing that then appears are visibly the
 * same object, which is most of what tells a shopper the add worked.
 */
export function CartPill({
  label,
  caption,
  price,
  onPress,
  disabled,
  accessibilityLabel,
  bumpKey,
  leading,
}: CartPillProps) {
  return (
    <MotiView
      key={bumpKey}
      from={{ scale: bumpKey ? 0.94 : 1 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', damping: 9, stiffness: 260 }}
      style={SHADOW}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        className="flex-row items-center gap-3 rounded-[26px] pl-5 pr-2.5 active:opacity-90"
        style={{ height: 64, backgroundColor: disabled ? mustard[200] : mustard[400] }}
      >
        {leading}
        <View className="flex-1">
          <RNText
            numberOfLines={1}
            style={{ fontFamily: 'HankenGrotesk_800ExtraBold', fontSize: 15, letterSpacing: 1.2, color: forest[900] }}
          >
            {label}
          </RNText>
          {caption ? (
            <RNText
              numberOfLines={1}
              style={{ fontFamily: 'HankenGrotesk_600SemiBold', fontSize: 12, color: forest[900], opacity: 0.75 }}
            >
              {caption}
            </RNText>
          ) : null}
        </View>
        {price ? (
          <View className="rounded-2xl px-4 justify-center" style={{ height: 46, backgroundColor: forest[900] }}>
            <RNText style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 19, color: mustard[300] }}>
              {price}
            </RNText>
          </View>
        ) : null}
      </Pressable>
    </MotiView>
  );
}

const SHADOW = {
  shadowColor: '#3A2A08',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.22,
  shadowRadius: 18,
  elevation: 8,
};

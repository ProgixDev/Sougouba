import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { AnimatePresence, MotiView } from 'moti';
import { ShoppingBag } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarInset } from '@/hooks/useTabBarInset';
import { useT } from '@/lib/i18n/useT';
import { formatCad } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useCartStore } from '@/store/useCartStore';
import { forest } from '@/theme/tokens';

import { CartPill } from './CartPill';

/** Height of the pill plus the gap above whatever it floats over. */
export const CART_BAR_SPACE = 64 + 16;

/**
 * Where the bar floats. Browsing screens only — it would be noise on the cart
 * and checkout (which *are* the cart), on the product page (whose own add button
 * is the same pill), and on account and order screens, where nobody is shopping.
 */
const TAB_SCREENS = ['/home', '/search'];
const STACK_SCREENS = [/^\/vendor\//, /^\/vertical\//, /^\/favorites$/];

export function cartBarPlacement(pathname: string): 'tab' | 'stack' | null {
  if (TAB_SCREENS.includes(pathname)) return 'tab';
  if (STACK_SCREENS.some((r) => r.test(pathname))) return 'stack';
  return null;
}

/**
 * The cart, always in reach while shopping.
 *
 * Before this, an add changed nothing on screen: the only way to know it
 * worked was to open the cart. Now the first add slides this bar in, and every
 * add after it bumps the pill, fires a haptic and flashes "Ajouté ✓" — the
 * count and subtotal update in place. Tapping it opens the cart.
 *
 * Mounted once in the customer layout rather than per screen, so it survives
 * navigation between browsing screens instead of re-animating on each one.
 */
export function CartBar() {
  const t = useT();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const items = useCartStore((s) => s.items);

  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPriceCad, 0);

  const [justAdded, setJustAdded] = useState(false);
  const previous = useRef(count);
  useEffect(() => {
    const grew = count > previous.current;
    previous.current = count;
    if (!grew) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setJustAdded(true);
    const timer = setTimeout(() => setJustAdded(false), 1600);
    return () => clearTimeout(timer);
  }, [count]);

  const placement = cartBarPlacement(pathname);
  const visible = count > 0 && placement !== null;
  const bottom = placement === 'tab' ? tabBarInset + 10 : insets.bottom + 10;

  return (
    <AnimatePresence>
      {visible ? (
        <MotiView
          key="cart-bar"
          from={{ opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
          exit={{ opacity: 0, translateY: 40 }}
          transition={{ type: 'spring', damping: 16, stiffness: 180 }}
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom }}
        >
          <CartPill
            label={t('customer.cartBar.view')}
            caption={
              justAdded ? t('customer.cartBar.added') : t('customer.cartBar.count', { count })
            }
            price={formatCad(subtotal)}
            bumpKey={count}
            accessibilityLabel={t('customer.cartBar.a11y', { count, total: formatCad(subtotal) })}
            onPress={() => router.navigate(routes.customerCart)}
            leading={
              <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: forest[900] }}>
                <ShoppingBag size={17} color="#FFFFFF" strokeWidth={2.2} />
              </View>
            }
          />
        </MotiView>
      ) : null}
    </AnimatePresence>
  );
}

/** Extra bottom space a browsing screen reserves so its last row is not under the bar. */
export function useCartBarInset(): number {
  const count = useCartStore((s) => s.items.length);
  return count > 0 ? CART_BAR_SPACE : 0;
}

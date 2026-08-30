import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { MessageCircle, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, Reveal, Text } from '@/components/ui';
import { loyaltyApi, ordersApi } from '@/data/api';
import {
  REFERRAL_MIN_FIRST_ORDER_CAD,
  REFERRAL_REWARD_POINTS,
  pointsToDiscountCad,
  referralCodeFor,
} from '@/data/loyalty';
import { useThemeColors } from '@/hooks/useColorScheme';
import { formatCad } from '@/lib/format';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * `sougouba.ca` is the marketing site's real domain (see `web/lib/content.ts`);
 * a `?ref=` landing page for it is a two-line addition there whenever that
 * site is touched next — this link is honest about the code it carries even
 * before that page exists to read the param.
 */
const REFERRAL_LINK_BASE = 'https://sougouba.ca/?ref=';

export default function ReferScreen() {
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const [stats, setStats] = useState({ referredCount: 0, pointsFromReferrals: 0 });

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      ordersApi.ensureLoyaltyBackfill(user.id).then(() =>
        loyaltyApi.getReferralStats(user.id).then((next) => {
          if (active) setStats(next);
        })
      );
      return () => {
        active = false;
      };
    }, [user])
  );

  if (!user) return null;

  const code = referralCodeFor(user.id);
  const link = `${REFERRAL_LINK_BASE}${code}`;
  const rewardCad = formatCad(pointsToDiscountCad(REFERRAL_REWARD_POINTS));
  const message = `Rejoins-moi sur Sougouba et gagne ${REFERRAL_REWARD_POINTS} points (${rewardCad}) sur ta première commande de ${REFERRAL_MIN_FIRST_ORDER_CAD} $ et plus. Mon code : ${code} — ${link}`;

  async function share(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Impossible d’ouvrir l’application', 'Réessayez, ou copiez votre code manuellement.');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Parrainer un proche" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pt-2 pb-8 gap-5">
        <Reveal>
          <View className="items-center gap-2 px-4">
            <Text variant="title" weight="bold" className="text-center text-[22px]">
              Offrez {REFERRAL_REWARD_POINTS} points, gagnez {REFERRAL_REWARD_POINTS} points
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              Dès que votre ami termine sa première commande de {formatCad(REFERRAL_MIN_FIRST_ORDER_CAD)} et
              plus, vous recevez chacun {REFERRAL_REWARD_POINTS} points ({rewardCad}).
            </Text>
          </View>
        </Reveal>

        <Reveal delay={60}>
          <View className="rounded-[20px] bg-card p-5 items-center gap-3">
            <Text variant="label" tone="muted">
              Votre code
            </Text>
            <Text
              selectable
              variant="display"
              weight="extrabold"
              tone="primary"
              className="text-[30px] tracking-[2px]"
            >
              {code}
            </Text>
            <Text variant="caption" tone="muted" className="text-center text-[12px]">
              Appuyez longuement sur le code pour le copier.
            </Text>
          </View>
        </Reveal>

        <Reveal delay={100}>
          <View className="gap-2.5">
            <ShareButton
              icon={<MessageCircle size={19} color="#fff" strokeWidth={2.2} />}
              label="Partager via WhatsApp"
              backgroundColor="#25D366"
              onPress={() => share(`https://wa.me/?text=${encodeURIComponent(message)}`)}
            />
            <ShareButton
              // Lucide dropped brand marks, so Facebook is spelled out rather
              // than mimed with a generic icon that would not read as "Facebook".
              icon={
                <Text weight="extrabold" className="text-white text-[19px] leading-[19px]">
                  f
                </Text>
              }
              label="Partager sur Facebook"
              backgroundColor="#1877F2"
              onPress={() =>
                share(
                  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    link
                  )}&quote=${encodeURIComponent(message)}`
                )
              }
            />
          </View>
        </Reveal>

        <Reveal delay={140}>
          <View className="flex-row items-center gap-3 rounded-[20px] bg-muted p-4">
            <View className="w-10 h-10 items-center justify-center rounded-full bg-card">
              <Users size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[18px]">
              {stats.referredCount === 0
                ? 'Aucun ami parrainé pour l’instant.'
                : `${stats.referredCount} ami${stats.referredCount > 1 ? 's' : ''} parrainé${
                    stats.referredCount > 1 ? 's' : ''
                  } · ${stats.pointsFromReferrals} points gagnés grâce au parrainage.`}
            </Text>
          </View>
        </Reveal>

        <Text variant="caption" tone="muted" className="px-1 text-[12px] leading-[17px]">
          Une récompense par nouveau client. Les points sont crédités une fois la commande de votre
          ami livrée — jamais avant.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ShareButton({
  icon,
  label,
  backgroundColor,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  backgroundColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="h-14 flex-row items-center justify-center gap-2.5 rounded-full active:opacity-85"
      style={{ backgroundColor }}
    >
      {icon}
      <Text variant="body" weight="bold" className="text-white tracking-wide">
        {label}
      </Text>
    </Pressable>
  );
}

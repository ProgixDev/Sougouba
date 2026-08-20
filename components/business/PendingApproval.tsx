import { router } from 'expo-router';
import { Clock3, ShieldCheck, Store } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useDemoShopApproval } from '@/hooks/useDemoShopApproval';
import { useTabBarInset } from '@/hooks/useTabBarInset';
import { MERCHANT_SIGNUP_STEPS } from '@/lib/merchantOnboarding';
import { routes } from '@/lib/routes';

export interface PendingApprovalProps {
  /** `missing` has never filed anything; `pending` is waiting on a human. */
  state: 'missing' | 'pending';
  /** Re-read the shop after the demo approval, so the tabs leave this screen. */
  onApproved?: () => Promise<void> | void;
}

/**
 * What a merchant account sees before its shop is live.
 *
 * Two states, and the difference is the whole reason this is not an error
 * message. "Missing" is a form nobody has filled; "pending" is a shop sitting in
 * the admin queue (CDC addendum v1.1, §02). Telling someone to wait when they
 * have not applied, or asking them to apply when they already have, are both
 * ways of looking broken.
 *
 * Registration itself used to live on the administration website and this screen
 * existed mostly to explain a redirect it could not perform. The form is in the
 * app now; what did not change is that a person approves it.
 *
 * Rendered by all five business tabs rather than each writing its own version —
 * they are all the same account in the same state.
 */
export function PendingApproval({ state, onApproved }: PendingApprovalProps) {
  const colors = useThemeColors();
  const tabBarInset = useTabBarInset();
  const { approve, approving, adoptDemoShop, adopting } = useDemoShopApproval(onApproved);

  const applied = state === 'pending';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        // The tab bar is positioned absolutely so content scrolls under its
        // blur; every scroll container inside `(tabs)` reserves this.
        contentContainerStyle={{ padding: 20, paddingBottom: tabBarInset + 28, gap: 20 }}
      >
        <View className="items-start gap-4 pt-6">
          <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
            {applied ? (
              <Clock3 size={30} color={colors.primary} strokeWidth={1.6} />
            ) : (
              <Store size={30} color={colors.primary} strokeWidth={1.6} />
            )}
          </View>
          <View className="gap-2">
            <Text variant="title" weight="bold" className="text-[26px]">
              {applied ? 'Demande en attente' : 'Inscrivez votre boutique'}
            </Text>
            <Text variant="body" tone="muted">
              {applied
                ? 'Votre boutique n’est pas encore en ligne. Un administrateur Sougouba doit valider votre dossier avant que vous puissiez recevoir des commandes.'
                : 'Quelques informations sur votre commerce, votre adresse et vos documents, et votre dossier part en validation.'}
            </Text>
          </View>
        </View>

        <View className="rounded-[20px] bg-card p-5 gap-5">
          {MERCHANT_SIGNUP_STEPS.map((step, index) => (
            <View key={step.title} className="flex-row gap-3.5">
              <View className="w-7 h-7 rounded-full bg-primary/10 items-center justify-center mt-0.5">
                <Text variant="caption" weight="bold" tone="primary" className="text-[12px]">
                  {index + 1}
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text variant="caption" weight="bold">
                  {step.title}
                </Text>
                <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                  {step.body}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {applied ? (
          <View className="flex-row items-start gap-2.5 rounded-2xl border border-border p-4">
            <ShieldCheck
              size={15}
              color={colors.mutedForeground}
              strokeWidth={2}
              className="mt-0.5"
            />
            <Text variant="caption" tone="muted" className="flex-1 text-[13px] leading-[19px]">
              La validation prend généralement un jour ouvrable. Vous serez averti dès que votre
              boutique est en ligne.
            </Text>
          </View>
        ) : (
          <Button
            label="Inscrire ma boutique"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push(routes.businessSignup)}
          />
        )}

        {/* Says what it is. Without the back-office there is no other way to
            reach the merchant screens from an account created in the app, and a
            demo that cannot show them is worse than one honest button. */}
        <View className="gap-2 pt-2 border-t border-border">
          <Text variant="label" tone="muted" className="text-[10px]">
            Démonstration
          </Text>
          {applied ? (
            <>
              <Button
                label="Simuler l’approbation"
                variant="outline"
                size="md"
                fullWidth
                loading={approving}
                onPress={approve}
              />
              <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
                Met votre boutique en ligne, comme le ferait un administrateur. Elle démarre sans
                catalogue ni historique.
              </Text>
            </>
          ) : (
            <>
              {/* The shop a merchant files is empty by definition, so the
                  dashboard, the analytics and the order queue have nothing to
                  draw. This borrows a seeded shop so those screens can be shown
                  without filling a form first — a different thing from approving
                  a real application, and labelled as such. */}
              <Button
                label="Ouvrir une boutique de démonstration"
                variant="outline"
                size="md"
                fullWidth
                loading={adopting}
                onPress={adoptDemoShop}
              />
              <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
                Rattache ce compte à une boutique déjà garnie, avec son catalogue et son historique
                de commandes.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

import { Redirect } from 'expo-router';
import { Heart, Leaf, Lock, Mail, MapPin, ShoppingCart } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  LanguageToggle,
  Skeleton,
  SkeletonCard,
  StatPill,
  Text,
} from '@/components/ui';
import { CategoryRow } from '@/components/customer';
import { categories } from '@/data/seed/categories';
import type { Category } from '@/data/types';
import {
  formatCad,
  formatCadCompact,
  formatDate,
  formatDayLong,
  formatElapsed,
  formatMonthYear,
  formatPercent,
  formatTime,
} from '@/lib/format';
import { formatDistance } from '@/lib/geo';
import { useLocalized } from '@/lib/localized';
import { intlSupportReport } from '@/lib/i18n/icu';
import { useLocale } from '@/lib/i18n/useT';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * Phase 0 checkpoint: design-system styleguide. Not part of the real app flow —
 * app/index.tsx becomes the animated splash + redirect slot in Phase 1.
 *
 * Development builds only. Expo Router does not hide `_`-prefixed folders, so
 * without this guard `/_dev/styleguide` is a real route in the store build,
 * reachable by deep link.
 */
export default function StyleguideScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Styleguide />;
}

function Styleguide() {
  const L = useLocalized();
  const { preference, toggle } = useThemeStore();
  const [selectedChip, setSelectedChip] = useState('cat_produce');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView className="flex-1" contentContainerClassName="p-5 gap-8 pb-16">
        <View className="flex-row items-center justify-between">
          <Text variant="title" weight="extrabold" tone="primary">
            Sougouba
          </Text>
          <Button label={preference === 'dark' ? 'Mode clair' : 'Mode sombre'} variant="outline" size="sm" onPress={toggle} />
        </View>

        <IntlProbe />

        <Section title="Typographie">
          <Text variant="display" weight="extrabold">
            Display 4xl
          </Text>
          <Text variant="title" weight="bold">
            Title 2xl bold
          </Text>
          <Text variant="subtitle" weight="medium">
            Subtitle lg medium
          </Text>
          <Text variant="body">Body base — texte courant de l’application, en français.</Text>
          <Text variant="caption" tone="muted">
            Caption sm muted
          </Text>
          <Text variant="label" tone="muted">
            Label uppercase
          </Text>
        </Section>

        <Section title="Boutons">
          <View className="gap-3">
            <Button label="Ajouter au panier" variant="cta" icon={<ShoppingCart size={18} color="#fff" />} fullWidth />
            <Button label="Continuer" variant="primary" fullWidth />
            <Button label="En savoir plus" variant="outline" fullWidth />
            <Button label="Annuler" variant="ghost" fullWidth />
            <Button label="Supprimer" variant="destructive" fullWidth />
            <Button label="Chargement" variant="primary" loading fullWidth />
            <Button label="Désactivé" variant="primary" disabled fullWidth />
          </View>
        </Section>

        <Section title="Champs de saisie">
          <Input label="Adresse courriel" icon={Mail} keyboardType="email-address" required />
          <Input label="Mot de passe" icon={Lock} isPassword required />
          <Input label="Code postal" error="Ce champ est requis" />
        </Section>

        <Section title="Catégories (accueil)">
          <CategoryRow categories={categories} selectedId={selectedChip} onSelect={setSelectedChip} />
        </Section>

        <Section title="Chips de filtre">
          <View className="flex-row flex-wrap gap-2">
            {categories.map((cat: Category) => (
              <Chip
                key={cat.id}
                label={L(cat.shortName)}
                selected={selectedChip === cat.id}
                onPress={() => setSelectedChip(cat.id)}
              />
            ))}
          </View>
        </Section>

        <Section title="Badges — soft">
          <View className="flex-row flex-wrap gap-2 items-center">
            <Badge label="Halal" tone="success" />
            <Badge label="En préparation" tone="warning" />
            <Badge label="Annulée" tone="destructive" />
            <Badge label="Nouveau" tone="primary" />
            <Badge label="En livraison" tone="secondary" />
            <Badge label="Épuisé" tone="neutral" />
          </View>
        </Section>

        <Section title="Badges — solid">
          <View className="flex-row flex-wrap gap-2 items-center">
            <Badge label="Halal" tone="success" variant="solid" />
            <Badge label="En préparation" tone="warning" variant="solid" />
            <Badge label="Annulée" tone="destructive" variant="solid" />
            <Badge label="Nouveau" tone="primary" variant="solid" />
            <Badge label="En livraison" tone="secondary" variant="solid" />
            <Badge label="Épuisé" tone="neutral" variant="solid" />
          </View>
        </Section>

        <Section title="Badges — small">
          <View className="flex-row flex-wrap gap-2 items-center">
            <Badge label="-20%" tone="secondary" variant="solid" size="sm" />
            <Badge label="Halal" tone="success" size="sm" />
            <Badge label="Bio" tone="primary" size="sm" />
          </View>
        </Section>

        <Section title="Carte produit (aperçu)">
          <Card className="p-4 gap-3">
            <View className="flex-row items-center gap-3">
              <Avatar fullName="Marché Bamako" size={48} />
              <View className="flex-1">
                <Text weight="bold">Mangue Kent</Text>
                <View className="flex-row items-center gap-1">
                  <MapPin size={14} color="#8A8175" />
                  <Text variant="caption" tone="muted">
                    Marché Bamako · Côte-des-Neiges
                  </Text>
                </View>
              </View>
              <Heart size={20} color="#D9642C" />
            </View>
            <View className="flex-row justify-between bg-muted rounded-md p-3">
              <StatPill label="Calories" value="60 kcal" />
              <StatPill label="Protéines" value="1 g" />
              <StatPill label="Lipides" value="0 g" />
              <StatPill label="Poids" value="200 g" />
            </View>
            <Button label="Ajouter au panier — 4,50 $" variant="cta" fullWidth />
          </Card>
        </Section>

        <Section title="États de chargement">
          <View className="flex-row gap-3">
            <Skeleton width={60} height={60} radius={30} />
            <View className="flex-1 gap-2 justify-center">
              <Skeleton height={14} width="60%" />
              <Skeleton height={12} width="40%" />
            </View>
          </View>
          <SkeletonCard />
        </Section>

        <Section title="État vide">
          <Card className="overflow-hidden">
            <EmptyState
              icon={Leaf}
              title="Votre panier est vide"
              description="Parcourez les commerces près de chez vous pour commencer."
              actionLabel="Découvrir les commerces"
              onAction={() => {}}
            />
          </Card>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * What this device's `Intl` actually does — the release gate for the formatter
 * work.
 *
 * `npm run verify` runs in Node, which has full ICU and therefore cannot speak
 * for Hermes. Android's Hermes is the one with the trimmed `Intl`, and the crash
 * documented atop `data/utils/time.ts` is what happens when that is assumed
 * rather than checked. **Open this screen on a physical Android device** and
 * read the table before trusting `lib/format.ts`.
 *
 * Every row should render a sensible string in both locales, except
 * `relativeTime` and `pluralRules`, which are expected to read `undefined` on
 * Android — they are listed so their absence is a recorded observation rather
 * than a discovery made in production. Nothing in the app may use them.
 *
 * The FR/EN toggle beside it exercises the live switch: prices, dates and the
 * formatted samples below should all change without a reload.
 */
function IntlProbe() {
  // Subscribes this component to the locale. `LanguageToggle` below does too,
  // but it is a *child* — its re-render would not re-run the `formatCad` calls
  // here, and the samples would sit frozen in the launch language. This is the
  // same trap `scripts/verify-i18n.ts` check 9 exists to catch across the app.
  useLocale();

  const report = intlSupportReport();
  const sample = new Date(2026, 7, 8, 18, 30).toISOString();

  return (
    <Section title="Intl / i18n (dev gate)">
      <LanguageToggle className="flex-row items-center gap-3" />
      {report.map((row) => (
        <View key={row.locale} className="gap-1 rounded-2xl bg-muted p-3">
          <Text variant="caption" weight="bold">
            {row.locale}
          </Text>
          {Object.entries(row)
            .filter(([field]) => field !== 'locale')
            .map(([field, value]) => (
              <View key={field} className="flex-row justify-between gap-3">
                <Text variant="caption" tone="muted" className="text-[12px]">
                  {field}
                </Text>
                <Text variant="caption" className="text-[12px] flex-1 text-right">
                  {value}
                </Text>
              </View>
            ))}
        </View>
      ))}
      <View className="gap-1 rounded-2xl bg-muted p-3">
        <Text variant="caption" weight="bold">
          Through lib/format (active locale)
        </Text>
        {(
          [
            ['formatCad', formatCad(1234.5)],
            ['formatCadCompact', formatCadCompact(10)],
            ['formatDate', formatDate(sample)],
            ['formatTime', formatTime(sample)],
            ['formatMonthYear', formatMonthYear(sample)],
            ['formatDayLong', formatDayLong(sample)],
            ['formatPercent', formatPercent(0.125)],
            ['formatDistance', formatDistance(12.4)],
            ['formatElapsed', formatElapsed(new Date(Date.now() - 5 * 86400000).toISOString())],
          ] as const
        ).map(([field, value]) => (
          <View key={field} className="flex-row justify-between gap-3">
            <Text variant="caption" tone="muted" className="text-[12px]">
              {field}
            </Text>
            <Text variant="caption" className="text-[12px] flex-1 text-right">
              {value}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

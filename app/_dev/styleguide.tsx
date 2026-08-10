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
  Skeleton,
  SkeletonCard,
  StatPill,
  Text,
} from '@/components/ui';
import { CategoryRow } from '@/components/customer';
import { categories } from '@/data/seed/categories';
import type { Category } from '@/data/types';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * Phase 0 checkpoint: design-system styleguide. Not part of the real app flow —
 * app/index.tsx becomes the animated splash + redirect slot in Phase 1.
 */
export default function StyleguideScreen() {
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
                label={cat.shortNameFr}
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

import { ArrowUpLeft, Clock, LayoutGrid, Search, Store, TrendingUp, X, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui';
import { useProductsByIds, useSearchSuggestions, useTopProductIds } from '@/data/queries';
import type { Category, ID, Vendor } from '@/data/types';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useDebounce } from '@/hooks/useDebounce';
import { categoryIcons } from '@/lib/categoryIcons';
import { useT } from '@/lib/i18n/useT';
import { useLocalized } from '@/lib/localized';
import { MIN_SUGGEST_LENGTH, foldSearch, matchByLabel } from '@/lib/searchSuggestions';
import { useRecentSearchesStore } from '@/store/useRecentSearchesStore';
import { darkColors, lightColors } from '@/theme/colors';

/** Stable empty fallback — a fresh `[]` per render would be a new query key each time. */
const EMPTY_IDS: ID[] = [];

/** There are eight categories; more than two matching a few letters is noise. */
const CATEGORY_LIMIT = 2;

const SUGGEST_DEBOUNCE_MS = 300;

/** The home screen's own best-seller count, so this reads its cache instead of asking again. */
const POPULAR_LIMIT = 6;

export interface SearchSuggestionsProps {
  /** The search field's text, as typed. */
  query: string;
  categories: Category[];
  /** The cached shop list — only to show a suggested shop's specialty in the app's language. */
  vendors: Vendor[];
  /** Run the search for a term: what was typed, a suggestion, or a past search. */
  onSearch: (term: string) => void;
  onPickCategory: (categoryId: ID) => void;
  onPickVendor: (vendorId: ID) => void;
  bottomInset: number;
}

/**
 * What the search screen shows while its field has the keyboard.
 *
 * With two letters or more: the search itself, then the categories, shops and
 * terms those letters could mean. Before that: this phone's recent searches
 * and what is selling now — a place to start for someone who does not yet know
 * what the catalogue calls things.
 *
 * Shops and terms come from the API a beat after the typing stops; categories
 * are matched here and appear at once. The first row — « Rechercher … » — is
 * always there, so the panel is never a dead end when nothing else matches.
 */
export function SearchSuggestions({
  query,
  categories,
  vendors,
  onSearch,
  onPickCategory,
  onPickVendor,
  bottomInset,
}: SearchSuggestionsProps) {
  const t = useT();
  const L = useLocalized();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const term = query.replace(/\s+/g, ' ').trim();
  const typing = foldSearch(term).length >= MIN_SUGGEST_LENGTH;

  // Asked once the typing pauses, not at every letter: 300 ms is longer than
  // the gap between two letters of a word being typed, shorter than a pause to
  // read the panel.
  const remote = useSearchSuggestions(useDebounce(term, SUGGEST_DEBOUNCE_MS));
  // Ignored once the field is too short again: the query keeps its last answer
  // on purpose (see `useSearchSuggestions`), and it no longer applies.
  const suggestions = typing ? remote.data : undefined;

  const matchedCategories = matchByLabel(categories, (c) => [L(c.name), L(c.shortName)], term, CATEGORY_LIMIT);

  const recent = useRecentSearchesStore((s) => s.terms);
  const removeRecent = useRecentSearchesStore((s) => s.remove);
  const clearRecent = useRecentSearchesStore((s) => s.clear);

  const popularIds = useTopProductIds(POPULAR_LIMIT).data ?? EMPTY_IDS;
  const popularProducts = useProductsByIds(popularIds).data;
  // By name: two shops selling the same best seller are one thing to search for.
  const popular = [...new Map((popularProducts ?? []).map((p) => [foldSearch(p.name), p.name])).values()];

  const specialtyOf = (id: ID, fallback: string) => {
    const cached = vendors.find((v) => v.id === id);
    return cached ? L(cached.specialty) : fallback;
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      // A tap on a row must reach the row, not just close the keyboard.
      keyboardShouldPersistTaps="handled"
      // The keyboard is up for as long as this is on screen; without the inset
      // the last rows would sit under it, unreachable.
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingBottom: bottomInset }}
    >
      {typing ? (
        <>
          <Row
            icon={Search}
            iconColor={colors.primary}
            label={t('customer.search.suggestions.searchFor', { query: term })}
            onPress={() => onSearch(term)}
          />
          {matchedCategories.map((category) => (
            <Row
              key={`category-${category.id}`}
              icon={categoryIcons[category.icon] ?? LayoutGrid}
              iconColor={colors.mutedForeground}
              label={L(category.name)}
              sublabel={t('customer.search.suggestions.category')}
              onPress={() => onPickCategory(category.id)}
            />
          ))}
          {(suggestions?.vendors ?? []).map((vendor) => (
            <Row
              key={`vendor-${vendor.id}`}
              icon={Store}
              iconColor={colors.mutedForeground}
              label={vendor.name}
              sublabel={specialtyOf(vendor.id, vendor.specialtyFr)}
              onPress={() => onPickVendor(vendor.id)}
            />
          ))}
          {(suggestions?.terms ?? []).map((suggested) => (
            <Row
              key={`term-${suggested}`}
              icon={Search}
              iconColor={colors.mutedForeground}
              label={suggested}
              onPress={() => onSearch(suggested)}
              // The arrow every search field uses for "put this in the field".
              trailing={<ArrowUpLeft size={17} color={colors.mutedForeground} strokeWidth={2} />}
            />
          ))}
        </>
      ) : (
        <>
          {recent.length > 0 ? (
            <>
              <Heading
                title={t('customer.search.suggestions.recent')}
                actionLabel={t('customer.search.suggestions.clearRecent')}
                onAction={clearRecent}
              />
              {recent.map((past) => (
                <Row
                  key={`recent-${past}`}
                  icon={Clock}
                  iconColor={colors.mutedForeground}
                  label={past}
                  onPress={() => onSearch(past)}
                  trailing={
                    <Pressable
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('customer.search.suggestions.removeRecent', { query: past })}
                      onPress={() => removeRecent(past)}
                    >
                      <X size={17} color={colors.mutedForeground} strokeWidth={2} />
                    </Pressable>
                  }
                />
              ))}
            </>
          ) : null}
          {popular.length > 0 ? (
            <>
              <Heading title={t('customer.search.suggestions.popular')} />
              {popular.map((name) => (
                <Row
                  key={`popular-${name}`}
                  icon={TrendingUp}
                  iconColor={colors.mutedForeground}
                  label={name}
                  onPress={() => onSearch(name)}
                />
              ))}
            </>
          ) : null}
          {recent.length === 0 && popular.length === 0 ? (
            <Text variant="caption" tone="muted" className="px-5 pt-2">
              {t('customer.search.suggestions.hint')}
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Heading({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View className="flex-row items-center px-5 pt-3 pb-1">
      <Text variant="label" tone="muted" className="flex-1">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable hitSlop={8} accessibilityRole="button" onPress={onAction}>
          <Text variant="caption" weight="semibold" tone="secondary">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({
  icon: Icon,
  iconColor,
  label,
  sublabel,
  onPress,
  trailing,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      onPress={onPress}
      className="flex-row items-center gap-3 px-5 py-2.5 active:opacity-70"
    >
      <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
        <Icon size={17} color={iconColor} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text weight="medium" numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text variant="caption" tone="muted" numberOfLines={1} className="text-[13px]">
            {sublabel}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

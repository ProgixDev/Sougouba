import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Clock, Heart, MapPin, Star, StoreIcon } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuItemRow, ProductCard, useCardWidth, useCartBarInset } from '@/components/customer';
import { Badge, CatalogImage, Chip, EmptyState, ListFooter, Skeleton, Text } from '@/components/ui';
import { usePagedList } from '@/hooks/usePagedList';
import { categoriesApi, productsApi, vendorsApi } from '@/data/api';
import { deliveryFeeBetween } from '@/data/deliveryPricing';
import type { Category, Product, Vendor } from '@/data/types';
import { useColorScheme } from '@/hooks/useColorScheme';
import { deliveryAddressFor } from '@/lib/deliveryAddress';
import { useLocalized } from '@/lib/localized';
import { useT } from '@/lib/i18n/useT';
import { formatCad } from '@/lib/format';
import { dynamicRoutes, routes } from '@/lib/routes';
import { shopDay, shopStatusLine } from '@/lib/shopHours';
import { useCartStore } from '@/store/useCartStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useSessionStore } from '@/store/useSessionStore';
import { darkColors, lightColors } from '@/theme/colors';
import { mustard, terracotta } from '@/theme/tokens';

const COVER_HEIGHT = 200;
const RAIL_HEIGHT = 56;
/** Two per row for a grocery grid; a restaurant menu is one dish per row. */
const GRID_COLUMNS = 2;

/** One rendered line of a section: a pair of grocery cards, or a single dish. */
type SectionRow = Product[];

interface MenuSection {
  id: string;
  title: string;
  data: SectionRow[];
}

const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList<SectionRow, MenuSection>
);

/**
 * Level 2 of the browse: one shop, its own sections, its own products.
 *
 * The catalogue used to be a single flat grid titled "Catalogue (24)". The CDC
 * addendum has each merchant name their own shelves — Entrées/Plats/Desserts, or
 * Fruits/Épices/Conserves — so the page is now a sectioned list under those
 * headings, with a rail that pins itself to the top once the cover scrolls away.
 */
export default function VendorDetailScreen() {
  const cartBarInset = useCartBarInset();
  const t = useT();
  const L = useLocalized();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  const cardWidth = useCardWidth();

  const addItem = useCartStore((s) => s.addItem);
  const isFavorite = useFavoritesStore((s) => (id ? s.vendorIds.includes(id) : false));
  const toggleVendor = useFavoritesStore((s) => s.toggleVendor);
  const user = useSessionStore((s) => s.user);
  /** Where an order from here would go — the delivery fee is a function of it. */
  const destination = useMemo(() => deliveryAddressFor(user), [user]);

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const listRef = useRef<SectionList<SectionRow, MenuSection>>(null);
  const scrollY = useSharedValue(0);
  /** Where the in-flow rail sits in content space, measured rather than assumed. */
  const railOffset = useSharedValue(COVER_HEIGHT + 220);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setVendorLoading(true);
    Promise.all([vendorsApi.getVendorById(id), categoriesApi.getCategories()])
      .then(([v, c]) => {
        if (!active) return;
        setVendor(v ?? null);
        setCategories(c);
      })
      .finally(() => {
        if (active) setVendorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // The shelves, in the shop's own section order, a page at a time: a section
  // arrives whole before the next one starts, so headings never repeat. Fifty
  // per page covers most shops in one request, which keeps the section rail
  // complete; a bigger shop's later sections join the rail as they load.
  const shelves = usePagedList(
    ['products', 'vendor', id, 'section'],
    (offset, limit) => productsApi.getVendorProductsPage(id as string, { sort: 'section' }, offset, limit),
    { enabled: !!id, pageSize: 50 }
  );
  const products: Product[] = shelves.items;
  const loading = vendorLoading || shelves.loading;

  const iconByCategory = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.icon])),
    [categories]
  );

  const isRestaurant = vendor?.vendorType === 'restaurant';

  /**
   * The shop's sections, in the shop's order, carrying only what it actually
   * stocks. An empty shelf renders no heading — a section title with nothing
   * under it reads as a loading failure.
   */
  const sections = useMemo<MenuSection[]>(() => {
    if (!vendor) return [];
    return vendor.sections
      .map((section) => {
        const items = products.filter((p) => p.sectionId === section.id);
        const rows: SectionRow[] = isRestaurant
          ? items.map((item) => [item])
          : chunk(items, GRID_COLUMNS);
        return { id: section.id, title: L(section.name), data: rows };
      })
      .filter((section) => section.data.length > 0);
  }, [vendor, products, isRestaurant]);

  useEffect(() => {
    setActiveSectionId((current) => current ?? sections[0]?.id ?? null);
  }, [sections]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // The rail leaves the screen with the header, so a copy of it drops in from
  // the top edge at the moment the original would have gone — the shopper never
  // loses the ability to jump between sections mid-menu.
  const pinnedRailStyle = useAnimatedStyle(() => {
    const pinned = scrollY.value > railOffset.value - insets.top;
    return {
      opacity: withTiming(pinned ? 1 : 0, { duration: 140 }),
      transform: [{ translateY: withTiming(pinned ? 0 : -12, { duration: 160 }) }],
      pointerEvents: pinned ? 'auto' : 'none',
    };
  });

  const jumpToSection = useCallback(
    (sectionId: string) => {
      const sectionIndex = sections.findIndex((s) => s.id === sectionId);
      if (sectionIndex < 0) return;
      Haptics.selectionAsync();
      setActiveSectionId(sectionId);
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        // Clear the pinned rail and the notch, or the heading lands under them.
        viewOffset: insets.top + RAIL_HEIGHT,
        animated: true,
      });
    },
    [sections, insets.top]
  );

  if (!loading && !vendor) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <EmptyState
          icon={StoreIcon}
          title={t('customer.vendor.notFoundTitle')}
          description={t('customer.vendor.notFoundBody')}
          actionLabel={t('customer.orderConfirmed.home')}
          onAction={() => router.replace(routes.customerHome)}
        />
      </View>
    );
  }

  const day = vendor ? shopDay(vendor) : null;
  // A closed shop is for looking, not ordering: the notice below says so, and the add buttons follow it.
  const closed = Boolean(day && !day.isOpen);

  return (
    <View className="flex-1 bg-background">
      <AnimatedSectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(row, index) => row[0]?.id ?? `row-${index}`}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={shelves.loadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={<ListFooter loading={shelves.loadingMore} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + cartBarInset + 32 }}
        onScrollToIndexFailed={() => {
          // Rows are content-sized, so a long jump can outrun the measured
          // window. Landing at the top beats not moving at all.
          listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true });
        }}
        onViewableItemsChanged={({ viewableItems }) => {
          const first = viewableItems.find((entry) => entry.section);
          const nextId = (first?.section as MenuSection | undefined)?.id;
          if (nextId) setActiveSectionId(nextId);
        }}
        viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
        ListHeaderComponent={
          <View>
            {loading || !vendor ? (
              <Skeleton height={COVER_HEIGHT} radius={0} />
            ) : (
              <CatalogImage id={vendor.id} kind="vendor" path={vendor.coverUrl} radius={0} height={COVER_HEIGHT} />
            )}

            <View className="-mt-6 rounded-t-[28px] bg-background px-5 pt-6 gap-5">
              {loading || !vendor ? (
                <View className="gap-3">
                  <Skeleton height={28} width="60%" />
                  <Skeleton height={16} width="40%" />
                </View>
              ) : (
                <View className="gap-3">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text variant="title" weight="bold" className="text-[25px] leading-[31px]">
                        {vendor.name}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {L(vendor.specialty)}
                      </Text>
                    </View>
                    {vendor.isHalalCertified ? <Badge label={t('customer.vendor.halal')} tone="success" /> : null}
                  </View>

                  <View className="flex-row items-center gap-1.5">
                    <MapPin size={15} color={colors.mutedForeground} strokeWidth={2} />
                    <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
                      {[vendor.address.street, vendor.city].filter(Boolean).join(', ')}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-4">
                    <View className="flex-row items-center gap-1.5">
                      <Star size={15} color={mustard[500]} fill={mustard[500]} strokeWidth={0} />
                      <Text variant="caption" weight="semibold">
                        {vendor.rating.toFixed(1)}
                      </Text>
                      <Text variant="caption" tone="muted">
                        ({vendor.reviewCount})
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <Clock size={15} color={colors.mutedForeground} strokeWidth={2} />
                      <Text variant="caption" tone="muted">
                        {vendor.deliveryEtaMin} min
                      </Text>
                    </View>
                    <Text variant="caption" tone="muted">
                      {t('customer.vendor.deliveryFee', {
                        fee: formatCad(deliveryFeeBetween(vendor.address, destination)),
                      })}
                    </Text>
                  </View>

                  {day && !day.isOpen ? (
                    <View className="rounded-2xl bg-muted px-4 py-3">
                      <Text variant="caption" weight="semibold">
                        {t(shopStatusLine(day))}
                      </Text>
                      <Text variant="caption" tone="muted" className="text-[12px]">
                        {t('customer.misc.browseOnly')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {sections.length > 1 ? (
              <View
                style={{ height: RAIL_HEIGHT }}
                onLayout={(event) => {
                  // Content-space y of the rail, so the pinned copy takes over at
                  // exactly the moment this one leaves — no guessed constant.
                  railOffset.value = event.nativeEvent.layout.y;
                }}
              >
                <SectionRail
                  sections={sections}
                  activeId={activeSectionId}
                  onSelect={jumpToSection}
                />
              </View>
            ) : (
              <View className="h-3" />
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View className="bg-background px-5 pt-4 pb-2">
            <Text variant="subtitle" weight="bold" className="text-[18px]">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item: row }) =>
          isRestaurant ? (
            <View className="px-5">
              <MenuItemRow
                product={row[0]}
                categoryIcon={iconByCategory[row[0].categoryId]}
                onPress={() =>
                  router.push({ pathname: dynamicRoutes.productDetail, params: { id: row[0].id } })
                }
                onAdd={() =>
                  addItem({
                    productId: row[0].id,
                    vendorId: row[0].vendorId,
                    unitPriceCad: row[0].priceCad,
                  })
                }
                closed={closed}
              />
              <View className="h-px bg-border ml-5" />
            </View>
          ) : (
            <View className="flex-row px-5 gap-3.5 pb-3.5" style={{ alignItems: 'flex-start' }}>
              {row.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  width={cardWidth}
                  categoryIcon={iconByCategory[product.categoryId]}
                  onPress={() =>
                    router.push({ pathname: dynamicRoutes.productDetail, params: { id: product.id } })
                  }
                  onAdd={() =>
                    addItem({
                      productId: product.id,
                      vendorId: product.vendorId,
                      unitPriceCad: product.priceCad,
                    })
                  }
                  closed={closed}
                />
              ))}
            </View>
          )
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={StoreIcon}
              title={t('customer.vendor.emptyCatalogTitle')}
              description={t('customer.vendor.emptyCatalogBody')}
            />
          )
        }
      />

      {/* Controls float over the cover rather than sitting in a bar, so the
          image reads full-bleed on scroll. */}
      <View
        className="absolute left-5 right-5 flex-row items-center justify-between"
        style={{ top: insets.top + 6 }}
      >
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.ui.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.customerHome))}
          className="w-11 h-11 items-center justify-center rounded-full bg-card"
        >
          <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? t('customer.favorite.remove') : t('customer.favorite.add')}
          onPress={() => {
            if (!id) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleVendor(id);
          }}
          className="w-11 h-11 items-center justify-center rounded-full bg-card"
        >
          <Heart
            size={19}
            color={isFavorite ? terracotta[600] : colors.foreground}
            fill={isFavorite ? terracotta[600] : 'transparent'}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      {sections.length > 1 ? (
        <Animated.View
          style={[
            pinnedRailStyle,
            {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              paddingTop: insets.top,
              height: insets.top + RAIL_HEIGHT,
              backgroundColor: colors.background,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <SectionRail sections={sections} activeId={activeSectionId} onSelect={jumpToSection} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function SectionRail({
  sections,
  activeId,
  onSelect,
}: {
  sections: MenuSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="px-5 gap-2 items-center"
      style={{ height: RAIL_HEIGHT }}
    >
      {sections.map((section) => (
        <Chip
          key={section.id}
          label={section.title}
          selected={section.id === activeId}
          onPress={() => onSelect(section.id)}
        />
      ))}
    </ScrollView>
  );
}

/** Groups a flat list into rows of `size`, so a SectionList can render a grid. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

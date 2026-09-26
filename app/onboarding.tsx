import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StatusBar, View, type ImageSourcePropType } from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingSlide } from '@/components/onboarding';
import { useT } from '@/lib/i18n/useT';
import { Button, Text } from '@/components/ui';
import { onboardingImages } from '@/lib/onboardingImages';
import { routes } from '@/lib/routes';

interface Slide {
  /** Also the catalogue key: the words are `onboarding.slides.<key>.*`. */
  key: 'market' | 'spices' | 'table' | 'shopping';
  photo: ImageSourcePropType;
}

/**
 * Four photographs, in the order a shopper meets the app: the market, the shelf,
 * the meal, the habit. The copy names real things — the boroughs served, the
 * products stocked — because a promise this specific is the one thing a generic
 * delivery app can't copy.
 *
 * All four are close, saturated and low-key, and none of them shows a shopfront.
 * The storefront photography in the catalogue carries other businesses' signage,
 * British price tags and an Indonesian dairy aisle — fine at thumbnail size in a
 * vendor list, wrong as the first thing a brand says about itself.
 */
const slides: Slide[] = [
  { key: 'market', photo: onboardingImages.market },
  { key: 'spices', photo: onboardingImages.spices },
  { key: 'table', photo: onboardingImages.table },
  // "Gardées au chaud" belonged to the old photograph, which was a glass of
  // tea; against a market stall the metaphor no longer lands. The slide is
  // about repeating your usual shop, so the copy now says that plainly.
  { key: 'shopping', photo: onboardingImages.shopping },
];

/** Height the pinned controls occupy, so slide copy never runs under them. */
const CONTROLS_HEIGHT = 132;

export default function OnboardingScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const isLast = page === slides.length - 1;

  // Nothing is recorded on the way out: being signed out always means
  // onboarding, so there is no "already seen it" state to keep.
  function finish() {
    router.replace(routes.authWelcome);
  }

  function next() {
    if (isLast) {
      finish();
    } else {
      pagerRef.current?.setPage(page + 1);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#0A2018' }}>
      {/* The photography runs under the status bar, so its glyphs have to invert. */}
      <StatusBar barStyle="light-content" />

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {slides.map((slide, index) => (
          <OnboardingSlide
            key={slide.key}
            index={index}
            photo={slide.photo}
            title={t(`onboarding.slides.${slide.key}.title`)}
            description={t(`onboarding.slides.${slide.key}.body`)}
            active={page === index}
            bottomInset={CONTROLS_HEIGHT + insets.bottom}
          />
        ))}
      </PagerView>

      <Pressable
        hitSlop={10}
        onPress={finish}
        accessibilityRole="button"
        className="absolute right-6"
        style={{ top: insets.top + 6 }}
      >
        <Text variant="caption" weight="semibold" className="text-white/80">
          {t('onboarding.skip')}
        </Text>
      </Pressable>

      <View
        className="absolute left-0 right-0 px-7 gap-6"
        style={{ bottom: insets.bottom + 18 }}
        pointerEvents="box-none"
      >
        <View className="flex-row items-center gap-2">
          {slides.map((_, index) => (
            <Dot key={index} active={index === page} />
          ))}
        </View>

        <Button
          label={isLast ? t('onboarding.start') : t('onboarding.next')}
          variant="cta"
          size="lg"
          fullWidth
          onPress={next}
        />
      </View>
    </View>
  );
}

/**
 * Progress marker. The active one stretches into a bar rather than swapping
 * colour, so the row shows how far along you are without a second visual code.
 */
function Dot({ active }: { active: boolean }) {
  const width = useDerivedValue(() => withSpring(active ? 24 : 7, { damping: 15, stiffness: 190 }));
  // Opacity rides the same spring rather than switching, so the two halves of
  // the change land together.
  const style = useAnimatedStyle(() => ({
    width: width.value,
    opacity: 0.4 + ((width.value - 7) / 17) * 0.6,
  }));

  return <Animated.View className="h-[7px] rounded-full bg-white" style={style} />;
}

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { ImageOff } from 'lucide-react-native';
import { View } from 'react-native';

import { productImages, vendorImages } from '@/data/images.generated';
import { forest, mustard, terracotta } from '@/theme/tokens';

export interface CatalogImageProps {
  /** A product or vendor id — the key into the generated image map. */
  id: string;
  kind: 'product' | 'vendor';
  /** Category icon, used by the placeholder so an image-less card still reads as food. */
  icon?: LucideIcon;
  height: number;
  /** Omit to fill the parent's width. */
  width?: number;
  radius?: number;
  contentFit?: 'cover' | 'contain';
}

/**
 * One place that decides between a bundled photo and a placeholder.
 *
 * Screens should never reach into the image map themselves: photography lands
 * in batches (see scripts/fetch-product-images.mjs), so at any given moment some
 * ids have a file and some don't. Routing every catalog image through here means
 * a half-populated asset folder degrades to something deliberate-looking instead
 * of a grey box, and no screen changes when the rest of the photos arrive.
 */
const PLACEHOLDER_TINTS = [
  { from: forest[100], to: forest[50], icon: forest[500] },
  { from: terracotta[100], to: terracotta[50], icon: terracotta[500] },
  { from: mustard[100], to: mustard[50], icon: mustard[600] },
] as const;

/** Stable per id, so a given product always gets the same tint across renders and screens. */
function tintFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_TINTS[hash % PLACEHOLDER_TINTS.length];
}

export function CatalogImage({
  id,
  kind,
  icon: Icon,
  height,
  width,
  radius = 16,
  contentFit = 'cover',
}: CatalogImageProps) {
  const source = kind === 'product' ? productImages[id] : vendorImages[id];

  // Sizing goes through `style`, never `className`: expo-image is a third-party
  // component and this project registers no cssInterop, so NativeWind classes
  // are dropped on it — which would silently collapse the image to zero height.
  const box = { width: width ?? ('100%' as const), height, borderRadius: radius };

  if (source) {
    return <Image source={source} style={box} contentFit={contentFit} transition={200} />;
  }

  const tint = tintFor(id);
  const PlaceholderIcon = Icon ?? ImageOff;

  return (
    <View style={[box, { overflow: 'hidden' }]}>
      <LinearGradient
        colors={[tint.from, tint.to]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <PlaceholderIcon size={Math.max(22, Math.round(height * 0.26))} color={tint.icon} strokeWidth={1.5} />
      </LinearGradient>
    </View>
  );
}

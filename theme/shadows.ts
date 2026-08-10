import { Platform } from 'react-native';

function shadow(color: string, opacity: number, radius: number, elevation: number, offsetY: number) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation, shadowColor: color },
    default: {},
  });
}

export const shadows = {
  card: shadow('#000000', 0.06, 12, 3, 4),
  floating: shadow('#000000', 0.14, 20, 8, 8),
};

/** A soft shadow tinted to match a button/surface's own fill color — reads as lift, not a generic drop shadow. */
export function coloredShadow(hexColor: string, opacity = 0.35, radius = 14, elevation = 6, offsetY = 6) {
  return shadow(hexColor, opacity, radius, elevation, offsetY);
}

/** Reduced "pressed" version of a colored shadow — the button settles toward the surface on tap. */
export function coloredShadowPressed(hexColor: string) {
  return shadow(hexColor, 0.16, 6, 2, 2);
}

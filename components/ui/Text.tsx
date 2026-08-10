import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

type Variant = 'display' | 'title' | 'subtitle' | 'body' | 'caption' | 'label';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
type Tone = 'default' | 'muted' | 'primary' | 'secondary' | 'destructive' | 'inverted';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  weight?: Weight;
  tone?: Tone;
  className?: string;
}

const sizeClasses: Record<Variant, string> = {
  display: 'text-4xl leading-tight',
  title: 'text-2xl leading-snug',
  subtitle: 'text-lg leading-snug',
  body: 'text-base leading-normal',
  caption: 'text-sm leading-normal',
  label: 'text-xs leading-normal tracking-wide uppercase',
};

/** Which face (display vs. body) and default weight each variant reaches for — the display face is spent deliberately, not on every label. */
const variantDefaults: Record<Variant, { family: 'display' | 'body'; weight: Weight }> = {
  display: { family: 'display', weight: 'extrabold' },
  title: { family: 'display', weight: 'semibold' },
  subtitle: { family: 'display', weight: 'medium' },
  body: { family: 'body', weight: 'regular' },
  caption: { family: 'body', weight: 'regular' },
  label: { family: 'body', weight: 'semibold' },
};

const fontClass: Record<'display' | 'body', Record<Weight, string>> = {
  display: {
    regular: 'font-display-regular',
    medium: 'font-display-medium',
    semibold: 'font-display-semibold',
    bold: 'font-display-bold',
    extrabold: 'font-display',
  },
  body: {
    regular: 'font-sans',
    medium: 'font-sans-medium',
    semibold: 'font-sans-semibold',
    bold: 'font-sans-bold',
    extrabold: 'font-sans-extrabold',
  },
};

const toneClasses: Record<Tone, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  secondary: 'text-secondary',
  destructive: 'text-destructive',
  inverted: 'text-primary-foreground',
};

export function Text({ variant = 'body', weight, tone = 'default', className = '', ...rest }: TextProps) {
  const defaults = variantDefaults[variant];
  const resolvedWeight = weight ?? defaults.weight;

  return (
    <RNText
      className={`${sizeClasses[variant]} ${fontClass[defaults.family][resolvedWeight]} ${toneClasses[tone]} ${className}`}
      {...rest}
    />
  );
}

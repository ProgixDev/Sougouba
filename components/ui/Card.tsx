import { View, type ViewProps } from 'react-native';

import { shadows } from '@/theme/shadows';

export interface CardProps extends ViewProps {
  elevated?: boolean;
  className?: string;
}

export function Card({ elevated = true, className = '', style, ...rest }: CardProps) {
  return (
    <View
      className={`bg-card rounded-lg ${className}`}
      style={[elevated ? shadows.card : undefined, style]}
      {...rest}
    />
  );
}

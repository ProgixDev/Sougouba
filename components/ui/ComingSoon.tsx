import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from './EmptyState';

export interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Placeholder tab content for screens built out in later phases. */
export function ComingSoon({ icon, title, description }: ComingSoonProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center">
        <EmptyState icon={icon} title={title} description={description} />
      </View>
    </SafeAreaView>
  );
}

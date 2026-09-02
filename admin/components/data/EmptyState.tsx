import type { LucideIcon } from 'lucide-react';
import { Text } from '../ui/Text';

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <Text variant="subtitle" className="mt-1">
        {title}
      </Text>
      {description && (
        <Text variant="body" tone="muted" className="max-w-sm">
          {description}
        </Text>
      )}
    </div>
  );
}

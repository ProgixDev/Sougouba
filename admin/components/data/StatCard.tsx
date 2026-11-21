import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  icon: Icon,
  deltaPct,
  tint = 'forest',
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  deltaPct?: number;
  tint?: 'forest' | 'terracotta' | 'mustard';
}) {
  const tintClasses = {
    forest: 'bg-forest-50 text-forest-700 dark:bg-forest-950 dark:text-forest-200',
    terracotta: 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-950 dark:text-terracotta-200',
    mustard: 'bg-mustard-50 text-mustard-800 dark:bg-mustard-950 dark:text-mustard-200',
  }[tint];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <Text variant="label" tone="muted">
          {label}
        </Text>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tintClasses)}>
          <Icon size={17} strokeWidth={2} />
        </div>
      </div>
      <Text variant="display" as="p" className="mt-3 tabular">
        {value}
      </Text>
      {deltaPct !== undefined && (
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1 font-sans text-[0.75rem] font-semibold',
            deltaPct >= 0 ? 'text-success-strong' : 'text-destructive'
          )}
        >
          {deltaPct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(deltaPct).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} % vs période précédente
        </div>
      )}
    </Card>
  );
}

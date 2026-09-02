import { Badge } from '../ui/Badge';
import type { BadgeTone } from '../ui';

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <Badge tone={tone}>{label}</Badge>;
}

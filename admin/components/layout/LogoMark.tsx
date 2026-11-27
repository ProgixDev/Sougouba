import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';

/**
 * The Sougouba basket, on a light round tile so it reads on both themes.
 * `public/logo-mark.png` is a 256px copy of `assets/images/brand/mark.png`.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-[#FBF7F0] ring-1 ring-border', className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static 256px PNG; next/image buys nothing here */}
      <img src="/logo-mark.png" alt={t('common.brand')} width={size * 0.74} height={size * 0.74} className="object-contain" />
    </div>
  );
}

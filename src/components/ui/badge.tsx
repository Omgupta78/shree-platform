import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'featured' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-fg-muted border-line',
  featured: 'bg-accent-surface text-accent-fg border-accent-line',
  success: 'bg-positive-surface text-positive-fg border-positive-surface',
  warning: 'bg-accent-surface text-accent-fg border-accent-line',
  danger: 'bg-critical-surface text-critical-fg border-critical-line',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-xs border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

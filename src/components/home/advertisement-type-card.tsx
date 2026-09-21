import { Button } from '@/components/ui/button';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface AdvertisementType {
  key: 'classified' | 'display';
  eyebrow: string;
  title: string;
  description: string;
  audience: readonly string[];
  cta: { href: string; label: string };
}

/**
 * One of the two advertising formats the business sells.
 *
 * The visual difference between them is deliberate and structural, not
 * decorative: the classified card is set on paper, in a single text column
 * with a ruled list, the way a boxed classified reads in the paper. The
 * display card is set on ink, with its example rendered as a block of space,
 * the way a display advertisement occupies a page.
 */
export function AdvertisementTypeCard({
  type,
  preview,
}: {
  type: AdvertisementType;
  preview: ReactNode;
}) {
  const isDisplay = type.key === 'display';

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border p-6 sm:p-8',
        isDisplay
          ? 'border-chrome-border bg-chrome text-chrome-fg'
          : 'border-line-strong bg-surface',
      )}
    >
      <p
        className={cn(
          'text-xs font-semibold tracking-[0.16em] uppercase',
          isDisplay ? 'text-gold-400' : 'text-primary',
        )}
      >
        {type.eyebrow}
      </p>

      <h3 className="mt-3 font-serif text-2xl font-semibold sm:text-[1.625rem]">
        {type.title}
      </h3>

      <p
        className={cn(
          'mt-3 text-[0.9375rem] leading-relaxed',
          isDisplay ? 'text-chrome-muted' : 'text-fg-muted',
        )}
      >
        {type.description}
      </p>

      <div className="my-6">{preview}</div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {type.audience.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm">
            <CheckIcon
              size={16}
              className={cn('mt-0.5 shrink-0', isDisplay ? 'text-gold-400' : 'text-primary')}
            />
            <span className={isDisplay ? 'text-chrome-fg' : 'text-fg'}>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8 pt-2 lg:mt-auto">
        <Button
          href={type.cta.href}
          variant={isDisplay ? 'onDark' : 'primary'}
          size="lg"
          fullWidth
        >
          {type.cta.label}
        </Button>
      </div>
    </div>
  );
}

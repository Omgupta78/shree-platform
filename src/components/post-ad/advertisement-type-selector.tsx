'use client';

import { usePostAd } from '@/components/post-ad/form-provider';
import { Button } from '@/components/ui/button';
import { CategoryIcon, CheckIcon } from '@/components/ui/icons';
import { ADVERTISEMENT_TYPES, type AdvertisementTypeOption } from '@/config/ad-types';
import { cn } from '@/lib/utils';

/**
 * The first decision: a classified or a display advertisement.
 *
 * Driven entirely by `config/ad-types.ts`, so a third kind of advertisement
 * appears here by adding an entry to that list.
 */
export function AdvertisementTypeSelector() {
  const { state, dispatch } = usePostAd();

  return (
    <div className="grid gap-4 md:grid-cols-2" data-step="type">
      {ADVERTISEMENT_TYPES.map((option) => (
        <TypeCard
          key={option.id}
          option={option}
          selected={state.advertisementType === option.id}
          onSelect={() => dispatch({ type: 'chooseType', value: option.id })}
        />
      ))}
    </div>
  );
}

function TypeCard({
  option,
  selected,
  onSelect,
}: {
  option: AdvertisementTypeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      data-ad-type={option.id}
      className={cn(
        'flex flex-col rounded-md border bg-surface p-5 transition-colors sm:p-6',
        selected ? 'border-primary shadow-raised' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-sm bg-surface-sunken text-primary">
          <CategoryIcon name={option.icon} size={22} />
        </span>
        {selected ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary uppercase">
            <CheckIcon size={14} />
            Selected
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 font-serif text-xl font-semibold">{option.name}</h3>
      <p className="mt-1 text-sm font-medium text-fg-muted">{option.tagline}</p>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">{option.description}</p>

      <div className="mt-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-fg-subtle uppercase">
          Typically used for
        </p>
        <ul className="mt-2 space-y-1 text-sm text-fg-muted">
          {option.examples.map((example) => (
            <li key={example} className="flex gap-2">
              <span aria-hidden="true" className="text-fg-subtle">
                &middot;
              </span>
              {example}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-xs text-fg-subtle">{option.handling}</p>

      <div className="mt-6 pt-2 lg:mt-auto">
        <Button onClick={onSelect} fullWidth size="lg" variant={selected ? 'primary' : 'secondary'}>
          {selected ? 'Continue' : `Choose ${option.name.split(' ')[0]}`}
        </Button>
      </div>
    </div>
  );
}

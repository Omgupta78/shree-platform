import {
  AdvertisementTypeCard,
  type AdvertisementType,
} from '@/components/home/advertisement-type-card';
import { Section, SectionHeading } from '@/components/ui/section';

/**
 * The two advertising formats the business sells. This is the section that
 * separates Shree Classified from a marketplace: the printed paper carries
 * both a strip of small boxed classifieds and full-page display advertising,
 * and the website has to sell both.
 */
const TYPES: readonly AdvertisementType[] = [
  {
    key: 'classified',
    eyebrow: 'Format one',
    title: 'Classified Advertisement',
    description:
      'A short, boxed text advertisement in a section, the way a vacancy or a property notice runs in the paper. Priced small, published quickly.',
    audience: [
      'Jobs',
      'Property',
      'Vehicles',
      'Matrimonial',
      'Services',
      'Buy and sell',
      'Public notices',
      'Other local advertisements',
    ],
    cta: { href: '/post-ad', label: 'Post Classified Ad' },
  },
  {
    key: 'display',
    eyebrow: 'Format two',
    title: 'Display Advertisement',
    description:
      'A designed advertisement in a booked position — a full page, a half page or a banner across the website. For businesses and institutions that need presence rather than a listing.',
    audience: [
      'Businesses',
      'Universities',
      'Institutes',
      'Brands',
      'Promotional campaigns',
      'Large visual advertisements',
    ],
    cta: { href: '/post-ad', label: 'Advertise Your Business' },
  },
] as const;

/** A boxed classified, drawn in type rather than described. */
function ClassifiedPreview() {
  return (
    <div className="rounded-sm border-2 border-fg bg-canvas p-4">
      <p className="text-center font-serif text-base font-semibold">
        Office Assistant Required
      </p>
      <div className="mx-auto mt-2 h-px w-12 bg-line-strong" />
      <div className="mt-3 space-y-1.5" aria-hidden="true">
        <div className="h-2 rounded-xs bg-line" />
        <div className="h-2 w-11/12 rounded-xs bg-line" />
        <div className="h-2 w-8/12 rounded-xs bg-line" />
      </div>
      <p className="mt-3 text-center text-xs font-semibold tracking-wide text-fg-muted">
        Contact: 9XXXXXXXXX
      </p>
      <p className="mt-2 text-center text-[0.625rem] tracking-[0.1em] text-fg-subtle uppercase">
        Example layout
      </p>
    </div>
  );
}

/** A display block, drawn as occupied space. */
function DisplayPreview() {
  return (
    <div className="rounded-sm border border-chrome-border bg-white/5 p-4">
      <div className="flex aspect-16/7 flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-chrome-border">
        <span className="font-serif text-lg text-chrome-fg">Your advertisement</span>
        <span className="text-[0.625rem] tracking-[0.16em] text-chrome-muted uppercase">
          Full page &middot; Half page &middot; Banner
        </span>
      </div>
      <p className="mt-3 text-center text-[0.625rem] tracking-[0.1em] text-chrome-muted uppercase">
        Example placement
      </p>
    </div>
  );
}

export function AdvertisementTypes() {
  return (
    <Section labelledBy="formats-heading">
      <SectionHeading
        id="formats-heading"
        eyebrow="Two formats"
        title="Classified and display advertising"
        description="Shree Classified carries both. A small boxed notice and a full-page campaign are different products, priced and published differently."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {TYPES.map((type) => (
          <AdvertisementTypeCard
            key={type.key}
            type={type}
            preview={type.key === 'classified' ? <ClassifiedPreview /> : <DisplayPreview />}
          />
        ))}
      </div>
    </Section>
  );
}

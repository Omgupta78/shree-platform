import { AdvertisementCard } from '@/components/advertisements/advertisement-card';
import { Section, SectionHeading } from '@/components/ui/section';
import { EmptyState } from '@/components/ui/states';
import type { Advertisement } from '@/types/content';

/**
 * Featured advertisements — the paid placement at the top of the page.
 *
 * Takes its data as a prop rather than importing it, so the page can switch
 * from the mock module to a Supabase query without touching this component.
 */
export function FeaturedAds({
  advertisements,
}: {
  advertisements: readonly Advertisement[];
}) {
  return (
    <Section tone="sunken" labelledBy="featured-heading">
      <SectionHeading
        id="featured-heading"
        eyebrow="Promoted"
        title="Featured advertisements"
        description="Placements booked for prominence on the website and in the printed edition."
        action={{ href: '/classifieds?type=featured', label: 'See all featured' }}
      />

      {advertisements.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No featured advertisements yet"
          description="Featured placements appear here once they are booked."
          action={{ label: 'Advertise with us', href: '/advertise' }}
        />
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {advertisements.map((advertisement) => (
            <li key={advertisement.id}>
              <AdvertisementCard advertisement={advertisement} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

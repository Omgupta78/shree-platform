import { AdvertisementCard } from '@/components/advertisements/advertisement-card';
import { Section, SectionHeading } from '@/components/ui/section';
import { EmptyState } from '@/components/ui/states';
import type { Advertisement } from '@/types/content';

/**
 * Latest classifieds, in the compact variant — closer to how the small boxed
 * advertisements sit together at the top of a printed page than a gallery of
 * photographs would be.
 */
export function LatestClassifieds({
  advertisements,
}: {
  advertisements: readonly Advertisement[];
}) {
  return (
    <Section labelledBy="latest-heading">
      <SectionHeading
        id="latest-heading"
        eyebrow="Just published"
        title="Latest classifieds"
        action={{ href: '/classifieds', label: 'View all classifieds' }}
      />

      {advertisements.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No classifieds published yet"
          description="Approved advertisements appear here, newest first."
          action={{ label: 'Post an advertisement', href: '/post-ad' }}
        />
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {advertisements.map((advertisement) => (
            <li key={advertisement.id}>
              <AdvertisementCard advertisement={advertisement} variant="compact" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

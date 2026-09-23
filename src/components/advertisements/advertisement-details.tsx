import { AdvertisementGallery } from '@/components/advertisements/advertisement-gallery';
import { AdvertisementMeta } from '@/components/advertisements/advertisement-meta';
import { AdvertiserCard } from '@/components/advertisements/advertiser-card';
import { ContactActions } from '@/components/advertisements/contact-actions';
import { MobileContactBar } from '@/components/advertisements/mobile-contact-bar';
import { ReportAdvertisementModal } from '@/components/advertisements/report-modal';
import { ViewCounter } from '@/components/advertisements/view-counter';
import { SafetyNotice } from '@/components/advertisements/safety-notice';
import { ShareButton } from '@/components/advertisements/share-button';
import { SimilarAdvertisements } from '@/components/advertisements/similar-advertisements';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Container } from '@/components/ui/container';
import { ClockIcon, MapPinIcon } from '@/components/ui/icons';
import { CATEGORY_BY_SLUG } from '@/config/categories';
import { PRICE_LABEL, priceRole } from '@/config/category-fields';
import { locationName } from '@/config/locations';
import { formatDate, formatPrice, formatRelative } from '@/lib/format';
import type { Advertisement } from '@/types/content';

/**
 * The advertisement detail page.
 *
 * Desktop is two columns: gallery left, the facts and the contact actions
 * right. Below `lg` everything stacks in the order a reader on a phone wants
 * it — image, title, price, location, contact, description, details,
 * advertiser, similar — and the contact buttons repeat in a sticky bar.
 */
export function AdvertisementDetails({
  advertisement,
  similar,
  baseUrl,
}: {
  advertisement: Advertisement;
  similar: readonly Advertisement[];
  baseUrl: string;
}) {
  const category = CATEGORY_BY_SLUG.get(advertisement.categorySlug);
  const role = priceRole(advertisement.categorySlug);
  const showPrice = role !== 'none';
  const paragraphs = advertisement.description.split(/\n{2,}/).filter(Boolean);

  return (
    <>
      {/* Renders nothing; counts one view once the page is on a reader's screen. */}
      <ViewCounter advertisementId={advertisement.id} />

      {/* Room for the sticky contact bar on small screens. */}
      <Container className="py-8 pb-36 lg:pb-8">
        <Breadcrumbs
          baseUrl={baseUrl}
          items={[
            { label: 'Home', href: '/' },
            { label: 'Classifieds', href: '/classifieds' },
            ...(category
              ? [{ label: category.name, href: `/classifieds/${category.slug}` }]
              : []),
            { label: advertisement.title },
          ]}
        />

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <AdvertisementGallery
              images={advertisement.images}
              title={advertisement.title}
              place={locationName(advertisement.locationSlug)}
              categoryName={category?.name ?? 'Advertisement'}
              categoryIcon={category?.icon ?? null}
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {advertisement.isFeatured ? <Badge tone="featured">Featured</Badge> : null}
              {category ? (
                <span className="text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                  {category.name}
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 font-serif text-3xl leading-tight font-semibold sm:text-4xl">
              {advertisement.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon size={15} />
                {locationName(advertisement.locationSlug)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={15} />
                <time dateTime={advertisement.publishedAt}>
                  {formatRelative(advertisement.publishedAt)}
                </time>
              </span>
            </div>

            {showPrice ? (
              <p className="mt-5 font-serif text-3xl font-semibold text-fg">
                {formatPrice(advertisement.price, advertisement.priceType)}
                {role === 'salary' && advertisement.price !== null ? (
                  <span className="ml-2 font-sans text-sm font-normal text-fg-subtle">
                    {PRICE_LABEL[role].toLowerCase()} per month
                  </span>
                ) : null}
              </p>
            ) : null}

            <div className="mt-6">
              <ContactActions advertisement={advertisement} />
            </div>

            <div className="mt-5">
              <SafetyNotice />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <ShareButton title={advertisement.title} />
              <ReportAdvertisementModal
                advertisementId={advertisement.id}
                reference={advertisement.reference}
              />
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="font-serif text-xl font-semibold">
              Description
            </h2>
            {/* Paragraphs kept at a readable measure rather than one block. */}
            <div className="mt-4 max-w-prose space-y-4 text-[0.9375rem] leading-relaxed text-fg-muted">
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <p className="mt-6 text-xs text-fg-subtle">
              Published {formatDate(advertisement.publishedAt)} &middot; Reference{' '}
              <span className="tabular-nums">{advertisement.reference}</span>
            </p>
          </section>

          <div className="space-y-10">
            <AdvertisementMeta advertisement={advertisement} />
            <AdvertiserCard advertisement={advertisement} />
          </div>
        </div>

        <SimilarAdvertisements
          advertisements={similar}
          categorySlug={advertisement.categorySlug}
          categoryName={category?.name ?? 'this section'}
        />
      </Container>

      <MobileContactBar advertisement={advertisement} />
    </>
  );
}

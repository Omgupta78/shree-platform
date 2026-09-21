import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { NewspaperIcon } from '@/components/ui/icons';
import { Section, SectionHeading } from '@/components/ui/section';
import { SITE } from '@/config/site';
import { formatDate } from '@/lib/format';
import type { Edition } from '@/types/content';

/**
 * The printed edition, online.
 *
 * `coverImageUrl` is null until edition management exists, so the cover is
 * drawn typographically. Nothing here implies a PDF that is not on the server:
 * the download button appears only once `pdfUrl` is set.
 */
function EditionCover({ edition, small = false }: { edition: Edition; small?: boolean }) {
  if (edition.coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- generated at upload time
      <img
        src={edition.coverImageUrl}
        alt={`Front page of the edition dated ${formatDate(edition.editionDate)}`}
        className="h-full w-full object-cover object-top"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-canvas p-3">
      <div className="border-b-2 border-fg pb-1.5 text-center">
        <span
          className={`font-serif font-semibold tracking-tight ${small ? 'text-sm' : 'text-xl'}`}
        >
          Shree
        </span>
        <span
          className={`ml-1.5 font-semibold tracking-[0.18em] text-primary uppercase ${
            small ? 'text-[0.5rem]' : 'text-[0.625rem]'
          }`}
        >
          Classified
        </span>
      </div>

      <p
        className={`mt-1 text-center text-fg-subtle ${small ? 'text-[0.5rem]' : 'text-[0.625rem]'}`}
      >
        {formatDate(edition.editionDate)}
      </p>

      {/* Suggestion of a page layout, not a reproduction of one. */}
      <div className="mt-2 flex flex-1 flex-col gap-1.5" aria-hidden="true">
        <div className="flex-[4] rounded-xs border border-line bg-surface-sunken" />
        <div className="flex flex-[2] gap-1.5">
          <div className="flex-1 rounded-xs border border-line bg-surface-sunken" />
          <div className="flex-1 rounded-xs border border-line bg-surface-sunken" />
        </div>
        <div className="flex flex-[3] flex-col justify-between rounded-xs border border-line bg-surface-sunken p-1.5">
          <div className="h-1 rounded-xs bg-line" />
          <div className="h-1 w-10/12 rounded-xs bg-line" />
          <div className="h-1 w-11/12 rounded-xs bg-line" />
          <div className="h-1 w-9/12 rounded-xs bg-line" />
        </div>
      </div>
    </div>
  );
}

export function TodaysEdition({
  current,
  previous,
}: {
  current: Edition;
  previous: readonly Edition[];
}) {
  return (
    <Section tone="sunken" labelledBy="edition-heading">
      <SectionHeading
        id="edition-heading"
        eyebrow="In print"
        title="Today's Shree Classified"
        description={`The printed edition is published every ${SITE.publishDay} and can be read here in full, page by page, on any device.`}
        action={{ href: '/edition/archive', label: 'All editions' }}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <Link
          href="/edition"
          className="group block overflow-hidden rounded-md border border-line-strong bg-surface shadow-card transition-shadow hover:shadow-raised"
        >
          <div className="aspect-[728/950]">
            <EditionCover edition={current} />
          </div>
        </Link>

        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Current edition
          </p>
          <p className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">
            {formatDate(current.editionDate)}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
            <NewspaperIcon size={16} />
            {current.pageCount} pages
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/edition" size="lg">
              Read Edition
            </Button>
            {current.pdfUrl ? (
              <Button href={current.pdfUrl} variant="secondary" size="lg">
                Download PDF
              </Button>
            ) : null}
          </div>

          <div className="mt-10">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
              Previous editions
            </h3>
            <ul className="mt-4 grid grid-cols-3 gap-4 sm:max-w-md">
              {previous.map((edition) => (
                <li key={edition.id}>
                  <Link
                    href={`/edition/${edition.editionDate}`}
                    className="group block rounded-sm border border-line bg-surface transition-colors hover:border-primary"
                  >
                    <div className="aspect-[728/950] overflow-hidden">
                      <EditionCover edition={edition} small />
                    </div>
                    <span className="block border-t border-line px-2 py-1.5 text-center text-[0.6875rem] text-fg-muted">
                      {formatDate(edition.editionDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

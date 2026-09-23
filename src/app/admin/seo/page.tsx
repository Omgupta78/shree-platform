import type { Metadata } from 'next';

import { AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui';
import { Button } from '@/components/ui/button';
import { runSeoAudit, type Finding } from '@/lib/seo/audit';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Search engines' };

/**
 * What the site looks like to a search engine.
 *
 * There is no score on this page, no ranking, no impression count and no
 * traffic estimate — and their absence is the point. Rankings live in
 * Google's index and impressions live in Search Console; a number invented
 * here to fill the space would be read as a measurement and planned against,
 * which is exactly what this project has spent eleven phases not doing.
 *
 * Everything shown is counted from the site's own rows and its own
 * configuration: how many pages ask to be indexed, how many deliberately do
 * not, how the sitemap is split, and every problem that is decidable without
 * asking Google — a slug that collides, a section with nothing in it, a
 * description too short to make a snippet.
 */
export default async function SeoPage() {
  const audit = await runSeoAudit();

  const errors = audit.findings.filter((f) => f.level === 'error').length;
  const warnings = audit.findings.filter((f) => f.level === 'warning').length;

  return (
    <>
      <AdminPageHeader
        title="Search engines"
        description="Counted from the advertisements and the site's own configuration. Nothing here is a ranking."
        actions={
          <>
            <Button href="/sitemap.xml" variant="secondary" size="sm">
              View sitemap
            </Button>
            <Button href="/robots.txt" variant="secondary" size="sm">
              View robots.txt
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Pages asking to be indexed"
          value={audit.indexablePages}
          hint="Home, sections, location landing pages, the information pages, and every live advertisement."
        />
        <Stat
          label="Pages deliberately not indexed"
          value={audit.noindexPages}
          hint="The post-advertisement form and the account pages. Expired advertisements are also noindex and are not counted here, because how many there are changes daily."
        />
        <Stat
          label="Live advertisements"
          value={audit.liveAdvertisements}
          hint="Approved and inside their run. Only these are in the sitemap."
        />
        <Stat
          label="Sitemap files"
          value={audit.sitemapFiles}
          hint={`One main sitemap plus ${audit.sitemapFiles} for advertisements, ${audit.sitemapPageSize.toLocaleString('en-IN')} to a file. All are listed in robots.txt.`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <AdminPanel
          title="Findings"
          description={
            audit.findings.length === 0
              ? 'Nothing to report.'
              : `${errors} to fix, ${warnings} worth looking at.`
          }
          className="xl:col-span-2"
        >
          {audit.findings.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              Every check passed. That is not a ranking — it means nothing on the site is
              obviously stopping a search engine reading it.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {audit.findings.map((finding) => (
                <FindingRow key={finding.title} finding={finding} />
              ))}
            </ul>
          )}
        </AdminPanel>

        <div className="space-y-6">
          <AdminPanel title="Location landing pages">
            <div className="space-y-3 p-4 text-sm">
              <p>
                <span className="text-2xl font-semibold tabular-nums">
                  {audit.locationLandings}
                </span>{' '}
                <span className="text-fg-muted">currently worth having</span>
              </p>
              <p className="text-fg-muted">
                A section-and-place page — &ldquo;Property in Manglaur&rdquo; — is created only
                where there are at least {audit.landingThreshold} live advertisements. The rest
                of the combinations still work if somebody filters their way to them, but they
                are kept out of the sitemap and ask not to be indexed. Generating all of them
                would mean dozens of near-empty pages competing with the sections they were cut
                from.
              </p>
            </div>
          </AdminPanel>

          <AdminPanel title="What this page cannot tell you">
            <div className="space-y-3 p-4 text-sm text-fg-muted">
              <p>
                Whether Google has indexed a page, what it ranks for, how many people saw it and
                what they searched to find it are all facts held by Google, not by this site.
                They are in Search Console, and no figure here is a substitute for it.
              </p>
              <p>
                Submit <code className="text-fg">/sitemap.xml</code> there once. Everything on
                this page — canonical addresses, the robots file, correct status codes for
                missing advertisements — is the groundwork that makes crawling work; crawling,
                indexing and ranking remain Google&rsquo;s decisions.
              </p>
            </div>
          </AdminPanel>
        </div>
      </div>

      {!audit.fromDatabase ? (
        <p className="mt-6 rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-fg-muted">
          The advertisement checks need a database connection. What is shown comes from the
          site&rsquo;s configuration only.
        </p>
      ) : null}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">
        {value.toLocaleString('en-IN')}
      </p>
      <p className="mt-2 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}

const LEVEL_STYLES: Record<Finding['level'], { dot: string; label: string }> = {
  error: { dot: 'bg-critical-fg', label: 'Fix' },
  warning: { dot: 'bg-accent-fg', label: 'Look at' },
  note: { dot: 'bg-fg-subtle', label: 'Note' },
};

function FindingRow({ finding }: { finding: Finding }) {
  const style = LEVEL_STYLES[finding.level];
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', style.dot)}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {finding.title}
            {finding.count > 0 ? (
              <span className="ml-2 text-fg-subtle tabular-nums">{finding.count}</span>
            ) : null}
            <span className="sr-only"> — {style.label}</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted">{finding.detail}</p>
          {finding.examples.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {finding.examples.map((example) => (
                <li key={example} className="truncate font-mono text-xs text-fg-subtle">
                  {example}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

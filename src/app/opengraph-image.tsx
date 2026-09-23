import { ImageResponse } from 'next/og';

import { SITE } from '@/config/site';

/**
 * The share card every page falls back to.
 *
 * Generated rather than a committed PNG, so it cannot drift from the site's
 * own name and description, and so there is no binary in the repository that
 * somebody has to open a design tool to correct.
 *
 * Typographic, with no photograph. A stock image of a newspaper would be
 * pretending to show this newspaper. An advertisement with its own photograph
 * overrides this card with that photograph, which is the one case where a
 * picture on the card is a picture of the thing being shared.
 */
export const runtime = 'nodejs';
export const alt = `${SITE.name} — local classified advertising in ${SITE.city}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#fdfcfa',
          padding: '64px 80px 56px',
          // The masthead rule from the printed edition, in the site's red.
          borderTop: '24px solid #b3121b',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: '#1d1b19',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {SITE.name}
          </div>
          <div style={{ display: 'flex', marginTop: 28, fontSize: 34, color: '#57534e', lineHeight: 1.35 }}>
            Local classified and display advertising for {SITE.city} and Haridwar district
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 26,
            color: '#78716c',
          }}
        >
          <div style={{ display: 'flex' }}>{SITE.publisher}</div>
          <div style={{ display: 'flex' }}>In print every {SITE.publishDay}</div>
        </div>
      </div>
    ),
    size,
  );
}

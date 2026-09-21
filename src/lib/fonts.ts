import localFont from 'next/font/local';

/**
 * Fonts are self-hosted rather than fetched from Google Fonts: no third-party
 * request on first paint, no dependency on an external CDN, and `next/font`
 * still generates the size-adjusted fallback that prevents layout shift.
 *
 * Files come from the Fontsource distributions of IBM Plex Sans, IBM Plex Sans
 * Devanagari and Source Serif 4, all licensed under the SIL Open Font License.
 */

export const plexSans = localFont({
  src: [
    {
      path: '../assets/fonts/ibm-plex-sans-latin-wght-normal.woff2',
      weight: '100 700',
      style: 'normal',
    },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const sourceSerif = localFont({
  src: [
    {
      path: '../assets/fonts/source-serif-4-latin-wght-normal.woff2',
      weight: '200 900',
      style: 'normal',
    },
  ],
  variable: '--font-source-serif',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

/**
 * Devanagari face for Hindi ad copy. Static weights, because the variable
 * Devanagari cut is not published by Fontsource.
 */
export const plexDevanagari = localFont({
  src: [
    {
      path: '../assets/fonts/ibm-plex-sans-devanagari-devanagari-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/ibm-plex-sans-devanagari-devanagari-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-deva',
  display: 'swap',
  fallback: ['Noto Sans Devanagari', 'sans-serif'],
});

export const fontVariables = [
  plexSans.variable,
  sourceSerif.variable,
  plexDevanagari.variable,
].join(' ');

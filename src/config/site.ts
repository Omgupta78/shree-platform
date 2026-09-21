/**
 * Business identity.
 *
 * Every value here is taken from the printed edition of Shree Classified.
 * Nothing is invented: no circulation figures, no founding year, no awards,
 * no audience claims. If a fact is not printed in the paper, it is not here.
 *
 * Later this is read from the `app_settings` table so the office can change
 * a phone number without a deployment. The shape is kept flat and simple so
 * that swap is a one-file change.
 */
export const SITE = {
  /** Consumer-facing publication name. */
  name: 'Shree Classified',
  /** Registered business name, as printed. */
  publisher: 'Shree Advertising & Marketing',
  city: 'Roorkee',
  state: 'Uttarakhand',

  description:
    'Local classified and display advertising for Roorkee and Haridwar district, published in print and online by Shree Advertising & Marketing.',

  address: 'S-17, Avas Vikas Colony, Opp. Telephone Exchange, Roorkee, Uttarakhand',
  email: 'shreerke@gmail.com',
  website: 'shreeadvertising.in',

  /** Both numbers appear on every printed page. */
  phones: ['9719419913', '9897638912'] as const,
  /** Country code + number, digits only, for wa.me links. */
  whatsapp: '919719419913',

  /** The printed edition day, as shown on the masthead. */
  publishDay: 'Saturday',

  /** Printed on every classified page of the paper. */
  readerDisclaimer:
    'Readers are advised to verify the claims made in any advertisement at their own level before acting on them. Shree Classified is not responsible for any transaction arising from a published advertisement.',
} as const;

export type SiteConfig = typeof SITE;

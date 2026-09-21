import { CATEGORY_BY_SLUG } from '@/config/categories';
import type { AdAttributes, Advertisement, AdvertisementFormat, PriceType } from '@/types/content';

/**
 * DEVELOPMENT PLACEHOLDER DATA — replaced by Supabase queries in a later phase.
 *
 * Everything here is invented for layout and filtering purposes. Nothing is
 * copied from the printed edition: no real advertiser name, address, price or
 * advertisement text appears.
 *
 * Telephone numbers are deliberately absent. Any plausible ten-digit Indian
 * mobile risks belonging to a real person, and a placeholder that actually
 * dials someone is worse than no placeholder at all — so `MOCK_CONTACT_PHONE`
 * is null and the contact buttons render in their disabled state. Set it to a
 * number the office owns if you want to demonstrate them end to end.
 *
 * The shape matches `Advertisement`, which mirrors the `classified_ads` table.
 */
export const MOCK_CONTACT_PHONE: string | null = null;

/**
 * Sample gallery panels. Clearly labelled placeholders rather than stock
 * photographs, so no image on the site can be mistaken for an advertiser's
 * own picture. Attached to a handful of advertisements so the gallery can be
 * exercised; the rest have none, which is the commoner case.
 */
const SAMPLE_IMAGES = [
  '/mock/sample-1.svg',
  '/mock/sample-2.svg',
  '/mock/sample-3.svg',
  '/mock/sample-4.svg',
] as const;

/** Anchor evaluated once at module load, so ordering and date filters are stable. */
const NOW = Date.now();
const daysAgo = (days: number): string =>
  new Date(NOW - days * 86_400_000 - 3_600_000).toISOString();
const daysAhead = (days: number): string =>
  new Date(NOW + days * 86_400_000).toISOString();

let sequence = 100_100;

interface Seed {
  title: string;
  summary: string;
  category: string;
  location: string;
  days: number;
  price?: number;
  priceType?: PriceType;
  format?: AdvertisementFormat;
  contact: string;
  attributes?: AdAttributes;
  /** Extra paragraphs, for advertisements with longer copy. */
  detail?: string;
  /** How many sample panels to attach. */
  images?: number;
  /** Days since this advertiser first placed an advertisement. */
  advertiserDays?: number;
}

/**
 * Body copy is composed from the summary plus whatever category attributes the
 * advertisement carries, so every record has a realistic multi-paragraph
 * description without 59 hand-written essays. `detail` overrides where a
 * longer body is wanted for layout testing.
 */
/**
 * Composes an advertisement body from its seed.
 *
 * Deliberately does NOT recite the attributes: the "Advertisement details"
 * table sits alongside the description on the detail page and already lists
 * them, with the labels from `config/category-fields.ts`. Repeating them in
 * prose only duplicates what the reader can already see.
 */
function describe(seed: Seed): string {
  const paragraphs: string[] = [seed.summary];

  if (seed.detail) paragraphs.push(seed.detail);

  paragraphs.push(
    'Interested readers may contact the advertiser directly using the details on this page. Please mention Shree Classified when you call.',
  );

  return paragraphs.join('\n\n');
}

function build(seed: Seed): Advertisement {
  const {
    title,
    category,
    location,
    days,
    price = undefined,
    priceType,
    format = 'boxed',
    contact,
    attributes = {},
    images = 0,
    advertiserDays,
  } = seed;

  sequence += 1;
  const reference = `SC${sequence}`;
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  // `/classifieds/[slug]` serves both categories and advertisements, and a
  // category always wins. An advertisement whose title reduced to a category
  // slug would be unreachable, so it takes its reference as a suffix.
  const slug = CATEGORY_BY_SLUG.has(base) ? `${base}-${reference.toLowerCase()}` : base;

  return {
    id: reference,
    reference,
    slug,
    title,
    summary: seed.summary,
    description: describe(seed),
    categorySlug: category,
    locationSlug: location,
    price: price ?? null,
    priceType: priceType ?? (price === undefined ? 'on_call' : 'fixed'),
    format,
    isFeatured: format === 'featured',
    status: 'approved',
    publishedAt: daysAgo(days),
    updatedAt: null,
    // Advertisements run for 30 days from publication, matching the
    // `ads.default_duration_days` setting in the schema.
    expiresAt: daysAhead(30 - days),
    images: SAMPLE_IMAGES.slice(0, images),
    contactName: contact,
    contactPhone: MOCK_CONTACT_PHONE,
    contactWhatsapp: MOCK_CONTACT_PHONE,
    contactEmail: null,
    advertiserSince: advertiserDays ? daysAgo(advertiserDays) : null,
    attributes,
  };
}

const SEEDS: readonly Seed[] = [
  /* ------------------------------------------------------------- jobs -- */
  { title: 'Accounts assistant required for a trading firm', summary: 'Commerce graduate with working knowledge of accounting software. Day shift, six days a week.', category: 'jobs', location: 'roorkee', days: 0, price: 22000, contact: 'Vardaan Trading Company', format: 'featured', images: 2, advertiserDays: 260, attributes: { organisation: 'Vardaan Trading Company', jobType: 'Full time', experience: '1-3 years', qualification: 'B.Com' } },
  { title: 'Delivery staff required for a local distributor', summary: 'Own two-wheeler and a valid licence necessary. Daily payment settlement.', category: 'jobs', location: 'roorkee', days: 0, price: 14000, contact: 'Saraswati Distributors', attributes: { organisation: 'Saraswati Distributors', jobType: 'Full time', experience: 'Fresher', qualification: '10th pass' } },
  { title: 'Receptionist required at a clinic', summary: 'Front desk duties, appointment scheduling and basic record keeping. Pleasant manner essential.', category: 'jobs', location: 'roorkee', days: 1, price: 16000, contact: 'Nandini Health Clinic', attributes: { organisation: 'Nandini Health Clinic', jobType: 'Full time', experience: 'Fresher', qualification: '12th pass' } },
  { title: 'Mechanical technician for a small manufacturing unit', summary: 'Diploma holders with workshop experience preferred. Knowledge of measuring instruments required.', category: 'jobs', location: 'landhaura', days: 1, price: 24000, contact: 'Ambika Engineering Works', format: 'photo', attributes: { organisation: 'Ambika Engineering Works', jobType: 'Full time', experience: '3+ years', qualification: 'Diploma' } },
  { title: 'Walk-in interview for field sales executives', summary: 'Interviews held every Monday and Thursday morning. Bring a copy of your documents.', category: 'jobs', location: 'haridwar', days: 2, price: 18000, priceType: 'negotiable', contact: 'Prabhat Marketing Services', attributes: { organisation: 'Prabhat Marketing Services', jobType: 'Walk-in', experience: 'Fresher', qualification: 'Graduate' } },
  { title: 'Part-time computer operator for evening shift', summary: 'Data entry and billing. Four hours daily, suitable for students.', category: 'jobs', location: 'roorkee', days: 2, price: 9000, contact: 'Sankalp Enterprises', attributes: { organisation: 'Sankalp Enterprises', jobType: 'Part time', experience: 'Fresher', qualification: '12th pass' } },
  { title: 'Experienced tailor required for a garment shop', summary: 'Ladies and gents stitching. Piece rate or monthly, as preferred.', category: 'jobs', location: 'manglaur', days: 3, price: 20000, priceType: 'negotiable', contact: 'Roopmati Garments', attributes: { organisation: 'Roopmati Garments', jobType: 'Full time', experience: '3+ years', qualification: 'Not specified' } },
  { title: 'Primary school teacher required', summary: 'B.Ed. qualified candidates for classes one to five. Session starting shortly.', category: 'jobs', location: 'bhagwanpur', days: 4, price: 21000, contact: 'Gyan Deep Public School', attributes: { organisation: 'Gyan Deep Public School', jobType: 'Full time', experience: '1-3 years', qualification: 'B.Ed.' } },
  { title: 'Store keeper for a wholesale godown', summary: 'Stock maintenance, inward and outward entries, physical verification.', category: 'jobs', location: 'roorkee', days: 5, price: 17500, contact: 'Bhagirath Wholesale', attributes: { organisation: 'Bhagirath Wholesale', jobType: 'Full time', experience: '1-3 years', qualification: 'Graduate' } },
  { title: 'Electrician required for site work', summary: 'ITI certificate holders. Local candidates preferred, site within the town.', category: 'jobs', location: 'roorkee', days: 6, price: 19000, contact: 'Meenakshi Electricals', attributes: { organisation: 'Meenakshi Electricals', jobType: 'Full time', experience: '1-3 years', qualification: 'ITI' } },
  { title: 'Office assistant for a legal practice', summary: 'Filing, correspondence and client coordination. Typing speed an advantage.', category: 'jobs', location: 'roorkee', days: 9, price: 15000, contact: 'Adv. Shalini Rastogi', attributes: { organisation: 'Rastogi Legal Chambers', jobType: 'Full time', experience: 'Fresher', qualification: 'Graduate' } },
  { title: 'Kitchen helper required for a catering service', summary: 'Work on event days, transport provided. Experience not essential.', category: 'jobs', location: 'jwalapur', days: 12, price: 12000, contact: 'Annapurna Caterers', attributes: { organisation: 'Annapurna Caterers', jobType: 'Part time', experience: 'Fresher', qualification: 'Not specified' } },
  { title: 'Accountant with GST filing experience', summary: 'Independent handling of returns and reconciliation for a group of small firms.', category: 'jobs', location: 'roorkee', days: 18, price: 32000, priceType: 'negotiable', contact: 'Tripathi & Associates', attributes: { organisation: 'Tripathi & Associates', jobType: 'Full time', experience: '3+ years', qualification: 'B.Com' } },
  { title: 'Security guard required for a residential society', summary: 'Twelve-hour shifts, rotating. Ex-servicemen welcome to apply.', category: 'jobs', location: 'roorkee', days: 26, price: 13500, contact: 'Shanti Kunj Residents Welfare', attributes: { organisation: 'Shanti Kunj Residents Welfare', jobType: 'Full time', experience: 'Fresher', qualification: 'Not specified' } },

  /* --------------------------------------------------------- property -- */
  { title: 'Independent house for sale on a corner plot', summary: 'Three bedrooms, covered parking, freehold, close to the main road.', category: 'property', location: 'roorkee', days: 1, price: 4800000, priceType: 'negotiable', format: 'featured', contact: 'Sudhir Kumar Saini', images: 4, advertiserDays: 420, detail: 'The property sits on a quiet residential lane with a school and a daily market within walking distance. The plot is a corner one, so two sides are open and the rooms get light through the day. Construction was completed a few years ago and the structure has been maintained since. Water supply is from both the municipal line and a private boring, and there is a separate overhead tank. The compound has space for two cars under cover, with a small garden along the front boundary. Papers are clear and freehold, and the registry can be completed without delay. Viewing is possible on any day with prior intimation; serious enquiries only, please, as the family is not in a hurry to sell below the indicated figure.', attributes: { listingType: 'Sale', propertyType: 'House', bedrooms: 3, areaSqft: 1450 } },
  { title: 'Two bedroom flat available on rent', summary: 'First floor, semi-furnished, separate entry, family preferred.', category: 'property', location: 'roorkee', days: 0, price: 9500, priceType: 'negotiable', contact: 'Rekha Chaudhary', attributes: { listingType: 'Rent', propertyType: 'Flat', bedrooms: 2, areaSqft: 850 } },
  { title: 'Shop available on rent in the main market', summary: 'Ground floor with roadside frontage, suitable for retail or an office.', category: 'property', location: 'roorkee', days: 1, price: 18000, priceType: 'negotiable', contact: 'Mahesh Chand Agarwal', attributes: { listingType: 'Rent', propertyType: 'Shop', areaSqft: 320 } },
  { title: 'Residential plot for sale in a developing colony', summary: 'Clear title, boundary wall constructed, electricity and water connections available.', category: 'property', location: 'bhagwanpur', days: 3, price: 2200000, priceType: 'negotiable', contact: 'Yogendra Singh Rana', attributes: { listingType: 'Sale', propertyType: 'Plot', areaSqft: 2000 } },
  { title: 'Office space on the first floor, ready to occupy', summary: 'Four cabins with a reception area and an attached washroom. Lift available.', category: 'property', location: 'roorkee', days: 4, price: 26000, contact: 'Nirmal Properties', format: 'photo', images: 3, advertiserDays: 610, detail: 'The floor is ready to occupy with no further work needed. Four cabins open off a common reception area, and there is an attached washroom on the same floor. The building has a lift and a backup connection for common lighting. Parking is available in front for staff and visitors, and the location is on a main road with frequent shared transport. Suitable for a professional practice, a small office or a training centre.', attributes: { listingType: 'Rent', propertyType: 'Office', areaSqft: 900 } },
  { title: 'Three bedroom flat for sale, east facing', summary: 'Second floor in a small gated block, lift and covered parking included.', category: 'property', location: 'haridwar', days: 6, price: 5600000, priceType: 'negotiable', contact: 'Anjali Bhatnagar', attributes: { listingType: 'Sale', propertyType: 'Flat', bedrooms: 3, areaSqft: 1250 } },
  { title: 'Single room with attached bath on rent', summary: 'Suitable for a working professional or a student. Water and electricity separate.', category: 'property', location: 'roorkee', days: 8, price: 4500, contact: 'Pushpa Devi', attributes: { listingType: 'Rent', propertyType: 'House', bedrooms: 1, areaSqft: 220 } },
  { title: 'Commercial plot on the highway side for sale', summary: 'Wide frontage, suitable for a showroom or a warehouse. Papers complete.', category: 'property', location: 'manglaur', days: 11, price: 8500000, priceType: 'negotiable', contact: 'Harbhajan Singh', attributes: { listingType: 'Sale', propertyType: 'Plot', areaSqft: 4100 } },
  { title: 'Two shops available together on rent', summary: 'Can be taken separately or as one unit. Market location with regular footfall.', category: 'property', location: 'landhaura', days: 15, price: 12000, priceType: 'negotiable', contact: 'Kishan Lal Verma', attributes: { listingType: 'Rent', propertyType: 'Shop', areaSqft: 480 } },
  { title: 'Old house on a large plot for sale', summary: 'Suitable for reconstruction. Quiet lane, close to a school and a market.', category: 'property', location: 'laksar', days: 22, price: 3200000, priceType: 'negotiable', contact: 'Ram Avtar Sharma', attributes: { listingType: 'Sale', propertyType: 'House', bedrooms: 4, areaSqft: 2400 } },

  /* -------------------------------------------------------- education -- */
  { title: 'Admission open for diploma and degree courses', summary: 'Session 2026-27. Engineering, pharmacy and management streams. Scholarships available.', category: 'education', location: 'bhagwanpur', days: 2, format: 'featured', contact: 'Shivalik Institute of Technology', attributes: { institutionType: 'College', course: 'Engineering, Pharmacy, Management' } },
  { title: 'Mathematics tuition for classes nine to twelve', summary: 'Small batches, separate doubt sessions and weekend tests.', category: 'education', location: 'roorkee', days: 1, format: 'line', contact: 'Vikram Tutorials', attributes: { institutionType: 'Coaching', course: 'Mathematics' } },
  { title: 'Spoken English and personality development course', summary: 'Eight week programme, morning and evening batches, certificate on completion.', category: 'education', location: 'roorkee', days: 5, contact: 'Confident Speakers Academy', attributes: { institutionType: 'Coaching', course: 'Spoken English' } },
  { title: 'Admission guidance for professional courses', summary: 'Counselling for candidates seeking admission under management and NRI quota.', category: 'education', location: 'roorkee', days: 7, contact: 'Pathway Education Counsellors', attributes: { institutionType: 'Coaching', course: 'Admission guidance' } },
  { title: 'Nursery to class eight admissions now open', summary: 'Transport facility available on selected routes. Limited seats in each section.', category: 'education', location: 'manglaur', days: 10, contact: 'Little Scholars Academy', attributes: { institutionType: 'School', course: 'Nursery to VIII' } },
  { title: 'Computer courses with practical training', summary: 'Basic computing, accounting packages and office applications. Flexible timings.', category: 'education', location: 'haridwar', days: 16, contact: 'Disha Computer Centre', attributes: { institutionType: 'Coaching', course: 'Computer applications' } },

  /* --------------------------------------------------------- vehicles -- */
  { title: 'Hatchback for sale, single owner and well maintained', summary: 'Petrol, service records available, new tyres fitted last month.', category: 'vehicles', location: 'manglaur', days: 3, price: 395000, priceType: 'negotiable', format: 'featured', contact: 'Deepak Chauhan', images: 3, advertiserDays: 75, attributes: { vehicleType: 'Car', brand: 'Hatchback', year: 2019 } },
  { title: 'Scooter for sale in good running condition', summary: 'Insurance valid, papers complete, genuine buyers only.', category: 'vehicles', location: 'landhaura', days: 2, price: 48000, priceType: 'negotiable', contact: 'Mohit Kumar', attributes: { vehicleType: 'Two-wheeler', brand: 'Scooter', year: 2021 } },
  { title: 'Sedan for sale, second owner', summary: 'Diesel, highway driven, all documents up to date.', category: 'vehicles', location: 'roorkee', days: 5, price: 620000, priceType: 'negotiable', contact: 'Rajeev Nagpal', attributes: { vehicleType: 'Car', brand: 'Sedan', year: 2020 } },
  { title: 'Motorcycle in showroom condition for sale', summary: 'Low mileage, kept garaged, single owner since new.', category: 'vehicles', location: 'roorkee', days: 7, price: 72000, contact: 'Sandeep Rawat', attributes: { vehicleType: 'Two-wheeler', brand: 'Motorcycle', year: 2022 } },
  { title: 'Goods carrier available for sale', summary: 'Fit certificate valid, suitable for local transport work.', category: 'vehicles', location: 'haridwar', days: 9, price: 340000, priceType: 'negotiable', contact: 'Pawan Transport', attributes: { vehicleType: 'Commercial', brand: 'Mini truck', year: 2018 } },
  { title: 'Electric rickshaw with new battery set', summary: 'Recently serviced, ready for immediate use. Finance can be arranged.', category: 'vehicles', location: 'jwalapur', days: 13, price: 118000, priceType: 'negotiable', contact: 'Sunil Kumar', attributes: { vehicleType: 'Commercial', brand: 'E-rickshaw', year: 2023 } },
  { title: 'Spare parts and accessories at wholesale rates', summary: 'Two-wheeler parts for common models. Dealers and workshops welcome.', category: 'vehicles', location: 'roorkee', days: 19, contact: 'Balaji Auto Parts', attributes: { vehicleType: 'Two-wheeler', brand: 'Spare parts' } },
  { title: 'Car in running condition, urgent sale', summary: 'Owner relocating. Reasonable offers will be considered.', category: 'vehicles', location: 'roorkee', days: 28, price: 215000, priceType: 'negotiable', contact: 'Neha Saxena', attributes: { vehicleType: 'Car', brand: 'Hatchback', year: 2015 } },

  /* --------------------------------------------------------- business -- */
  { title: 'Running restaurant available for takeover', summary: 'Established location with existing staff and licences in place.', category: 'business', location: 'roorkee', days: 4, price: 1500000, priceType: 'negotiable', contact: 'Gokul Hospitality', attributes: { businessType: 'Business for sale' } },
  { title: 'Packaging machinery available for sale', summary: 'Working condition, suitable for a small unit. Inspection welcome.', category: 'business', location: 'landhaura', days: 8, price: 285000, priceType: 'negotiable', contact: 'Shakti Industrial Supplies', attributes: { businessType: 'Machinery' } },
  { title: 'Wholesale supply of stationery and paper goods', summary: 'Bulk rates for schools, offices and retailers across the district.', category: 'business', location: 'roorkee', days: 12, contact: 'Ganga Paper Mart', attributes: { businessType: 'Wholesale' } },
  { title: 'Franchise opportunity for a food brand', summary: 'Enquiries invited from parties with a suitable commercial location.', category: 'business', location: 'haridwar', days: 17, contact: 'Swad Foods Franchising', attributes: { businessType: 'Franchise' } },
  { title: 'Godown space available for storage on contract', summary: 'Covered space with loading access and round-the-clock security.', category: 'business', location: 'manglaur', days: 24, price: 35000, priceType: 'negotiable', contact: 'Yamuna Warehousing', attributes: { businessType: 'Warehousing' } },

  /* --------------------------------------------------------- services -- */
  { title: 'Home-cooked tiffin service for students and families', summary: 'Daily changing menu, vegetarian only, delivery across the town.', category: 'services', location: 'roorkee', days: 2, contact: 'Griha Bhojan Tiffin Service', format: 'photo', images: 2, advertiserDays: 150, attributes: { serviceType: 'Food and tiffin' } },
  { title: 'Air conditioner service and repair at your doorstep', summary: 'Installation, gas filling and annual maintenance contracts.', category: 'services', location: 'roorkee', days: 3, contact: 'Cool Care Services', attributes: { serviceType: 'Repairs' } },
  { title: 'Tent house and catering for weddings and functions', summary: 'Complete arrangements including decoration, seating and lighting.', category: 'services', location: 'manglaur', days: 6, contact: 'Shubh Aarambh Tent House', attributes: { serviceType: 'Events and catering' } },
  { title: 'Taxi service for outstation and local trips', summary: 'Clean vehicles and experienced drivers. Advance booking preferred.', category: 'services', location: 'haridwar', days: 10, contact: 'Ganga Yatra Travels', attributes: { serviceType: 'Travel' } },
  { title: 'Printing, lamination and binding services', summary: 'Visiting cards, wedding cards, banners and office stationery.', category: 'services', location: 'roorkee', days: 14, contact: 'Akshar Printers', attributes: { serviceType: 'Printing' } },
  { title: 'Physiotherapy at home for elderly patients', summary: 'Post-operative care and mobility exercises by a qualified practitioner.', category: 'services', location: 'roorkee', days: 21, contact: 'Dr. Ritu Malhotra', attributes: { serviceType: 'Health' } },

  /* ------------------------------------------------------ matrimonial -- */
  { title: 'Suitable match invited for a post-graduate daughter', summary: 'Working in the education sector. Family settled in the district.', category: 'matrimonial', location: 'roorkee', days: 5, contact: 'Family in Roorkee', attributes: { seeking: 'Groom', education: 'Post-graduate' } },
  { title: 'Alliance invited for a government-employed son', summary: 'Well settled family, simple marriage preferred.', category: 'matrimonial', location: 'haridwar', days: 11, contact: 'Family in Haridwar', attributes: { seeking: 'Bride', education: 'Graduate' } },
  { title: 'Proposals invited for a professionally qualified son', summary: 'Working in a private firm. Details shared on genuine enquiry.', category: 'matrimonial', location: 'roorkee', days: 20, contact: 'Family in Roorkee', attributes: { seeking: 'Bride', education: 'Professional degree' } },

  /* --------------------------------------------------------- buy-sell -- */
  { title: 'Refrigerator and washing machine in working order', summary: 'Both in good condition, being sold as the household is relocating.', category: 'buy-sell', location: 'roorkee', days: 1, price: 14000, priceType: 'negotiable', contact: 'Praveen Bhatt', attributes: { itemType: 'Home appliance', condition: 'Used' } },
  { title: 'Wooden double bed with mattress for sale', summary: 'Solid frame, minor wear. Buyer to arrange transport.', category: 'buy-sell', location: 'roorkee', days: 4, price: 8500, priceType: 'negotiable', contact: 'Sneha Kaushik', attributes: { itemType: 'Furniture', condition: 'Used' } },
  { title: 'Smartphone in excellent condition with bill', summary: 'Complete box and charger, no repairs done.', category: 'buy-sell', location: 'manglaur', days: 9, price: 11500, contact: 'Arjun Tomar', attributes: { itemType: 'Mobile', condition: 'Used' } },
  { title: 'Office furniture set available at a reduced rate', summary: 'Tables, chairs and storage units. Suitable for a new office.', category: 'buy-sell', location: 'roorkee', days: 23, price: 32000, priceType: 'negotiable', contact: 'Sumit Bansal', attributes: { itemType: 'Furniture', condition: 'Used' } },

  /* ----------------------------------------------------------- others -- */
  { title: 'Public notice regarding a change of name', summary: 'Published for general information as required. Objections, if any, within the stated period.', category: 'others', location: 'roorkee', days: 2, format: 'line', contact: 'Notice by an individual', attributes: { noticeType: 'Name change' } },
  { title: 'Tender invited for a civil works contract', summary: 'Sealed quotations invited from registered contractors. Details available at the office.', category: 'others', location: 'haridwar', days: 7, contact: 'A registered society', attributes: { noticeType: 'Tender' } },
  { title: 'Documents lost near the bus stand', summary: 'A folder containing personal papers. Finder requested to inform.', category: 'others', location: 'roorkee', days: 15, format: 'line', contact: 'Notice by an individual', attributes: { noticeType: 'Lost and found' } },
];

/** The complete development dataset. */
export const ADVERTISEMENTS: readonly Advertisement[] = SEEDS.map(build);

/* Derived views used by the homepage; the dataset above stays the one source. */
export const FEATURED_ADVERTISEMENTS: readonly Advertisement[] = ADVERTISEMENTS.filter(
  (ad) => ad.isFeatured,
).slice(0, 4);

export const LATEST_ADVERTISEMENTS: readonly Advertisement[] = [...ADVERTISEMENTS]
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  .slice(0, 6);

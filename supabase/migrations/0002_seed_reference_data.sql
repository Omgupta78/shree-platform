-- =============================================================================
-- Shree Classified — Phase 1: reference data
--
-- Categories mirror the sections that already run in the printed paper
-- (recruitment, admissions, property, trade notices). Locations cover Haridwar
-- district, matching the print circulation area; adding a city later is an
-- INSERT, not a migration.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ------------------------------------------------------- app settings ----
insert into public.app_settings (key, value, description) values
  ('site.legal_name',   '"Shree Advertising & Marketing"'::jsonb, 'Registered business name.'),
  ('site.brand_name',   '"Shree Classified"'::jsonb,              'Consumer-facing platform name.'),
  ('site.tagline',      '"Roorkee''s classified marketplace — in print every week, online every day"'::jsonb, 'Short descriptor used in headers and metadata.'),
  ('site.address',      '"S-17, Avas Vikas Colony, Opp. Telephone Exchange, Roorkee, Uttarakhand 247667"'::jsonb, 'Office address.'),
  ('site.phones',       '["9719419913","9897638912"]'::jsonb,     'Office contact numbers, 10-digit.'),
  ('site.whatsapp',     '"919719419913"'::jsonb,                  'WhatsApp number including country code, digits only.'),
  ('site.email',        '"shreerke@gmail.com"'::jsonb,            'Office email address.'),
  ('site.print_day',    '"Saturday"'::jsonb,                      'Day the printed edition is published.'),
  ('ads.default_duration_days', '30'::jsonb, 'How long an approved advertisement stays live.'),
  ('ads.max_images',            '8'::jsonb,  'Maximum images per advertisement.'),
  ('ads.free_per_month',        '2'::jsonb,  'Free advertisements a user may publish each month.')
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();

-- -------------------------------------------------------- categories ----
-- Top level.
insert into public.categories (slug, name, description, icon, sort_order) values
  ('jobs',          'Jobs',              'Vacancies, walk-in interviews and staff requirements across Roorkee.', 'briefcase', 10),
  ('property',      'Property',          'Houses, shops, plots and rentals for sale and lease.',                  'building',  20),
  ('vehicles',      'Vehicles',          'Cars, two-wheelers, commercial vehicles and spares.',                   'car',       30),
  ('education',     'Education',         'Admissions, coaching classes, tuitions and study material.',            'graduation',40),
  ('services',      'Services',          'Local trades, repairs, catering, travel and professional services.',    'wrench',    50),
  ('business',      'Business & Trade',  'Businesses for sale, machinery, wholesale and trade notices.',          'store',     60),
  ('buy-sell',      'Buy & Sell',        'Electronics, furniture, mobiles and household goods.',                  'tag',       70),
  ('matrimonial',   'Matrimonial',       'Marriage proposals.',                                                    'heart',     80),
  ('announcements', 'Announcements',     'Lost and found, public notices and tenders.',                            'megaphone', 90)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      sort_order = excluded.sort_order;

-- Second level.
insert into public.categories (parent_id, slug, name, sort_order)
select p.id, v.slug, v.name, v.sort_order
from (values
  ('jobs',      'jobs-full-time',        'Full Time',              10),
  ('jobs',      'jobs-part-time',        'Part Time',              20),
  ('jobs',      'jobs-walk-in',          'Walk-in Interview',      30),
  ('jobs',      'jobs-work-from-home',   'Work From Home',         40),
  ('jobs',      'jobs-wanted',           'Job Wanted',             50),

  ('property',  'property-house-sale',   'House for Sale',         10),
  ('property',  'property-house-rent',   'House for Rent',         20),
  ('property',  'property-plots',        'Plots & Land',           30),
  ('property',  'property-commercial',   'Shops & Commercial',     40),
  ('property',  'property-pg-hostel',    'PG & Hostel',            50),

  ('vehicles',  'vehicles-cars',         'Cars',                   10),
  ('vehicles',  'vehicles-bikes',        'Bikes & Scooters',       20),
  ('vehicles',  'vehicles-commercial',   'Commercial Vehicles',    30),
  ('vehicles',  'vehicles-spares',       'Spare Parts & Accessories', 40),

  ('education', 'education-admissions',  'Admissions',             10),
  ('education', 'education-coaching',    'Coaching & Tuition',     20),
  ('education', 'education-books',       'Books & Study Material', 30),

  ('services',  'services-home',         'Home & Repairs',         10),
  ('services',  'services-events',       'Events & Catering',      20),
  ('services',  'services-health',       'Health & Wellness',      30),
  ('services',  'services-travel',       'Travel & Transport',     40),
  ('services',  'services-professional', 'Professional Services',  50),

  ('business',  'business-for-sale',     'Business for Sale',      10),
  ('business',  'business-machinery',    'Machinery & Equipment',  20),
  ('business',  'business-wholesale',    'Wholesale & Supply',     30),

  ('buy-sell',  'buy-sell-mobiles',      'Mobiles & Tablets',      10),
  ('buy-sell',  'buy-sell-electronics',  'Electronics & Appliances', 20),
  ('buy-sell',  'buy-sell-furniture',    'Furniture & Home',       30),
  ('buy-sell',  'buy-sell-other',        'Everything Else',        40),

  ('matrimonial', 'matrimonial-bride',   'Bride Wanted',           10),
  ('matrimonial', 'matrimonial-groom',   'Groom Wanted',           20),

  ('announcements', 'announcements-lost-found', 'Lost & Found',    10),
  ('announcements', 'announcements-notice',     'Public Notice',   20),
  ('announcements', 'announcements-tender',     'Tenders',         30)
) as v(parent_slug, slug, name, sort_order)
join public.categories p on p.slug = v.parent_slug and p.parent_id is null
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      parent_id = excluded.parent_id;

-- --------------------------------------------------------- locations ----
insert into public.locations (slug, name, kind, sort_order)
values ('haridwar-district', 'Haridwar District', 'district', 10)
on conflict (slug) do update set name = excluded.name;

insert into public.locations (parent_id, slug, name, kind, sort_order)
select d.id, v.slug, v.name, 'city'::public.location_kind, v.sort_order
from (values
  ('roorkee',     'Roorkee',      10),
  ('haridwar',    'Haridwar',     20),
  ('manglaur',    'Manglaur',     30),
  ('bhagwanpur',  'Bhagwanpur',   40),
  ('landhaura',   'Landhaura',    50),
  ('jwalapur',    'Jwalapur',     60),
  ('laksar',      'Laksar',       70),
  ('piran-kaliyar', 'Piran Kaliyar', 80),
  ('narsan',      'Narsan',       90)
) as v(slug, name, sort_order)
cross join (select id from public.locations where slug = 'haridwar-district') d
on conflict (slug) do update
  set name = excluded.name, sort_order = excluded.sort_order, parent_id = excluded.parent_id;

-- Roorkee localities that already appear in the printed classifieds.
insert into public.locations (parent_id, slug, name, kind, sort_order)
select c.id, v.slug, v.name, 'area'::public.location_kind, v.sort_order
from (values
  ('roorkee-civil-lines',     'Civil Lines',        10),
  ('roorkee-malviya-chowk',   'Malviya Chowk',      20),
  ('roorkee-avas-vikas',      'Avas Vikas Colony',  30),
  ('roorkee-bt-ganj',         'B.T. Ganj',          40),
  ('roorkee-amber-talab',     'Amber Talab',        50),
  ('roorkee-ramnagar',        'Ramnagar',           60),
  ('roorkee-solani-puram',    'Solani Puram',       70),
  ('roorkee-ganeshpur',       'Ganeshpur',          80),
  ('roorkee-dehradun-road',   'Dehradun Road',      90),
  ('roorkee-manglaur-road',   'Manglaur Road',     100),
  ('roorkee-rampur-chungi',   'Rampur Chungi',     110),
  ('roorkee-iit-campus',      'IIT Roorkee Campus',120)
) as v(slug, name, sort_order)
cross join (select id from public.locations where slug = 'roorkee') c
on conflict (slug) do update
  set name = excluded.name, sort_order = excluded.sort_order, parent_id = excluded.parent_id;

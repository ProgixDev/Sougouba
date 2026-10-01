-- Shop specialties: a list the back office controls, chosen from at registration.
--
-- Was a free-text line (`vendors.specialty_fr`). Free text gave the catalogue a
-- different spelling of "épicerie africaine" per shop and nothing to filter on.
-- The line under a shop's name is still `vendors.specialty_fr` — denormalised
-- from the chosen row at registration, so every existing reader (cards, search,
-- the admin detail page) keeps working untouched — and `vendors.specialty_id`
-- records which entry it came from.
--
-- Scoped per `vendor_type`: a restaurant picks a cuisine, a grocery a kind of
-- shop, and neither list makes sense for the other.

create table public.specialties (
  id           uuid primary key default gen_random_uuid(),
  vendor_type  public.vendor_type not null,
  slug         text not null unique,
  -- 40, the same limit the free-text field had: it is one line under a name.
  name_fr      text not null check (char_length(name_fr) between 2 and 40),
  name_en      text not null check (char_length(name_en) between 2 and 40),
  position     integer not null default 0,
  -- Retired, not deleted: shops that chose it keep their line.
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
--> statement-breakpoint
create index specialties_type_position_idx on public.specialties (vendor_type, position) where is_active;
--> statement-breakpoint

-- Read through the API only, like every other table.
alter table public.specialties enable row level security;
--> statement-breakpoint
revoke all on table public.specialties from public, anon, authenticated;
--> statement-breakpoint

alter table public.vendors
  add column specialty_id uuid references public.specialties (id) on delete set null;
--> statement-breakpoint

-- The starting list. The back office owns it from here on.
insert into public.specialties (vendor_type, slug, name_fr, name_en, position) values
  ('grocery', 'epicerie-africaine',         'Épicerie africaine',           'African grocery',            10),
  ('grocery', 'epicerie-maghrebine',        'Épicerie maghrébine',          'Maghrebi grocery',           20),
  ('grocery', 'epicerie-ouest-africaine',   'Épicerie ouest-africaine',     'West African grocery',       30),
  ('grocery', 'epicerie-afrique-centrale',  'Épicerie d’Afrique centrale',  'Central African grocery',    40),
  ('grocery', 'epicerie-afrique-est',       'Épicerie d’Afrique de l’Est',  'East African grocery',       50),
  ('grocery', 'boucherie-halal',            'Boucherie halal',              'Halal butcher',              60),
  ('grocery', 'poissonnerie-africaine',     'Poissonnerie africaine',       'African fishmonger',         70),
  ('grocery', 'fruits-legumes-tropicaux',   'Fruits et légumes tropicaux',  'Tropical fruit and veg',     80),
  ('grocery', 'epices-condiments',          'Épices et condiments',         'Spices and condiments',      90),
  ('grocery', 'boulangerie-patisserie',     'Boulangerie-pâtisserie',       'Bakery and pastry',         100),
  ('restaurant', 'cuisine-senegalaise',     'Cuisine sénégalaise',          'Senegalese cuisine',         10),
  ('restaurant', 'cuisine-ivoirienne',      'Cuisine ivoirienne',           'Ivorian cuisine',            20),
  ('restaurant', 'cuisine-malienne',        'Cuisine malienne',             'Malian cuisine',             30),
  ('restaurant', 'cuisine-camerounaise',    'Cuisine camerounaise',         'Cameroonian cuisine',        40),
  ('restaurant', 'cuisine-congolaise',      'Cuisine congolaise',           'Congolese cuisine',          50),
  ('restaurant', 'cuisine-nigeriane',       'Cuisine nigériane',            'Nigerian cuisine',           60),
  ('restaurant', 'cuisine-ethiopienne',     'Cuisine éthiopienne',          'Ethiopian cuisine',          70),
  ('restaurant', 'cuisine-marocaine',       'Cuisine marocaine',            'Moroccan cuisine',           80),
  ('restaurant', 'cuisine-algerienne',      'Cuisine algérienne',           'Algerian cuisine',           90),
  ('restaurant', 'cuisine-tunisienne',      'Cuisine tunisienne',           'Tunisian cuisine',          100),
  ('restaurant', 'grillades-braises',       'Grillades et braises',         'Grills and braai',          110),
  ('restaurant', 'patisserie-orientale',    'Pâtisserie orientale',         'Oriental pastries',         120);

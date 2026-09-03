-- The platform taxonomy, ported from the mobile app's `data/seed/categories.ts`
-- (slug, label, icon and colour token all unchanged, so a catalogue exported
-- from the mock imports cleanly).
--
-- The uuids are written out rather than generated: this seed runs in dev,
-- staging and production, and a category whose id differs per environment makes
-- every `category_id` in a data export environment-specific. Fixed ids keep a
-- dump portable between them.
--
-- Idempotent on `slug`, so re-running against a database that already has these
-- is a no-op rather than a duplicate-key failure.
insert into public.categories (id, slug, name_fr, short_name_fr, icon, color_token) values
  ('7f3a1c00-0000-4000-8000-000000000001', 'fruits-legumes',        'Fruits & Légumes',        'Fruits',   'carrot',    'forest'),
  ('7f3a1c00-0000-4000-8000-000000000002', 'epices-condiments',     'Épices & Condiments',     'Épices',   'flame',     'terracotta'),
  ('7f3a1c00-0000-4000-8000-000000000003', 'viande-halal',          'Viande Halal',            'Viande',   'drumstick', 'mustard'),
  ('7f3a1c00-0000-4000-8000-000000000004', 'boissons',              'Boissons',                'Boissons', 'cup-soda',  'forest'),
  ('7f3a1c00-0000-4000-8000-000000000005', 'plats-prepares',        'Plats Préparés',          'Plats',    'utensils',  'terracotta'),
  ('7f3a1c00-0000-4000-8000-000000000006', 'produits-laitiers',     'Produits Laitiers',       'Laitiers', 'milk',      'mustard'),
  ('7f3a1c00-0000-4000-8000-000000000007', 'cereales-legumineuses', 'Céréales & Légumineuses', 'Céréales', 'wheat',     'forest'),
  -- "Boulangerie" was withdrawn as a browse vertical (CDC addendum v1.1, §01),
  -- but its thirteen products are real and still need a search filter, so the
  -- shelf is renamed for what is actually on it rather than emptied into
  -- "Plats Préparés" -- which would then have to hold baklava and khobz.
  ('7f3a1c00-0000-4000-8000-000000000008', 'pains-patisseries',     'Pains & Pâtisseries',     'Pains',    'croissant', 'terracotta')
on conflict (slug) do nothing;

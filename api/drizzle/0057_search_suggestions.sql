-- Search suggestions, a search that no longer trips on accents, and a column
-- and an index so that both stay fast on a large catalogue.
--
-- The CDC's module 02 lists « recherche intelligente & filtres : favoris,
-- géolocalisation, suggestions, classement ». Filters, favourites, sorting and
-- nearest-first all existed; nothing suggested anything. The search screen was
-- a field and a grid: the shopper had to know what to type, and the field's own
-- placeholder — « Rechercher un produit, un commerce… » — promised shops that
-- the search never returned.
--
-- `search_suggest` answers a few letters with what the catalogue itself holds:
--   • shops, by name or by their specialty line;
--   • terms — product names and tags — to search for.
-- Categories are not in here on purpose: there are eight, the app already holds
-- them in both languages, and matching them on the phone costs no request.
--
-- Suggestions come from the catalogue rather than from a log of what people
-- typed. A log is empty on day one, needs moderating before it can be shown to
-- anyone, and suggests things no shop sells; the catalogue has none of those
-- problems and never suggests a term with nothing behind it.
--
-- Accents. `ilike` ignores case but not accents, so « epices » did not find
-- « Épices » — on a phone keyboard, where accents cost a long press, that is
-- most searches. Everything below compares text *folded*: lower case, no
-- accents, hyphens and apostrophes read as spaces.
--
-- Built for the catalogue after launch, not the one before it. A suggestion is
-- asked at every pause in typing, by every shopper searching at that moment,
-- so what one call costs the database is the whole question. Folding is the
-- expensive part (a regular expression and a dictionary lookup per text), and
-- the first version of this file did it to every name and tag on every call:
-- measured on 30 000 products (local Postgres 16), about 200 ms a suggestion
-- and 80 ms a search. So the folding is done once, when a product is written,
-- into a stored column — and a call only folds the few letters typed. Same
-- catalogue, same machine: 4 to 10 ms a suggestion, under 12 ms a search.
create extension if not exists unaccent with schema extensions;
--> statement-breakpoint
create extension if not exists pg_trgm with schema extensions;
--> statement-breakpoint

-- Lower case, no accents, hyphens and apostrophes as spaces, one space between
-- words: « Côte-d'Ivoire  » and « cote d ivoire » fold to the same text.
--
-- `immutable` is what lets a generated column be built on it, and it is a
-- promise Postgres cannot check: `unaccent` itself is only `stable`, because it
-- reads a dictionary that an administrator could edit. Naming the dictionary by
-- schema — the two-argument form — removes the part that depended on the
-- session; the rest of the promise is ours to keep. ⚠️ If the `unaccent` rules
-- ever change (an extension upgrade that edits them), every stored
-- `search_doc` is stale: rewrite them with
-- `update public.products set name = name;`.
--
-- U+001F is folded away with the hyphens: `search_doc` uses it as its
-- separator, and a name that somehow carried one must not be able to forge it.
create or replace function private.search_fold(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $function$
  select btrim(regexp_replace(
           translate(lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_text)),
                     '-''’' || chr(31), '    '),
           '\s+', ' ', 'g'))
$function$;
--> statement-breakpoint

-- Everything a row can be found by, as one line of folded text: a main label,
-- then any others, each between spaces and kept apart by a character nobody
-- types (U+001F, the unit separator). For a product, its name and its tags:
--
--     ' riz basmati 5 kg ␟ riz ␟ cereales '
--
-- The spaces mean a word at the start of a name or of a tag is preceded by one,
-- like any other word — which is what « starts a word » is tested by. The
-- separator means a search for two words cannot match the end of the name
-- glued to the start of a tag, and lets the folded labels be read back out, in
-- order, beside the originals.
create or replace function private.search_doc(p_label text, p_more text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select ' ' || private.search_fold(coalesce(p_label, ''))
         || coalesce(
              (select string_agg(' ' || chr(31) || ' ' || private.search_fold(coalesce(m.item, '')), '' order by m.ord)
                 from unnest(p_more) with ordinality as m(item, ord)),
              '')
         || ' '
$function$;
--> statement-breakpoint

-- Not locked down like the functions in `public`, and deliberately. These two
-- are not reachable over the API (PostgREST only exposes `public`), they read
-- no table, and the generated column below runs `search_doc` on behalf of
-- whoever writes a product — a role without `execute` would be refused the
-- write itself. So every role that can touch `products` may run them.
grant execute on function private.search_fold(text) to anon, authenticated, service_role;
--> statement-breakpoint
grant execute on function private.search_doc(text, text[]) to anon, authenticated, service_role;
--> statement-breakpoint

-- The product's folded text, kept by the database itself: written when the
-- product is, never by hand, and impossible to forget to update.
--
-- Adding it rewrites the table under a lock that holds reads and writes — a
-- blink on the catalogue at the time of writing (a few hundred products). The
-- column holds nothing the catalogue does not already show.
alter table public.products
  add column if not exists search_doc text
  generated always as (private.search_doc(name, tags)) stored;
--> statement-breakpoint

-- Trigrams, because the search is « contains », not « starts with »: a b-tree
-- cannot answer `like '%riz%'`, a trigram index can, from three letters on —
-- and from two when they start a word, since a word's first letters make
-- trigrams with the space before them. On a small catalogue the planner will
-- rightly ignore it and read the column; it is here for the day that stops
-- being the cheaper plan.
create index if not exists products_search_doc_trgm_idx
  on public.products
  using gin (search_doc extensions.gin_trgm_ops);
--> statement-breakpoint

-- How well a folded text answers the folded letters typed — the rule the two
-- `case` expressions below both apply:
--   0  it starts with them                       « ri » → « riz basmati »
--   1  one of its words starts with them         « ri » → « le riad »
--   2  they are somewhere inside a word          « ice » → « epicerie »
--   —  no match
-- The third kind only counts from three letters on. Two letters sit inside half
-- the words of the language (« ri » is in « épicerie »), and the panel opens at
-- two: without this rule its first answer would be mostly noise.
--
-- Written out twice rather than put in a function: it runs once per candidate
-- label, and a SQL function that sets its own `search_path` — as every function
-- in this database must — cannot be inlined, so the call would cost more than
-- the test.
--
-- plpgsql rather than one SQL statement so that the letters are plain values
-- by the time the queries are planned.
create or replace function public.search_suggest(
  p_q text,
  p_vendor_limit integer default 3,
  p_term_limit integer default 5
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  -- What was typed, folded the way everything it is compared with is folded.
  v_needle text := private.search_fold(coalesce(p_q, ''));
  v_sep constant text := ' ' || chr(31) || ' ';
  v_like text;
  v_vendors jsonb;
  v_terms jsonb;
begin
  -- One letter matches half the catalogue and suggests nothing.
  if length(v_needle) < 2 then
    return jsonb_build_object('vendors', '[]'::jsonb, 'terms', '[]'::jsonb);
  end if;

  -- The pattern that finds the candidate products; the ranking rule then
  -- decides, on those rows only, what is a real match and how good. Escaped,
  -- because unlike `strpos` a `like` pattern has a syntax (`common/sql/like.ts`
  -- does the same for the API's own patterns).
  --
  -- Two letters only ever match the start of a word, so the pattern asks for
  -- the space in front of them; three or more may sit anywhere.
  v_like := replace(replace(replace(v_needle, '\', '\\'), '%', '\%'), '_', '\_');
  v_like := case when length(v_needle) >= 3 then '%' || v_like || '%' else '% ' || v_like || '%' end;

  -- Shops. Folded as they are read rather than from a stored column: there are
  -- a few hundred of them, not tens of thousands, and `vendors` is the table
  -- whose columns are the most carefully granted — not one to widen for two
  -- milliseconds. The name ranks a shop; one found by its specialty line only
  -- (« sénégalaise », « halal ») comes after every shop found by name.
  select coalesce(jsonb_agg(
           jsonb_build_object('id', s.id, 'name', s.name, 'specialtyFr', s.specialty_fr, 'vendorType', s.vendor_type)
           order by s.rank, s.name, s.id), '[]'::jsonb)
    into v_vendors
    from (
      select v.id, v.name, v.specialty_fr, v.vendor_type, r.rank
        from public.vendors v
       cross join lateral (
              select min(case when part.ord = 1 then m.rank else 3 end) as rank
                from unnest(array[private.search_fold(v.name), private.search_fold(v.specialty_fr)])
                       with ordinality as part(folded, ord)
               cross join lateral (
                      select case
                               when starts_with(part.folded, v_needle) then 0
                               when strpos(' ' || part.folded, ' ' || v_needle) > 0 then 1
                               when length(v_needle) >= 3 and strpos(part.folded, v_needle) > 0 then 2
                             end as rank
                    ) m
               where m.rank is not null
            ) r
       -- Approved shops only — the rule every shopper read applies.
       where v.status = 'approved'
         and r.rank is not null
       -- The id breaks ties: two shops may share a name.
       order by r.rank, v.name, v.id
       limit least(greatest(p_vendor_limit, 0), 10)
    ) s;

  -- Terms: the names and tags of the products the pattern found.
  with hits as (
    -- An approved shop, a product the back office has not hidden: the same
    -- visibility as `product_page`, so a suggestion never leads to an empty
    -- result.
    select p.name, p.tags, p.search_doc
      from public.products p
     where p.search_doc like v_like
       and p.hidden_at is null
       and exists (select 1 from public.vendors v where v.id = p.vendor_id and v.status = 'approved')
     -- A ceiling on the work one call can cost. « ri » on a large catalogue is
     -- thousands of rice products; the first few thousand already say which
     -- terms are common, and that is all the ranking asks of them.
     limit 3000
  ),
  labels as (
    -- Each product's name and tags as written, beside the same ones folded —
    -- read back out of `search_doc`, which holds them in that order, so
    -- nothing is folded again here.
    select btrim(l.label) as label, l.folded
      from hits h
     cross join lateral unnest(
            array[h.name] || h.tags,
            string_to_array(substr(h.search_doc, 2, length(h.search_doc) - 2), v_sep)
          ) as l(label, folded)
  ),
  ranked as (
    select l.label, l.folded,
           case
             when starts_with(l.folded, v_needle) then 0
             when strpos(' ' || l.folded, ' ' || v_needle) > 0 then 1
             when length(v_needle) >= 3 and strpos(l.folded, v_needle) > 0 then 2
           end as rank
      from labels l
  ),
  terms as (
    select
      -- « Riz Basmati », « riz basmati » and the tag « riz basmati » are one
      -- suggestion; it is written the way most of the catalogue writes it.
      mode() within group (order by r.label) as label,
      r.folded,
      count(*) as uses,
      min(r.rank) as rank
      from ranked r
     -- A product found by one of its tags brings its name along; the name is
     -- only a suggestion if it matches too.
     where r.rank is not null
       -- Suggesting exactly what was typed is not a suggestion.
       and r.folded <> v_needle
     group by r.folded
     -- Within a rank: the term more products carry, then the shorter one — a
     -- tag on forty products is a better guess than one product's full name.
     order by min(r.rank), count(*) desc, length(r.folded), r.folded
     limit least(greatest(p_term_limit, 0), 10)
  )
  select coalesce(jsonb_agg(t.label order by t.rank, t.uses desc, length(t.folded), t.folded), '[]'::jsonb)
    into v_terms
    from terms t;

  return jsonb_build_object('vendors', v_vendors, 'terms', v_terms);
end;
$function$;
--> statement-breakpoint

-- Called by the API with the service role, like every other catalogue function.
-- What it returns is public (it is the catalogue), but a function in `public`
-- is reachable by `anon` over `/rpc/search_suggest` unless that is taken away —
-- and an unthrottled, unauthenticated search per keystroke is not something to
-- leave open beside the API's own rate limit and cache.
revoke execute on function public.search_suggest(text, integer, integer) from public, anon, authenticated;
--> statement-breakpoint
grant execute on function public.search_suggest(text, integer, integer) to service_role;
--> statement-breakpoint

-- The product search itself, with the same folding — otherwise the panel would
-- suggest « Épices » for « epic » while pressing Search on « epices » found
-- nothing — and against the same stored column.
--
-- `p_q` still arrives as the escaped `%…%` pattern the API builds
-- (`containsPattern`). Folding it leaves `%`, `_` and `\` alone; it is folded
-- once, into `v_like`, not once per product. « Name or any one tag contains the
-- term » is unchanged: the unit separator keeps a term from matching across
-- the two.
--
-- Three things a shopper can now find that they could not: a term typed
-- without its accents, with a space where the name has a hyphen or an
-- apostrophe (« cote d ivoire »), or with the words of a name several spaces
-- apart.
--
-- Only the search condition changes — everything else is 0047's function, word
-- for word, and `create or replace` on an unchanged signature keeps its grants.
create or replace function public.product_page(p_vendor_id uuid DEFAULT NULL::uuid, p_approved_only boolean DEFAULT true, p_q text DEFAULT NULL::text, p_section_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_on_sale boolean DEFAULT false, p_in_stock_only boolean DEFAULT false, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_max_stock integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_items jsonb;
  v_total integer;
  v_like text := private.search_fold(p_q);
begin
  with matched as (
    select p.*
      from public.products p
     where (p_vendor_id is null or p.vendor_id = p_vendor_id)
       and (not p_approved_only
            or exists (select 1 from public.vendors v where v.id = p.vendor_id and v.status = 'approved'))
       -- Hidden by the back office: gone from every shopper read, still listed
       -- for the merchant (who calls with p_approved_only = false).
       and (not p_approved_only or p.hidden_at is null)
       and (p_section_id  is null or p.section_id  = p_section_id)
       and (p_category_id is null or p.category_id = p_category_id)
       and (p_price_min   is null or p.price_cad >= p_price_min)
       and (p_price_max   is null or p.price_cad <  p_price_max)
       and (not p_on_sale       or p.compare_at_price_cad is not null)
       and (not p_in_stock_only or (p.is_available = true and p.stock_qty > 0))
       and (p_max_stock is null or (p.is_available = true and p.stock_qty <= p_max_stock))
       -- Name or any one tag, accents and case ignored — the same test
       -- `searchProducts` makes, against the product's stored folded text.
       and (v_like is null or p.search_doc like v_like)
  )
  select
    coalesce((select jsonb_agg(
               jsonb_build_object(
                 'id', id, 'vendorId', vendor_id, 'categoryId', category_id, 'sectionId', section_id,
                 'name', name, 'description', description,
                 'priceCad', price_cad, 'compareAtPriceCad', compare_at_price_cad,
                 'imageUrl', image_url, 'stockQty', stock_qty, 'isAvailable', is_available, 'tags', tags,
                 'nutritionCalories', nutrition_calories, 'nutritionProteinG', nutrition_protein_g,
                 'nutritionFatG', nutrition_fat_g, 'nutritionWeightG', nutrition_weight_g,
                 'hiddenAt', hidden_at, 'hiddenReason', hidden_reason
               ) order by rn)
             from (
               select m.*,
                      row_number() over (
                        order by
                          -- `id` is the tiebreak in every branch: without a
                          -- unique one, page 2 can overlap page 1.
                          case when p_sort = 'price_asc'  then m.price_cad end asc,
                          case when p_sort = 'price_desc' then m.price_cad end desc,
                          case when p_sort = 'name'       then m.name collate "fr-CA-x-icu" end asc,
                          -- A shop page, grouped by its own sections: the shop's
                          -- section order, products without one last.
                          case when p_sort = 'stock_asc'  then m.stock_qty end asc,
                          case when p_sort = 'section' then (select s.position from public.vendor_sections s where s.id = m.section_id) end asc nulls last,
                          -- `relevance` keeps the catalogue's own order rather
                          -- than imposing one, matching the mobile default.
                          case when p_sort not in ('price_asc','price_desc','name','stock_asc') then m.created_at end asc,
                          m.id asc
                      ) as rn
                 from matched m
             ) ordered
            where rn > p_offset and rn <= p_offset + p_limit),
            '[]'::jsonb),
    (select count(*)::int from matched)
  into v_items, v_total;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;

-- A page of products that costs what a page costs, not what the catalogue costs.
--
-- `product_page` answers every product list in the app: the home screen, a
-- category, a shop's shelves, search, the merchant's own catalogue. To return
-- twenty products it numbered every product that matched — `row_number()` over
-- the whole set, which sorts the whole set, every column of every row — and
-- only then kept twenty. Measured on 30 000 products (local Postgres 16, the
-- live indexes): about 50 ms for a page of the unfiltered catalogue, which is
-- the request the home screen makes for every shopper who opens the app, and
-- 24 such pages a second with four people asking at once. The cost grew with
-- the catalogue; the page did not.
--
-- Same function, same arguments, same answers — compared against the version
-- it replaces on 600 combinations of filters, sorts and pages, byte for byte.
-- What changes is how the page is cut:
--
--   • `order by … limit … offset …` instead of numbering every row, so the
--     sort keeps only as many rows as the page needs;
--   • only the id and the sort keys go through that sort; the products
--     themselves are read by primary key once it is known which twenty they
--     are;
--   • for the default order — the catalogue's own, oldest first — an index on
--     `(created_at, id)` that is already in that order, so the page is read
--     straight from it and the scan stops after twenty rows.
--
-- Same catalogue, same machine: 8 ms for that page (315 a second with four
-- asking at once), about 20 ms sorted by price or by name where it was 53 and
-- 75. A shop's own shelves, a category and a search were already a few
-- milliseconds and still are. The exact count of everything matching is now
-- most of what a page costs — 7 of the 8 ms at that size.
--
-- Only the default order gets an index. Sorting by price or by name is a
-- choice made from the filter sheet, far rarer than opening a screen, and an
-- index each would be paid for on every product write.
create index if not exists products_created_at_id_idx on public.products (created_at, id);
--> statement-breakpoint

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
  -- `not materialized`: the set is described once and read twice — once to
  -- count it, once to cut a page from it — and each reading is planned on its
  -- own. Left to itself Postgres would build the whole set in memory first,
  -- because it is referenced twice, and then nothing below could stop early.
  with matched as not materialized (
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
                 'id', p.id, 'vendorId', p.vendor_id, 'categoryId', p.category_id, 'sectionId', p.section_id,
                 'name', p.name, 'description', p.description,
                 'priceCad', p.price_cad, 'compareAtPriceCad', p.compare_at_price_cad,
                 'imageUrl', p.image_url, 'stockQty', p.stock_qty, 'isAvailable', p.is_available, 'tags', p.tags,
                 'nutritionCalories', p.nutrition_calories, 'nutritionProteinG', p.nutrition_protein_g,
                 'nutritionFatG', p.nutrition_fat_g, 'nutritionWeightG', p.nutrition_weight_g,
                 'hiddenAt', p.hidden_at, 'hiddenReason', p.hidden_reason
               )
               -- The page's own order again, on its twenty rows: an aggregate
               -- is not promised its input in the order a subquery sorted it.
               order by page.by_price_asc asc, page.by_price_desc desc, page.by_name asc, page.by_stock asc,
                        page.by_section asc nulls last, page.by_created asc, page.id asc)
             from (
               -- Only the id and the sort keys are carried through the sort —
               -- not the product, with its description and its tags. Sorting a
               -- catalogue by price compares every row; it should not also
               -- copy every row.
               select m.id,
                      -- One sort key per ordering; all but the one asked for
                      -- are null, and a key that is the same for every row is
                      -- dropped by the planner. What is left is a plain
                      -- `order by created_at, id` (or price, or name…), which
                      -- is what lets it walk an index and stop at the limit.
                      case when p_sort = 'price_asc'  then m.price_cad end as by_price_asc,
                      case when p_sort = 'price_desc' then m.price_cad end as by_price_desc,
                      case when p_sort = 'name'       then m.name collate "fr-CA-x-icu" end as by_name,
                      case when p_sort = 'stock_asc'  then m.stock_qty end as by_stock,
                      -- A shop page, grouped by its own sections: the shop's
                      -- section order, products without one last.
                      case when p_sort = 'section' then (select s.position from public.vendor_sections s where s.id = m.section_id) end as by_section,
                      -- `relevance` keeps the catalogue's own order rather
                      -- than imposing one, matching the mobile default.
                      case when p_sort not in ('price_asc','price_desc','name','stock_asc') then m.created_at end as by_created
                 from matched m
                -- `id` is the tiebreak in every branch: without a unique one,
                -- page 2 can overlap page 1.
                order by by_price_asc asc, by_price_desc desc, by_name asc, by_stock asc,
                         by_section asc nulls last, by_created asc, m.id asc
                limit greatest(p_limit, 0) offset greatest(p_offset, 0)
             ) page
             -- The page's products, read by primary key once it is known which they are.
             join public.products p on p.id = page.id),
            '[]'::jsonb),
    (select count(*)::int from matched)
  into v_items, v_total;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$function$;

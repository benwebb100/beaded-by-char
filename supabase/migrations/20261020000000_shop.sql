-- BeadedByChar shop: catalogue, orders, contacts, settings and the admin allow-list.
-- Edge functions use the service role (bypasses RLS). The browser uses the anon key:
-- shoppers can read the visible catalogue; signed-in admins can manage everything.

create or replace function public.short_id() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── Admins ─────────────────────────
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ───────────────────────── Catalogue ─────────────────────────
create table public.collections (
  id text primary key default public.short_id(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  image text,                         -- category tile shown on Home / Shop
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key default public.short_id(),   -- GHL ids kept so old URLs still work
  name text not null check (length(trim(name)) > 0),
  description text not null default '',            -- simple HTML (<p>, <strong>, <em>, <ul>, <li>, <br>)
  visible boolean not null default true,
  images text[] not null default '{}',
  -- [{ "id": "...", "name": "Scent", "values": [{ "id": "...", "name": "Vanilla" }] }]
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_collections (
  product_id text not null references public.products (id) on delete cascade,
  collection_id text not null references public.collections (id) on delete cascade,
  primary key (product_id, collection_id)
);
create index on public.product_collections (collection_id);

-- One row per purchasable variant (a product with no options has exactly one).
create table public.prices (
  id text primary key default public.short_id(),
  product_id text not null references public.products (id) on delete cascade,
  option_value_ids text[] not null default '{}',
  amount numeric(10, 2) not null check (amount >= 0),
  compare_at numeric(10, 2) check (compare_at is null or compare_at >= 0),
  track_inventory boolean not null default false,
  quantity int,
  allow_out_of_stock boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.prices (product_id);

-- ───────────────────────── Settings (single row) ─────────────────────────
create table public.settings (
  id boolean primary key default true check (id),
  shop_open boolean not null default true,
  shipping_amount numeric(10, 2) not null default 15 check (shipping_amount >= 0),
  shipping_label text not null default 'Standard delivery',
  notify_email text not null default 'info@beadedbychar.com.au',
  catalog_changed_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

-- ───────────────────────── Orders and contacts ─────────────────────────
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('public.order_number_seq'),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'refunded', 'partially_refunded')),
  fulfillment text not null default 'unfulfilled' check (fulfillment in ('unfulfilled', 'fulfilled')),
  customer_name text,
  customer_email text,
  customer_phone text,
  -- { "name", "line1", "line2", "city", "state", "postal_code", "country" }
  shipping_address jsonb,
  subtotal numeric(10, 2) not null default 0,
  shipping numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  currency text not null default 'AUD',
  oversold boolean not null default false,          -- paid for more than was in stock
  note text not null default '',                    -- Charlee's private note
  source text not null default 'website' check (source in ('website', 'ghl')),
  stripe_session_id text unique,
  stripe_payment_intent text unique,
  ghl_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index on public.orders (status, fulfillment, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  price_id text references public.prices (id) on delete set null,
  name text not null,
  variant text not null default '',
  image text,
  unit_amount numeric(10, 2) not null check (unit_amount >= 0),
  qty int not null check (qty > 0)
);
create index on public.order_items (order_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  newsletter boolean not null default false,
  source text not null default 'website',           -- 'order' | 'newsletter' | 'ghl'
  ghl_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_email_key on public.contacts (lower(email));

-- ───────────────────────── Triggers ─────────────────────────
create trigger touch before update on public.collections for each row execute function public.touch_updated_at();
create trigger touch before update on public.products for each row execute function public.touch_updated_at();
create trigger touch before update on public.prices for each row execute function public.touch_updated_at();
create trigger touch before update on public.settings for each row execute function public.touch_updated_at();
create trigger touch before update on public.orders for each row execute function public.touch_updated_at();
create trigger touch before update on public.contacts for each row execute function public.touch_updated_at();

create or replace function public.orders_fulfilled_at() returns trigger language plpgsql as $$
begin
  if new.fulfillment is distinct from old.fulfillment then
    new.fulfilled_at := case when new.fulfillment = 'fulfilled' then now() end;
  end if;
  return new;
end $$;
create trigger fulfilled_at before update of fulfillment on public.orders
  for each row execute function public.orders_fulfilled_at();

-- Any catalogue edit marks the website as needing a rebuild.
create or replace function public.mark_catalog_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.settings set catalog_changed_at = now() where id;
  return null;
end $$;
create trigger catalog_changed after insert or update or delete on public.collections for each statement execute function public.mark_catalog_changed();
create trigger catalog_changed after insert or update or delete on public.products for each statement execute function public.mark_catalog_changed();
create trigger catalog_changed after insert or update or delete on public.prices for each statement execute function public.mark_catalog_changed();
create trigger catalog_changed after insert or update or delete on public.product_collections for each statement execute function public.mark_catalog_changed();

-- ───────────────────────── Row level security ─────────────────────────
alter table public.admins enable row level security;
alter table public.collections enable row level security;
alter table public.products enable row level security;
alter table public.product_collections enable row level security;
alter table public.prices enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.contacts enable row level security;

create policy "admins read own row" on public.admins for select to authenticated using (user_id = auth.uid());

create policy "public reads collections" on public.collections for select to anon, authenticated using (true);
create policy "admins manage collections" on public.collections for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads visible products" on public.products for select to anon, authenticated using (visible or public.is_admin());
create policy "admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads product collections" on public.product_collections for select to anon, authenticated using (true);
create policy "admins manage product collections" on public.product_collections for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads live prices" on public.prices for select to anon, authenticated
  using (public.is_admin() or (active and exists (select 1 from public.products p where p.id = product_id and p.visible)));
create policy "admins manage prices" on public.prices for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public reads shop settings" on public.settings for select to anon, authenticated using (true);
create policy "admins update settings" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins read orders" on public.orders for select to authenticated using (public.is_admin());
create policy "admins update orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read order items" on public.order_items for select to authenticated using (public.is_admin());
create policy "admins manage contacts" on public.contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Shoppers never write directly; only the edge functions (service role) do.
revoke insert, update, delete, truncate on all tables in schema public from anon;
-- Anonymous visitors may only see the public settings columns.
revoke select on public.settings from anon;
grant select (shop_open, shipping_amount, shipping_label) on public.settings to anon;
-- Admins edit order status fields and notes, not amounts or Stripe ids.
revoke update on public.orders from authenticated;
grant update (fulfillment, note) on public.orders to authenticated;
revoke insert, delete on public.orders, public.order_items from authenticated;

-- ───────────────────────── Order flow (called by edge functions) ─────────────────────────

-- "Scent: Vanilla / Colour: Pink" → "Vanilla / Pink", in the product's option order.
create or replace function public.variant_label(p_options jsonb, p_value_ids text[]) returns text
language sql immutable as $$
  select coalesce(string_agg(v.val->>'name', ' / ' order by o.ord), '')
  from jsonb_array_elements(p_options) with ordinality as o(opt, ord)
  cross join lateral jsonb_array_elements(o.opt->'values') as v(val)
  where v.val->>'id' = any (p_value_ids)
$$;

-- Validate a cart against live prices and stock, then record it as a pending order.
-- p_lines: [{ "priceId": "...", "qty": 2 }]. Raises 'SHOP_CLOSED', 'EMPTY_CART',
-- 'BAD_LINE', 'UNAVAILABLE:<name>' or 'OUT_OF_STOCK:<name>:<left>'.
create or replace function public.create_pending_order(p_lines jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  s public.settings;
  o public.orders;
  line record;
  v_subtotal numeric(10, 2) := 0;
begin
  select * into s from public.settings where id;
  if not s.shop_open then raise exception 'SHOP_CLOSED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'EMPTY_CART'; end if;
  if jsonb_array_length(p_lines) > 50 then raise exception 'BAD_LINE'; end if;

  insert into public.orders (shipping) values (s.shipping_amount) returning * into o;

  for line in
    select l.price_id, sum(l.qty)::int as qty, pr.id as found, pr.amount, pr.track_inventory, pr.quantity,
           pr.allow_out_of_stock, pr.active, pr.option_value_ids, p.id as product_id, p.name, p.visible, p.options, p.images
    from (
      select x->>'priceId' as price_id, (x->>'qty')::int as qty
      from jsonb_array_elements(p_lines) x
    ) l
    left join public.prices pr on pr.id = l.price_id
    left join public.products p on p.id = pr.product_id
    group by l.price_id, pr.id, p.id
  loop
    if line.qty is null or line.qty < 1 or line.qty > 99 then raise exception 'BAD_LINE'; end if;
    if line.found is null or not line.active or not line.visible then
      raise exception 'UNAVAILABLE:%', coalesce(line.name, 'an item');
    end if;
    if line.track_inventory and not line.allow_out_of_stock and coalesce(line.quantity, 0) < line.qty then
      raise exception 'OUT_OF_STOCK:%:%', line.name, greatest(coalesce(line.quantity, 0), 0);
    end if;
    insert into public.order_items (order_id, product_id, price_id, name, variant, image, unit_amount, qty)
    values (o.id, line.product_id, line.price_id, line.name, public.variant_label(line.options, line.option_value_ids),
            line.images[1], line.amount, line.qty);
    v_subtotal := v_subtotal + line.amount * line.qty;
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal + shipping
  where id = o.id returning * into o;

  return jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'subtotal', o.subtotal, 'shipping', o.shipping,
    'shipping_label', s.shipping_label, 'total', o.total,
    'items', (select jsonb_agg(jsonb_build_object('name', i.name, 'variant', i.variant, 'image', i.image,
                                                  'unit_amount', i.unit_amount, 'qty', i.qty) order by i.name)
              from public.order_items i where i.order_id = o.id));
end $$;

create or replace function public.attach_checkout_session(p_order uuid, p_session text) returns void
language sql set search_path = public as $$
  update public.orders set stripe_session_id = p_session where id = p_order and status = 'pending'
$$;

-- Stripe says the order is paid. Idempotent: only the first call does anything.
-- p_details: { customer_name, customer_email, customer_phone, shipping_address, total, shipping, payment_intent }
-- Returns { newly_paid, order_id, number, sold_out: [price ids now at zero], oversold }.
create or replace function public.mark_order_paid(p_session text, p_details jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  o public.orders;
  sold_out text[];
  names text[];
  v_first text;
begin
  update public.orders set
    status = 'paid',
    paid_at = now(),
    customer_name = p_details->>'customer_name',
    customer_email = p_details->>'customer_email',
    customer_phone = nullif(p_details->>'customer_phone', ''),
    shipping_address = p_details->'shipping_address',
    shipping = coalesce((p_details->>'shipping')::numeric, shipping),
    total = coalesce((p_details->>'total')::numeric, total),
    stripe_payment_intent = nullif(p_details->>'payment_intent', '')
  where stripe_session_id = p_session and status in ('pending', 'cancelled')
  returning * into o;

  if o.id is null then
    select * into o from public.orders where stripe_session_id = p_session;
    return jsonb_build_object('newly_paid', false, 'order_id', o.id, 'number', o.number);
  end if;

  -- Did anything sell beyond what was in stock?
  select array_agg(pr.id) into names
  from public.prices pr
  join (select price_id, sum(qty) qty from public.order_items where order_id = o.id group by price_id) i on i.price_id = pr.id
  where pr.track_inventory and not pr.allow_out_of_stock and coalesce(pr.quantity, 0) < i.qty;
  if names is not null then
    update public.orders set oversold = true where id = o.id;
  end if;

  with used as (
    select price_id, sum(qty) qty from public.order_items where order_id = o.id group by price_id
  )
  update public.prices pr set quantity = greatest(coalesce(pr.quantity, 0) - used.qty, 0)
  from used where pr.id = used.price_id and pr.track_inventory;

  select array_agg(pr.id) into sold_out
  from public.prices pr
  where pr.track_inventory and not pr.allow_out_of_stock and pr.quantity = 0
    and pr.id in (select price_id from public.order_items where order_id = o.id);

  if coalesce(o.customer_email, '') <> '' then
    v_first := split_part(trim(coalesce(o.customer_name, '')), ' ', 1);
    insert into public.contacts (email, first_name, last_name, phone, source)
    values (o.customer_email, v_first, trim(substr(trim(coalesce(o.customer_name, '')), length(v_first) + 1)),
            coalesce(o.customer_phone, ''), 'order')
    on conflict (lower(email)) do update set
      phone = case when contacts.phone = '' then excluded.phone else contacts.phone end;
  end if;

  return jsonb_build_object('newly_paid', true, 'order_id', o.id, 'number', o.number,
                            'sold_out', coalesce(to_jsonb(sold_out), '[]'::jsonb), 'oversold', names is not null);
end $$;

create or replace function public.cancel_pending_order(p_session text) returns void
language sql set search_path = public as $$
  update public.orders set status = 'cancelled' where stripe_session_id = p_session and status = 'pending'
$$;

create or replace function public.mark_order_refunded(p_payment_intent text, p_full boolean) returns uuid
language sql set search_path = public as $$
  update public.orders set status = case when p_full then 'refunded' else 'partially_refunded' end
  where stripe_payment_intent = p_payment_intent and status in ('paid', 'partially_refunded')
  returning id
$$;

-- Newsletter form. Returns true for a brand-new subscriber.
create or replace function public.subscribe_newsletter(p_first text, p_last text, p_email text) returns boolean
language plpgsql set search_path = public as $$
declare was boolean;
begin
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then raise exception 'BAD_EMAIL'; end if;
  select newsletter into was from public.contacts where lower(email) = lower(trim(p_email));
  insert into public.contacts (email, first_name, last_name, newsletter, source)
  values (trim(p_email), left(trim(coalesce(p_first, '')), 80), left(trim(coalesce(p_last, '')), 80), true, 'newsletter')
  on conflict (lower(email)) do update set newsletter = true,
    first_name = case when contacts.first_name = '' then excluded.first_name else contacts.first_name end,
    last_name = case when contacts.last_name = '' then excluded.last_name else contacts.last_name end;
  return coalesce(was, false) = false;
end $$;

create or replace function public.mark_published() returns void
language sql security definer set search_path = public as $$
  update public.settings set published_at = now() where id
$$;

-- The order-flow functions are for the service role only.
revoke execute on function public.create_pending_order(jsonb) from public, anon, authenticated;
revoke execute on function public.attach_checkout_session(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(text, jsonb) from public, anon, authenticated;
revoke execute on function public.cancel_pending_order(text) from public, anon, authenticated;
revoke execute on function public.mark_order_refunded(text, boolean) from public, anon, authenticated;
revoke execute on function public.subscribe_newsletter(text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_published() from public, anon, authenticated;
revoke execute on function public.mark_catalog_changed() from public, anon, authenticated;
grant execute on function public.create_pending_order(jsonb) to service_role;
grant execute on function public.attach_checkout_session(uuid, text) to service_role;
grant execute on function public.mark_order_paid(text, jsonb) to service_role;
grant execute on function public.cancel_pending_order(text) to service_role;
grant execute on function public.mark_order_refunded(text, boolean) to service_role;
grant execute on function public.subscribe_newsletter(text, text, text) to service_role;
grant execute on function public.mark_published() to service_role;

-- ───────────────────────── Product photo storage ─────────────────────────
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "admins upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "admins update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "admins delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

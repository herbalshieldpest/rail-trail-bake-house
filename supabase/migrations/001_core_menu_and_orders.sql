-- Types
create type public.product_category as enum ('bread','rolls','cookies','pies','pastry','gifts','wild_card');
create type public.week_status as enum ('draft','published','archived');
create type public.order_status as enum ('pending_payment','paid','baked','out_for_delivery','delivered','cancelled','refunded');

-- Products: the catalog the weekly menus draw from
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  unit text not null default '',
  description text not null default '',
  category public.product_category not null,
  price_cents integer check (price_cents is null or price_cents >= 0),
  icon text,
  image_url text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Weeks: one ordering window per delivery Tuesday
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  bake_date date not null,
  delivery_date date not null,
  delivery_window text not null default '10 am to 4 pm',
  status public.week_status not null default 'draft',
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint weeks_window_valid check (closes_at > opens_at),
  constraint weeks_dates_valid check (delivery_date >= bake_date),
  constraint weeks_delivery_unique unique (delivery_date)
);

-- What is on a given week's menu, with optional price override and batch limit
create table public.week_items (
  week_id uuid not null references public.weeks(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  price_cents integer check (price_cents is null or price_cents >= 0),
  batch_limit integer check (batch_limit is null or batch_limit >= 0),
  sold_count integer not null default 0 check (sold_count >= 0),
  featured boolean not null default false,
  sort integer not null default 0,
  primary key (week_id, product_id)
);
create index week_items_product_idx on public.week_items(product_id);

-- Delivery area by zip code
create table public.delivery_zones (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  town text not null,
  active boolean not null default true
);

-- Customers and orders (never readable from the browser; written by server code only)
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  week_id uuid not null references public.weeks(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_name text not null,
  address_line1 text not null,
  address_line2 text not null default '',
  city text not null,
  state text not null default 'MD',
  zip text not null,
  phone text not null default '',
  delivery_notes text not null default '',
  gift_message text not null default '',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz
);
create index orders_week_idx on public.orders(week_id);
create index orders_customer_idx on public.orders(customer_id);
create index orders_status_idx on public.orders(week_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null,
  unit text not null default '',
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents integer generated always as (unit_price_cents * quantity) stored
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);

-- Settings (single row): minimum order etc.
create table public.settings (
  id boolean primary key default true check (id),
  min_order_cents integer not null default 4000,
  timezone text not null default 'America/New_York'
);
insert into public.settings default values;

-- updated_at trigger for products
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();

-- Keep week_items.sold_count in step with paid orders
create function public.sync_sold_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w uuid;
begin
  w := coalesce(new.week_id, old.week_id);
  update public.week_items wi
     set sold_count = coalesce((
       select sum(oi.quantity) from public.order_items oi
         join public.orders o on o.id = oi.order_id
        where o.week_id = wi.week_id and oi.product_id = wi.product_id
          and o.status in ('paid','baked','out_for_delivery','delivered')), 0)
   where wi.week_id = w;
  return null;
end $$;
revoke execute on function public.sync_sold_counts() from public, anon, authenticated;
create trigger orders_sync_sold after insert or update of status on public.orders
for each row execute function public.sync_sold_counts();

-- Row level security: browser (anon) can read the public menu data only
alter table public.products enable row level security;
alter table public.weeks enable row level security;
alter table public.week_items enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.settings enable row level security;

create policy "public reads active products" on public.products
  for select to anon, authenticated using (active);
create policy "public reads published weeks" on public.weeks
  for select to anon, authenticated using (status = 'published');
create policy "public reads items of published weeks" on public.week_items
  for select to anon, authenticated
  using (exists (select 1 from public.weeks w where w.id = week_id and w.status = 'published'));
create policy "public reads active zones" on public.delivery_zones
  for select to anon, authenticated using (active);
create policy "public reads settings" on public.settings
  for select to anon, authenticated using (true);
-- customers, orders, order_items: no policies, so only the server (service role) can touch them.

-- The menu the site shows: the open week, or the next published one
create view public.current_menu with (security_invoker = true) as
with wk as (
  select w.* from public.weeks w
   where w.status = 'published' and w.closes_at > now()
   order by w.opens_at limit 1
)
select wk.id as week_id, wk.opens_at, wk.closes_at, wk.bake_date, wk.delivery_date, wk.delivery_window,
       (now() >= wk.opens_at and now() < wk.closes_at) as is_open,
       p.id as product_id, p.slug, p.name, p.unit, p.description, p.category, p.icon, p.image_url,
       coalesce(wi.price_cents, p.price_cents) as price_cents,
       wi.batch_limit,
       case when wi.batch_limit is null then null else greatest(wi.batch_limit - wi.sold_count, 0) end as remaining,
       wi.featured, wi.sort
  from wk
  join public.week_items wi on wi.week_id = wk.id
  join public.products p on p.id = wi.product_id and p.active;
grant select on public.current_menu to anon, authenticated;

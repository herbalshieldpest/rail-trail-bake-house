-- Applied: admins table, is_admin(), admin policies, bake_sheet view, create_next_week(), team fields.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
create policy "admins read own row" on public.admins for select to authenticated using (user_id = (select auth.uid()));
-- (admin "for all" policies on products, weeks, week_items, delivery_zones, customers, orders, order_items; update on settings)
-- bake_sheet view and create_next_week() as applied in the live project.
alter table public.admins
  add column name text not null default '',
  add column invited_by uuid references auth.users(id) on delete set null;
create policy "admins read team" on public.admins for select to authenticated using ((select public.is_admin()));

-- Product photos: public bucket, admins upload/replace/delete
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "admins upload product photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and (select public.is_admin()));
create policy "admins update product photos" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and (select public.is_admin()));
create policy "admins delete product photos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and (select public.is_admin()));

-- Partial refunds tracking
alter table public.orders add column refunded_cents integer not null default 0 check (refunded_cents >= 0);

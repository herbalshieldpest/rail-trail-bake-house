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

-- Live and test Stripe payments side by side. Test orders are kept out of the real sheets and sold counts.
alter table public.orders add column livemode boolean not null default true;
update public.orders set livemode = false; -- every order before this was paid with test keys
create index orders_week_live_idx on public.orders(week_id, livemode);

create or replace view public.bake_sheet as
 select o.week_id, oi.product_id, oi.name, oi.unit, sum(oi.quantity)::integer as quantity, o.livemode
   from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.status in ('paid','baked','out_for_delivery','delivered')
  group by o.week_id, oi.product_id, oi.name, oi.unit, o.livemode;
alter view public.bake_sheet set (security_invoker = true);
revoke all on public.bake_sheet from anon;
revoke insert, update, delete, truncate, references, trigger on public.bake_sheet from authenticated;

create or replace function public.sync_sold_counts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w uuid;
begin
  w := coalesce(new.week_id, old.week_id);
  update public.week_items wi
     set sold_count = coalesce((
       select sum(oi.quantity) from public.order_items oi
         join public.orders o on o.id = oi.order_id
        where o.week_id = wi.week_id and oi.product_id = wi.product_id and o.livemode
          and o.status in ('paid','baked','out_for_delivery','delivered')), 0)
   where wi.week_id = w;
  return null;
end $$;

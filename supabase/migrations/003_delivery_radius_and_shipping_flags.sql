create type public.fulfillment_method as enum ('delivery','shipping');
alter table public.products add column shippable boolean not null default false;
update public.products set shippable = true where slug = 'candied-pecans-sugared-almonds';
alter table public.orders add column fulfillment public.fulfillment_method not null default 'delivery';
alter table public.settings
  add column origin_label text not null default 'Hereford, MD',
  add column origin_lat double precision not null default 39.5865,
  add column origin_lng double precision not null default -76.6555,
  add column max_drive_minutes integer not null default 15,
  add column shipping_enabled boolean not null default false;
comment on table public.delivery_zones is 'Zip codes shown as the delivery area. Checkout also checks drive time from settings.origin against settings.max_drive_minutes.';

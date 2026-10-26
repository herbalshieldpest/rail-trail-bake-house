insert into public.products (slug, name, unit, description, category, price_cents, icon, sort) values
 ('country-sourdough','Country sourdough','One loaf','A two-day ferment, then a hot, dark bake for a crust that crackles as it cools. Best the day it arrives.','bread',1200,'wheat',10),
 ('parker-house-rolls','Parker House rolls','By the dozen','','rolls',1200,'trefoil',20),
 ('brown-butter-chocolate-chip','Brown butter chocolate chip','Half dozen','','cookies',1200,'rosette',30),
 ('apple-pie-lattice','Apple pie, lattice top','Whole, 9 inch','','pies',1800,'lattice',40),
 ('cinnamon-morning-buns','Cinnamon morning buns','Half dozen, glazed','','pastry',1800,'swirl',50),
 ('candied-pecans-sugared-almonds','Candied pecans & sugared almonds','One jar','Candied in small batches, boxed and tied by hand, with a card tucked inside.','gifts',null,null,60);

-- First real week: menu up Wednesday Oct 28, orders close Sunday Nov 1 at 6 pm Eastern
insert into public.weeks (opens_at, closes_at, bake_date, delivery_date, status)
values (timestamp '2026-10-28 07:00' at time zone 'America/New_York',
        timestamp '2026-11-01 18:00' at time zone 'America/New_York',
        date '2026-11-02', date '2026-11-03', 'published');

insert into public.week_items (week_id, product_id, sort, featured)
select w.id, p.id, p.sort, p.slug = 'country-sourdough'
  from public.weeks w cross join public.products p
 where w.delivery_date = date '2026-11-03' and p.category <> 'gifts';

-- Draft delivery area: zips within roughly 15 minutes of Hereford (to be confirmed)
insert into public.delivery_zones (zip, town) values
 ('21111','Monkton / Hereford'),
 ('21120','Parkton'),
 ('21131','Phoenix / Jacksonville'),
 ('21152','Sparks Glencoe'),
 ('21161','White Hall'),
 ('21053','Freeland'),
 ('21082','Hydes'),
 ('21030','Cockeysville / Hunt Valley'),
 ('21031','Hunt Valley'),
 ('21084','Jarrettsville');

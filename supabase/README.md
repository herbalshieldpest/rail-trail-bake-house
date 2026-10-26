# Database (Supabase)

Project: `rail-trail-bake-house` (ref `rjkwrvmhermwdkgekcto`, us-east-2).

These migrations are a record of what has been applied to the live database. Apply new ones in order.

- **products**: the catalog (name, unit, price, category, icon, shippable)
- **weeks**: one ordering window per delivery Tuesday (opens Wednesday, closes Sunday 6 pm ET)
- **week_items**: what is on a week's menu, with optional price override and batch limit (`null` = no limit)
- **delivery_zones**: zip codes shown as the delivery area
- **settings**: minimum order ($40), origin (Hereford), max drive time (15 minutes), shipping on/off
- **customers / orders / order_items**: written only by server code; never readable from the browser
- **current_menu** (view): the open week's menu, or the next published one, for the site to read

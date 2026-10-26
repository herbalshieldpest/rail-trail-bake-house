# Rail Trail Bakehouse — build plan

Status as of October 25, 2026. The homepage (desktop and phone) is live behind the preview password on Vercel. Everything below ships behind that password until launch.

## 1. Homepage on phones — done

- Phone and tablet layouts for the header, hero, menu columns, "How it works" and the footer, with no sideways scrolling.

## 2. Menu and order data (Supabase) — done

Built in the `rail-trail-bake-house` Supabase project. The SQL is saved in the repo under `supabase/migrations`.

- **products**: name, unit, description, price, category, icon, photo, shippable flag, active flag
- **weeks**: opens Wednesday, closes Sunday 6 pm ET, bake Monday, deliver Tuesday 10 am to 4 pm
- **week_items**: which products are on each week's menu, with optional price override and batch limit (left empty, since there are no limits)
- **customers, orders, order_items**: private; only server code can read or write them
- **delivery_zones**: zip codes for the delivery-area display
- **settings**: $40 minimum, Hereford as the origin, 15-minute maximum drive, shipping switched off
- **current_menu**: the open (or next) week's menu, which the homepage now reads

Seeded with the five current menu items and prices, the candied nut gift (price still needed), and the first week: menu up Wednesday, October 28, orders close Sunday, November 1 at 6 pm, and delivery Tuesday, November 3.

## 3. Menu page and basket

- Full weekly menu grouped by breads, rolls, cookies, pies, gifts and the weekly wild card
- Add to basket, change quantities, and a basket drawer that works well on phones
- $40 minimum enforced, with a "you're $X away" note
- Countdown to Sunday 6 pm. After the cutoff, ordering closes and the page shows "Next menu Wednesday"
- No batch limits for now; sold-out handling is built in if limits are ever needed

## 4. Checkout and payment (Stripe)

- Stripe Checkout: cards, Apple Pay and Google Pay
- Address collected and checked before payment: drive time from Hereford must be 15 minutes or less (via a maps routing service), with the zip list as a quick first check
- Delivery stays included in every price, so there is no delivery line item
- Confirmation email with the order, Tuesday's 10 am to 4 pm delivery window and contact details
- Optional reminder email Monday evening

## 5. Owner tools (password protected)

- Set next week's menu: pick products, set prices and batch limits, publish Wednesday
- Live order list for the week
- Monday bake sheet: totals per item
- Tuesday delivery sheet: addresses in a sensible route order, with notes and phone numbers, printable
- Mark orders delivered; issue refunds through Stripe

## 6. Shipping (later)

- Gifts marked shippable can ship once shipping is switched on in settings
- Shipping rates, packaging and a ship-by schedule to be decided when it is turned on

## 7. Remaining pages

- How delivery works (map, area, timing, what happens if you're not home)
- Gifts and pantry
- Privacy policy, terms of sale, delivery and refunds, accessibility
- Real social links for Instagram, Facebook and Pinterest
- Email signup connected to a mailing tool for the Wednesday menu email

## 8. Launch

- Connect railtrailbakehouse.com and www in Vercel → Settings → Domains
- Remove the password gate (`middleware.js`)
- Remove the "noindex" tag so search engines can list the site
- Test share cards with Facebook's Sharing Debugger and LinkedIn's Post Inspector
- Place a real test order end to end and refund it

## Decisions

1. **Payments:** Stripe (existing account). Needed before step 4: the Stripe secret key and webhook secret added in Vercel (I'll walk you through it).
2. **Delivery area:** within a 15-minute drive of Hereford.
3. **Batch limits:** none; items stay open until the Sunday cutoff.
4. **Gifts:** Tuesday delivery now; shipping to be switched on later.
5. **Licensing:** confirmed, you have rights to the seal silhouette and images.

## Still needed from you

- Price for the candied pecans & sugared almonds jar
- Confirm the Wednesday time the menu opens (set to 7 am for now)
- A maps routing account for the 15-minute drive check (Google Maps or Mapbox; both have free tiers)

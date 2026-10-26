// Public checkout endpoint.
//   action "start":  validate basket + delivery details, create a pending order, return a Stripe Checkout URL
//   action "status": look up an order by its Stripe session id for the thank-you page
// Prices always come from the database, never from the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@17.4.0";

const ALLOWED_ORIGINS = [
  /^https:\/\/rail-trail-bake-house(-[a-z0-9-]+)?\.vercel\.app$/,
  /^https:\/\/(www\.)?railtrailbakehouse\.com$/,
  /^http:\/\/localhost(:\d+)?$/,
];
function corsFor(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.some((r) => r.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://rail-trail-bake-house.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "Checkout isn’t switched on yet." }, 503);
  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === "status") {
      const sid = clean(body.session_id, 200);
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return json({ error: "Unknown order." }, 404);
      const { data: o } = await sb.from("orders")
        .select("order_number,status,subtotal_cents,delivery_name,address_line1,city,zip,week_id,weeks(delivery_date,delivery_window),order_items(name,unit,quantity,line_total_cents)")
        .eq("stripe_checkout_session_id", sid).maybeSingle();
      if (!o) return json({ error: "Unknown order." }, 404);
      // If the webhook hasn't arrived yet, ask Stripe directly.
      if (o.status === "pending_payment") {
        const s = await stripe.checkout.sessions.retrieve(sid);
        if (s.payment_status === "paid") {
          await sb.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null })
            .eq("stripe_checkout_session_id", sid).eq("status", "pending_payment");
          o.status = "paid";
        }
      }
      return json({ order: o });
    }

    if (body.action !== "start") return json({ error: "Unknown action." }, 400);

    // ---- validate delivery details
    const d = (body.delivery ?? {}) as Record<string, unknown>;
    const delivery = {
      name: clean(d.name, 120), email: clean(d.email, 200).toLowerCase(), phone: clean(d.phone, 40),
      line1: clean(d.line1, 200), line2: clean(d.line2, 120), city: clean(d.city, 80),
      zip: clean(d.zip, 10), notes: clean(d.notes, 500), gift: clean(d.gift, 300),
    };
    if (!delivery.name) return json({ error: "Please add your name.", field: "name" }, 400);
    if (!EMAIL_RE.test(delivery.email)) return json({ error: "Please check your email address.", field: "email" }, 400);
    if (delivery.phone.replace(/\D/g, "").length < 10) return json({ error: "Please add a phone number we can text on delivery day.", field: "phone" }, 400);
    if (!delivery.line1 || !delivery.city) return json({ error: "Please add your street address and town.", field: "line1" }, 400);
    const zip5 = delivery.zip.slice(0, 5);
    if (!/^\d{5}$/.test(zip5)) return json({ error: "Please check your zip code.", field: "zip" }, 400);
    const { data: zone } = await sb.from("delivery_zones").select("zip").eq("zip", zip5).eq("active", true).maybeSingle();
    if (!zone) return json({ error: "Sorry, we don’t deliver to " + zip5 + " yet. We deliver within about 15 minutes of Hereford. Email hello@railtrailbakehouse.com if you’re just outside.", field: "zip" }, 400);

    // ---- price the basket from the database
    const { data: menu, error: mErr } = await sb.from("current_menu").select("*");
    if (mErr) throw mErr;
    if (!menu || !menu.length) return json({ error: "There’s no menu open right now." }, 409);
    const wk = menu[0];
    const now = Date.now();
    if (now < new Date(wk.opens_at).getTime() || now >= new Date(wk.closes_at).getTime())
      return json({ error: "Ordering is closed for this week. The next menu goes up Wednesday." }, 409);
    const bySlug = new Map(menu.map((m: Record<string, unknown>) => [m.slug as string, m]));
    const raw = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
    const lines: Array<{ m: Record<string, any>; qty: number }> = [];
    for (const it of raw) {
      const m = bySlug.get(String(it.slug)) as Record<string, any> | undefined;
      const qty = Math.floor(Number(it.qty));
      if (!m || !(qty > 0)) continue;
      if (m.price_cents == null) continue;
      if (m.remaining != null && qty > m.remaining) return json({ error: `Only ${m.remaining} ${m.name} left this week.` }, 409);
      lines.push({ m, qty: Math.min(qty, 24) });
    }
    if (!lines.length) return json({ error: "Your basket is empty." }, 400);
    const subtotal = lines.reduce((s, l) => s + l.m.price_cents * l.qty, 0);
    const { data: settings } = await sb.from("settings").select("min_order_cents").maybeSingle();
    const min = settings?.min_order_cents ?? 4000;
    if (subtotal < min) return json({ error: `The minimum order is $${(min / 100).toFixed(0)}.` }, 400);

    // ---- customer + pending order
    let customerId: string;
    const { data: cust } = await sb.from("customers").select("id").eq("email", delivery.email).maybeSingle();
    if (cust) {
      customerId = cust.id;
      await sb.from("customers").update({ name: delivery.name, phone: delivery.phone }).eq("id", cust.id);
    } else {
      const { data: c2, error } = await sb.from("customers").insert({ email: delivery.email, name: delivery.name, phone: delivery.phone }).select("id").single();
      if (error) throw error;
      customerId = c2.id;
    }
    const { data: order, error: oErr } = await sb.from("orders").insert({
      week_id: wk.week_id, customer_id: customerId, status: "pending_payment", subtotal_cents: subtotal,
      delivery_name: delivery.name, address_line1: delivery.line1, address_line2: delivery.line2, city: delivery.city,
      state: "MD", zip: delivery.zip, phone: delivery.phone, delivery_notes: delivery.notes, gift_message: delivery.gift,
    }).select("id,order_number").single();
    if (oErr) throw oErr;
    const { error: iErr } = await sb.from("order_items").insert(lines.map((l) => ({
      order_id: order.id, product_id: l.m.product_id, name: l.m.name, unit: l.m.unit, unit_price_cents: l.m.price_cents, quantity: l.qty,
    })));
    if (iErr) throw iErr;

    // ---- Stripe Checkout
    const site = origin && ALLOWED_ORIGINS.some((r) => r.test(origin)) ? origin : "https://rail-trail-bake-house.vercel.app";
    const deliveryDay = new Date(wk.delivery_date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: delivery.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id, order_number: String(order.order_number) },
      payment_intent_data: {
        metadata: { order_id: order.id, order_number: String(order.order_number) },
        description: `Rail Trail Bakehouse order #${order.order_number} · delivery ${deliveryDay}`,
      },
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: {
          currency: "usd", unit_amount: l.m.price_cents,
          product_data: { name: l.m.name, description: l.m.unit || undefined, ...(l.m.image_url ? { images: [l.m.image_url] } : {}) },
        },
      })),
      custom_text: { submit: { message: `Delivery included. We’ll bring your order ${deliveryDay}, ${wk.delivery_window} to ${delivery.line1}, ${delivery.city}.` } },
      success_url: `${site}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/menu?checkout=cancelled`,
      expires_at: Math.floor(now / 1000) + 30 * 60 + 60,
    });
    await sb.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
    return json({ url: session.url, order_number: order.order_number });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong starting checkout. Please try again, or email hello@railtrailbakehouse.com." }, 500);
  }
});

// Refund an order (full or partial) through Stripe. Admins only. Uses the live or test key the order was paid with.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@17.4.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return json({ error: "Please sign in again." }, 401);
  const { data: admin } = await sb.from("admins").select("user_id").eq("user_id", who.user.id).maybeSingle();
  if (!admin) return json({ error: "Only admins can refund orders." }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const { data: o } = await sb.from("orders").select("id,order_number,status,subtotal_cents,refunded_cents,stripe_payment_intent_id,livemode")
    .eq("id", String(body.order_id ?? "")).maybeSingle();
  if (!o) return json({ error: "Order not found." }, 404);
  if (!o.stripe_payment_intent_id) return json({ error: "This order has no card payment to refund." }, 400);
  const left = o.subtotal_cents - (o.refunded_cents ?? 0);
  if (left <= 0) return json({ error: "This order is already fully refunded." }, 400);
  const amount = body.amount_cents == null ? left : Math.floor(Number(body.amount_cents));
  if (!(amount > 0) || amount > left) return json({ error: `Refund must be between $0.01 and $${(left / 100).toFixed(2)}.` }, 400);

  try {
    const key = Deno.env.get(o.livemode ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST");
    if (!key) return json({ error: `The Stripe ${o.livemode ? "live" : "test"} key isn’t set up.` }, 503);
    const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
    await stripe.refunds.create({
      payment_intent: o.stripe_payment_intent_id, amount,
      metadata: { order_id: o.id, order_number: String(o.order_number), by: who.user.email ?? "" },
    });
    const refunded = (o.refunded_cents ?? 0) + amount;
    await sb.from("orders").update({ refunded_cents: refunded, ...(refunded >= o.subtotal_cents ? { status: "refunded" } : {}) }).eq("id", o.id);
    return json({ ok: true, refunded_cents: refunded, full: refunded >= o.subtotal_cents });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || "Stripe couldn’t make that refund." }, 502);
  }
});

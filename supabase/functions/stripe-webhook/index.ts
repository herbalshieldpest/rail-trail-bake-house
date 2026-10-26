// Stripe webhook: marks orders paid, cancelled or refunded. Verifies Stripe's signature on every call.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@17.4.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const sig = req.headers.get("Stripe-Signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !secret) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, crypto);
  } catch (e) {
    console.error("Bad signature", (e as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") break; // async methods finish later
        await sb.from("orders").update({
          status: "paid", paid_at: new Date().toISOString(),
          stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null,
        }).eq("stripe_checkout_session_id", s.id).eq("status", "pending_payment");
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        await sb.from("orders").update({ status: "cancelled" }).eq("stripe_checkout_session_id", s.id).eq("status", "pending_payment");
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        if (c.refunded && typeof c.payment_intent === "string") {
          await sb.from("orders").update({ status: "refunded" }).eq("stripe_payment_intent_id", c.payment_intent);
        }
        break;
      }
    }
  } catch (e) {
    console.error(e);
    return new Response("Error", { status: 500 }); // Stripe will retry
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});

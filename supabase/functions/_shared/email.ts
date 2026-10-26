// Order confirmation email via Resend. Safe to call more than once: it claims the order first, so only one email goes out.
// deno-lint-ignore-file no-explicit-any
const FROM = "Rail Trail Bakehouse <hello@railtrailbakehouse.com>";
const REPLY_TO = "hello@railtrailbakehouse.com";
const PHONE = "443-555-0100";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (c: number) => "$" + (c / 100).toFixed(c % 100 ? 2 : 0);
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export async function sendConfirmation(sb: any, orderId: string): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.warn("RESEND_API_KEY not set; skipping confirmation"); return; }

  // Claim: only the first caller gets the row back.
  const { data: claimed } = await sb.from("orders").update({ confirmation_sent_at: new Date().toISOString(), confirmation_error: null })
    .eq("id", orderId).is("confirmation_sent_at", null).select("id");
  if (!claimed || !claimed.length) return;

  const { data: o } = await sb.from("orders")
    .select("order_number,subtotal_cents,livemode,delivery_name,address_line1,address_line2,city,zip,delivery_notes,gift_message,customers(email),weeks(delivery_date,delivery_window),order_items(name,unit,quantity,line_total_cents)")
    .eq("id", orderId).single();
  const to = o?.customers?.email;
  if (!o || !to) { await sb.from("orders").update({ confirmation_sent_at: null, confirmation_error: "No email address" }).eq("id", orderId); return; }

  const when = o.weeks ? `${day(o.weeks.delivery_date)}, ${o.weeks.delivery_window || "10 am to 4 pm"}` : "Tuesday, 10 am to 4 pm";
  const first = String(o.delivery_name || "").split(" ")[0] || "there";
  const addr = [o.address_line1, o.address_line2].filter(Boolean).join(", ") + ", " + o.city + " " + o.zip;
  const items = (o.order_items || []) as any[];
  const test = !o.livemode;
  const subject = `${test ? "[TEST] " : ""}Your Rail Trail order #${o.order_number} · ${o.weeks ? day(o.weeks.delivery_date) : "Tuesday"}`;

  const rows = items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e6d9c6">${i.quantity} × ${esc(i.name)}${i.unit ? `<br><span style="color:#7a6a5a;font-size:14px">${esc(i.unit)}</span>` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #e6d9c6;text-align:right;vertical-align:top">${money(i.line_total_cents)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#1b2e31;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#2a1c13">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#f1ebe0;border-radius:6px" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 28px">
${test ? `<p style="background:#f3d36b;padding:8px 12px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;margin:0 0 20px"><b>Test order</b> · paid with a Stripe test card. No real charge.</p>` : ""}
<p style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#7a6a5a;margin:0 0 6px">Rail Trail Bakehouse</p>
<h1 style="font-weight:normal;font-size:28px;margin:0 0 16px">Thank you, ${esc(first)}.</h1>
<p style="font-size:17px;line-height:1.5;margin:0 0 20px">Your order is in. We bake Monday and bring it to your door <b>${esc(when)}</b>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:16px">${rows}
<tr><td style="padding:12px 0 0"><b>Total</b> <span style="color:#7a6a5a;font-size:14px">· delivery included</span></td><td style="padding:12px 0 0;text-align:right"><b>${money(o.subtotal_cents)}</b></td></tr></table>
<h2 style="font-weight:normal;font-size:19px;margin:28px 0 6px">Delivering to</h2>
<p style="font-size:16px;line-height:1.5;margin:0">${esc(o.delivery_name)}<br>${esc(addr)}</p>
${o.delivery_notes ? `<p style="font-size:15px;margin:8px 0 0;color:#5a4a3a">Note: ${esc(o.delivery_notes)}</p>` : ""}
${o.gift_message ? `<p style="font-size:15px;margin:8px 0 0;color:#5a4a3a">Gift card: ${esc(o.gift_message)}</p>` : ""}
<p style="font-size:16px;line-height:1.5;margin:24px 0 0">If you’re not home, we’ll leave it bagged and boxed by your door, out of the sun. Need to change something? Reply to this email or call <a href="tel:+14435550100" style="color:#2a1c13">${PHONE}</a> before Sunday 6 pm.</p>
<p style="font-size:16px;margin:24px 0 0">Order #${o.order_number}</p>
</td></tr></table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#a9b5b3;margin:16px 0 0">Rail Trail Bakehouse · Hereford, Maryland · <a href="https://railtrailbakehouse.com/refunds" style="color:#a9b5b3">Delivery &amp; refunds</a></p>
</td></tr></table></body></html>`;
  const text = `${test ? "[TEST ORDER: no real charge]\n\n" : ""}Thank you, ${first}.\n\nYour order is in. We bake Monday and bring it to your door ${when}.\n\n` +
    items.map((i) => `${i.quantity} x ${i.name}  ${money(i.line_total_cents)}`).join("\n") +
    `\nTotal ${money(o.subtotal_cents)} (delivery included)\n\nDelivering to:\n${o.delivery_name}\n${addr}\n` +
    (o.delivery_notes ? `Note: ${o.delivery_notes}\n` : "") + (o.gift_message ? `Gift card: ${o.gift_message}\n` : "") +
    `\nNeed to change something? Reply to this email or call ${PHONE} before Sunday 6 pm.\n\nOrder #${o.order_number}\nRail Trail Bakehouse · Hereford, Maryland`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `order-confirmation-${orderId}` },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  } catch (e) {
    console.error("Confirmation email failed", e);
    await sb.from("orders").update({ confirmation_sent_at: null, confirmation_error: String((e as Error).message || e).slice(0, 500) }).eq("id", orderId);
  }
}

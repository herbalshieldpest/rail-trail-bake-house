// Team management for the kitchen admin page: list, invite, reset password, remove.
// Only signed-in admins can call it. Uses the service role key, which never leaves the server.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const WORDS = ["crust", "rye", "oven", "loaf", "crumb", "proof", "levain", "flour", "honey", "barley", "maple", "pecan",
  "butter", "spelt", "oat", "lattice", "rolling", "pin", "sugar", "almond", "cocoa", "cinnamon", "batch", "porch"];
function tempPassword() {
  const r = new Uint32Array(4);
  crypto.getRandomValues(r);
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${WORDS[r[2] % WORDS.length]}-${10 + (r[3] % 90)}`;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await sb.auth.getUser(token);
  const me = who?.user;
  if (!me) return json({ error: "Please sign in again." }, 401);
  const { data: meAdmin } = await sb.from("admins").select("user_id").eq("user_id", me.id).maybeSingle();
  if (!meAdmin) return json({ error: "Only admins can manage the team." }, 403);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action;

  try {
    if (action === "list") {
      const { data: rows, error } = await sb.from("admins").select("user_id,email,name,created_at,invited_by").order("created_at");
      if (error) throw error;
      const team = [];
      for (const r of rows ?? []) {
        const { data } = await sb.auth.admin.getUserById(r.user_id);
        const u = data?.user;
        team.push({
          user_id: r.user_id, email: u?.email ?? r.email, name: r.name, added_at: r.created_at,
          last_sign_in_at: u?.last_sign_in_at ?? null,
          pending: !!u?.user_metadata?.must_change_password,
          you: r.user_id === me.id,
        });
      }
      return json({ team });
    }

    if (action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!EMAIL_RE.test(email)) return json({ error: "That email address doesn’t look right." }, 400);

      const password = tempPassword();
      let userId: string | null = null;
      const created = await sb.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { must_change_password: true, name },
      });
      if (created.data?.user) userId = created.data.user.id;
      else {
        // Already has an account: find it and give it a fresh temporary password.
        let page = 1;
        while (!userId && page < 20) {
          const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
          const hit = data?.users.find((u) => (u.email ?? "").toLowerCase() === email);
          if (hit) userId = hit.id;
          if (!data || data.users.length < 200) break;
          page++;
        }
        if (!userId) throw created.error ?? new Error("Could not create the account.");
        const { data: already } = await sb.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
        if (already) return json({ error: "That person is already on the team." }, 409);
        await sb.auth.admin.updateUserById(userId, { password, user_metadata: { must_change_password: true, name } });
      }
      const { error } = await sb.from("admins").insert({ user_id: userId, email, name, invited_by: me.id });
      if (error) throw error;
      return json({ ok: true, email, name, password });
    }

    if (action === "reset") {
      const id = String(body.user_id ?? "");
      if (id === me.id) return json({ error: "Change your own password from the sign-in page instead." }, 400);
      const { data: target } = await sb.from("admins").select("email,name").eq("user_id", id).maybeSingle();
      if (!target) return json({ error: "That person isn’t on the team." }, 404);
      const password = tempPassword();
      const { error } = await sb.auth.admin.updateUserById(id, { password, user_metadata: { must_change_password: true } });
      if (error) throw error;
      return json({ ok: true, email: target.email, name: target.name, password });
    }

    if (action === "remove") {
      const id = String(body.user_id ?? "");
      if (id === me.id) return json({ error: "You can’t remove yourself." }, 400);
      const { count } = await sb.from("admins").select("user_id", { count: "exact", head: true });
      if ((count ?? 0) <= 1) return json({ error: "The team needs at least one admin." }, 400);
      const { error } = await sb.from("admins").delete().eq("user_id", id);
      if (error) throw error;
      await sb.auth.admin.deleteUser(id); // signs them out everywhere
      return json({ ok: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || "Something went wrong." }, 500);
  }
});

# Rail Trail Bakehouse

Website for Rail Trail Bakehouse. Plain HTML + CSS, with a small Vercel middleware that password-protects the site during preview.

## Files

- `index.html` — the homepage design (preview)
- `images/` — photography
- `middleware.js` — password gate (HTTP basic auth) for the whole site
- `package.json` — declares `@vercel/functions`, used by the middleware
- `styles.css` — all styling
- `404.html` — not-found page
- `favicon.svg` — site icon
- `vercel.json` — Vercel settings (clean URLs)


## Deploying on Vercel

1. In Vercel, **Add New → Project** and import `herbalshieldpest/rail-trail-bake-house`.
2. Framework preset: **Other**. Leave build command and output directory empty.
3. Deploy. Every push to `main` redeploys automatically.

## Custom domain

1. In the Vercel project, go to **Settings → Domains** and add your domain (e.g. `railtrailbakehouse.com` and `www.railtrailbakehouse.com`).
2. At your domain registrar, add the DNS records Vercel shows you (typically an `A` record for the root domain and a `CNAME` for `www`).
3. Vercel issues the HTTPS certificate automatically once DNS resolves.

## Local preview

Open `index.html` in a browser, or run `npx serve .` from this folder.

## Password protection (preview)

The whole site asks for a password until you remove `middleware.js`.

1. In Vercel, open the project → **Settings → Environment Variables**.
2. Add `SITE_PASSWORD` with the password you want (all environments).
3. Optional: add `SITE_USER` to also require a specific username. Without it, any username works.
4. Redeploy (Deployments → ⋯ → Redeploy) so the new variable takes effect.

Until `SITE_PASSWORD` is set, the site shows a "password is not set yet" message instead of the page.

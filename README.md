# Rail Trail Bake House

Website for Rail Trail Bake House. Plain HTML + CSS — no build step.

## Files

- `index.html` — the homepage (just the bakery name for now)
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

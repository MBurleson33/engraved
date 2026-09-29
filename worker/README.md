# Engraved save counter (Cloudflare Worker + D1)

Counts wallpaper saves and powers the "Someone in Tulsa, OK saved…" notices.
Everything here fits in Cloudflare's free plan (100k requests/day, D1 free tier).
No IP addresses or personal data are stored — only wallpaper id, approximate city, and time.

## Setup (dashboard, ~10 minutes)

1. Sign up / log in at dash.cloudflare.com (free plan, no card needed).
2. Create the database: Storage & Databases → D1 SQL Database → Create → name it `engraved`.
3. Create the tables: open the `engraved` database → Console → paste all of `schema.sql` → Execute.
4. Create the Worker: Workers & Pages → Create → Start with Hello World → name it `engraved-stats` → Deploy.
5. Paste the code: on the Worker, click Edit code → delete everything → paste all of `worker.js` → Deploy.
6. Connect the database: Worker → Settings → Bindings → Add → D1 database →
   Variable name `DB` (exactly) → database `engraved` → Save.
7. Test it: open `https://engraved-stats.<your-subdomain>.workers.dev/stats` —
   you should see `{"counts":{},"recent":[],...}`.
8. Turn it on in the site (already done for engraved-stats.burleson-matthew.workers.dev):
   `const STATS_API = 'https://engraved-stats.<your-subdomain>.workers.dev';` (no trailing slash).

If you later move the site to a custom domain, update `SITE` at the top of `worker.js`.

## Comments (added later)

1. **Tables:** D1 → `engraved` → Console → paste the "Comments" block at the bottom of `schema.sql` → Execute.
2. **Turnstile:** dashboard → Turnstile → Add widget → name `Engraved`, hostname `mburleson33.github.io`, mode **Managed** → Create. Copy the **Site Key** and **Secret Key**.
3. **Worker secrets:** Worker → Settings → Variables and Secrets → Add → type **Secret**:
   - `TURNSTILE_SECRET` = the Turnstile Secret Key
   - `ADMIN_KEY` = a long random string (your admin password)
4. **Worker code:** Edit code → replace everything with the new `worker.js` → Deploy.
5. **Site:** put the Turnstile **Site Key** in `TURNSTILE_SITEKEY` in `index.html`.

Review comments at `/engraved/admin.html` using your `ADMIN_KEY`.

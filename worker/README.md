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

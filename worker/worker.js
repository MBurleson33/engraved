/**
 * Engraved save counter — Cloudflare Worker + D1 (free tier).
 *
 *   POST /save   {"id":"psalm-46-10--line-art"}  -> records one save
 *   GET  /stats                                   -> {counts:{id:n}, recent:[{id,city,region,country,ts}]}
 *
 * Privacy: no IP addresses or identifiers are stored — only the wallpaper id,
 * the approximate city Cloudflare already knows for the request, and the time.
 */
const SITE = 'https://mburleson33.github.io';              // who may call this API
const LIST = SITE + '/engraved/wallpapers.json';           // only ids in here are counted
const RECENT_DAYS = 7;                                      // recent saves kept for the pop-up

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin(req.headers.get('Origin')),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/save' && req.method === 'POST') {
        const { id } = await req.json().catch(() => ({}));
        if (!(await isKnownId(id, env))) return json({ ok: false }, 400, cors);
        const cf = req.cf || {};
        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare('INSERT INTO counts (id, n) VALUES (?1, 1) ON CONFLICT(id) DO UPDATE SET n = n + 1').bind(id),
          env.DB.prepare('INSERT INTO saves (id, city, region, country, ts) VALUES (?1, ?2, ?3, ?4, ?5)')
            .bind(id, cf.city || null, cf.regionCode || cf.region || null, cf.country || null, now),
        ]);
        // occasional cleanup of old recent-save rows (counts are kept forever)
        if (Math.random() < 0.02) ctx.waitUntil(env.DB.prepare('DELETE FROM saves WHERE ts < ?1').bind(now - RECENT_DAYS * 864e5).run());
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === '/stats' && req.method === 'GET') {
        // Cached at the edge for 60s so page views barely touch the database.
        const cache = caches.default, key = new Request(url.origin + '/stats');
        let res = await cache.match(key);
        if (!res) {
          const [c, r] = await env.DB.batch([
            env.DB.prepare('SELECT id, n FROM counts'),
            env.DB.prepare('SELECT id, city, region, country, ts FROM saves WHERE city IS NOT NULL ORDER BY ts DESC LIMIT 25'),
          ]);
          const counts = Object.fromEntries(c.results.map(x => [x.id, x.n]));
          res = new Response(JSON.stringify({ counts, recent: r.results, now: Date.now() }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
          });
          ctx.waitUntil(cache.put(key, res.clone()));
        }
        return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors } });
      }

      return json({ ok: false, error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ ok: false, error: 'server' }, 500, cors);
    }
  },
};

function allowOrigin(o) {
  if (!o) return SITE;
  if (o === SITE || /^http:\/\/localhost(:\d+)?$/.test(o) || /^https:\/\/([a-z0-9-]+\.)*engraved[a-z0-9-]*\.[a-z]+$/.test(o)) return o;
  return SITE;
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
// Only count real wallpapers: check the id against the live wallpapers.json (cached 10 min).
let ids = null, idsAt = 0;
async function isKnownId(id, env) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,80}$/.test(id)) return false;
  if (!ids || Date.now() - idsAt > 6e5) {
    try {
      const list = await fetch(env.LIST_URL || LIST, { cf: { cacheTtl: 600 } }).then(r => r.json());
      ids = new Set(list.map(w => w.id)); idsAt = Date.now();
    } catch { return !!ids && ids.has(id); }
  }
  return ids.has(id);
}

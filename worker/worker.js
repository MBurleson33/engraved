/**
 * Engraved API — Cloudflare Worker + D1 (free tier).
 *
 *   POST /save        {"id":"psalm-46-10--line-art"}      -> records one save
 *   GET  /stats                                             -> {counts, comments, recent, now}
 *   GET  /comments?id=psalm-46-10--line-art                 -> approved comments for one wallpaper
 *   POST /comments    {id, name, body, token, website}      -> new comment, held for approval
 *   GET  /admin/comments?status=pending|approved            -> (X-Admin-Key header) list comments
 *   POST /admin/comments {cid, action:"approve"|"delete"}   -> (X-Admin-Key header) moderate
 *
 * Secrets to set on the Worker (Settings -> Variables and Secrets, type "Secret"):
 *   TURNSTILE_SECRET  — from your Cloudflare Turnstile widget
 *   ADMIN_KEY         — any long random string; it unlocks admin.html
 *
 * Privacy: saves store only wallpaper id, approximate city and time. Comments store
 * the name/text people type plus a one-way hash of their IP (used only for the
 * rate limit, and deleted after 2 days). No raw IP addresses are ever stored.
 */
const SITE = 'https://mburleson33.github.io';              // who may call this API
const LIST = SITE + '/engraved/wallpapers.json';           // only ids in here are accepted
const RECENT_DAYS = 7;                                      // recent saves kept for the pop-up
const MAX_COMMENTS_PER_HOUR = 3;                            // per device
const MAX_BODY = 500, MAX_NAME = 40;

// Keep this list short and obvious; everything is reviewed by hand anyway.
const BLOCKED_WORDS = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'porn', 'viagra', 'casino', 'crypto', 'bitcoin', 'onlyfans'];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin(req.headers.get('Origin')),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      'Vary': 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      /* ---------------- saves ---------------- */
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
        if (Math.random() < 0.02) ctx.waitUntil(env.DB.prepare('DELETE FROM saves WHERE ts < ?1').bind(now - RECENT_DAYS * 864e5).run());
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === '/stats' && req.method === 'GET') {
        // Cached at the edge for 60s so page views barely touch the database.
        const cache = caches.default, key = new Request(url.origin + '/stats');
        let res = await cache.match(key);
        if (!res) {
          const [c, r, k] = await env.DB.batch([
            env.DB.prepare('SELECT id, n FROM counts'),
            env.DB.prepare('SELECT id, city, region, country, ts FROM saves WHERE city IS NOT NULL ORDER BY ts DESC LIMIT 25'),
            env.DB.prepare("SELECT id, COUNT(*) AS n FROM comments WHERE status = 'approved' GROUP BY id"),
          ]);
          const counts = Object.fromEntries(c.results.map(x => [x.id, x.n]));
          const comments = Object.fromEntries(k.results.map(x => [x.id, x.n]));
          res = new Response(JSON.stringify({ counts, comments, recent: r.results, now: Date.now() }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
          });
          ctx.waitUntil(cache.put(key, res.clone()));
        }
        return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors } });
      }

      /* ---------------- public comments ---------------- */
      if (url.pathname === '/comments' && req.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!/^[a-z0-9-]{3,80}$/.test(id)) return json({ ok: false }, 400, cors);
        const r = await env.DB.prepare("SELECT cid, name, body, ts FROM comments WHERE id = ?1 AND status = 'approved' ORDER BY ts DESC LIMIT 100").bind(id).all();
        return json({ ok: true, comments: r.results }, 200, { ...cors, 'Cache-Control': 'public, max-age=30' });
      }

      if (url.pathname === '/comments' && req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        // 1) hidden trap field — real people never fill it in
        if (b.website) return json({ ok: true, pending: true }, 200, cors);
        // 2) must be a real wallpaper
        if (!(await isKnownId(b.id, env))) return json({ ok: false, error: 'Unknown wallpaper.' }, 400, cors);
        // 3) content rules
        const name = clean(b.name).slice(0, MAX_NAME) || 'Anonymous';
        const body = clean(b.body);
        if (body.length < 2) return json({ ok: false, error: 'Please write a little more.' }, 400, cors);
        if (body.length > MAX_BODY) return json({ ok: false, error: `Please keep it under ${MAX_BODY} characters.` }, 400, cors);
        if (hasLink(body) || hasLink(name)) return json({ ok: false, error: 'Links aren’t allowed in comments.' }, 400, cors);
        if (hasBlocked(body) || hasBlocked(name)) return json({ ok: false, error: 'Please keep comments kind and clean.' }, 400, cors);
        // 4) Cloudflare Turnstile human check
        const ip = req.headers.get('CF-Connecting-IP') || '';
        if (!(await turnstileOK(b.token, ip, env))) return json({ ok: false, error: 'Couldn’t verify you’re human. Please try again.' }, 403, cors);
        // 5) rate limit per device (hashed IP)
        const iph = await sha(ip + '|' + (env.ADMIN_KEY || 'engraved'));
        const now = Date.now();
        const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE iph = ?1 AND ts > ?2').bind(iph, now - 36e5).first();
        if (recent && recent.n >= MAX_COMMENTS_PER_HOUR) return json({ ok: false, error: 'You’ve posted a few already. Please try again later.' }, 429, cors);
        await env.DB.prepare("INSERT INTO comments (id, name, body, ts, status, iph) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)").bind(b.id, name, body, now, iph).run();
        // forget IP hashes after 2 days
        if (Math.random() < 0.1) ctx.waitUntil(env.DB.prepare('UPDATE comments SET iph = NULL WHERE ts < ?1 AND iph IS NOT NULL').bind(now - 2 * 864e5).run());
        return json({ ok: true, pending: true }, 200, cors);
      }

      /* ---------------- admin ---------------- */
      if (url.pathname === '/admin/comments') {
        if (!env.ADMIN_KEY || req.headers.get('X-Admin-Key') !== env.ADMIN_KEY) return json({ ok: false, error: 'unauthorized' }, 401, cors);
        if (req.method === 'GET') {
          const status = url.searchParams.get('status') === 'approved' ? 'approved' : 'pending';
          const r = await env.DB.prepare('SELECT cid, id, name, body, ts, status FROM comments WHERE status = ?1 ORDER BY ts DESC LIMIT 200').bind(status).all();
          const p = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'").first();
          return json({ ok: true, comments: r.results, pending: p ? p.n : 0 }, 200, cors);
        }
        if (req.method === 'POST') {
          const { cid, action } = await req.json().catch(() => ({}));
          if (!Number.isInteger(cid)) return json({ ok: false }, 400, cors);
          if (action === 'approve') await env.DB.prepare("UPDATE comments SET status = 'approved' WHERE cid = ?1").bind(cid).run();
          else if (action === 'delete') await env.DB.prepare('DELETE FROM comments WHERE cid = ?1').bind(cid).run();
          else return json({ ok: false }, 400, cors);
          ctx.waitUntil(caches.default.delete(new Request(url.origin + '/stats')));
          return json({ ok: true }, 200, cors);
        }
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
function clean(s) {
  return String(s || '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
function hasLink(s) {
  return /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ru|xyz|info|biz|link|site|shop|top|app)\b)/i.test(s);
}
function hasBlocked(s) {
  const t = s.toLowerCase();
  return BLOCKED_WORDS.some(w => t.includes(w));
}
async function turnstileOK(token, ip, env) {
  if (env.DEV_SKIP_TURNSTILE === '1') return true;            // local testing only
  if (!token || !env.TURNSTILE_SECRET) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form }).then(r => r.json()).catch(() => ({}));
  return r.success === true;
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Only accept real wallpapers: check the id against the live wallpapers.json (cached 10 min).
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

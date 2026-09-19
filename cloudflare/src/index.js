import { Problem, emptyRoom, reserve, start, stop, advance, holdView, snapshot } from './domain.js';
import { readRoom, mutateRoom } from './store.js';

const event = { id: 'nocturna', name: 'NOCTURNA / Sesión 01', venue: 'Sala Horizonte · Madrid', startsAt: '2027-06-19T20:00:00Z', priceCents: 2400 };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
const digest = async token => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2,'0')).join('');
async function body(request) {
  const text = await request.text();
  if (text.length > 2048) throw new Problem(413, 'Petición demasiado grande.');
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw new Problem(400, 'JSON no válido.'); }
}
// Admission limits accepted API work, not Cloudflare-billed incoming requests.
// Even a rejected request is billed by Workers; this is NOT an account spending cap.
export async function admit(db, session = false) {
  const day = new Date().toISOString().slice(0,10);
  const result = await db.prepare(`INSERT INTO budget(day, requests, sessions) VALUES (?, 1, ?)
    ON CONFLICT(day) DO UPDATE SET requests = requests + 1, sessions = sessions + excluded.sessions
    WHERE requests < 1500 AND sessions + excluded.sessions <= 20 RETURNING day`).bind(day, session ? 1 : 0).first();
  if (!result) throw new Problem(429, 'La demo ha alcanzado su presupuesto diario. Vuelve mañana.');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (env.DEMO_ENABLED !== 'true') throw new Problem(503, 'Demo pública pendiente de activar.');
      const path = url.pathname.slice(4);
      if (!['GET','POST'].includes(request.method)) throw new Problem(405, 'Método no permitido.');
      const origin = request.headers.get('Origin');
      if (request.method === 'POST' && ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')) throw new Problem(403, 'Origen no permitido.');
      if (Number(request.headers.get('Content-Length') || 0) > 2048) throw new Problem(413, 'Petición demasiado grande.');
      const token = /(?:^|;\s*)aforo_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
      const hash = token ? await digest(token) : null;
      if (path === '/session' && request.method === 'POST') {
        await body(request);
        await admit(env.DB);
        if (hash) {
          try { await readRoom(env.DB, hash); return json({ snapshot: true, experimentDriver: 'browser' }); }
          catch (e) { if (e.status !== 401) throw e; }
        }
        await admit(env.DB, true);
        const fresh = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
        // Retain at most one day. Cleanup is bounded by twenty admitted rooms/day.
        await env.DB.batch([
          env.DB.prepare('DELETE FROM room WHERE expires_at <= unixepoch()'),
          env.DB.prepare("DELETE FROM budget WHERE day < date('now', '-2 days')"),
          env.DB.prepare('INSERT INTO room(token_hash,data,expires_at) VALUES (?,?,unixepoch()+86400)').bind(await digest(fresh), JSON.stringify(emptyRoom()))
        ]);
        return json({ snapshot: true, experimentDriver: 'browser' }, 200, { 'Set-Cookie': `aforo_session=${fresh}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=86400${url.protocol === 'https:' ? '; Secure' : ''}` });
      }
      if (!hash) throw new Problem(401, 'Inicia una sesión.');
      await admit(env.DB);
      if (path === '/state' && request.method === 'GET') return json(snapshot((await readRoom(env.DB, hash)).room, Date.now()));
      if (path === '/event' && request.method === 'GET') { await readRoom(env.DB, hash); return json(event); }
      if (request.method === 'POST') {
        const data = await body(request);
        if (path === '/reservations') return json(await mutateRoom(env.DB, hash, (room, now) => holdView(reserve(room, data.seatIds, now), now)), 201);
        if (path === '/experiments') return json(await mutateRoom(env.DB, hash, (room, now) => start(room, data, now)), 201);
        const action = /^\/experiments\/([a-f0-9-]{36})\/(advance|stop)$/.exec(path);
        if (action) {
          await mutateRoom(env.DB, hash, (room, now) => {
            if (room.run?.id !== action[1]) throw new Problem(404, 'Prueba no encontrada.');
            if (action[2] === 'stop') { stop(room, action[1]); return null; }
            return advance(room, now) ? null : { unchanged: true, value: null };
          });
          return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
        }
      }
      throw new Problem(404, 'Ruta no encontrada.');
    } catch (error) {
      return json({ detail: error instanceof Problem ? error.message : 'No se pudo completar la operación.', status: error.status || 503 }, error instanceof Problem ? error.status : 503, error.status === 429 ? { 'Retry-After': '3600' } : {});
    }
  }
};

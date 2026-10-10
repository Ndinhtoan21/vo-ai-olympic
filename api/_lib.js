// Shared helpers for the API routes. Files starting with "_" are not exposed as routes on Vercel.
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const P = 'vao:'; // key prefix

const configured = () => !!(URL_ && TOKEN);

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd.map(String)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pinHash = (pin, salt) => sha(`vo-ai-olympic|pin|${salt}|${pin}`);
const tokenFor = (hash) => sha(`vo-ai-olympic|token|${hash}`);

async function getPin() {
  const raw = await redis('GET', P + 'pin');
  return raw ? JSON.parse(raw) : null; // {salt, hash}
}

// Teacher token check: token is derived from the stored PIN hash, so changing the PIN logs everyone out.
async function isTeacher(req) {
  const tok = String(req.headers['x-teacher-token'] || '');
  if (!tok) return false;
  const p = await getPin();
  if (!p) return false;
  const want = tokenFor(p.hash);
  return tok.length === want.length && crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(want));
}

function ip(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
}

// Simple fixed-window rate limit. Returns true when the caller is over the limit.
async function limited(name, req, max, windowSec) {
  const k = `${P}rl:${name}:${ip(req)}`;
  const n = await redis('INCR', k);
  if (n === 1) await redis('EXPIRE', k, windowSec);
  return n > max;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

module.exports = { redis, configured, P, sha, pinHash, tokenFor, getPin, isTeacher, limited, send, body, crypto };

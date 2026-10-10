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
// Fixed teacher PIN lives only in the Vercel env var TEACHER_PIN (never in the repo).
const PIN = String(process.env.TEACHER_PIN || '');
// Token is an HMAC keyed with a server-only secret, so it cannot be forged by guessing the PIN offline.
const SECRET = process.env.TOKEN_SECRET || TOKEN || 'dev';
const teacherToken = () => crypto.createHmac('sha256', SECRET).update('vo-ai-olympic|teacher|' + PIN).digest('hex');
const pinOk = (pin) => !!PIN && /^\d{1,12}$/.test(pin) && pin.length === PIN.length && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(PIN));

async function isTeacher(req) {
  const tok = String(req.headers['x-teacher-token'] || '');
  if (!tok || !PIN) return false;
  const want = teacherToken();
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

module.exports = { redis, configured, P, sha, PIN, teacherToken, pinOk, isTeacher, limited, send, body, crypto };

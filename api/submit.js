// Students post one finished quiz. No login: the record carries the name and class they typed.
const L = require('./_lib');

const MAX_RESULTS = 20000;
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = async (req, res) => {
  if (!L.configured()) return L.send(res, 503, { error: 'not_configured' });
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  try {
    if (await L.limited('submit', req, 120, 600)) return L.send(res, 429, { error: 'too_many' });
    const b = L.body(req);
    const name = clean(b.name, 60);
    const cls = clean(b.cls, 20);
    const code = String(b.code || '').toUpperCase();
    const bits = String(b.bits || '');
    const cid = String(b.cid || '').slice(0, 40);
    if (!name) return L.send(res, 400, { error: 'name' });
    if (!/^(AI|TT|TN)-[0-9A-Z]{1,12}$/.test(code)) return L.send(res, 400, { error: 'code' });
    if (!/^[01]{1,120}$/.test(bits)) return L.send(res, 400, { error: 'bits' });
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(cid)) return L.send(res, 400, { error: 'cid' });

    const now = Date.now();
    let at = Number(b.at);
    if (!isFinite(at) || at > now + 5 * 60e3 || at < now - 60 * 864e5) at = now;
    const secs = Math.max(0, Math.min(86400, Math.round(Number(b.secs) || 0)));
    const sel = Array.isArray(b.sel) && b.sel.length === bits.length
      ? b.sel.map((a) => (Array.isArray(a) ? a.filter((x) => Number.isInteger(x) && x >= 0 && x < 8).slice(0, 8) : []))
      : null;
    const rec = {
      id: cid, name, cls, code, bits,
      c: bits.split('').filter((x) => x === '1').length, n: bits.length,
      secs, at, recv: now, mode: b.mode === 0 ? 0 : 1, sel,
    };
    // cid is generated on the student's device: re-sending the same attempt (retry) overwrites, never duplicates.
    const exists = await L.redis('HEXISTS', L.P + 'results', cid);
    if (!exists && (await L.redis('HLEN', L.P + 'results')) >= MAX_RESULTS) return L.send(res, 507, { error: 'full' });
    await L.redis('HSET', L.P + 'results', cid, JSON.stringify(rec));
    return L.send(res, 200, { ok: true, id: cid });
  } catch (e) {
    return L.send(res, 500, { error: 'server' });
  }
};

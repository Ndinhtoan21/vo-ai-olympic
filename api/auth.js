// Teacher PIN: status, first-time setup, login, change.
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.configured()) return L.send(res, 503, { error: 'not_configured' });
  try {
    if (req.method === 'GET') {
      const p = await L.getPin();
      return L.send(res, 200, { hasPin: !!p, teacher: await L.isTeacher(req) });
    }
    if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
    const b = L.body(req);
    const pin = String(b.pin || '');
    const action = String(b.action || 'login');
    const valid = (x) => /^\d{4,12}$/.test(x);
    const p = await L.getPin();

    if (action === 'setup') {
      if (p) return L.send(res, 409, { error: 'exists' });
      if (!valid(pin)) return L.send(res, 400, { error: 'pin_format' });
      const salt = L.crypto.randomBytes(16).toString('hex');
      const rec = { salt, hash: L.pinHash(pin, salt) };
      // NX: only the first setup wins, even if two requests race.
      const ok = await L.redis('SET', L.P + 'pin', JSON.stringify(rec), 'NX');
      if (ok !== 'OK') return L.send(res, 409, { error: 'exists' });
      return L.send(res, 200, { token: L.tokenFor(rec.hash) });
    }

    if (await L.limited('auth', req, 10, 900)) return L.send(res, 429, { error: 'too_many' });
    if (!p) return L.send(res, 404, { error: 'no_pin' });
    if (L.pinHash(pin, p.salt) !== p.hash) return L.send(res, 401, { error: 'wrong_pin' });

    if (action === 'change') {
      const np = String(b.newPin || '');
      if (!valid(np)) return L.send(res, 400, { error: 'pin_format' });
      const salt = L.crypto.randomBytes(16).toString('hex');
      const rec = { salt, hash: L.pinHash(np, salt) };
      await L.redis('SET', L.P + 'pin', JSON.stringify(rec));
      return L.send(res, 200, { token: L.tokenFor(rec.hash) });
    }
    return L.send(res, 200, { token: L.tokenFor(p.hash) });
  } catch (e) {
    return L.send(res, 500, { error: 'server' });
  }
};

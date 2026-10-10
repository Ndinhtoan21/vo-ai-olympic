// Teacher login with the fixed PIN from the TEACHER_PIN env var. The PIN cannot be set or changed from the site.
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.configured()) return L.send(res, 503, { error: 'not_configured' });
  if (!L.PIN) return L.send(res, 503, { error: 'no_pin_env' });
  try {
    if (req.method === 'GET') return L.send(res, 200, { hasPin: true, teacher: await L.isTeacher(req) });
    if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
    if (await L.limited('auth', req, 10, 900)) return L.send(res, 429, { error: 'too_many' });
    const pin = String(L.body(req).pin || '');
    if (!L.pinOk(pin)) return L.send(res, 401, { error: 'wrong_pin' });
    return L.send(res, 200, { token: L.teacherToken() });
  } catch (e) {
    return L.send(res, 500, { error: 'server' });
  }
};

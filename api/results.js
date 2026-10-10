// Teacher-only: list all results, or delete some.
const L = require('./_lib');

module.exports = async (req, res) => {
  if (!L.configured()) return L.send(res, 503, { error: 'not_configured' });
  try {
    if (!(await L.isTeacher(req))) return L.send(res, 401, { error: 'auth' });
    if (req.method === 'GET') {
      const flat = (await L.redis('HGETALL', L.P + 'results')) || [];
      const rows = [];
      for (let i = 1; i < flat.length; i += 2) {
        try { rows.push(JSON.parse(flat[i])); } catch (e) { /* skip bad row */ }
      }
      return L.send(res, 200, { rows, now: Date.now() });
    }
    if (req.method === 'POST') {
      const b = L.body(req);
      const ids = Array.isArray(b.delete) ? b.delete.map(String).filter((x) => x.length <= 60).slice(0, 2000) : [];
      if (!ids.length) return L.send(res, 400, { error: 'ids' });
      for (let i = 0; i < ids.length; i += 200) await L.redis('HDEL', L.P + 'results', ...ids.slice(i, i + 200));
      return L.send(res, 200, { ok: true, deleted: ids.length });
    }
    return L.send(res, 405, { error: 'method' });
  } catch (e) {
    return L.send(res, 500, { error: 'server' });
  }
};

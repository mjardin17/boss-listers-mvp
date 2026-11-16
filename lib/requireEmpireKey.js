// lib/requireEmpireKey.js
// Auth gate for the /empire/* routes Empire OS calls (server to server).
//   if (!requireEmpireKey(req, res)) return;   // a 401/503 response was already sent
const { checkEmpireKey } = require("./empireContract");

function requireEmpireKey(req, res) {
  const check = checkEmpireKey(req.headers || {});
  if (!check.ok) {
    res.status(check.status).json({ ok: false, error: check.error });
    return false;
  }
  return true;
}

module.exports = { requireEmpireKey };

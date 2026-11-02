"use strict";
const crypto = require("node:crypto");
const { db } = require("./database.cjs");
const { cookie } = require("./http.cjs");
const hashPassword = (p, s) => crypto.scryptSync(p, s, 64);
const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");
function session(req) {
  const t = cookie(req);
  if (!t) return null;
  return db
    .prepare(
      "SELECT s.user_id,s.expires,m.space_id,m.slot FROM sessions s JOIN space_members m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires>?",
    )
    .get(sha(t), Date.now());
}
module.exports = { hashPassword, sha, session };

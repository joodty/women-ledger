"use strict";
const { db } = require("../database.cjs");
const { send, getBody } = require("../http.cjs");
const { fail } = require("../errors.cjs");

db.exec(`CREATE TABLE IF NOT EXISTS wake_alarm_receipts (
  space_id TEXT NOT NULL, alarm_id TEXT NOT NULL, account TEXT NOT NULL,
  version INTEGER NOT NULL, status TEXT NOT NULL, next_at INTEGER NOT NULL,
  PRIMARY KEY(space_id, alarm_id, account)
)`);

function receipts(space) {
  return Object.fromEntries(db.prepare(`
    SELECT alarm_id, r.version, status, next_at FROM wake_alarm_receipts r
    JOIN entity_rows e ON e.space_id=r.space_id AND e.collection='wake_alarms' AND e.id=r.alarm_id
    WHERE r.space_id=?
  `).all(space).map((r) => [r.alarm_id, { version: r.version, status: r.status, nextAt: r.next_at }]));
}
async function route(req, res, pathname, s) {
  if (pathname !== "/api/v2/wake-alarms/device") return false;
  if (req.method === "GET") {
    const alarms = db.prepare(`SELECT json,version FROM entity_rows
      WHERE space_id=? AND collection='wake_alarms' AND json_extract(json,'$.target')=?`)
      .all(s.space_id, s.slot).map((r) => ({ ...JSON.parse(r.json), version: r.version }));
    return send(res, 200, { account: s.user_id, spaceId: s.space_id, alarms });
  }
  if (req.method !== "POST") return false;
  const body = await getBody(req, 32768);
  // Recheck membership and version after awaiting the body. A stale device
  // receipt must never confirm a newer edit or another member's alarm.
  const current = require("../security.cjs").session(req);
  fail(current?.user_id === s.user_id && current.space_id === s.space_id &&
    body.account === s.user_id && body.spaceId === s.space_id &&
    Array.isArray(body.items) && body.items.length <= 40,
    "validation", "闹钟设备回执无效");
  const find = db.prepare(`SELECT version,json FROM entity_rows WHERE space_id=? AND
    collection='wake_alarms' AND id=? AND json_extract(json,'$.target')=?`);
  const write = db.prepare(`INSERT INTO wake_alarm_receipts VALUES(?,?,?,?,?,?)
    ON CONFLICT(space_id,alarm_id,account) DO UPDATE SET version=excluded.version,
      status=excluded.status,next_at=excluded.next_at`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of body.items) {
      if (!item || typeof item.id !== "string" || !Number.isSafeInteger(item.version) ||
        !Number.isSafeInteger(item.nextAt) || item.nextAt < 0 ||
        !["scheduled", "paused", "permission", "expired", "error"].includes(item.status) ||
        (item.status === "scheduled") !== (item.nextAt > 0)) continue;
      const alarm = find.get(s.space_id, item.id, s.slot);
      if (alarm?.version !== item.version ||
        JSON.parse(alarm.json).enabled === (item.status === "paused")) continue;
      write.run(s.space_id, item.id, s.user_id, item.version, item.status, item.nextAt);
    }
    db.prepare(`DELETE FROM wake_alarm_receipts WHERE space_id=? AND NOT EXISTS
      (SELECT 1 FROM entity_rows WHERE space_id=? AND collection='wake_alarms' AND id=alarm_id)`)
      .run(s.space_id, s.space_id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return send(res, 200, { ok: true });
}
module.exports = { receipts, route };

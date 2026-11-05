"use strict";
const { db } = require("./database.cjs");
const collections = [
  "members",
  "categories",
  "entries",
  "goals",
  "weekly_settlements",
  "points_ledger",
  "wishlist",
  "story_entries",
  "milestones",
  "redemptions",
];
db.exec(`CREATE TABLE IF NOT EXISTS entity_rows(space_id TEXT NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(space_id,collection,id));
CREATE TABLE IF NOT EXISTS entity_meta(space_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS command_receipts(account TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(account,id));
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);`);
function row(space) {
  return space === "legacy"
    ? db.prepare("SELECT revision,json FROM state WHERE id=1").get()
    : db
        .prepare("SELECT revision,json FROM space_state WHERE space_id=?")
        .get(space);
}
function project(space, data, revision) {
  const coupleText=JSON.stringify(data.couple),couple=db.prepare("SELECT json FROM entity_rows WHERE space_id=? AND collection='settings' AND id='couple'").get(space);
  if(!couple)db.prepare("INSERT INTO entity_rows VALUES(?,'settings','couple',?,1)").run(space,coupleText);else if(couple.json!==coupleText)db.prepare("UPDATE entity_rows SET json=?,version=version+1 WHERE space_id=? AND collection='settings' AND id='couple'").run(coupleText,space);
  for (const collection of collections) {
    const list = data[collection] || [],
      ids = new Set();
    for (const value of list) {
      if (typeof value.id !== "string") continue;
      ids.add(value.id);
      const text = JSON.stringify(value);
      const old = db
        .prepare(
          "SELECT json,version FROM entity_rows WHERE space_id=? AND collection=? AND id=?",
        )
        .get(space, collection, value.id);
      if (!old)
        db.prepare("INSERT INTO entity_rows VALUES(?,?,?,?,1)").run(
          space,
          collection,
          value.id,
          text,
        );
      else if (old.json !== text)
        db.prepare(
          "UPDATE entity_rows SET json=?,version=version+1 WHERE space_id=? AND collection=? AND id=?",
        ).run(text, space, collection, value.id);
    }
    for (const old of db
      .prepare("SELECT id FROM entity_rows WHERE space_id=? AND collection=?")
      .all(space, collection))
      if (!ids.has(old.id))
        db.prepare(
          "DELETE FROM entity_rows WHERE space_id=? AND collection=? AND id=?",
        ).run(space, collection, old.id);
  }
  const value = {};
  for (const [k, v] of Object.entries(data))
    if (!collections.includes(k)) value[k] = v;
  const orders = {},
    unindexed = {};
  for (const c of collections) {
    const list = data[c] || [];
    orders[c] = list.map((x) => x.id);
    if (
      list.some((x) => typeof x.id !== "string") ||
      new Set(orders[c]).size !== list.length
    )
      unindexed[c] = list;
  }
  const meta = { value, orders, unindexed };
  db.prepare(
    "INSERT INTO entity_meta VALUES(?,?,?) ON CONFLICT(space_id) DO UPDATE SET revision=excluded.revision,json=excluded.json",
  ).run(space, revision, JSON.stringify(meta));
}
function load(space) {
  const current = row(space);
  if (!current) return null;
  const meta = db
    .prepare("SELECT revision,json FROM entity_meta WHERE space_id=?")
    .get(space);
  if (!meta || meta.revision !== current.revision)
    project(space, JSON.parse(current.json), current.revision);
  const m = db
    .prepare("SELECT json FROM entity_meta WHERE space_id=?")
    .get(space);
  const stored = JSON.parse(m.json),
    data = stored.value,
    versions = {};
  for (const c of collections) {
    const rows = db
      .prepare(
        "SELECT id,json,version FROM entity_rows WHERE space_id=? AND collection=? ORDER BY rowid",
      )
      .all(space, c);
    const byId = new Map(rows.map((r) => [r.id, JSON.parse(r.json)]));
    data[c] =
      stored.unindexed[c] ||
      stored.orders[c].map((id) => byId.get(id)).filter(Boolean);
    versions[c] = Object.fromEntries(rows.map((r) => [r.id, r.version]));
  }
  versions.settings={couple:db.prepare("SELECT version FROM entity_rows WHERE space_id=? AND collection='settings' AND id='couple'").get(space).version};
  return { revision: current.revision, data, versions };
}
function save(space, data) {
  const old = row(space),
    revision = (old?.revision || 0) + 1,
    at = new Date().toISOString(),
    text = JSON.stringify(data);
  if (space === "legacy") {
    if (old)
      db.prepare(
        "INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)",
      ).run(old.revision, old.json, at);
    db.prepare(
      "INSERT INTO state(id,revision,json,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at",
    ).run(revision, text, at);
    db.prepare(
      "DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)",
    ).run();
  } else {
    if (old)
      db.prepare(
        "INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)",
      ).run(space, old.revision, old.json, at);
    db.prepare(
      "INSERT INTO space_state VALUES(?,?,?,?) ON CONFLICT(space_id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at",
    ).run(space, revision, text, at);
    db.prepare(
      "DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)",
    ).run(space, space);
  }
  project(space, data, revision);
  return revision;
}
// Additive, transactional migration: original account, state and history tables stay intact.
if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version=2").get()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const legacy = row("legacy");
    if (legacy) project("legacy", JSON.parse(legacy.json), legacy.revision);
    for (const s of db
      .prepare("SELECT space_id,revision,json FROM space_state")
      .all())
      project(s.space_id, JSON.parse(s.json), s.revision);
    db.prepare("INSERT INTO schema_migrations VALUES(2,?)").run(
      new Date().toISOString(),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
/* v3：奖励已并进愿望，rewards 这套数据彻底不要了。
   投影表里的行删掉，两处 state json 里的键也摘掉，
   否则老库会带着一个没人再读的键一直漂在那儿。 */
if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version=3").get()) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM entity_rows WHERE collection='rewards'").run();
    const strip = (table, key) => {
      for (const r of db.prepare(`SELECT ${key} AS k,json FROM ${table}`).all()) {
        let data;
        try {
          data = JSON.parse(r.json);
        } catch {
          continue;
        }
        if (!data || !Object.hasOwn(data, "rewards")) continue;
        delete data.rewards;
        db.prepare(`UPDATE ${table} SET json=? WHERE ${key}=?`).run(
          JSON.stringify(data),
          r.k,
        );
      }
    };
    strip("state", "id");
    strip("space_state", "space_id");
    /* rewards 已不在 collections 里，投影时会落进 meta.value，
       这里一并摘掉，否则 load 又把它带回来 */
    for (const m of db.prepare("SELECT space_id,json FROM entity_meta").all()) {
      let meta;
      try {
        meta = JSON.parse(m.json);
      } catch {
        continue;
      }
      if (!meta?.value || !Object.hasOwn(meta.value, "rewards")) continue;
      delete meta.value.rewards;
      db.prepare("UPDATE entity_meta SET json=? WHERE space_id=?").run(
        JSON.stringify(meta),
        m.space_id,
      );
    }
    db.prepare("INSERT INTO schema_migrations VALUES(3,?)").run(
      new Date().toISOString(),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
module.exports = { load, save, collections };

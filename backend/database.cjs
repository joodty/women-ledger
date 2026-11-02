"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { DatabaseSync, backup } = require("node:sqlite");
const root = process.env.WOMEN_APP_ROOT;
const dataDir = path.resolve(
  process.env.WOMEN_DATA_DIR || path.join(root, "data"),
);
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(path.join(dataDir, "ledger.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, salt BLOB NOT NULL, hash BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS space_members (user_id TEXT PRIMARY KEY REFERENCES users(id), space_id TEXT NOT NULL REFERENCES spaces(id), slot TEXT NOT NULL CHECK(slot IN ('me','him')), UNIQUE(space_id,slot));
CREATE TABLE IF NOT EXISTS space_state (space_id TEXT PRIMARY KEY REFERENCES spaces(id), revision INTEGER NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS space_snapshots (id INTEGER PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), revision INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(id), expires INTEGER NOT NULL);`);
// Keep the original single-space tables intact while mapping the original two accounts.
db.prepare("INSERT OR IGNORE INTO spaces VALUES(?,?)").run(
  "legacy",
  Date.now(),
);
for (const slot of ["me", "him"])
  db.prepare(
    "INSERT OR IGNORE INTO space_members(user_id,space_id,slot) SELECT id,?,id FROM users WHERE id=?",
  ).run("legacy", slot);
module.exports = { db, dataDir, backup };

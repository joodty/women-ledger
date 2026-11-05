"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process"),
  { DatabaseSync } = require("node:sqlite");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "women-v2-migration-")),
  file = path.join(dir, "ledger.sqlite"),
  db = new DatabaseSync(file);
db.exec(
  "CREATE TABLE users(id TEXT PRIMARY KEY,salt BLOB NOT NULL,hash BLOB NOT NULL);CREATE TABLE state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,json TEXT NOT NULL,updated_at TEXT NOT NULL);",
);
for (const id of ["me", "him"]) {
  const salt = crypto.randomBytes(16);
  db.prepare("INSERT INTO users VALUES(?,?,?)").run(
    id,
    salt,
    crypto.scryptSync("test-password-123", salt, 64),
  );
}
const original = {
  version: 4,
  couple: { since: "2024-01-01", code: "KEEP", shareOpen: true },
  members: [
    { id: "me", name: "one", avatar: null },
    { id: "him", name: "two", avatar: null },
  ],
  categories: [
    { id: "b", name: "B", color: "#AABBCC" },
    { id: "a", name: "A", color: "#CCDDEE" },
    { id: "none", name: "未分类", color: "#D8D5D2" },
  ],
  entries: [
    {
      id: "e1",
      memberId: "me",
      date: "2026-11-01",
      start: "10:00",
      end: "11:00",
      minutes: 60,
      content: "historical private",
      visibility: "private",
    },
  ],
  goals: [],
  weekly_settlements: [{ week: "2026-11-02", note: "old row without id" }],
  points_ledger: [
    { id: "p1", memberId: "me", points: 8, type: "legacy", date: "2026-11-01" },
  ],
  redemptions: [
    {
      id: "r1",
      memberId: "me",
      fromMe: 3,
      fromHim: 0,
      name: "old purchase",
      date: "2026-11-01",
    },
  ],
  wishlist: [],
  /* 升级前的库里还有 rewards，v3 迁移应该把它从 json 里抹掉 */
  rewards: [{ id: "rw1", name: "old reward", pointsLabel: "4" }],
  story_entries: [
    {
      id: "s1",
      memberId: "him",
      seq: 7,
      text: "historical story",
      date: "2026-11-01",
    },
  ],
  milestones: [],
  sparks: ["keep"],
};
const json = JSON.stringify(original),
  expected = structuredClone(original),
  expectedJson = (delete expected.rewards, JSON.stringify(expected));
db.prepare("INSERT INTO state VALUES(1,23,?,?)").run(json, "2026-11-01");
db.close();
let child;
async function run(entry) {
  const port = 24764,
    base = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, [entry], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, WOMEN_DATA_DIR: dir, PORT: String(port) },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + "/health");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const auth = await fetch(base + "/api/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ user: "me", password: "test-password-123" }),
  });
  const cookie = auth.headers.get("set-cookie").split(";")[0];
  const response = await fetch(base + "/api/v2/bootstrap", {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.data, expected);
  assert.equal(result.revision, 23);
  const check = new DatabaseSync(file, { readOnly: true });
  assert.equal(
    check.prepare("SELECT json FROM state WHERE id=1").get().json,
    expectedJson,
  );
  assert.equal(
    check
      .prepare("SELECT count(*) n FROM schema_migrations WHERE version=2")
      .get().n,
    1,
  );
  assert.equal(
    check.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  check.close();
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
  child = null;
}
(async () => {
  try {
    await run("server.cjs");
    await run("dist/server.cjs");
    console.log(
      "PASS: exact legacy data, order, id-less rows, balances, repeated migration and standalone bundle",
    );
  } finally {
    child?.kill();
    setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

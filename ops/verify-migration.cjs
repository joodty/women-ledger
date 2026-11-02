"use strict";
// Read an online backup, migrate an independent temporary copy, compare without printing private data.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  util = require("node:util"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process"),
  { DatabaseSync } = require("node:sqlite");
const backup = path.resolve(process.argv[2] || ""),
  entry = path.resolve(process.argv[3] || "dist/server.cjs"),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "women-migration-verify-"));
let child;
function view(db) {
  const datasets = [];
  const has = (t) =>
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(t);
  if (has("state")) {
    const old = db.prepare("SELECT revision,json FROM state WHERE id=1").get();
    if (old) datasets.push({ space: "legacy", ...old });
  }
  if (has("space_state"))
    datasets.push(
      ...db
        .prepare("SELECT space_id AS space,revision,json FROM space_state")
        .all(),
    );
  const users = db.prepare("SELECT id,salt,hash FROM users ORDER BY id").all();
  const authHash = crypto.createHash("sha256");
  for (const row of users) {
    authHash.update(row.id);
    authHash.update(row.salt);
    authHash.update(row.hash);
  }
  return {
    datasets,
    accountCount: users.length,
    authHash: authHash.digest("hex"),
  };
}
(async () => {
  try {
    fs.copyFileSync(backup, path.join(temp, "ledger.sqlite"));
    let db = new DatabaseSync(path.join(temp, "ledger.sqlite"), {
      readOnly: true,
    });
    const before = view(db);
    db.close();
    const port = 24766;
    child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        WOMEN_DATA_DIR: temp,
        HOST: "127.0.0.1",
        PORT: String(port),
      },
      stdio: "ignore",
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw Error("migrated copy did not start");
    db = new DatabaseSync(path.join(temp, "ledger.sqlite"), { readOnly: true });
    const after = view(db);
    if (!util.isDeepStrictEqual(before, after))
      throw Error("original state or account data changed");
    for (const dataset of before.datasets) {
      const stored = JSON.parse(
          db
            .prepare("SELECT json FROM entity_meta WHERE space_id=?")
            .get(dataset.space).json,
        ),
        data = stored.value;
      for (const collection of Object.keys(stored.orders)) {
        const rows = db
            .prepare(
              "SELECT id,json FROM entity_rows WHERE space_id=? AND collection=?",
            )
            .all(dataset.space, collection),
          map = new Map(rows.map((r) => [r.id, JSON.parse(r.json)]));
        data[collection] =
          stored.unindexed[collection] ||
          stored.orders[collection].map((id) => map.get(id));
      }
      if (!util.isDeepStrictEqual(data, JSON.parse(dataset.json)))
        throw Error("entity projection differs from original dataset");
    }
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("integrity check failed");
    db.close();
    console.log(
      JSON.stringify({
        ok: true,
        datasets: before.datasets.length,
        accounts: before.accountCount,
        originalStatePreserved: true,
        credentialsPreserved: true,
        entityProjectionMatches: true,
      }),
    );
  } finally {
    if (child)
      await new Promise((r) => {
        child.once("exit", r);
        child.kill();
      });
    const resolved = path.resolve(temp);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep))
      fs.rmSync(resolved, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

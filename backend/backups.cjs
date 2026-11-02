"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { db, dataDir, backup } = require("./database.cjs");
async function dailyBackup() {
  const folder = path.join(dataDir, "backups");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const date = new Date().toISOString().slice(0, 10);
  const destination = path.join(folder, `ledger-${date}.sqlite`);
  if (fs.existsSync(destination)) return;
  const tmp = destination + ".tmp";
  try {
    await backup(db, tmp);
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, destination);
    const files = fs
      .readdirSync(folder)
      .filter((n) => /^ledger-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n))
      .sort()
      .reverse();
    for (const name of files.slice(14)) fs.unlinkSync(path.join(folder, name));
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    console.error("自动备份失败：", e.message);
  }
}
module.exports = { dailyBackup };

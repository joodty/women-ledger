"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  readline = require("node:readline/promises");
const { db, backup } = require("./database.cjs");
const { hashPassword, sha } = require("./security.cjs");
const count = () => db.prepare("SELECT count(*) n FROM users").get().n;

const users = ["me", "him"];
async function secret(prompt) {
  if (!process.stdin.isTTY) throw Error("请在终端中交互设置密码");
  const { Writable } = require("node:stream");
  const silent = new Writable({
    write(_c, _e, done) {
      done();
    },
  });
  process.stdout.write(prompt);
  const rl = readline.createInterface({
    input: process.stdin,
    output: silent,
    terminal: true,
  });
  try {
    return await rl.question("");
  } finally {
    rl.close();
    process.stdout.write("\n");
  }
}
async function setup() {
  if (count()) throw Error("账户已存在；不会覆盖已有账户。");
  const entries = [];
  for (const id of users) {
    const p = await secret(
      `设置${id === "me" ? "第一位" : "第二位"}成员的密码（至少 12 个字符）：`,
    );
    const confirm = await secret("再次输入：");
    if (p.length < 12 || p !== confirm)
      throw Error("密码不足 12 字符或两次不同");
    entries.push([id, crypto.randomBytes(16), p]);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [id, salt, p] of entries)
      db.prepare("INSERT INTO users VALUES(?,?,?)").run(
        id,
        salt,
        hashPassword(p, salt),
      );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  console.log("两个成员账户已创建，请妥善保管密码。");
}
if (process.argv[2] === "setup") {
  setup().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
  return;
}
if (process.argv[2] === "passwd") {
  (async () => {
    const id = process.argv[3];
    if (!users.includes(id) || !count())
      throw Error("请选择已有成员 me 或 him");
    const p = await secret("新密码（至少 12 个字符）：");
    const confirm = await secret("再次输入：");
    if (p.length < 12 || p !== confirm)
      throw Error("密码不足 12 字符或两次不同");
    const salt = crypto.randomBytes(16);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE users SET salt=?,hash=? WHERE id=?").run(
        salt,
        hashPassword(p, salt),
        id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    console.log("密码已更新，该成员需重新登录。");
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
  return;
}
if (process.argv[2] === "backup") {
  const destination = process.argv[3] && path.resolve(process.argv[3]);
  if (!destination || fs.existsSync(destination)) {
    console.error("请指定不存在的备份文件路径。");
    process.exit(1);
  }
  backup(db, destination)
    .then(() => {
      fs.chmodSync(destination, 0o600);
      db.close();
      console.log("数据库备份已创建。");
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
  return;
}

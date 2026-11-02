"use strict";
const crypto = require("node:crypto");
const { db } = require("../database.cjs");
const repo = require("../repository.cjs");
const { seed } = require("../domain/seed.cjs");
const { apply } = require("../domain/commands.cjs");
const { visibleState, validState } = require("../domain/state.cjs");
const { reconcilePoints } = require("../domain/points.cjs");
const { send, getBody } = require("../http.cjs");
const { fail } = require("../errors.cjs");
function bootstrap(s) {
  let current = repo.load(s.space_id);
  const members = db
    .prepare("SELECT user_id,slot FROM space_members WHERE space_id=?")
    .all(s.space_id);
  if (!current) {
    repo.save(s.space_id, seed(members));
    current = repo.load(s.space_id);
  }
  const own = current.data.members.find((m) => m.id === s.slot);
  if (own?.name === "待加入") {
    own.name = s.user_id;
    repo.save(s.space_id, current.data);
    current = repo.load(s.space_id);
  }
  const data = visibleState(current.data, s.slot);
  const versions = {};
  for (const [key, list] of Object.entries(data))
    if (Array.isArray(list))
      versions[key] = Object.fromEntries(
        list
          .filter((x) => x && x.id && current.versions[key]?.[x.id])
          .map((x) => [x.id, current.versions[key][x.id]]),
      );
  versions.settings=current.versions.settings;
  return {
    revision: current.revision,
    data,
    versions,
    session: {
      account: s.user_id,
      slot: s.slot,
      spaceId: s.space_id,
      canInvite: members.length === 1,
      legacySpace: s.space_id === "legacy",
      members: members.map((m) => ({ account: m.user_id, slot: m.slot })),
    },
  };
}
module.exports = async function (req, res, pathname, s) {
  if (pathname === "/api/v2/bootstrap" && req.method === "GET") {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = bootstrap(s);
      db.exec("COMMIT");
      return send(res, 200, result);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (pathname === "/api/v2/commands" && req.method === "POST") {
    const command = await getBody(req);
    fail(
      typeof command.id === "string" &&
        /^[a-z0-9_-]{1,100}$/i.test(command.id) &&
        typeof command.type === "string",
      "validation",
      "操作编号无效",
    );
    const fingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(command))
      .digest("hex");
    db.exec("BEGIN IMMEDIATE");
    try {
      const receipt = db
        .prepare(
          "SELECT fingerprint FROM command_receipts WHERE account=? AND id=?",
        )
        .get(s.user_id, command.id);
      if (receipt) {
        fail(
          receipt.fingerprint === fingerprint,
          "conflict",
          "同一操作编号不能提交不同内容",
          409,
        );
        const result = bootstrap(s);
        db.exec("COMMIT");
        return send(res, 200, { ...result, replayed: true });
      }
      const current = repo.load(s.space_id);
      fail(current, "not_found", "空间尚未初始化", 404);
      const next = structuredClone(current.data);
      apply(next, command, s, current.versions);
      reconcilePoints(current.data, next);
      fail(validState(next), "validation", "数据格式不正确");
      repo.save(s.space_id, next);
      db.prepare("INSERT INTO command_receipts VALUES(?,?,?,?)").run(
        s.user_id,
        command.id,
        fingerprint,
        new Date().toISOString(),
      );
      const result = bootstrap(s);
      db.exec("COMMIT");
      return send(res, 200, result);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return false;
};

"use strict";
const speechService = require("../services/speech.cjs");
const crypto = require("node:crypto");
const { db } = require("../database.cjs");
const { send, getBody, cookie } = require("../http.cjs");
const { sha, hashPassword, session } = require("../security.cjs");
const {
  visibleState,
  visibleHistory,
  validState,
  protectPersonal,
  equal,
  mergeValue,
} = require("../domain/state.cjs");
const { reconcilePoints, walletTag } = require("../domain/points.cjs");
const attempts = new Map(),
  registrations = new Map(),
  users = ["me", "him"];
const secure = process.env.WOMEN_SECURE_COOKIE === "1";
module.exports = async function (req, res, pathname) {
  if (pathname === "/api/login" && req.method === "POST") {
    const key = req.socket.remoteAddress;
    const a = attempts.get(key) || { n: 0, t: 0 };
    if (a.t > Date.now())
      return send(res, 429, { error: "尝试次数过多，请稍后再试" });
    const body = await getBody(req);
    const row =
      typeof body.user === "string"
        ? db
            .prepare(
              "SELECT u.*,m.slot FROM users u JOIN space_members m ON m.user_id=u.id WHERE u.id=?",
            )
            .get(body.user.trim().toLowerCase())
        : null;
    const salt = row ? row.salt : Buffer.alloc(16);
    const actual = hashPassword(
      typeof body.password === "string" ? body.password.slice(0, 256) : "",
      salt,
    );
    const good = row && crypto.timingSafeEqual(actual, Buffer.from(row.hash));
    if (!good) {
      a.n++;
      if (a.n >= 5) {
        a.n = 0;
        a.t = Date.now() + 60000;
      }
      attempts.set(key, a);
      return send(res, 401, { error: "账号或密码不正确" });
    }
    attempts.delete(key);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 7 * 86400000;
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      sha(token),
      row.id,
      expires,
    );
    return send(
      res,
      200,
      { user: row.slot, account: row.id },
      {
        "Set-Cookie": `women_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure ? "; Secure" : ""}`,
      },
    );
  }
  if (pathname === "/api/register" && req.method === "POST") {
    const registerKey = req.socket.remoteAddress,
      now = Date.now();
    let limit = registrations.get(registerKey);
    if (!limit || limit.until <= now)
      limit = { count: 0, until: now + 3600000 };
    if (limit.count >= 20)
      return send(res, 429, { error: "注册请求过多，请稍后再试" });
    limit.count++;
    registrations.set(registerKey, limit);
    const body = await getBody(req),
      id =
        typeof body.username === "string"
          ? body.username.trim().toLowerCase()
          : "",
      password = body.password;
    if (
      !/^[a-z0-9_]{3,32}$/.test(id) ||
      users.includes(id) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 256
    )
      return send(res, 400, {
        error: "账号须为3至32位字母、数字或下划线，密码须为12至256位",
      });
    const invitation =
      typeof body.invitation === "string" ? body.invitation : "";
    if (invitation && !/^[a-f0-9]{64}$/.test(invitation))
      return send(res, 400, { error: "邀请链接无效" });
    const salt = crypto.randomBytes(16),
      hash = hashPassword(password, salt);
    db.exec("BEGIN IMMEDIATE");
    try {
      if (db.prepare("SELECT 1 FROM users WHERE id=?").get(id)) {
        db.exec("ROLLBACK");
        return send(res, 409, { error: "账号已存在" });
      }
      let spaceId, slot;
      if (invitation) {
        const row = db
          .prepare("SELECT * FROM invitations WHERE token_hash=? AND expires>?")
          .get(sha(invitation), Date.now());
        if (
          !row ||
          db
            .prepare("SELECT count(*) n FROM space_members WHERE space_id=?")
            .get(row.space_id).n !== 1
        ) {
          db.exec("ROLLBACK");
          return send(res, 400, { error: "邀请已失效或空间已满" });
        }
        spaceId = row.space_id;
        const member = db
          .prepare("SELECT slot FROM space_members WHERE space_id=?")
          .get(spaceId);
        slot = member.slot === "me" ? "him" : "me";
        db.prepare("DELETE FROM invitations WHERE space_id=?").run(spaceId);
      } else {
        spaceId = crypto.randomUUID();
        slot = "me";
        db.prepare("INSERT INTO spaces VALUES(?,?)").run(spaceId, Date.now());
      }
      db.prepare("INSERT INTO users VALUES(?,?,?)").run(id, salt, hash);
      db.prepare("INSERT INTO space_members VALUES(?,?,?)").run(
        id,
        spaceId,
        slot,
      );
      db.exec("COMMIT");
      return send(res, 201, { ok: true });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (
    ![
      "/api/session",
      "/api/password",
      "/api/invite",
      "/api/logout",
      "/api/speech/config",
      "/api/speech/transcribe",
    ].includes(pathname)
  )
    return false;
  const s = session(req);
  if (!s) return send(res, 401, { error: "请先登录" });
  if (pathname === "/api/speech/config" && req.method === "GET") {
    try {
      return send(res, 200, await speechService.config());
    } catch {
      return send(res, 503, { error: "语音服务暂不可用，请检查笔记本和连接" });
    }
  }
  if (pathname === "/api/speech/transcribe" && req.method === "POST") {
    try {
      const body = await getBody(req, 8 * 1024 * 1024);
      return send(res, 200, await speechService.transcribe(body.audioBase64));
    } catch (e) {
      return send(res, e.status || 503, {
        error:
          e.message === "语音服务正忙，请稍后再试"
            ? e.message
            : "语音识别失败，请检查录音或稍后重试",
      });
    }
  }
  if (pathname === "/api/session" && req.method === "GET")
    return send(res, 200, {
      user: s.slot,
      account: s.user_id,
      legacySpace: s.space_id === "legacy",
      canInvite:
        db
          .prepare("SELECT count(*) n FROM space_members WHERE space_id=?")
          .get(s.space_id).n === 1,
    });
  if (pathname === "/api/password" && req.method === "POST") {
    const key = "password:" + s.user_id,
      a = attempts.get(key) || { n: 0, t: 0 };
    if (a.t > Date.now())
      return send(res, 429, { error: "尝试次数过多，请稍后再试" });
    const body = await getBody(req),
      current =
        typeof body.currentPassword === "string"
          ? body.currentPassword.slice(0, 256)
          : "",
      next = body.newPassword;
    if (typeof next !== "string" || next.length < 12 || next.length > 256)
      return send(res, 400, { error: "新密码需要 12 至 256 个字符" });
    const row = db
        .prepare("SELECT salt,hash FROM users WHERE id=?")
        .get(s.user_id),
      actual = hashPassword(current, row.salt);
    if (!crypto.timingSafeEqual(actual, Buffer.from(row.hash))) {
      a.n++;
      if (a.n >= 5) {
        a.n = 0;
        a.t = Date.now() + 60000;
      }
      attempts.set(key, a);
      return send(res, 401, { error: "当前密码不正确" });
    }
    attempts.delete(key);
    const salt = crypto.randomBytes(16),
      hash = hashPassword(next, salt);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE users SET salt=?,hash=? WHERE id=?").run(
        salt,
        hash,
        s.user_id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(s.user_id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return send(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie":
          "women_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
      },
    );
  }
  if (pathname === "/api/invite" && req.method === "POST") {
    if (
      db
        .prepare("SELECT count(*) n FROM space_members WHERE space_id=?")
        .get(s.space_id).n !== 1
    )
      return send(res, 409, { error: "两人空间已有两位成员" });
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("DELETE FROM invitations WHERE space_id=?").run(s.space_id);
    db.prepare("INSERT INTO invitations VALUES(?,?,?)").run(
      sha(token),
      s.space_id,
      Date.now() + 86400000,
    );
    return send(res, 200, { token, expiresIn: 86400 });
  }
  if (pathname === "/api/logout" && req.method === "POST") {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha(cookie(req)));
    return send(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie":
          "women_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
      },
    );
  }
  return false;
};

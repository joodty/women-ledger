"use strict";
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
module.exports = async function (req, res, pathname, s) {
  const legacy = s.space_id === "legacy",
    space = s.space_id;
  if (pathname === "/api/redeem" && req.method === "POST") {
    const body = await getBody(req);
    if (
      !["wish", "reward"].includes(body.kind) ||
      typeof body.id !== "string" ||
      !/^[a-z0-9_-]{1,100}$/i.test(body.id) ||
      typeof body.requestId !== "string" ||
      !/^[a-z0-9_-]{1,100}$/i.test(body.requestId)
    )
      return send(res, 400, { error: "兑换请求无效" });
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = legacy
        ? db.prepare("SELECT revision,json FROM state WHERE id=1").get()
        : db
            .prepare("SELECT revision,json FROM space_state WHERE space_id=?")
            .get(space);
      if (!row) {
        db.exec("ROLLBACK");
        return send(res, 400, { error: "还没有账本" });
      }
      const data = JSON.parse(row.json),
        old = data.redemptions.find(
          (r) =>
            r.id === body.requestId || r.confirmRequestId === body.requestId,
        );
      if (old) {
        db.exec("ROLLBACK");
        const actor =
          old.confirmRequestId === body.requestId
            ? old.confirmedBy
            : old.memberId;
        if (
          actor !== s.slot ||
          (body.kind === "wish" ? old.wishId : old.rewardId) !== body.id
        )
          return send(res, 409, { error: "兑换请求编号冲突" });
        if (old.status === "cancelled")
          return send(res, 409, { error: "这次申请已取消，请重新发起" });
        return send(res, 200, {
          revision: row.revision,
          data: visibleState(data, s.slot),
          pending: old.status === "pending",
        });
      }
      const item = (body.kind === "wish" ? data.wishlist : data.rewards).find(
        (x) => x.id === body.id,
      );
      if (
        !item ||
        (body.kind === "wish" && ["redeemed", "done"].includes(item.status))
      ) {
        db.exec("ROLLBACK");
        return send(res, 400, { error: "该内容不存在或已经兑换" });
      }
      const value = String(item.pointsLabel || "").trim(),
        cost = /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 0;
      if (!cost || cost > 10000) {
        db.exec("ROLLBACK");
        return send(res, 400, { error: "请先设置有效的兑换积分" });
      }
      const balance = (slot, wallet) =>
        data.points_ledger
          .filter((p) => p.memberId === slot && walletTag(p) === wallet)
          .reduce((n, p) => n + (Number.isFinite(p.points) ? p.points : 0), 0) -
        data.redemptions
          .filter((r) => r.status !== "pending" && walletTag(r) === wallet)
          .reduce(
            (n, r) => n + (slot === "me" ? r.fromMe || 0 : r.fromHim || 0),
            0,
          );
      const now = new Date(),
        date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
      /* 属于「我们俩」的愿望：一人一半，且要两个人都点头 */
      const existing =
        body.kind === "wish"
          ? data.redemptions.find(
              (r) => r.status === "pending" && r.wishId === item.id,
            )
          : null;
      if (
        existing &&
        ((item.scope || "both") !== "both" ||
          String(existing.label) !== String(cost) ||
          existing.name !== "兑换「" + item.name + "」")
      ) {
        db.exec("ROLLBACK");
        return send(res, 409, {
          error: "愿望内容已更改，请先取消旧申请再重新发起",
        });
      }
      const shared = body.kind === "wish" && (item.scope || "both") === "both";
      /* 单人的愿望只有本人能兑，因为分在他自己的钱包里 */
      if (
        body.kind === "wish" &&
        (item.scope || "both") !== "both" &&
        item.scope !== s.slot
      ) {
        db.exec("ROLLBACK");
        return send(res, 400, { error: "这是对方自己的愿望，要他自己来兑" });
      }
      let waiting = false;
      if (shared) {
        if (cost % 2 !== 0) {
          db.exec("ROLLBACK");
          return send(res, 400, { error: "两个人的兑换，分值要能被 2 整除" });
        }
        const half = cost / 2,
          open = existing;
        if (open && open.memberId === s.slot) {
          db.exec("ROLLBACK");
          return send(res, 409, { error: "已经发出去了，等对方确认" });
        }
        if (open) {
          if (balance("me", "ours") < half || balance("him", "ours") < half) {
            db.exec("ROLLBACK");
            return send(res, 400, {
              error: "说好一人一半，现在两个人的共同分还不够",
            });
          }
          open.fromMe = half;
          open.fromHim = half;
          open.status = "done";
          open.date = date;
          open.confirmedBy = s.slot;
          open.confirmRequestId = body.requestId;
          item.status = "redeemed";
        } else {
          if (balance(s.slot, "ours") < half) {
            db.exec("ROLLBACK");
            return send(res, 400, { error: "你的共同分还不够付这一半" });
          }
          data.redemptions.push({
            id: body.requestId,
            memberId: s.slot,
            date,
            name: "兑换「" + item.name + "」",
            wishId: item.id,
            fromMe: 0,
            fromHim: 0,
            label: String(cost),
            wallet: "ours",
            status: "pending",
          });
          waiting = true;
        }
      } else {
        if (balance(s.slot, "mine") < cost) {
          db.exec("ROLLBACK");
          return send(res, 400, { error: "积分不足，暂时不能兑换" });
        }
        data.redemptions.push({
          id: body.requestId,
          memberId: s.slot,
          date,
          name: "兑换「" + item.name + "」",
          wishId: body.kind === "wish" ? item.id : undefined,
          rewardId: body.kind === "reward" ? item.id : undefined,
          fromMe: s.slot === "me" ? cost : 0,
          fromHim: s.slot === "him" ? cost : 0,
          label: String(cost),
          wallet: "mine",
          status: "done",
        });
        if (body.kind === "wish") item.status = "redeemed";
      }
      const at = now.toISOString(),
        revision = row.revision + 1;
      if (legacy) {
        db.prepare(
          "INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)",
        ).run(row.revision, row.json, at);
        db.prepare(
          "UPDATE state SET revision=?,json=?,updated_at=? WHERE id=1",
        ).run(revision, JSON.stringify(data), at);
        db.prepare(
          "DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)",
        ).run();
      } else {
        db.prepare(
          "INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)",
        ).run(space, row.revision, row.json, at);
        db.prepare(
          "UPDATE space_state SET revision=?,json=?,updated_at=? WHERE space_id=?",
        ).run(revision, JSON.stringify(data), at, space);
        db.prepare(
          "DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)",
        ).run(space, space);
      }
      db.exec("COMMIT");
      return send(res, 200, {
        revision,
        data: visibleState(data, s.slot),
        pending: waiting,
      });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  if (pathname === "/api/redeem/cancel" && req.method === "POST") {
    const body = await getBody(req);
    if (typeof body.id !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(body.id))
      return send(res, 400, { error: "申请编号无效" });
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = legacy
        ? db.prepare("SELECT revision,json FROM state WHERE id=1").get()
        : db
            .prepare("SELECT revision,json FROM space_state WHERE space_id=?")
            .get(space);
      if (!row) {
        db.exec("ROLLBACK");
        return send(res, 404, { error: "没有找到申请" });
      }
      const data = JSON.parse(row.json),
        request = data.redemptions.find((r) => r.id === body.id);
      if (!request) {
        db.exec("ROLLBACK");
        return send(res, 404, { error: "没有找到申请" });
      }
      if (request.status === "cancelled") {
        db.exec("ROLLBACK");
        return send(res, 200, {
          revision: row.revision,
          data: visibleState(data, s.slot),
        });
      }
      if (request.status !== "pending") {
        db.exec("ROLLBACK");
        return send(res, 409, { error: "申请已完成，不能取消" });
      }
      request.status = "cancelled";
      request.cancelledBy = s.slot;
      const at = new Date().toISOString(),
        revision = row.revision + 1;
      if (legacy) {
        db.prepare(
          "INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)",
        ).run(row.revision, row.json, at);
        db.prepare(
          "UPDATE state SET revision=?,json=?,updated_at=? WHERE id=1",
        ).run(revision, JSON.stringify(data), at);
        db.prepare(
          "DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)",
        ).run();
      } else {
        db.prepare(
          "INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)",
        ).run(space, row.revision, row.json, at);
        db.prepare(
          "UPDATE space_state SET revision=?,json=?,updated_at=? WHERE space_id=?",
        ).run(revision, JSON.stringify(data), at, space);
        db.prepare(
          "DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)",
        ).run(space, space);
      }
      db.exec("COMMIT");
      return send(res, 200, { revision, data: visibleState(data, s.slot) });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return false;
};

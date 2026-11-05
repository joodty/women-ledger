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
  if (pathname === "/api/history" && req.method === "GET") {
    const list = legacy
      ? db
          .prepare(
            "SELECT id,revision,created_at FROM snapshots ORDER BY id DESC LIMIT 20",
          )
          .all()
      : db
          .prepare(
            "SELECT id,revision,created_at FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 20",
          )
          .all(space);
    return send(res, 200, { items: list });
  }
  if (/^\/api\/history\/\d+$/.test(pathname) && req.method === "GET") {
    const id = Number(pathname.split("/").pop());
    const row = legacy
      ? db
          .prepare("SELECT revision,json,created_at FROM snapshots WHERE id=?")
          .get(id)
      : db
          .prepare(
            "SELECT revision,json,created_at FROM space_snapshots WHERE space_id=? AND id=?",
          )
          .get(space, id);
    return row
      ? send(res, 200, {
          revision: row.revision,
          createdAt: row.created_at,
          data: visibleHistory(JSON.parse(row.json), s.slot),
        })
      : send(res, 404, { error: "没有找到此版本" });
  }
  if (pathname === "/api/state" && req.method === "GET") {
    const row = legacy
      ? db.prepare("SELECT revision,json FROM state WHERE id=1").get()
      : db
          .prepare("SELECT revision,json FROM space_state WHERE space_id=?")
          .get(space);
    return send(
      res,
      200,
      row
        ? {
            revision: row.revision,
            data: visibleState(JSON.parse(row.json), s.slot),
          }
        : { revision: 0, data: null },
    );
  }
  if (pathname === "/api/state" && req.method === "POST") {
    const body = await getBody(req);
    if (!Number.isSafeInteger(body.revision) || !validState(body.data))
      return send(res, 400, { error: "数据格式无效" });
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = legacy
          ? db.prepare("SELECT revision,json FROM state WHERE id=1").get()
          : db
              .prepare("SELECT revision,json FROM space_state WHERE space_id=?")
              .get(space),
        current = row ? row.revision : 0;
      /* 奖励已经整块删掉了：老客户端还会把 rewards 带上，收下但直接丢掉，不入库 */
      delete body.data.rewards;
      let data = body.data,
        merged = false;
      const fullCurrent = row ? JSON.parse(row.json) : null;
      let baseFull = fullCurrent;
      if (current !== body.revision) {
        const base = legacy
          ? db
              .prepare(
                "SELECT json FROM snapshots WHERE revision=? ORDER BY id DESC LIMIT 1",
              )
              .get(body.revision)
          : db
              .prepare(
                "SELECT json FROM space_snapshots WHERE space_id=? AND revision=? ORDER BY id DESC LIMIT 1",
              )
              .get(space, body.revision);
        if (!base || !row) {
          db.exec("ROLLBACK");
          return send(res, 409, {
            error: "原版本已过期，请先处理冲突",
            revision: current,
          });
        }
        baseFull = JSON.parse(base.json);
      }
      try {
        const base = baseFull
          ? visibleState(baseFull, s.slot)
          : { entries: [], goals: [], points_ledger: [], redemptions: [] };
        protectPersonal(base, data, s.slot);
        if (
          !equal(base.points_ledger, data.points_ledger) ||
          !equal(base.redemptions, data.redemptions)
        )
          throw Error("积分由服务端处理");
        if (current !== body.revision) {
          data = mergeValue(base, data, visibleState(fullCurrent, s.slot));
          merged = true;
        }
        if (fullCurrent) {
          for (const key of ["entries", "goals"]) {
            const hidden = fullCurrent[key].filter(
              (x) => x.memberId !== s.slot && x.visibility === "private",
            );
            const ids = new Set(data[key].map((x) => x.id));
            if (hidden.some((x) => ids.has(x.id)))
              throw Error("duplicate hidden item");
            data[key].push(...hidden);
          }
          const shown = new Set(
            visibleState(fullCurrent, s.slot).milestones.map((x) => x.id),
          );
          const hidden = fullCurrent.milestones.filter((x) => !shown.has(x.id));
          const ids = new Set(data.milestones.map((x) => x.id));
          if (hidden.some((x) => ids.has(x.id)))
            throw Error("duplicate hidden milestone");
          data.milestones.push(...hidden);
        }
        reconcilePoints(fullCurrent, data);
        if (!validState(data)) throw Error("invalid merge");
      } catch (e) {
        db.exec("ROLLBACK");
        return send(res, 409, {
          error:
            e.message === "已兑换积分，无法撤回该打卡"
              ? e.message
              : "内容冲突或无权修改对方的记录，请先处理",
          revision: current,
        });
      }
      const now = new Date().toISOString();
      if (row) {
        if (legacy)
          db.prepare(
            "INSERT INTO snapshots(revision,json,created_at) VALUES(?,?,?)",
          ).run(row.revision, row.json, now);
        else
          db.prepare(
            "INSERT INTO space_snapshots(space_id,revision,json,created_at) VALUES(?,?,?,?)",
          ).run(space, row.revision, row.json, now);
      }
      const rev = current + 1;
      if (legacy) {
        db.prepare(
          "INSERT INTO state(id,revision,json,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at",
        ).run(rev, JSON.stringify(data), now);
        db.prepare(
          "DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 100)",
        ).run();
      } else {
        db.prepare(
          "INSERT INTO space_state(space_id,revision,json,updated_at) VALUES(?,?,?,?) ON CONFLICT(space_id) DO UPDATE SET revision=excluded.revision,json=excluded.json,updated_at=excluded.updated_at",
        ).run(space, rev, JSON.stringify(data), now);
        db.prepare(
          "DELETE FROM space_snapshots WHERE space_id=? AND id NOT IN (SELECT id FROM space_snapshots WHERE space_id=? ORDER BY id DESC LIMIT 100)",
        ).run(space, space);
      }
      db.exec("COMMIT");
      return send(res, 200, {
        revision: rev,
        data: visibleState(data, s.slot),
      });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return false;
};

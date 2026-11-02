"use strict";
/* 记一笔也发分：每条 1 分，每人每天最多 3 条。
   只对生效日之后的记录生效，避免把历史记录一次性补成一大笔分。 */
/* 记一笔曾经发过分，2026-11-02 之后取消：奖励「记录」这个动作没有意义，
   而且写什么都行、无法核实。历史分保留，不追溯扣除。 */
const ENTRY_POINTS_SINCE = "2026-11-02",
  ENTRY_POINTS_UNTIL = "2026-11-02",
  ENTRY_POINTS_PER = 1,
  ENTRY_POINTS_DAILY = 3;
/* 每周保底：这一周做到过至少一个约定，就再给 3 分，免得一分开不出来。
   从 2026-11-02 那一周起算，更早的周不补。 */
const WEEK_FLOOR = 3,
  WEEK_FLOOR_SINCE = "2026-11-02";
/* 钱包：旧记录没有 wallet 字段，一律算个人分 */
const walletTag = (x) => (x && x.wallet === "ours" ? "ours" : "mine");
function reconcilePoints(before, after) {
  const oldEntries = new Map((before?.entries || []).map((e) => [e.id, e]));
  const oldAwards = new Map(
    (before?.points_ledger || [])
      .filter((p) => p.type === "checkin" && p.entryId)
      .map((p) => [p.entryId, p]),
  );
  const goals = new Map(after.goals.map((g) => [g.id, g]));
  const ledger = (before?.points_ledger || []).filter(
    (p) =>
      !((p.type === "checkin" || p.type === "entry") && p.entryId) &&
      p.type !== "week",
  );
  /* 目标打卡：共同目标谁打卡都能计入（分记在打卡人自己名下） */
  for (const e of after.entries) {
    const previous = oldEntries.get(e.id),
      old = oldAwards.get(e.id);
    let award = null;
    if (
      previous &&
      previous.goalId === e.goalId &&
      previous.memberId === e.memberId
    )
      award = old || null;
    else if (e.goalId) {
      const goal = goals.get(e.goalId),
        amount = goal?.pointsPerCheckin,
        shared = goal?.scope === "both";
      if (
        goal &&
        (shared || goal.memberId === e.memberId) &&
        goal.joined !== false &&
        goal.status === "active" &&
        Number.isSafeInteger(amount) &&
        amount > 0 &&
        amount <= 10000
      )
        award = {
          id: "checkin-" + e.id,
          entryId: e.id,
          memberId: e.memberId,
          type: "checkin",
          wallet: shared ? "ours" : "mine",
          points: amount,
          date: e.date,
          note: shared ? "共同目标打卡" : "目标打卡",
        };
    }
    if (award) {
      award.wallet = walletTag(award);
      ledger.push(award);
    }
  }
  /* 记一笔：不进目标的那种，按天取前 3 条各 1 分 */
  const days = new Map();
  for (const e of after.entries) {
    if (
      e.goalId ||
      String(e.date || "") < ENTRY_POINTS_SINCE ||
      String(e.date || "") > ENTRY_POINTS_UNTIL
    )
      continue;
    const key = e.memberId + "|" + e.date;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(e);
  }
  for (const [key, list] of days) {
    list.sort(
      (a, b) =>
        String(a.start || "").localeCompare(String(b.start || "")) ||
        String(a.id).localeCompare(String(b.id)),
    );
    const memberId = key.slice(0, key.indexOf("|"));
    for (const e of list.slice(0, ENTRY_POINTS_DAILY))
      ledger.push({
        id: "entry-" + e.id,
        entryId: e.id,
        memberId,
        type: "entry",
        wallet: "mine",
        points: ENTRY_POINTS_PER,
        date: e.date,
        note: "记一笔",
      });
  }
  /* 周保底：按周一算一周，一个成员这周做到过至少一个约定就 +3，记在自己的钱包 */
  const weekFloor = new Set();
  for (const p of ledger) {
    if (
      p.type !== "checkin" ||
      !p.memberId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ""))
    )
      continue;
    const ms = Date.parse(p.date + "T00:00:00Z"),
      start = new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86400000)
        .toISOString()
        .slice(0, 10);
    if (start < WEEK_FLOOR_SINCE) continue;
    weekFloor.add(p.memberId + "|" + start);
  }
  for (const key of [...weekFloor].sort()) {
    const cut = key.indexOf("|"),
      memberId = key.slice(0, cut),
      week = key.slice(cut + 1);
    ledger.push({
      id: "week-" + memberId + "-" + week,
      memberId,
      type: "week",
      wallet: "mine",
      points: WEEK_FLOOR,
      date: week,
      note: "本周约定保底",
    });
  }
  after.points_ledger = ledger;
  for (const slot of ["me", "him"])
    for (const wallet of ["mine", "ours"]) {
      const earned = ledger
        .filter((p) => p.memberId === slot && walletTag(p) === wallet)
        .reduce((n, p) => n + (Number.isFinite(p.points) ? p.points : 0), 0);
      const spent = after.redemptions
        .filter((r) => r.status !== "pending" && walletTag(r) === wallet)
        .reduce(
          (n, r) => n + (slot === "me" ? r.fromMe || 0 : r.fromHim || 0),
          0,
        );
      if (earned < spent) throw Error("已兑换积分，无法撤回该打卡");
    }
}
module.exports = { reconcilePoints, walletTag };

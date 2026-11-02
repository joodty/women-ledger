"use strict";
const { fail } = require("../errors.cjs");
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
function text(value, max = 200, empty = false) {
  fail(
    typeof value === "string" &&
      (empty || value.trim().length > 0) &&
      value.length <= max,
    "validation",
    "请检查文字内容和长度",
  );
  return value.trim();
}
function id(value) {
  fail(
    typeof value === "string" && /^[a-z0-9_-]{1,100}$/i.test(value),
    "validation",
    "记录编号无效",
  );
  return value;
}
function date(value) {
  fail(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)),
    "validation",
    "日期无效",
  );
  return value;
}
function own(item, slot) {
  fail(item && item.memberId === slot, "forbidden", "只能修改自己的内容", 403);
}
function visibility(v) {
  fail(["private", "shared"].includes(v), "validation", "请选择可见范围");
  return v;
}
function goalFields(p) {
  const kind = p.kind === "once" ? "once" : "repeat",
    cap = kind === "once" ? 30 : 5,
    points = Number(p.pointsPerCheckin),
    times = Number(p.timesPerWeek || 1);
  fail(
    Number.isSafeInteger(points) &&
      points > 0 &&
      points <= cap &&
      Number.isSafeInteger(times) &&
      times >= 1 &&
      times <= 21,
    "validation",
    "请检查约定的次数和积分",
  );
  const scope = p.scope === "both" ? "both" : "me";
  fail(
    !p.reminderTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(p.reminderTime),
    "validation",
    "提醒时间无效",
  );
  return {
    name: text(p.name),
    kind,
    pointsPerCheckin: points,
    timesPerWeek: kind === "once" ? 1 : times,
    scope,
    visibility:
      scope === "both" ? "shared" : visibility(p.visibility || "private"),
    categoryId: p.categoryId || "growth",
    keywords: [],
    reminderTime: p.reminderTime || "",
    icon: p.icon || "target",
  };
}

module.exports = { today, text, id, date, own, visibility, goalFields };

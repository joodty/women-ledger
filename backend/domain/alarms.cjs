"use strict";
const { db } = require("../database.cjs");
const { fail } = require("../errors.cjs");
const { id } = require("./validation.cjs");
const audio = require("../alarm-audio.cjs");

const tones = ["gentle", "bright", "rising"];
function fields(p, session) {
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(p.date || "")
    && new Date(p.date + "T00:00:00Z");
  fail(
    typeof p.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time) &&
    Array.isArray(p.days) && p.days.length <= 7 &&
    new Set(p.days).size === p.days.length &&
    p.days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) &&
    (p.days.length || (calendarDate && Number.isFinite(+calendarDate) &&
      calendarDate.toISOString().slice(0, 10) === p.date &&
      Date.parse(p.date + "T" + p.time + ":00+08:00") > Date.now())) &&
    (tones.includes(p.tone) || p.tone === "custom") &&
    typeof p.note === "string" && p.note.length <= 200,
    "validation", "请检查日期、时间、铃声和留言",
  );
  if (p.tone === "custom")
    fail(audio.owns(session, p.clipId), "validation", "请选择你自己上传的铃声");
  return { time: p.time, days: p.days.slice().sort(), date: p.days.length ? "" : p.date,
    tone: p.tone, note: p.note.trim(), ...(p.tone === "custom" ? { clipId: p.clipId } : {}) };
}
module.exports = function ({ data, p, type, slot, session, find, version, create }) {
  if (!["alarm.create", "alarm.update", "alarm.pause", "alarm.delete"].includes(type)) return false;
  data.wake_alarms ??= [];
  if (type === "alarm.create") {
    const target = slot === "me" ? "him" : "me";
    fail(db.prepare("SELECT 1 FROM space_members WHERE space_id=? AND slot=?")
      .get(session.space_id, target), "validation", "请先绑定两人空间");
    fail(data.wake_alarms.length < 40, "validation", "最多保留 40 个闹钟");
    create("wake_alarms", { id: id(p.id), memberId: slot, target, ...fields(p, session), enabled: true });
    return true;
  }
  const alarm = find("wake_alarms");
  const currentVersion = version("wake_alarms", alarm);
  if (type === "alarm.update") {
    fail(alarm.memberId === slot, "forbidden", "只有设置人能修改时间", 403);
    const next = fields(p, session);
    if (next.clipId && !alarm.clipId && alarm.enabled)
      alarm.legacy = { ...alarm, version: currentVersion };
    if (!next.clipId) {
      delete alarm.clipId;
      delete alarm.legacy;
    }
    Object.assign(alarm, next, { enabled: true });
  } else {
    // Both members can stop an alarm. Removing it cannot create a new ring.
    if (type === "alarm.delete") {
      const receipt = db.prepare(`SELECT status,version FROM wake_alarm_receipts
        WHERE space_id=? AND alarm_id=?`).get(session.space_id, alarm.id);
      fail(receipt?.version === currentVersion &&
        ["paused", "expired"].includes(receipt.status), "validation", "请先等待手机确认暂停");
      data.wake_alarms = data.wake_alarms.filter((x) => x !== alarm);
      db.prepare("DELETE FROM wake_alarm_receipts WHERE space_id=? AND alarm_id=?")
        .run(session.space_id, alarm.id);
    } else {
      alarm.enabled = false;
      delete alarm.legacy;
    }
  }
  return true;
};

"use strict";
const { fail } = require("../errors.cjs");
const {
  today,
  text,
  id,
  date,
  own,
  visibility,
  goalFields,
} = require("./validation.cjs");
module.exports = function ({
  data,
  p,
  type,
  slot,
  session,
  find,
  version,
  create,
}) {
  switch (type) {
    case "backup.restoreOwn": {
      const backup = p.backup;
      fail(
        backup &&
          backup.format === "women-ledger-v2" &&
          backup.account === session.user_id &&
          backup.slot === slot &&
          backup.data?.version === 4,
        "validation",
        "请选择当前账号导出的新版备份",
      );
      for (const key of ["entries", "goals", "story_entries"]) {
        fail(Array.isArray(backup.data[key]), "validation", "备份内容无效");
        for (const item of backup.data[key]) {
          if (item.memberId !== slot || data[key].some((x) => x.id === item.id))
            continue;
          id(item.id);
          if (key === "entries") {
            text(item.content, 10000);
            date(item.date);
            fail(
              /^([01]\d|2[0-3]):[0-5]\d$/.test(item.start) &&
                /^([01]\d|2[0-3]):[0-5]\d$/.test(item.end),
              "validation",
              "备份中的时间无效",
            );
            visibility(item.visibility || "shared");
            item.goalId = null;
          }
          if (key === "goals") {
            goalFields(item);
            item.reminderTime = "";
          }
          if (key === "story_entries") {
            text(item.text, 10000);
            item.seq =
              Math.max(
                0,
                ...data.story_entries.map((x) => Number(x.seq) || 0),
              ) + 1;
          }
          data[key].push(structuredClone(item));
        }
      }
      break;
    }

    default:
      return false;
  }
  return true;
};

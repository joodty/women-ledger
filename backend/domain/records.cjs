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
    case "record.create":
    case "record.update": {
      let old = null;
      if (type === "record.update") {
        old = find("entries");
        own(old, slot);
        version("entries", old);
      }
      const start = text(p.start, 5),
        end = text(p.end, 5);
      fail(
        /^([01]\d|2[0-3]):[0-5]\d$/.test(start) &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(end),
        "validation",
        "时间无效",
      );
      const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
      const minutes = (mins(end) - mins(start) + 1440) % 1440;
      /* 从约定上点「记一次」只回答「今天做了没有」，不填时间，所以允许 0 分钟；
         手写的记录仍然必须有真实时长，否则时间分布会被一堆 0 分钟灌满 */
      fail(
        minutes > 0 || (minutes === 0 && p.goalId),
        "validation",
        "开始和结束时间不能相同",
      );
      const g = p.goalId ? data.goals.find((g) => g.id === p.goalId) : null;
      if (p.goalId)
        fail(
          g &&
            (old?.goalId === g.id ||
              (!g.deleted &&
                g.status === "active" &&
                g.joined !== false &&
                (g.memberId === slot || g.scope === "both"))),
          "validation",
          "请选择有效的约定",
        );
      if (g?.kind === "once")
        fail(
          !data.entries.some(
            (e) => e.memberId === slot && e.goalId === g.id && e.id !== old?.id,
          ),
          "validation",
          "这个一次性约定已经完成过了",
        );
      /* 每天每个约定只打一次卡。打一次就是「今天做了」，再点一次不代表多做了，
         只会凭空多一分。要改时长就去改那条记录，不是再打一次。 */
      if (type === "record.create" && g && g.kind !== "once") {
        const day = date(p.date || today());
        fail(
          !data.entries.some(
            (e) =>
              e.memberId === slot && e.goalId === g.id && e.date === day,
          ),
          "validation",
          "今天已经为这个约定打过卡了",
        );
      }
      const entry = {
        ...(old || {}),
        id: id(p.id),
        memberId: slot,
        date: date(p.date || today()),
        start,
        end,
        minutes,
        content: text(p.content, 10000),
        note: text(p.note || "", 10000, true),
        categoryId: p.categoryId || null,
        happy: p.happy == null || p.happy === "" ? null : Number(p.happy),
        goalId: g?.id || null,
        visibility: visibility(p.visibility || "shared"),
      };
      fail(
        entry.happy === null ||
          (Number.isInteger(entry.happy) &&
            entry.happy >= 1 &&
            entry.happy <= 5),
        "validation",
        "心情分值无效",
      );
      if (old) Object.assign(old, entry);
      else create("entries", entry);
      break;
    }
    case "record.delete": {
      const item = find("entries");
      own(item, slot);
      version("entries", item);
      data.entries = data.entries.filter((x) => x.id !== item.id);
      break;
    }

    default:
      return false;
  }
  return true;
};

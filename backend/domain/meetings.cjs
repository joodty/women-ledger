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
    case "meeting.delete":
    case "milestone.delete": {
      const item = find("milestones");
      fail(
        type === "meeting.delete" ? item.kind === "meet" : item.kind !== "goal",
        "validation",
        "这项内容需要从对应的约定中管理",
      );
      version("milestones", item);
      data.milestones = data.milestones.filter((x) => x.id !== item.id);
      break;
    }
    case "meeting.save": {
      const old = p.id ? data.milestones.find((m) => m.id === p.id) : null;
      if (old) version("milestones", old);
      const value = {
        id: id(p.id),
        kind: "meet",
        date: date(p.date),
        title: text(p.title || "见面"),
        note: text(p.note || "", 10000, true),
        plan: text(p.note || "", 10000, true),
      };
      if (old) Object.assign(old, value);
      else create("milestones", value);
      break;
    }

    default:
      return false;
  }
  return true;
};

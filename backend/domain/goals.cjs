"use strict";
const { fail } = require("../errors.cjs");
const {
  today,
  text,
  id,
  date,
  ownOrShared,
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
    case "goal.create": {
      const fields = goalFields(p);
      if (fields.scope !== "both")
        fail(
          data.goals.filter(
            (g) =>
              g.memberId === slot &&
              g.scope !== "both" &&
              g.status === "active" &&
              !g.deleted,
          ).length < 3,
          "validation",
          "最多同时保留三个个人约定",
        );
      create("goals", {
        id: id(p.id),
        memberId: slot,
        ...fields,
        status: "active",
        joined: fields.scope !== "both",
      });
      break;
    }
    case "goal.update": {
      const item = find("goals");
      ownOrShared(item, slot);
      version("goals", item);
      const fields = goalFields(p);
      /* 共同的约定谁都能改，但改的只能是内容 —— 不能把两个人一起做的事改成只剩一个人 */
      if (item.memberId !== slot) fields.scope = "both";
      Object.assign(item, fields);
      break;
    }
    case "goal.join": {
      const item = find("goals");
      fail(
        item.scope === "both" &&
          item.visibility !== "private" &&
          item.memberId !== slot,
        "forbidden",
        "这条约定不需要你加入",
        403,
      );
      item.joined = true;
      break;
    }
    case "goal.archive": {
      const item = find("goals");
      ownOrShared(item, slot);
      version("goals", item);
      /* active 用来把归档过的约定放回「正在进行」 */
      fail(
        ["active", "done", "dropped"].includes(p.status),
        "validation",
        "归档状态无效",
      );
      item.status = p.status;
      /* 放回正在进行 ＝ 这是我自己决定的，别再被自动归档逻辑认领 */
      if (p.status === "active") item.autoDone = false;
      break;
    }
    case "goal.delete": {
      const item = find("goals");
      ownOrShared(item, slot);
      version("goals", item);
      // Keep the goal behind existing check-ins so deletion cannot erase earned points.
      item.deleted = true;
      item.status = "dropped";
      break;
    }

    default:
      return false;
  }
  return true;
};

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
    case "wish.delete": {
      const item = find("wishlist");
      fail(
        !["me", "him"].includes(item.scope) || item.scope === slot,
        "forbidden",
        "只能删除自己的个人愿望",
        403,
      );
      version("wishlist", item);
      fail(
        !data.redemptions.some(
          (r) => r.status === "pending" && r.wishId === item.id,
        ),
        "validation",
        "这项内容还有兑换申请，请先取消申请再删除",
      );
      item.deleted = true;
      break;
    }
    case "wish.save": {
      const old = data.wishlist.find((x) => x.id === p.id);
      fail(!old?.deleted, "not_found", "这项内容已删除", 404);
      fail(
        !old || !["me", "him"].includes(old.scope) || old.scope === slot,
        "forbidden",
        "只能修改自己的个人愿望",
        403,
      );
      if (old) version("wishlist", old);
      const label = String(p.pointsLabel || "待定").trim();
      fail(
        label === "待定" ||
          (/^[1-9]\d{0,4}$/.test(label) && Number(label) <= 10000),
        "validation",
        "请输入 1–10000 的积分或待定",
      );
      const scope = ["me", "him", "both"].includes(p.scope) ? p.scope : "both";
      const value = {
        ...(old || {}),
        id: id(p.id),
        name: text(p.name),
        pointsLabel: label,
        scope,
        executor: ["me", "him", "both"].includes(p.executor)
          ? p.executor
          : "both",
        executorLabel: "我们一起",
        icon: p.icon || "star",
        cat: p.cat || "together",
        status: old?.status || "saving",
      };
      if (old) Object.assign(old, value);
      else create("wishlist", value);
      break;
    }
    case "wish.complete": {
      const item = find("wishlist");
      version("wishlist", item);
      fail(
        item.pointsLabel === "待定" ||
          !Number(item.pointsLabel) ||
        item.status === "redeemed",
        "validation",
        "需要先兑换这个愿望",
      );
      item.status = "done";
      break;
    }

    default:
      return false;
  }
  return true;
};

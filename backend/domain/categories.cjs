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
    case "category.delete": {
      const item = find("categories");
      fail(item.id !== "none", "validation", "未分类是系统分类，不能删除");
      version("categories", item);
      for (const list of [data.entries, data.goals])
        for (const row of list)
          if (row.categoryId === item.id) row.categoryId = "none";
      data.categories = data.categories.filter((x) => x.id !== item.id);
      break;
    }
    case "category.save": {
      const old = data.categories.find((c) => c.id === p.id);
      if (old) version("categories", old);
      fail(p.id !== "none", "validation", "未分类不能修改");
      fail(/^#[0-9a-f]{6}$/i.test(p.color), "validation", "颜色无效");
      const value = {
        id: id(p.id),
        name: text(p.name, 20),
        desc: text(p.desc || "", 200, true),
        color: p.color,
      };
      if (old) Object.assign(old, value);
      else
        data.categories.splice(
          Math.max(0, data.categories.length - 1),
          0,
          value,
        );
      break;
    }
    case "category.move": {
      const item = find("categories");
      version("categories", item);
      const i = data.categories.indexOf(item),
        j = i + (p.direction === "up" ? -1 : 1);
      fail(
        item.id !== "none" &&
          j >= 0 &&
          j < data.categories.length &&
          data.categories[j].id !== "none",
        "validation",
        "不能再移动",
      );
      [data.categories[i], data.categories[j]] = [
        data.categories[j],
        data.categories[i],
      ];
      break;
    }

    default:
      return false;
  }
  return true;
};

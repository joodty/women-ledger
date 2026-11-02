"use strict";
const { fail } = require("../errors.cjs");
const { id } = require("./validation.cjs");
const handlers = [
  require("./records.cjs"),
  require("./goals.cjs"),
  require("./stories.cjs"),
  require("./profiles.cjs"),
  require("./wishes.cjs"),
  require("./categories.cjs"),
  require("./meetings.cjs"),
  require("./imports.cjs"),
  require("./redemptions.cjs"),
];
function apply(data, command, session, versions) {
  const { type, payload: p } = command,
    slot = session.slot;
  fail(
    p && typeof p === "object" && !Array.isArray(p),
    "validation",
    "操作内容无效",
  );
  function find(collection) {
    const item = data[collection].find((x) => x.id === id(p.id));
    fail(item && !item.deleted, "not_found", "这条内容已经不存在", 404);
    return item;
  }
  function version(collection, item) {
    const actual = versions[collection]?.[item.id];
    fail(
      command.expectedVersion === actual,
      "conflict",
      "这条内容已在另一端更新，请核对后再保存",
      409,
      { collection, id: item.id, current: item, version: actual },
    );
  }
  function create(collection, item) {
    fail(
      !data[collection].some((x) => x.id === id(item.id)),
      "conflict",
      "记录编号已经存在",
      409,
    );
    data[collection].push(item);
  }
  const ctx = { data, p, type, slot, session, find, version, create };
  for (const handler of handlers) if (handler(ctx)) return data;
  fail(false, "validation", "不支持这个操作");
}
module.exports = { apply };

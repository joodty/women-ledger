"use strict";
const { fail } = require("../errors.cjs");
module.exports = function ({ data, type, slot, find, version }) {
  if (type !== "redemption.reverse") return false;
  const item = find("redemptions");
  const shared = item.wallet === "ours";
  fail(
    shared || item.memberId === slot,
    "forbidden",
    "只能撤销自己的个人兑换",
    403,
  );
  if (item.status === "reversed") return true;
  version("redemptions", item);
  fail(
    !["pending", "cancelled"].includes(item.status),
    "validation",
    "待确认申请请使用取消申请",
  );
  if (shared && !item.reverseRequestedBy) {
    item.reverseRequestedBy = slot;
    return true;
  }
  if (shared && item.reverseRequestedBy === slot) return true;
  item.status = "reversed";
  item.reversedBy = slot;
  item.reversedAt = new Date().toISOString();
  const wish = data.wishlist.find((w) => w.id === item.wishId);
  if (wish && !wish.deleted) wish.status = "saving";
  return true;
};

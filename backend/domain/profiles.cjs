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
    case "profile.update": {
      const item = data.members.find((m) => m.id === slot);
      version("members", item);
      item.name = text(p.name, 200);
      if (p.avatar !== undefined) {
        fail(
          p.avatar === null ||
            (typeof p.avatar === "string" &&
              p.avatar.length < 500000 &&
              /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
                p.avatar,
              )),
          "validation",
          "头像图片无效",
        );
        item.avatar = p.avatar;
      }
      break;
    }
    case "couple.update":
      version("settings", { id: "couple" });
      if (p.since !== undefined) {
        date(p.since);
        fail(p.since <= today(), "validation", "起始日期不能晚于今天");
        data.couple.since = p.since;
      }
      if (typeof p.shareOpen === "boolean") data.couple.shareOpen = p.shareOpen;
      break;

    default:
      return false;
  }
  return true;
};

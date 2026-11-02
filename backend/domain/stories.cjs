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
    case "story.publish":
      create("story_entries", {
        id: id(p.id),
        memberId: slot,
        text: text(p.text, 10000),
        date: today(),
        seq:
          Math.max(0, ...data.story_entries.map((x) => Number(x.seq) || 0)) + 1,
      });
      break;

    default:
      return false;
  }
  return true;
};

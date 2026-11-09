"use strict";
function seed(members) {
  return {
    version: 4,
    couple: {
      since: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Shanghai",
      }),
      shareOpen: true,
    },
    members: ["me", "him"].map((id) => ({
      id,
      name: members.find((m) => m.slot === id)?.user_id || "待加入",
      side: id === "me" ? "pink" : "blue",
      avatar: null,
    })),
    categories: [
      ["health", "健康", "#E9C9A3"],
      ["career", "事业", "#A7C7EC"],
      ["growth", "成长", "#A8CF9F"],
      ["relate", "关系", "#F2A6AC"],
      ["life", "生活", "#C3A6EA"],
      ["leisure", "休闲", "#93D2CE"],
      ["none", "未分类", "#D8D5D2"],
    ].map(([id, name, color]) => ({ id, name, color })),
    entries: [],
    goals: [],
    weekly_settlements: [],
    points_ledger: [],
    wishlist: [],
    story_entries: [],
    milestones: [],
    redemptions: [],
    wake_alarms: [],
    sparks: [
      "她把信纸折成一只小鸟，放进雨后的水洼。",
      "那天风很大，他们约好下次见。",
    ],
  };
}
module.exports = { seed };

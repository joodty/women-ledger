"use strict";
function validState(s) {
  const arrays = [
    "members",
    "categories",
    "entries",
    "goals",
    "weekly_settlements",
    "points_ledger",
    "wishlist",
    "story_entries",
    "milestones",
    "redemptions",
    "sparks",
  ];
  return !!(
    s &&
    s.version === 4 &&
    s.couple &&
    typeof s.couple === "object" &&
    arrays.every((k) => Array.isArray(s[k]) && s[k].length <= 100000) &&
    s.members.length === 2 &&
    s.members.every(
      (m) => m && typeof m.name === "string" && m.name.length <= 200,
    ) &&
    s.categories.some((c) => c && c.id === "none") &&
    ["entries", "goals", "points_ledger", "story_entries", "redemptions"].every(
      (k) => s[k].every((x) => x && ["me", "him"].includes(x.memberId)),
    ) &&
    s.entries.every(
      (x) =>
        typeof x.content === "string" &&
        typeof x.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
        typeof x.start === "string" &&
        typeof x.end === "string",
    ) &&
    s.goals.every((x) => Array.isArray(x.keywords)) &&
    typeof s.couple.since === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.couple.since) &&
    s.members.some((m) => m.id === "me") &&
    s.members.some((m) => m.id === "him") &&
    s.members.every(
      (m) =>
        m &&
        (!m.avatar ||
          (typeof m.avatar === "string" &&
            /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
              m.avatar,
            ))),
    ) &&
    s.categories.every(
      (c) =>
        c &&
        typeof c.color === "string" &&
        /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.color),
    ) &&
    arrays
      .filter((k) => k !== "sparks")
      .every((k) =>
        s[k].every(
          (item) =>
            item &&
            typeof item === "object" &&
            (!("id" in item) ||
              (typeof item.id === "string" &&
                /^[a-z0-9_-]{1,100}$/i.test(item.id))),
        ),
      )
  );
}
// A three-way merge only accepts independent edits. Deletions versus edits and
// simultaneous changes to the same value remain explicit conflicts.
const absent = Symbol("absent");
const equal = (a, b) =>
  a === absent || b === absent
    ? a === b
    : JSON.stringify(a) === JSON.stringify(b);
function mergeValue(base, local, remote) {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  if (base === absent || local === absent || remote === absent)
    throw Error("conflict");
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const all = [...base, ...local, ...remote];
    if (
      !all.every(
        (x) =>
          x &&
          typeof x === "object" &&
          !Array.isArray(x) &&
          typeof x.id === "string",
      )
    )
      throw Error("conflict");
    for (const a of [base, local, remote])
      if (new Set(a.map((x) => x.id)).size !== a.length)
        throw Error("conflict");
    // Concurrent reordering must not silently lose either user's arrangement.
    const baseIds = new Set(base.map((x) => x.id));
    for (const a of [local, remote]) {
      const ids = new Set(a.map((x) => x.id));
      const before = base.filter((x) => ids.has(x.id)).map((x) => x.id),
        after = a.filter((x) => baseIds.has(x.id)).map((x) => x.id);
      if (!equal(before, after)) throw Error("conflict");
    }
    const maps = [base, local, remote].map(
        (a) => new Map(a.map((x) => [x.id, x])),
      ),
      ids = [...new Set([...remote, ...local].map((x) => x.id))];
    return ids
      .map((id) =>
        mergeValue(...maps.map((m) => (m.has(id) ? m.get(id) : absent))),
      )
      .filter((x) => x !== absent);
  }
  if (
    [base, local, remote].every(
      (x) => x && typeof x === "object" && !Array.isArray(x),
    )
  ) {
    const out = {};
    for (const k of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const v = mergeValue(
        ...[base, local, remote].map((x) =>
          Object.hasOwn(x, k) ? x[k] : absent,
        ),
      );
      if (v !== absent) out[k] = v;
    }
    return out;
  }
  throw Error("conflict");
}
function visibleState(data, slot) {
  const result = structuredClone(data);
  for (const alarm of result.wake_alarms || []) delete alarm.legacy;
  for (const key of ["goals", "wishlist"])
    result[key] = result[key].filter((x) => !x.deleted);
  const hiddenGoals = new Set(
    data.goals
      .filter((x) => x.memberId !== slot && x.visibility === "private")
      .map((x) => "完成长期目标「" + x.name + "」"),
  );
  result.milestones = result.milestones.filter(
    (x) => x.kind !== "goal" || !hiddenGoals.has(x.title),
  );
  for (const key of ["entries", "goals"])
    result[key] = result[key].filter(
      (x) => x.memberId === slot || x.visibility !== "private",
    );
  return result;
}
function visibleHistory(data, slot) {
  const result = visibleState(data, slot);
  delete result.wake_alarms;
  // An item shared in the past can become private later; historical snapshots
  // must not give the other account a way to recover its former contents.
  for (const key of ["entries", "goals"])
    result[key] = result[key].filter((x) => x.memberId === slot);
  result.milestones = result.milestones.filter((x) => x.kind !== "goal");
  return result;
}
/* 对方的共同约定，唯一允许改的字段是把 joined 从 false 改成 true —— 这就是「加入」。
   别的字段一律不许动：分是发起人定的，内容也是他写的。 */
function onlyJoined(base, requested) {
  if (base.length !== requested.length) return false;
  const m = new Map(requested.map((x) => [x.id, x]));
  for (const x of base) {
    const y = m.get(x.id);
    if (y && equal(x, y)) continue;
    if (
      !y ||
      x.id !== y.id ||
      x.scope !== "both" ||
      x.joined !== false ||
      y.joined !== true
    )
      return false;
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      if (k === "joined") continue;
      if (!equal(x[k], y[k])) return false;
    }
  }
  return true;
}
function protectPersonal(base, requested, slot) {
  const baseStories = new Map((base.story_entries || []).map((x) => [x.id, x]));
  const otherBefore = (base.story_entries || []).filter(
      (x) => x.memberId !== slot,
    ),
    otherAfter = (requested.story_entries || []).filter(
      (x) => x.memberId !== slot,
    );
  if (!equal(otherBefore, otherAfter))
    throw Error("cannot change another member story");
  for (const story of requested.story_entries || []) {
    const old = baseStories.get(story.id);
    if (old && old.memberId !== story.memberId)
      throw Error("invalid story owner");
    if (!old || !equal(old, story)) {
      if (
        typeof story.text !== "string" ||
        !story.text.trim() ||
        story.text.length > 10000
      )
        throw Error("invalid story text");
    }
  }
  const otherMembersBefore = (base.members || []).filter((x) => x.id !== slot),
    otherMembersAfter = (requested.members || []).filter((x) => x.id !== slot);
  if (base.members && !equal(otherMembersBefore, otherMembersAfter))
    throw Error("cannot change another profile");
  for (const key of ["entries", "goals"]) {
    const a = base[key].filter((x) => x.memberId !== slot),
      b = requested[key].filter((x) => x.memberId !== slot);
    if (!equal(a, b) && !(key === "goals" && onlyJoined(a, b)))
      throw Error("cannot change another member’s personal items");
    const original = new Map(base[key].map((x) => [x.id, x]));
    for (const x of requested[key]) {
      const old = original.get(x.id);
      if (
        !x.id ||
        !["private", "shared", undefined].includes(x.visibility) ||
        (old && old.memberId !== x.memberId)
      )
        throw Error("invalid item ownership");
    }
    if (new Set(requested[key].map((x) => x.id)).size !== requested[key].length)
      throw Error("duplicate personal item");
  }
}
module.exports = {
  validState,
  mergeValue,
  visibleState,
  visibleHistory,
  protectPersonal,
  equal,
};

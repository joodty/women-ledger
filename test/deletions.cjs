"use strict";
// Local, isolated data only. All assertions use authenticated bootstrap responses.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "women-deletions-"));
const base = "http://127.0.0.1:24814";
const proc = spawn(process.execPath, ["server.cjs"], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...process.env,
    WOMEN_DATA_DIR: dir,
    PORT: "24814",
    HOST: "127.0.0.1",
  },
  stdio: "pipe",
});
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "Asia/Shanghai",
});
let stage = "startup";
async function req(url, body, cookie) {
  const response = await fetch(base + url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
function command(type, payload, expectedVersion) {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}
async function send(cookie, type, payload, version) {
  return req("/api/v2/commands", command(type, payload, version), cookie);
}
function success(result) {
  assert.equal(result.status, 200, stage + ": " + JSON.stringify(result.data));
  return result.data;
}
async function snapshot(cookie) {
  return success(await req("/api/v2/bootstrap", undefined, cookie));
}
async function version(cookie, collection, id) {
  const n = (await snapshot(cookie)).versions[collection]?.[id];
  assert(Number.isSafeInteger(n), stage + ": missing visible entity version");
  return n;
}
async function deleteItem(cookie, type, collection, id) {
  return send(cookie, type, { id }, await version(cookie, collection, id));
}
const entry = (id, goalId, categoryId = "none") => ({
  id,
  content: id,
  date: today,
  start: "10:00",
  end: "10:30",
  goalId,
  categoryId,
  visibility: "shared",
});
const goal = (id, extra = {}) => ({
  id,
  name: id,
  kind: "repeat",
  scope: "me",
  visibility: "shared",
  timesPerWeek: 3,
  pointsPerCheckin: 3,
  categoryId: "none",
  ...extra,
});
const wish = (id, scope = "both", points = "4") => ({
  id,
  name: id,
  scope,
  pointsLabel: points,
  executor: "both",
});
function balance(data, slot, wallet = "mine") {
  return (
    data.points_ledger
      .filter((p) => p.memberId === slot && (p.wallet || "mine") === wallet)
      .reduce((n, p) => n + p.points, 0) -
    data.redemptions
      .filter(
        (r) =>
          !["pending", "cancelled", "reversed"].includes(r.status) &&
          (r.wallet || "mine") === wallet,
      )
      .reduce((n, r) => n + (slot === "me" ? r.fromMe || 0 : r.fromHim || 0), 0)
  );
}
(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        ready = (await fetch(base + "/health")).ok;
        if (ready) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(ready, "isolated server did not start");
    const password = "isolated-test-password-123";
    async function account(username, invitation) {
      assert.equal(
        (
          await req("/api/register", {
            username,
            password,
            ...(invitation ? { invitation } : {}),
          })
        ).status,
        201,
      );
      const login = await req("/api/login", { user: username, password });
      assert.equal(login.status, 200);
      await snapshot(login.cookie);
      return login.cookie;
    }
    const a = await account("delete_alice"),
      invitation = success(await req("/api/invite", {}, a)).token;
    const b = await account("delete_bob", invitation),
      outsider = await account("delete_outsider");
    assert.equal(
      (await snapshot(a)).session.spaceId,
      (await snapshot(b)).session.spaceId,
    );
    assert.notEqual(
      (await snapshot(a)).session.spaceId,
      (await snapshot(outsider)).session.spaceId,
    );

    stage = "legacy shared fixtures";
    // Existing installations may have shared items without scope and auto goal milestones.
    // Seed these through the compatibility API in this fresh local database only.
    const initial = await snapshot(a);
    initial.data.wishlist.push({
      id: "legacy-wish",
      name: "legacy shared wish",
      pointsLabel: "4",
      status: "saving",
    });
    /* 老客户端可能还会把 rewards 发上来，服务端应当默默收下而不是报错 */
    initial.data.rewards = [
      { id: "legacy-reward", name: "legacy reward", pointsLabel: "4" },
    ];
    initial.data.milestones.push({
      id: "auto-goal-milestone",
      kind: "goal",
      date: today,
      title: "完成长期目标「自动里程碑」",
    });
    success(
      await req(
        "/api/state",
        { revision: initial.revision, data: initial.data },
        a,
      ),
    );
    assert(
      !("rewards" in (await snapshot(a)).data),
      "rewards should not come back from the server",
    );
    success(await deleteItem(b, "wish.delete", "wishlist", "legacy-wish"));
    assert(
      !(await snapshot(a)).data.wishlist.some((x) => x.id === "legacy-wish"),
    );
    assert.equal(
      (
        await deleteItem(
          a,
          "milestone.delete",
          "milestones",
          "auto-goal-milestone",
        )
      ).status,
      400,
    );

    stage = "goal deletion keeps checkins and earned points";
    success(await send(a, "goal.create", goal("linked-goal")));
    success(
      await send(a, "record.create", entry("linked-entry", "linked-goal")),
    );
    const beforeGoal = await snapshot(a),
      goalVersion = beforeGoal.versions.goals["linked-goal"];
    assert.equal(
      (await send(outsider, "goal.delete", { id: "linked-goal" }, goalVersion))
        .status,
      404,
    );
    assert.equal(
      (await send(b, "goal.delete", { id: "linked-goal" }, goalVersion)).status,
      403,
    );
    assert.equal(
      (await send(a, "goal.delete", { id: "linked-goal" }, goalVersion - 1))
        .status,
      409,
    );
    const deleteGoal = command(
      "goal.delete",
      { id: "linked-goal" },
      goalVersion,
    );
    success(await req("/api/v2/commands", deleteGoal, a));
    const afterGoal = await snapshot(a);
    assert(!afterGoal.data.goals.some((g) => g.id === "linked-goal"));
    assert(
      afterGoal.data.entries.some(
        (e) => e.id === "linked-entry" && e.goalId === "linked-goal",
      ),
    );
    assert.deepEqual(
      afterGoal.data.points_ledger,
      beforeGoal.data.points_ledger,
    );
    assert.equal(
      success(await req("/api/v2/commands", deleteGoal, a)).replayed,
      true,
    );
    assert.equal(
      (await snapshot(a)).revision,
      afterGoal.revision,
      "same command must not save again",
    );
    assert.equal(
      (await send(a, "record.create", entry("bad-new-checkin", "linked-goal")))
        .status,
      400,
    );

    stage = "story deletion preserves remaining order";
    success(await send(a, "story.publish", { id: "story-a", text: "第一段" }));
    success(await send(b, "story.publish", { id: "story-b", text: "第二段" }));
    success(await send(a, "story.publish", { id: "story-c", text: "第三段" }));
    const storyVersion = await version(b, "story_entries", "story-b");
    assert.equal(
      (await send(a, "story.delete", { id: "story-b" }, storyVersion)).status,
      403,
    );
    assert.equal(
      (await send(outsider, "story.delete", { id: "story-b" }, storyVersion))
        .status,
      404,
    );
    assert.equal(
      (await send(b, "story.delete", { id: "story-b" }, storyVersion - 1))
        .status,
      409,
    );
    success(await send(b, "story.delete", { id: "story-b" }, storyVersion));
    assert.deepEqual(
      (await snapshot(a)).data.story_entries.map((x) => [x.id, x.seq]),
      [
        ["story-a", 1],
        ["story-c", 3],
      ],
    );
    success(
      await send(b, "story.publish", { id: "story-d", text: "新的第四段" }),
    );
    assert.equal(
      (await snapshot(a)).data.story_entries.find((x) => x.id === "story-d")
        .seq,
      4,
    );

    stage = "wish deletion uses absolute owner slots";
    success(await send(a, "wish.save", wish("his-wish", "him")));
    const hisVersion = await version(a, "wishlist", "his-wish");
    assert.equal(
      (await send(a, "wish.delete", { id: "his-wish" }, hisVersion)).status,
      403,
    );
    assert.equal(
      (await send(b, "wish.delete", { id: "his-wish" }, hisVersion - 1)).status,
      409,
    );
    success(await deleteItem(b, "wish.delete", "wishlist", "his-wish"));
    success(await send(a, "wish.save", wish("own-wish", "me")));
    const wishVersion = await version(a, "wishlist", "own-wish");
    assert.equal(
      (await send(b, "wish.delete", { id: "own-wish" }, wishVersion)).status,
      403,
    );
    assert.equal(
      (await send(outsider, "wish.delete", { id: "own-wish" }, wishVersion))
        .status,
      404,
    );
    success(await deleteItem(a, "wish.delete", "wishlist", "own-wish"));
    assert(
      !(await snapshot(b)).data.wishlist.some((r) => r.id === "own-wish"),
    );
    assert.equal(
      (
        await req(
          "/api/redeem",
          {
            kind: "wish",
            id: "own-wish",
            requestId: "deleted-wish-attempt",
          },
          a,
        )
      ).status,
      400,
    );
    success(await send(a, "wish.save", wish("shared-wish", "both")));
    success(await deleteItem(b, "wish.delete", "wishlist", "shared-wish"));
    assert(
      !(await snapshot(a)).data.wishlist.some((r) => r.id === "shared-wish"),
    );

    stage = "category deletion reassigns references safely";
    success(
      await send(a, "category.save", {
        id: "custom-cat",
        name: "演示分类",
        color: "#112233",
      }),
    );
    success(
      await send(
        a,
        "goal.create",
        goal("categorized-goal", { categoryId: "custom-cat" }),
      ),
    );
    success(
      await send(
        b,
        "record.create",
        entry("categorized-entry", null, "custom-cat"),
      ),
    );
    const catVersion = await version(a, "categories", "custom-cat");
    assert.equal(
      (await send(a, "category.delete", { id: "custom-cat" }, catVersion - 1))
        .status,
      409,
    );
    assert.equal(
      (
        await send(
          outsider,
          "category.delete",
          { id: "custom-cat" },
          catVersion,
        )
      ).status,
      404,
    );
    success(await deleteItem(b, "category.delete", "categories", "custom-cat"));
    const categoryState = await snapshot(a);
    assert(!categoryState.data.categories.some((x) => x.id === "custom-cat"));
    assert.equal(
      categoryState.data.goals.find((x) => x.id === "categorized-goal")
        .categoryId,
      "none",
    );
    assert.equal(
      categoryState.data.entries.find((x) => x.id === "categorized-entry")
        .categoryId,
      "none",
    );
    assert.equal(
      (await deleteItem(a, "category.delete", "categories", "none")).status,
      400,
    );

    stage = "shared meeting deletion and stale edits";
    success(
      await send(a, "meeting.save", {
        id: "meet-delete",
        date: today,
        title: "本机见面",
        note: "测试安排",
      }),
    );
    const oldMeetingVersion = await version(a, "milestones", "meet-delete");
    success(
      await send(
        a,
        "meeting.save",
        { id: "meet-delete", date: today, title: "更新安排", note: "新版" },
        oldMeetingVersion,
      ),
    );
    assert.equal(
      (
        await send(
          b,
          "meeting.delete",
          { id: "meet-delete" },
          oldMeetingVersion,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await send(
          outsider,
          "meeting.delete",
          { id: "meet-delete" },
          oldMeetingVersion,
        )
      ).status,
      404,
    );
    success(await deleteItem(b, "meeting.delete", "milestones", "meet-delete"));
    assert(
      !(await snapshot(a)).data.milestones.some((x) => x.id === "meet-delete"),
    );
    success(
      await send(a, "meeting.save", {
        id: "milestone-delete",
        date: today,
        title: "另一项安排",
      }),
    );
    success(
      await deleteItem(b, "milestone.delete", "milestones", "milestone-delete"),
    );

    stage =
      "spent checkin cannot be removed, personal redemption can be reversed";
    success(
      await send(
        a,
        "goal.create",
        goal("spent-goal", { kind: "once", pointsPerCheckin: 30 }),
      ),
    );
    success(await send(a, "record.create", entry("spent-entry", "spent-goal")));
    const funded = await snapshot(a),
      personalBefore = balance(funded.data, "me");
    success(
      await send(
        a,
        "wish.save",
        wish("spent-wish", "me", String(personalBefore)),
      ),
    );
    success(
      await req(
        "/api/redeem",
        {
          kind: "wish",
          id: "spent-wish",
          requestId: "personal-redemption",
        },
        a,
      ),
    );
    const spent = await snapshot(a);
    assert.equal(balance(spent.data, "me"), 0);
    const protectedDelete = await deleteItem(
      a,
      "record.delete",
      "entries",
      "spent-entry",
    );
    assert.equal(
      protectedDelete.status,
      400,
      "spent award must be rejected as a business validation error",
    );
    assert.match(protectedDelete.data.error, /先撤销对应兑换/);
    assert(
      (await snapshot(a)).data.entries.some((e) => e.id === "spent-entry"),
    );
    const redemptionVersion = await version(
      a,
      "redemptions",
      "personal-redemption",
    );
    assert.equal(
      (
        await send(
          b,
          "redemption.reverse",
          { id: "personal-redemption" },
          redemptionVersion,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await send(
          outsider,
          "redemption.reverse",
          { id: "personal-redemption" },
          redemptionVersion,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await send(
          a,
          "redemption.reverse",
          { id: "personal-redemption" },
          redemptionVersion - 1,
        )
      ).status,
      409,
    );
    const reverse = command(
      "redemption.reverse",
      { id: "personal-redemption" },
      redemptionVersion,
    );
    success(await req("/api/v2/commands", reverse, a));
    assert.equal(
      success(await req("/api/v2/commands", reverse, a)).replayed,
      true,
    );
    assert.equal(balance((await snapshot(a)).data, "me"), personalBefore);
    success(await deleteItem(a, "record.delete", "entries", "spent-entry"));
    assert(
      !(await snapshot(a)).data.entries.some((e) => e.id === "spent-entry"),
    );

    stage = "pending shared redemption must be cancelled before item deletion";
    success(
      await send(a, "goal.create", goal("shared-goal", { scope: "both" })),
    );
    success(await send(b, "goal.join", { id: "shared-goal" }));
    success(
      await send(a, "record.create", entry("shared-checkin-a", "shared-goal")),
    );
    success(
      await send(b, "record.create", entry("shared-checkin-b", "shared-goal")),
    );
    success(await send(a, "wish.save", wish("pending-wish")));
    success(
      await req(
        "/api/redeem",
        { kind: "wish", id: "pending-wish", requestId: "pending-redemption" },
        a,
      ),
    );
    assert(
      [400, 409].includes(
        (await deleteItem(b, "wish.delete", "wishlist", "pending-wish")).status,
      ),
    );
    assert.equal(
      (
        await deleteItem(
          a,
          "redemption.reverse",
          "redemptions",
          "pending-redemption",
        )
      ).status,
      400,
    );
    success(await req("/api/redeem/cancel", { id: "pending-redemption" }, b));
    assert.equal(balance((await snapshot(a)).data, "me", "ours"), 3);
    success(await deleteItem(b, "wish.delete", "wishlist", "pending-wish"));

    stage = "shared redemption reversal requires both people, refunds once";
    success(await send(a, "wish.save", wish("completed-wish")));
    success(
      await req(
        "/api/redeem",
        { kind: "wish", id: "completed-wish", requestId: "shared-redemption" },
        a,
      ),
    );
    success(
      await req(
        "/api/redeem",
        {
          kind: "wish",
          id: "completed-wish",
          requestId: "shared-confirmation",
        },
        b,
      ),
    );
    const sharedDone = await snapshot(a),
      sharedVersion = sharedDone.versions.redemptions["shared-redemption"];
    assert.equal(balance(sharedDone.data, "me", "ours"), 1);
    assert.equal(balance(sharedDone.data, "him", "ours"), 1);
    success(
      await send(
        a,
        "redemption.reverse",
        { id: "shared-redemption" },
        sharedVersion,
      ),
    );
    let state = await snapshot(b),
      red = state.data.redemptions.find((r) => r.id === "shared-redemption");
    assert.equal(red.reverseRequestedBy, "me");
    assert.equal(red.status, "done");
    assert.equal(
      balance(state.data, "me", "ours"),
      1,
      "one person's request cannot refund",
    );
    assert.equal(
      (
        await send(
          b,
          "redemption.reverse",
          { id: "shared-redemption" },
          sharedVersion,
        )
      ).status,
      409,
    );
    success(
      await send(
        a,
        "redemption.reverse",
        { id: "shared-redemption" },
        state.versions.redemptions["shared-redemption"],
      ),
    );
    state = await snapshot(b);
    success(
      await send(
        b,
        "redemption.reverse",
        { id: "shared-redemption" },
        state.versions.redemptions["shared-redemption"],
      ),
    );
    state = await snapshot(a);
    assert.equal(
      state.data.redemptions.find((r) => r.id === "shared-redemption").status,
      "reversed",
    );
    assert.equal(balance(state.data, "me", "ours"), 3);
    assert.equal(balance(state.data, "him", "ours"), 3);
    assert.equal(
      state.data.wishlist.find((w) => w.id === "completed-wish").status,
      "saving",
    );
    success(
      await send(
        a,
        "redemption.reverse",
        { id: "shared-redemption" },
        state.versions.redemptions["shared-redemption"],
      ),
    );
    assert.equal(
      balance((await snapshot(a)).data, "me", "ours"),
      3,
      "repeated reversal cannot mint points",
    );
    stage = "reversal does not resurrect an already deleted shared wish";
    success(await send(a, "wish.save", wish("deleted-after-redeem")));
    success(
      await req(
        "/api/redeem",
        {
          kind: "wish",
          id: "deleted-after-redeem",
          requestId: "deleted-wish-redemption",
        },
        a,
      ),
    );
    success(
      await req(
        "/api/redeem",
        {
          kind: "wish",
          id: "deleted-after-redeem",
          requestId: "deleted-wish-confirmation",
        },
        b,
      ),
    );
    success(
      await deleteItem(a, "wish.delete", "wishlist", "deleted-after-redeem"),
    );
    success(
      await deleteItem(
        a,
        "redemption.reverse",
        "redemptions",
        "deleted-wish-redemption",
      ),
    );
    success(
      await deleteItem(
        b,
        "redemption.reverse",
        "redemptions",
        "deleted-wish-redemption",
      ),
    );
    state = await snapshot(a);
    assert(!state.data.wishlist.some((w) => w.id === "deleted-after-redeem"));
    assert.equal(balance(state.data, "me", "ours"), 3);
    assert.equal(balance(state.data, "him", "ours"), 3);
    assert.equal((await snapshot(outsider)).data.redemptions.length, 0);
    console.log(
      "PASS: isolated deletion ownership, versions, idempotency, linked records/points, shared cleanup and two-person redemption reversal",
    );
  } finally {
    proc.kill();
    await new Promise((resolve) =>
      proc.exitCode !== null ? resolve() : proc.once("exit", resolve),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error("Deletion regression failed at: " + stage);
  console.error(error);
  process.exitCode = 1;
});

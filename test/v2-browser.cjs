"use strict";
const { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { expect } = require("playwright/test");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "women-v2-browser-")),
  base = "http://127.0.0.1:24761";
const server = spawn(process.execPath, ["server.cjs"], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, WOMEN_DATA_DIR: dir, PORT: "24761" },
  stdio: "pipe",
});
(async () => {
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        await fetch(base);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    const ca = await browser.newContext({
        viewport: { width: 390, height: 844 },
        permissions: ["microphone"],
      }),
      cb = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      a = await ca.newPage(),
      b = await cb.newPage();
    const errors = [];
    a.on("dialog", (dialog) =>
      dialog.type() === "confirm" ? dialog.accept() : dialog.dismiss(),
    );
    b.on("dialog", (dialog) =>
      dialog.type() === "confirm" ? dialog.accept() : dialog.dismiss(),
    );
    a.on("pageerror", (e) => errors.push(e.message));
    b.on("pageerror", (e) => errors.push(e.message));
    async function register(page, user, invite = "") {
      await page.goto(base + (invite ? "/?invite=" + invite : ""));
      if (!invite)
        await page.getByRole("button", { name: "注册新账号" }).click();
      await page.getByLabel("账号", { exact: true }).fill(user);
      await page.getByLabel("密码", { exact: true }).fill("test-password-123");
      await page.getByRole("button", { name: "注册并登录" }).click();
      await page.getByRole("heading", { name: "今天，过得怎么样？" }).waitFor();
    }
    const snapshot = async (page) =>
      (await page.request.get(base + "/api/v2/bootstrap")).json();
    await register(a, "alice");
    await a.goto(base + "/#/goals");
    await a.getByRole("button", { name: "新增约定" }).click();
    await a.getByLabel("约定名称").fill("共同运动");
    await a
      .getByRole("group", { name: "属于谁", exact: true })
      .getByRole("button", { name: "我们共同的", exact: true })
      .click();
    await a.getByRole("button", { name: "保存约定" }).click();
    await expect
      .poll(async () => (await snapshot(a)).data.goals.length)
      .toBe(1);
    const invite = await (
      await a.request.post(base + "/api/invite", {
        data: {},
        headers: { Origin: base },
      })
    ).json();
    await register(b, "bob", invite.token);
    await b.goto(base + "/#/goals");
    await b.getByRole("button", { name: "加入", exact: true }).click();
    await expect
      .poll(async () => (await snapshot(b)).data.goals[0].joined)
      .toBe(true);
    /* 从约定上点一下就生成记录，不再弹表单；记录内容就是约定名 */
    await b
      .getByRole("button", { name: "记一次：共同运动", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(b)).data.entries.length)
      .toBe(1);
    /* 记一笔不再有「谁可以看到」，新记录一律双方可见 */
    await expect
      .poll(async () => (await snapshot(a)).data.entries.length)
      .toBe(1);
    await a.goto(base + "/#/story");
    await a.locator("#story-input").fill("草稿不会因为切换页面丢失");
    await a.getByRole("link", { name: "今天", exact: true }).click();
    await a.goto(base + "/#/story");
    assert.equal(
      await a.locator("#story-input").inputValue(),
      "草稿不会因为切换页面丢失",
    );
    await a.route("**/api/speech/config", (r) =>
      r.fulfill({ json: { maxSeconds: 120 } }),
    );
    await a.route("**/api/speech/transcribe", (r) => {
      assert.ok(r.request().postDataJSON().audioBase64.startsWith("UklGR"));
      return r.fulfill({ json: { text: "语音文字" } });
    });
    await a.getByRole("button", { name: "开始录音" }).click();
    await a.getByRole("button", { name: "停止录音" }).waitFor();
    await a.waitForTimeout(1000);
    await a.getByRole("button", { name: "停止录音" }).click();
    await expect(a.locator("#story-input")).toHaveValue(
      "草稿不会因为切换页面丢失语音文字",
    );
    const longStory = "故事".repeat(5000);
    await a.locator("#story-input").fill(longStory);
    await a.getByRole("button", { name: "发布这一段" }).click();
    await expect
      .poll(async () => (await snapshot(a)).data.story_entries[0]?.text.length)
      .toBe(10000);
    await expect(a).toHaveURL(/#\/story\/full$/);
    await a.reload();
    await expect(a).toHaveURL(/#\/story\/full$/);
    await expect(a.locator(".seg-card .v2-wrap")).toHaveText(longStory);
    await a.goto(base + "/#/");
    await ca.setOffline(true);
    await a.getByRole("button", { name: "记一笔", exact: true }).click();
    await a.getByLabel("做了什么").fill("重启后仍可提交的离线记录");
    await a.getByRole("button", { name: "保存记录" }).click();
    await expect(a.getByRole("button", { name: "查看待处理" })).toBeVisible();
    const offlineKey = await a.evaluate(() =>
      Object.keys(localStorage).find((k) => k === "women.v2.pending.alice"),
    );
    assert(offlineKey);
    await ca.setOffline(false);
    const restored = await ca.newPage();
    await restored.goto(base);
    await expect
      .poll(async () =>
        (await snapshot(restored)).data.entries.some(
          (e) => e.content === "重启后仍可提交的离线记录",
        ),
      )
      .toBe(true);
    await restored.close();
    await a.reload();
    await a.getByRole("heading", { name: "今天，过得怎么样？" }).waitFor();
    await a.evaluate(async () => {
      const s = await (await fetch("/api/v2/bootstrap")).json();
      const legacy = structuredClone(s.data);
      legacy.couple.since = "2026-01-03";
      localStorage.setItem(
        "women.pending.v1.previous-session.alice",
        JSON.stringify({ user: "me", revision: s.revision, data: legacy }),
      );
      sessionStorage.removeItem("women.tab");
    });
    await a.reload();
    await a.getByRole("button", { name: "查看待处理" }).click();
    await a.getByRole("button", { name: "尝试恢复" }).click();
    await expect
      .poll(async () => (await snapshot(a)).data.couple.since)
      .toBe("2026-01-03");
    await expect
      .poll(() =>
        a.evaluate(() =>
          localStorage.getItem("women.pending.v1.previous-session.alice"),
        ),
      )
      .toBeNull();
    await a.getByRole("button", { name: "收起", exact: true }).click();
    await a.goto(base + "/#/review");
    await a.getByRole("heading", { name: "回看", exact: true }).waitFor();
    await a.goto(base + "/#/settings");
    await a.getByRole("heading", { name: "设置", exact: true }).waitFor();
    // A save notification must not block the next action on a small screen.
    await a.setViewportSize({ width: 390, height: 640 });
    await a.goto(base + "/#/");
    await a.getByRole("button", { name: "记一笔", exact: true }).click();
    await a.getByLabel("做了什么").fill("连续记录滚动场景".repeat(35));
    await a.getByRole("button", { name: "保存记录", exact: true }).click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
    await expect(a.locator(".v2-toast")).toBeVisible();
    await a
      .getByRole("button", { name: "记一笔", exact: true })
      .click({ timeout: 1800 });
    await expect(a.getByRole("dialog", { name: "记一笔" })).toBeVisible();
    await a.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(a.locator(".v2-toast")).toHaveCount(0, { timeout: 5000 });
    await a.setViewportSize({ width: 390, height: 844 });

    // Delete from the restored UI, with ownership controls visible to each member.
    await b.goto(base + "/#/story");
    await b.locator("#story-input").fill("由另一位写的段落");
    await b.getByRole("button", { name: "发布这一段", exact: true }).click();
    await expect(b).toHaveURL(/#\/story\/full$/);
    const otherSegment = b.locator(".seg-card").filter({ hasText: longStory });
    await expect(
      otherSegment.getByRole("button", { name: "删除这一段", exact: true }),
    ).toHaveCount(0);
    await a.goto(base + "/#/story/full");
    await a.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(
      a.locator(".seg-card").filter({ hasText: "由另一位写的段落" }),
    ).toBeVisible();
    await expect(
      a
        .locator(".seg-card")
        .filter({ hasText: "由另一位写的段落" })
        .getByRole("button", { name: "删除这一段", exact: true }),
    ).toHaveCount(0);
    await a
      .locator(".seg-card")
      .filter({ hasText: longStory })
      .getByRole("button", { name: "删除这一段", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(a)).data.story_entries.length)
      .toBe(1);
    assert.equal(
      (await snapshot(a)).data.story_entries[0].seq,
      2,
      "deleting earlier segment must not renumber partner's segment",
    );
    await b.reload();
    await b.getByRole("button", { name: "删除这一段", exact: true }).click();
    await expect
      .poll(async () => (await snapshot(b)).data.story_entries.length)
      .toBe(0);

    await a.goto(base + "/#/palette");
    await a.getByRole("button", { name: "新增分类", exact: true }).click();
    const categoryDialog = a.getByRole("dialog", {
      name: "分类设置",
      exact: true,
    });
    await categoryDialog.getByLabel("分类名称").fill("界面删除回归分类");
    await categoryDialog
      .getByRole("button", { name: "保存分类", exact: true })
      .click();
    await expect(categoryDialog).toHaveCount(0);
    const custom = (await snapshot(a)).data.categories.find(
      (x) => x.name === "界面删除回归分类",
    );
    assert(custom);
    await a.goto(base + "/#/goals");
    await a
      .getByRole("button", { name: "修改约定：共同运动", exact: true })
      .click();
    await a
      .getByRole("group", { name: "归属分类", exact: true })
      .getByRole("button", { name: "界面删除回归分类", exact: true })
      .click();
    await a.getByRole("button", { name: "保存约定", exact: true }).click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
    await b.goto(base + "/#/");
    await b
      .getByRole("button", { name: "修改记录：共同运动", exact: true })
      .click();
    await b
      .getByRole("dialog", { name: "改一笔", exact: true })
      .getByRole("button", { name: "界面删除回归分类", exact: true })
      .click();
    await b.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(b.getByRole("dialog")).toHaveCount(0);
    await a.goto(base + "/#/palette");
    await a
      .getByRole("button", { name: "删除分类：界面删除回归分类", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await snapshot(a)).data.categories.some((x) => x.id === custom.id),
      )
      .toBe(false);
    assert.equal((await snapshot(a)).data.goals[0].categoryId, "none");
    assert.equal(
      (await snapshot(b)).data.entries.find((x) => x.content === "共同运动")
        .categoryId,
      "none",
    );

    await a.goto(base + "/#/wishlist");
    await a.getByRole("button", { name: "新增愿望", exact: true }).click();
    await a
      .getByRole("dialog", { name: "新增愿望", exact: true })
      .getByLabel("名称", { exact: true })
      .fill("本机共享愿望");
    await a.getByLabel("需要的积分", { exact: true }).fill("4");
    await a.getByRole("button", { name: "保存", exact: true }).click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
    await b.goto(base + "/#/wishlist");
    await b
      .getByRole("button", { name: "删除愿望：本机共享愿望", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(a)).data.wishlist.length)
      .toBe(0);
    /* 2026-11-05 奖励整块删掉：老客户端发上来的 rewards 服务端收下但不返回，
       /rewards 页面也已经不存在了 */
    const seeded = await snapshot(a);
    assert(!("rewards" in seeded.data), "bootstrap still returns rewards");
    seeded.data.rewards = [
      { id: "legacy-reward", name: "以前的小奖励", pointsLabel: "4" },
    ];
    assert.equal(
      (
        await a.request.post(base + "/api/state", {
          data: { revision: seeded.revision, data: seeded.data },
          headers: { Origin: base },
        })
      ).status(),
      200,
    );
    assert(
      !("rewards" in (await snapshot(a)).data),
      "rewards came back from the server",
    );
    await a.goto(base + "/#/wishlist");
    await a.reload();
    await expect(
      a.locator(".wi-row").filter({ hasText: "以前的小奖励" }),
    ).toHaveCount(0);
    await a.goto(base + "/#/rewards");
    await expect.poll(() => a.url()).toBe(base + "/#/");

    const kept = (await snapshot(b)).data.entries.find(
      (x) => x.content === "共同运动",
    );
    const awarded = (await snapshot(b)).data.points_ledger.filter(
      (x) => x.entryId === kept.id,
    );
    await a.goto(base + "/#/goals");
    await a
      .locator(".goal-card")
      .filter({ hasText: "共同运动" })
      .getByRole("button", { name: "更多操作：共同运动", exact: true })
      .click();
    await a
      .locator(".goal-card")
      .filter({ hasText: "共同运动" })
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(a)).data.goals.length)
      .toBe(0);
    assert((await snapshot(b)).data.entries.some((x) => x.id === kept.id));
    assert.deepEqual(
      (await snapshot(b)).data.points_ledger.filter(
        (x) => x.entryId === kept.id,
      ),
      awarded,
    );
    await b.goto(base + "/#/");
    await b
      .getByRole("button", { name: "修改记录：共同运动", exact: true })
      .click();
    await b.getByRole("button", { name: "删除这条记录", exact: true }).click();
    await expect
      .poll(async () =>
        (await snapshot(b)).data.entries.some((x) => x.id === kept.id),
      )
      .toBe(false);
    await expect(b.getByRole("dialog")).toHaveCount(0);
    assert.deepEqual(errors, []);
    if (process.env.PREVIEW_SCREENSHOT) {
      await a.goto(base);
      await a.getByRole("heading", { name: "今天，过得怎么样？" }).waitFor();
      await a.screenshot({
        path: process.env.PREVIEW_SCREENSHOT,
        fullPage: true,
      });
    }
    console.log(
      "PASS: restored mobile UI, two users, voice/10000 characters, offline/legacy recovery, story ownership and safe record/goal/category/wish deletion, rewards fully removed",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
    setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

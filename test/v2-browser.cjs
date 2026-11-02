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
    await a.getByLabel("属于谁").selectOption("both");
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
    await b.getByRole("button", { name: "记一次打卡" }).click();
    await b.getByLabel("做了什么").fill("对方私密打卡");
    await b.getByLabel("可见范围").selectOption("private");
    await b.getByRole("button", { name: "保存记录" }).click();
    await expect
      .poll(async () => (await snapshot(b)).data.entries.length)
      .toBe(1);
    assert.equal((await snapshot(a)).data.entries.length, 0);
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
    await a.reload();
    await a.getByRole("button", { name: "查看整篇故事" }).click();
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
    await expect.poll(()=>a.evaluate(()=>localStorage.getItem("women.pending.v1.previous-session.alice"))).toBeNull();
    await a.getByRole("button", { name: "收起", exact: true }).click();
    await a.goto(base + "/#/review");
    await a.getByRole("heading", { name: "回看", exact: true }).waitFor();
    await a.goto(base + "/#/settings");
    await a.getByRole("heading", { name: "设置", exact: true }).waitFor();
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
      "PASS: Vue mobile flows, two users, private checkin, voice, 10000 characters, offline restart and legacy recovery",
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

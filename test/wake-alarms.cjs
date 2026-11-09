"use strict";
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require("playwright");
const { expect } = require("playwright/test");

const dir = mkdtempSync(join(tmpdir(), "women-wake-"));
const base = "http://127.0.0.1:24772";
const device = "/api/v2/wake-alarms/device";
const server = spawn(process.execPath, ["server.cjs"], {
  cwd: join(__dirname, ".."),
  env: { ...process.env, WOMEN_DATA_DIR: dir, PORT: "24772" },
  stdio: "ignore",
});

(async () => {
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try { await fetch(base + "/health"); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    browser = await chromium.launch(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH } : {});
    async function request(context, url, body) {
      const response = body
        ? await context.request.post(base + url, { headers: { Origin: base }, data: body })
        : await context.request.get(base + url);
      return { status: response.status(), data: await response.json() };
    }
    const context = async () => browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await context(), b = await context(), outsider = await context();
    async function register(ctx, username, invitation) {
      const password = "isolated-test-password";
      assert.equal((await request(ctx, "/api/register", { username, password, invitation })).status, 201);
      assert.equal((await request(ctx, "/api/login", { user: username, password })).status, 200);
      return (await request(ctx, "/api/v2/bootstrap")).data;
    }
    await register(a, "alarm_alice");
    const invitation = (await request(a, "/api/invite", {})).data.token;
    const boot = await register(b, "alarm_bob", invitation);
    await register(outsider, "alarm_other");
    const page = await a.newPage();
    await page.goto(base + "/#/together");
    await page.getByRole("link", { name: /叫醒闹钟/ }).click();
    await page.getByRole("button", { name: /设闹钟/ }).click();
    await page.getByLabel("时间（北京时间）").fill("08:20");
    await page.getByLabel("早安留言（可选，响铃时显示）").fill("测试早安");
    await page.getByRole("button", { name: "保存闹钟" }).click();
    await expect(page.getByText("待手机同步", { exact: true })).toBeVisible();

    const pull = async (ctx) => (await request(ctx, device)).data.alarms;
    const [alarm] = await pull(b);
    assert.equal(alarm.time, "08:20");
    assert.equal(alarm.note, "测试早安");
    assert.deepEqual(await pull(a), []);
    assert.deepEqual(await pull(outsider), []);
    const command = (ctx, type, fields, expectedVersion) => request(ctx, "/api/v2/commands",
      { id: randomUUID(), type, payload: { id: alarm.id, ...fields }, expectedVersion });
    assert.equal((await command(outsider, "alarm.pause", {}, alarm.version)).status, 404);
    assert.equal((await command(b, "alarm.update", alarm, alarm.version)).status, 403);
    const at = Date.parse(alarm.date + "T08:20:00+08:00");
    const ack = (ctx, version, status, nextAt) => request(ctx, device, {
      account: ctx === a ? "alarm_alice" : "alarm_bob", spaceId: boot.session.spaceId,
      items: [{ id: alarm.id, version, status, nextAt }],
    });
    await ack(a, alarm.version, "scheduled", at);
    assert.equal((await request(a, "/api/v2/bootstrap")).data.alarmReceipts[alarm.id], undefined);
    assert.equal((await ack(b, alarm.version, "scheduled", at)).status, 200);

    await page.getByRole("button", { name: "修改" }).click();
    await page.getByLabel("时间（北京时间）").fill("08:40");
    await page.getByLabel("重复").selectOption({ label: "每周重复" });
    await page.getByRole("checkbox", { name: "一", exact: true }).check();
    await page.getByRole("button", { name: "保存闹钟" }).click();
    await expect(page.getByText(/旧时间.*仍可能响/)).toBeVisible();
    const [edited] = await pull(b);
    assert.equal(edited.version, alarm.version + 1);
    assert.deepEqual(edited.days, [1]);
    await ack(b, alarm.version, "paused", 0);
    assert.equal((await request(a, "/api/v2/bootstrap")).data.alarmReceipts[alarm.id].status, "scheduled");
    assert.equal((await command(b, "alarm.pause", {}, alarm.version)).status, 409);

    await page.getByRole("button", { name: "修改" }).click();
    await page.getByLabel("铃声", { exact: true }).selectOption("custom");
    await page.getByLabel("选择歌曲（20 MB 以内）").setInputFiles(
      join(__dirname, "../android/res/raw/wake_bright.wav"));
    await page.getByLabel("从第几秒开始").fill("1");
    await page.getByLabel("片段秒数（最多 60 秒）").fill("1");
    await page.getByRole("button", { name: "保存闹钟" }).click();
    await expect(page.getByText(/自定义铃声待手机同步/)).toBeVisible();
    const [legacy] = await pull(b);
    assert.equal(legacy.version, edited.version);
    assert.equal(legacy.tone, "gentle");
    const audioHeaders = { "X-Women-Wake-Audio": "1" };
    const native = await b.request.get(base + device, { headers: audioHeaders });
    const [custom] = (await native.json()).alarms;
    assert.equal(custom.tone, "custom");
    assert.equal(custom.version, edited.version + 1);
    const url = base + "/api/v2/wake-alarms/audio/" + custom.clipId;
    assert.equal((await outsider.request.get(url)).status(), 404);
    const audio = await b.request.get(url);
    assert.equal(audio.headers()["content-type"], "audio/wav");
    const bytes = await audio.body();
    assert.equal(bytes.length, 16044);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), custom.clipId);
    assert.equal((await command(b, "alarm.create", { ...custom, id: randomUUID() })).status, 400);
    await ack(b, custom.version, "scheduled", at);
    assert.notEqual((await request(a, "/api/v2/bootstrap")).data.alarmReceipts[alarm.id].version, custom.version);
    const receipt = await b.request.post(base + device, {
      headers: { ...audioHeaders, Origin: base },
      data: { account: "alarm_bob", spaceId: boot.session.spaceId,
        items: [{ id: alarm.id, version: custom.version, status: "scheduled", nextAt: at }] },
    });
    assert.equal(receipt.status(), 200);
    assert.equal((await request(a, "/api/v2/bootstrap")).data.alarmReceipts[alarm.id].version, custom.version);
    assert.equal((await command(b, "alarm.pause", {}, custom.version)).status, 200);
    const [paused] = await pull(b);
    assert.equal(paused.enabled, false);
    assert.equal((await command(a, "alarm.delete", {}, paused.version)).status, 400);
    assert.equal((await ack(b, paused.version, "paused", 0)).status, 200);
    assert.equal((await command(a, "alarm.delete", {}, paused.version)).status, 200);
    assert.deepEqual(await pull(b), []);
    assert.equal((await b.request.get(url)).status(), 404);
    console.log("Wake alarms: mobile form, audio trimming and access, old APK compatibility, receipts and cancellation passed.");
  } finally {
    await browser?.close();
    if (server.exitCode === null) { server.kill(); await once(server, "exit"); }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });

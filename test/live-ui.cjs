"use strict";
// Explicit, opt-in acceptance on a deployed site. Never included in npm test/CI.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const { expect } = require("playwright/test");

const repo = fs.realpathSync(path.join(__dirname, ".."));
function outsideRepo(p) {
  const relative = path.relative(repo, fs.realpathSync(p));
  return (
    relative !== "" &&
    (relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
  );
}
function check(ok, message) {
  if (!ok) throw Error(message);
}
function config() {
  const filename = process.env.WOMEN_TEST_ACCOUNTS_FILE;
  const output = process.env.WOMEN_TEST_OUTPUT_DIR;
  check(
    filename && path.isAbsolute(filename),
    "Set an absolute WOMEN_TEST_ACCOUNTS_FILE outside the repository",
  );
  check(
    output && path.isAbsolute(output),
    "Set an absolute WOMEN_TEST_OUTPUT_DIR outside the repository",
  );
  check(
    outsideRepo(filename),
    "Credentials must remain outside the repository",
  );
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  const url = new URL(value.baseUrl);
  check(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/",
    "Use a site origin only",
  );
  check(
    url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
    "Use HTTPS, or local loopback HTTP",
  );
  check(
    Array.isArray(value.accounts) && value.accounts.length === 2,
    "Exactly two dedicated QA accounts are required",
  );
  for (const a of value.accounts) {
    check(
      /^qa_women_[a-z0-9_]{1,23}$/.test(a.username),
      "Only dedicated qa_women_ accounts are allowed",
    );
    check(
      typeof a.password === "string" && a.password.length >= 12,
      "A private QA password is required",
    );
  }
  check(
    value.accounts[0].username !== value.accounts[1].username,
    "QA accounts must differ",
  );
  check(
    typeof value.spaceId === "string" &&
      /^[a-f0-9-]{36}$/.test(value.spaceId) &&
      value.spaceId !== "legacy",
    "Pin the dedicated QA space ID before running",
  );
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  check(
    outsideRepo(output),
    "Reports and screenshots must remain outside the repository",
  );
  return { ...value, base: url.origin, output: fs.realpathSync(output) };
}

(async () => {
  const c = config();
  const run =
    "QA-" +
    new Date().toISOString().replace(/[-:.TZ]/g, "") +
    "-" +
    crypto.randomBytes(2).toString("hex");
  const output = path.join(c.output, run);
  fs.mkdirSync(output, { mode: 0o700 });
  const report = {
    run,
    baseUrl: c.base,
    evidence: "Chromium mobile viewport 390x844; not a physical Android device",
    startedAt: new Date().toISOString(),
    checks: [],
    writeResponses: [],
    success: false,
  };
  let browser,
    step = "launch",
    verified = false;
  const pages = [],
    errors = [];
  const recordCheck = (name) => {
    report.checks.push({ name, passed: true });
    console.log("PASS: " + name);
  };
  async function ui(name, action) {
    step = name;
    try {
      return await action();
    } catch (error) {
      error.qaStep ||= name;
      throw error;
    }
  }
  try {
    browser = await chromium.launch({
      headless: process.env.WOMEN_TEST_HEADED !== "1",
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
    });
    for (const account of c.accounts) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      page.on("pageerror", () => errors.push("pageerror"));
      page.on("response", (response) => {
        if (
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/v2/commands"
        ) {
          const type = response.request().postDataJSON()?.type;
          report.writeResponses.push({
            accountIndex: c.accounts.indexOf(account),
            command: type,
            status: response.status(),
          });
        }
      });
      pages.push(page);
      step = "real page login";
      await page.goto(c.base, { waitUntil: "domcontentloaded" });
      check(
        new URL(page.url()).origin === c.base,
        "Unexpected redirect before login",
      );
      await page.getByLabel("账号", { exact: true }).fill(account.username);
      await page.getByLabel("密码", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page
        .getByRole("heading", { name: "今天，过得怎么样？", exact: true })
        .waitFor();
    }
    const [a, b] = pages;
    async function snapshot(page) {
      const response = await page.request.get(c.base + "/api/v2/bootstrap");
      check(response.ok(), "QA snapshot unavailable");
      const state = await response.json();
      const index = pages.indexOf(page);
      check(
        state.session?.account === c.accounts[index].username,
        "Session does not match configured QA account",
      );
      check(
        state.session.spaceId === c.spaceId && !state.session.legacySpace,
        "Refusing a different or legacy space",
      );
      const members = state.session.members?.map((x) => x.account).sort();
      check(
        JSON.stringify(members) ===
          JSON.stringify(c.accounts.map((x) => x.username).sort()),
        "The QA space must contain exactly the two configured accounts",
      );
      return state;
    }
    await snapshot(a);
    await snapshot(b);
    verified = true;
    recordCheck("两个独立浏览器登录，身份和专用双人空间核对");
    async function refresh(page, route = "/") {
      await ui("navigate to " + route, () => page.goto(c.base + "/#" + route));
      await ui("refresh deployed page", () =>
        page.getByRole("button", { name: "刷新", exact: true }).click(),
      );
    }
    async function prepareRecord(page, text, visibility = "shared") {
      const label = "record " + (pages.indexOf(page) === 0 ? "A" : "B") + ": ";
      await refresh(page);
      await ui(label + "select own space", () =>
        page.locator(".v2-tabs button").first().click(),
      );
      await ui(label + "open editor", () =>
        page.getByRole("button", { name: "记一笔", exact: true }).click(),
      );
      const dialog = page.getByRole("dialog", { name: "记一笔", exact: true });
      await ui(label + "fill content", () =>
        dialog.getByLabel("做了什么").fill(text),
      );
      await ui(label + "select visibility", () =>
        dialog.getByLabel("可见范围").selectOption(visibility),
      );
      await ui(label + "select no goal", () =>
        dialog.getByLabel("计入哪个约定").selectOption(""),
      );
      return dialog.getByRole("button", { name: "保存记录", exact: true });
    }
    async function waitRecord(page, text) {
      await expect
        .poll(
          async () =>
            (await snapshot(page)).data.entries.some((x) => x.content === text),
          { timeout: 25000 },
        )
        .toBe(true);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    step = "private and shared records";
    const privateText = run + "-A私密记录",
      sharedText = run + "-A分享记录";
    await (await prepareRecord(a, privateText, "private")).click();
    await waitRecord(a, privateText);
    await expect(a.getByText(privateText, { exact: true })).toBeVisible();
    check(
      !(await snapshot(b)).data.entries.some((x) => x.content === privateText),
      "Private record leaked to partner",
    );
    await (await prepareRecord(a, sharedText)).click();
    await waitRecord(a, sharedText);
    await refresh(b);
    await b.locator(".v2-tabs button").nth(1).click();
    await expect(b.getByText(sharedText, { exact: true })).toBeVisible();
    await expect(b.getByText(privateText, { exact: true })).toHaveCount(0);
    await b.screenshot({
      path: path.join(output, "partner-visible-records.png"),
      fullPage: true,
    });
    recordCheck("真实表单新增私密及共享记录，对方页面只显示共享内容");

    step = "goal checkin and points";
    const goalName = run + "-个人约定",
      checkinText = run + "-打卡";
    await refresh(a, "/goals");
    await a.getByRole("button", { name: "新增约定", exact: true }).click();
    const goalDialog = a.getByRole("dialog", { name: "新的约定", exact: true });
    await ui("goal: fill name", () =>
      goalDialog.getByLabel("约定名称").fill(goalName),
    );
    await ui("goal: set checkin points", () =>
      goalDialog.getByLabel("每次完成获得积分").fill("3"),
    );
    await ui("goal: select owner", () =>
      goalDialog.getByLabel("属于谁").selectOption("me"),
    );
    await ui("goal: select privacy", () =>
      goalDialog.getByLabel("可见范围").selectOption("private"),
    );
    await goalDialog
      .getByRole("button", { name: "保存约定", exact: true })
      .click();
    await expect(goalDialog).toHaveCount(0);
    const goal = a
      .locator("section.card")
      .filter({ has: a.locator(".card-title").filter({ hasText: goalName }) });
    await goal.getByRole("button", { name: "记一次打卡", exact: true }).click();
    const checkinDialog = a.getByRole("dialog", {
      name: "记一笔",
      exact: true,
    });
    await ui("checkin: fill content", () =>
      checkinDialog.getByLabel("做了什么").fill(checkinText),
    );
    await ui("checkin: select privacy", () =>
      checkinDialog.getByLabel("可见范围").selectOption("private"),
    );
    await checkinDialog
      .getByRole("button", { name: "保存记录", exact: true })
      .click();
    await waitRecord(a, checkinText);
    const checked = await snapshot(a),
      entry = checked.data.entries.find((x) => x.content === checkinText);
    check(
      checked.data.points_ledger.some(
        (p) => p.entryId === entry.id && p.type === "checkin" && p.points === 3,
      ),
      "Checkin did not earn the configured three points",
    );
    check(
      !(await snapshot(b)).data.entries.some((x) => x.content === checkinText),
      "Private checkin leaked to partner",
    );
    await expect(goal.locator(".v2-metric")).toContainText("1");
    await a.screenshot({
      path: path.join(output, "goal-checkin-progress.png"),
      fullPage: true,
    });
    recordCheck("通过约定入口打卡，进度变化，服务端发放设置的三分");

    step = "insufficient reward points";
    await refresh(a, "/points");
    await a.getByRole("heading", { name: "兑换", exact: true }).waitFor();
    const balance = Number(
      await a
        .locator("section.card")
        .filter({ hasText: "我的个人积分" })
        .locator(".v2-metric")
        .innerText(),
    );
    check(
      Number.isFinite(balance) && balance >= 3 && balance < 10000,
      "QA wallet has unexpected balance; review the dedicated test space",
    );
    const rewardName = run + "-余额不足奖励";
    const rewardCard = a
      .locator("section.card")
      .filter({ hasText: "给自己的小奖励" });
    await rewardCard.getByRole("button", { name: "新增", exact: true }).click();
    const rewardDialog = a.getByRole("dialog", {
      name: "奖励设置",
      exact: true,
    });
    await ui("reward: fill name", () =>
      rewardDialog.getByLabel("名称").fill(rewardName),
    );
    await ui("reward: set unaffordable price", () =>
      rewardDialog
        .getByLabel("需要的积分")
        .fill(String(Math.min(10000, balance + 100))),
    );
    await rewardDialog
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await expect(rewardDialog).toHaveCount(0);
    const reward = rewardCard
      .locator("article")
      .filter({ hasText: rewardName });
    await expect(
      reward.getByRole("button", { name: "兑换", exact: true }),
    ).toBeDisabled();
    check(
      !(await snapshot(a)).data.redemptions.some((r) => r.name === rewardName),
      "Unaffordable reward unexpectedly redeemed",
    );
    await a.screenshot({
      path: path.join(output, "insufficient-points-disabled.png"),
      fullPage: true,
    });
    recordCheck("页面显示个人积分，余额不足的奖励兑换按钮禁用且无兑换流水");

    step = "concurrent UI submission";
    const textA = run + "-A同时新增",
      textB = run + "-B同时新增";
    const [saveA, saveB] = await Promise.all([
      prepareRecord(a, textA),
      prepareRecord(b, textB),
    ]);
    step = "concurrent: click both save buttons";
    await Promise.all([saveA.click(), saveB.click()]);
    step = "concurrent: wait for both saved records";
    await Promise.all([waitRecord(a, textA), waitRecord(b, textB)]);
    for (const page of pages) {
      await expect
        .poll(
          async () => {
            const rows = (await snapshot(page)).data.entries;
            return rows.filter((e) => [textA, textB].includes(e.content))
              .length;
          },
          { timeout: 25000 },
        )
        .toBe(2);
      await refresh(page);
      await page.locator(".v2-tabs button").first().click();
      await expect(
        page.getByText(page === a ? textA : textB, { exact: true }),
      ).toBeVisible();
      await page.locator(".v2-tabs button").nth(1).click();
      await expect(
        page.getByText(page === a ? textB : textA, { exact: true }),
      ).toBeVisible();
    }
    await a.screenshot({
      path: path.join(output, "concurrent-partner-record.png"),
      fullPage: true,
    });
    recordCheck("两个页面同时提交各自记录，刷新后双方均保留且可见");
    check(errors.length === 0, "Browser JavaScript errors occurred");
    recordCheck("上述流程没有浏览器未捕获脚本错误");
    report.success = true;
  } catch (error) {
    report.failedStep = error.qaStep || step;
    report.errorType = error.name;
    report.errorDetail = String(error.message || "");
    for (const account of c.accounts)
      report.errorDetail = report.errorDetail
        .split(account.password)
        .join("[redacted]");
    // Details stay only in the private report; no credentials/trace are printed.
    if (verified)
      for (let i = 0; i < pages.length; i++)
        await pages[i]
          .screenshot({
            path: path.join(output, `failed-${i + 1}.png`),
            fullPage: true,
          })
          .catch(() => {});
    console.error(
      "FAIL: " +
        report.failedStep +
        " (" +
        error.name +
        "); inspect the private report/screenshots",
    );
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.pageErrorCount = errors.length;
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    await browser?.close();
    console.log("Private QA report: " + path.join(output, "report.json"));
  }
})().catch(() => {
  console.error(
    "QA configuration rejected. Check the private accounts file, target origin, dedicated space and outside-repository paths. No test mutations were started.",
  );
  process.exitCode = 1;
});

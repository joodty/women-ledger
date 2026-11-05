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
      page.on("dialog", (dialog) =>
        verified && dialog.type() === "confirm"
          ? dialog.accept()
          : dialog.dismiss(),
      );
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
    step = "remove previously generated QA goals through their owner UI";
    for (const page of pages) {
      const current = await snapshot(page);
      const previous = current.data.goals.filter(
        (g) =>
          g.memberId === current.session.slot &&
          /^QA-\d{17}-[a-f0-9]{4}-/.test(g.name) &&
          g.status === "active",
      );
      await refresh(page, "/goals");
      for (const item of previous) {
        const row = page
          .locator(".goal-card")
          .filter({
            has: page.locator(".goal-name").filter({ hasText: item.name }),
          });
        await ui("cleanup previous own QA goal", () =>
          row
            .getByRole("button", { name: "更多操作：" + item.name, exact: true })
            .click(),
        );
        await ui("cleanup previous own QA goal", () =>
          row.getByRole("button", { name: "删除", exact: true }).click(),
        );
        await expect
          .poll(async () =>
            (await snapshot(page)).data.goals.some((g) => g.id === item.id),
          )
          .toBe(false);
      }
    }
    recordCheck("仅通过本人页面删除此前自动生成的 QA 约定，保留其他内容");
    async function prepareRecord(page, text) {
      const label = "record " + (pages.indexOf(page) === 0 ? "A" : "B") + ": ";
      await refresh(page);
      await ui(label + "select own space", () =>
        page.locator(".pair-tabs .pair-tab").first().click(),
      );
      await ui(label + "open editor", () =>
        page.getByRole("button", { name: "记一笔", exact: true }).click(),
      );
      const dialog = page.getByRole("dialog", { name: "记一笔", exact: true });
      await ui(label + "fill content", () =>
        dialog.getByLabel("做了什么").fill(text),
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
    step = "records are visible to both";
    const firstText = run + "-A记录一",
      secondText = run + "-A记录二";
    await (await prepareRecord(a, firstText)).click();
    await waitRecord(a, firstText);
    await expect(a.getByText(firstText, { exact: true })).toBeVisible();
    await (await prepareRecord(a, secondText)).click();
    await waitRecord(a, secondText);
    await refresh(b);
    await b.locator(".pair-tabs .pair-tab").nth(1).click();
    await expect(b.getByText(firstText, { exact: true })).toBeVisible();
    await expect(b.getByText(secondText, { exact: true })).toBeVisible();
    await b.screenshot({
      path: path.join(output, "partner-visible-records.png"),
      fullPage: true,
    });
    recordCheck("记一笔不再有可见性选择，新增的记录对方页面都能看到");

    step = "goal checkin and points";
    const goalName = run + "-个人约定",
      checkinText = run + "-打卡";
    await refresh(a, "/goals");
    await a.getByRole("button", { name: /^新增约定/ }).click();
    const goalDialog = a.getByRole("dialog", { name: "新增约定", exact: true });
    await ui("goal: fill name", () =>
      goalDialog.getByLabel("约定名称").fill(goalName),
    );
    await ui("goal: set checkin points", () =>
      goalDialog
        .getByRole("group", { name: "每次完成获得积分", exact: true })
        .getByRole("button", { name: "3", exact: true })
        .click(),
    );
    await ui("goal: select owner", () =>
      goalDialog
        .getByRole("group", { name: "属于谁", exact: true })
        .getByRole("button", { name: "只算我自己的", exact: true })
        .click(),
    );
    await goalDialog
      .getByRole("button", { name: "保存约定", exact: true })
      .click();
    await expect(goalDialog).toHaveCount(0);
    const goal = a
      .locator(".goal-card")
      .filter({ has: a.locator(".goal-name").filter({ hasText: goalName }) });
    await goal.getByRole("button", { name: "记一次打卡", exact: true }).click();
    const checkinDialog = a.getByRole("dialog", {
      name: "记一笔",
      exact: true,
    });
    await ui("checkin: fill content", () =>
      checkinDialog.getByLabel("做了什么").fill(checkinText),
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
      (await snapshot(b)).data.entries.some((x) => x.content === checkinText),
      "Shared checkin was not visible to partner",
    );
    await expect(goal.locator(".goal-stat .txt")).toHaveText("1/3");
    await a.screenshot({
      path: path.join(output, "goal-checkin-progress.png"),
      fullPage: true,
    });
    recordCheck("通过约定入口打卡，进度变化，服务端发放设置的三分");

    step = "insufficient reward points";
    await refresh(a, "/points");
    await a.getByRole("heading", { name: "兑换", exact: true }).waitFor();
    const balance = Number(
      await a.locator('.pool-v[aria-label="我的个人积分"]').innerText(),
    );
    check(
      Number.isFinite(balance) && balance >= 3 && balance < 10000,
      "QA wallet has unexpected balance; review the dedicated test space",
    );
    const wishName = run + "-余额不足愿望";
    await refresh(a, "/wishlist");
    await a.getByRole("button", { name: "新增愿望", exact: true }).click();
    const wishDialog = a.getByRole("dialog", {
      name: "新增愿望",
      exact: true,
    });
    await ui("wish: fill name", () =>
      wishDialog.getByLabel("名称").fill(wishName),
    );
    await ui("wish: set unaffordable price", () =>
      wishDialog
        .getByLabel("需要的积分")
        .fill(String(Math.min(10000, balance + 100))),
    );
    await ui("wish: make it personal", () =>
      wishDialog
        .getByRole("group", { name: "属于谁", exact: true })
        .getByRole("button", { name: "只属于我", exact: true })
        .click(),
    );
    await wishDialog
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await expect(wishDialog).toHaveCount(0);
    await refresh(a, "/points");
    const wish = a
      .locator("article.wish-item")
      .filter({ hasText: wishName });
    await expect(
      wish.getByRole("button", { name: /^还差 \d+ 分$/ }),
    ).toBeDisabled();
    check(
      !(await snapshot(a)).data.redemptions.some((r) => r.name === wishName),
      "Unaffordable wish unexpectedly redeemed",
    );
    await a.screenshot({
      path: path.join(output, "insufficient-points-disabled.png"),
      fullPage: true,
    });
    recordCheck("页面显示个人积分，余额不足的愿望兑换按钮禁用且无兑换流水");

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
      await page.locator(".pair-tabs .pair-tab").first().click();
      await expect(
        page.getByText(page === a ? textA : textB, { exact: true }),
      ).toBeVisible();
      await page.locator(".pair-tabs .pair-tab").nth(1).click();
      await expect(
        page.getByText(page === a ? textB : textA, { exact: true }),
      ).toBeVisible();
    }
    await a.screenshot({
      path: path.join(output, "concurrent-partner-record.png"),
      fullPage: true,
    });
    recordCheck("两个页面同时提交各自记录，刷新后双方均保留且可见");

    step = "story publication and owner-only deletion";
    const storyA = run + "-她推开书店的门，雨刚好停了。",
      storyB = run + "-他把热咖啡推到对面，约好下次一起看海。";
    for (const [page, text] of [
      [a, storyA],
      [b, storyB],
    ]) {
      await refresh(page, "/story");
      await ui("story: fill current QA segment", () =>
        page.locator("#story-input").fill(text),
      );
      await ui("story: publish", () =>
        page.getByRole("button", { name: "发布这一段", exact: true }).click(),
      );
      await expect(page).toHaveURL(/#\/story\/full$/);
      await expect(
        page.locator(".seg-card").filter({ hasText: text }),
      ).toBeVisible();
    }
    await refresh(a, "/story/full");
    await refresh(b, "/story/full");
    const ownA = a.locator(".seg-card").filter({ hasText: storyA }),
      otherOnA = a.locator(".seg-card").filter({ hasText: storyB });
    const ownB = b.locator(".seg-card").filter({ hasText: storyB }),
      otherOnB = b.locator(".seg-card").filter({ hasText: storyA });
    await expect(otherOnA).toBeVisible();
    await expect(otherOnB).toBeVisible();
    await expect(
      otherOnA.getByRole("button", { name: "删除这一段", exact: true }),
    ).toHaveCount(0);
    await expect(
      otherOnB.getByRole("button", { name: "删除这一段", exact: true }),
    ).toHaveCount(0);
    const secondSeq = (await snapshot(b)).data.story_entries.find(
      (x) => x.text === storyB,
    ).seq;
    await a.screenshot({
      path: path.join(output, "story-owner-controls.png"),
      fullPage: true,
    });
    await ui("story: owner A deletes own QA segment", () =>
      ownA.getByRole("button", { name: "删除这一段", exact: true }).click(),
    );
    await expect
      .poll(async () =>
        (await snapshot(a)).data.story_entries.some((x) => x.text === storyA),
      )
      .toBe(false);
    check(
      (await snapshot(b)).data.story_entries.find((x) => x.text === storyB)
        .seq === secondSeq,
      "Deleting a story must not renumber its partner's segment",
    );
    await ui("story: owner B deletes own QA segment", () =>
      ownB.getByRole("button", { name: "删除这一段", exact: true }).click(),
    );
    await expect
      .poll(async () =>
        (await snapshot(b)).data.story_entries.some((x) => x.text === storyB),
      )
      .toBe(false);
    recordCheck("真实发布双方故事，只能删除本人段落，删除不重排对方顺序");

    step = "category deletion migrates current QA record and goal";
    const categoryName =
      "QA-" +
      Date.now().toString(36) +
      "-" +
      crypto.randomBytes(2).toString("hex");
    const categorizedText = run + "-分类删除记录";
    await refresh(a, "/palette");
    await a.getByRole("button", { name: "新增分类", exact: true }).click();
    const categoryDialog = a.getByRole("dialog", {
      name: "分类设置",
      exact: true,
    });
    await categoryDialog.getByLabel("分类名称").fill(categoryName);
    await categoryDialog
      .getByRole("button", { name: "保存分类", exact: true })
      .click();
    await expect(categoryDialog).toHaveCount(0);
    const category = (await snapshot(a)).data.categories.find(
      (x) => x.name === categoryName,
    );
    check(category, "QA category was not saved");
    const saveCategorized = await prepareRecord(a, categorizedText);
    await a
      .getByRole("dialog", { name: "记一笔", exact: true })
      .getByRole("button", { name: categoryName, exact: true })
      .click();
    await saveCategorized.click();
    await waitRecord(a, categorizedText);
    await refresh(a, "/goals");
    await a
      .getByRole("button", { name: "修改约定：" + goalName, exact: true })
      .click();
    const editingGoal = a.getByRole("dialog", {
      name: "编辑约定",
      exact: true,
    });
    await editingGoal
      .getByRole("group", { name: "归属分类", exact: true })
      .getByRole("button", { name: categoryName, exact: true })
      .click();
    await editingGoal
      .getByRole("button", { name: "保存约定", exact: true })
      .click();
    await expect(editingGoal).toHaveCount(0);
    await refresh(b, "/palette");
    await ui("category: partner deletes this run's QA category", () =>
      b
        .getByRole("button", { name: "删除分类：" + categoryName, exact: true })
        .click(),
    );
    await expect
      .poll(async () =>
        (await snapshot(a)).data.categories.some((x) => x.id === category.id),
      )
      .toBe(false);
    const reassigned = await snapshot(a);
    check(
      reassigned.data.entries.find((e) => e.content === categorizedText)
        ?.categoryId === "none",
      "Deleting category must preserve and reassign the QA record",
    );
    check(
      reassigned.data.goals.find((g) => g.name === goalName)?.categoryId ===
        "none",
      "Deleting category must preserve and reassign the QA goal",
    );
    await refresh(a);
    const categorizedRow = a.getByRole("button", {
      name: "修改记录：" + categorizedText,
      exact: true,
    });
    await expect(categorizedRow.locator(".entry-chip")).toHaveText("未分类");
    await a.screenshot({
      path: path.join(output, "category-deletion-keeps-record.png"),
      fullPage: true,
    });
    recordCheck("通过分类页删除本次测试分类，原记录和约定保留并显示未分类");

    step = "delete only content created by this run through the UI";
    async function deleteCurrentRecord(page, text) {
      check(
        text.startsWith(run + "-"),
        "Refusing to delete a record outside this QA run",
      );
      await refresh(page);
      await page.locator(".pair-tabs .pair-tab").first().click();
      await ui("cleanup: open current QA record", () =>
        page
          .getByRole("button", { name: "修改记录：" + text, exact: true })
          .click(),
      );
      await ui("cleanup: confirm current QA record deletion", () =>
        page
          .getByRole("dialog", { name: "改一笔", exact: true })
          .getByRole("button", { name: "删除这条记录", exact: true })
          .click(),
      );
      await expect
        .poll(async () =>
          (await snapshot(page)).data.entries.some((e) => e.content === text),
        )
        .toBe(false);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await refresh(a, "/wishlist");
    await a
      .getByRole("button", { name: "删除愿望：" + wishName, exact: true })
      .click();
    await expect
      .poll(async () =>
        (await snapshot(a)).data.wishlist.some((w) => w.name === wishName),
      )
      .toBe(false);
    for (const text of [firstText, secondText, textA, categorizedText])
      await deleteCurrentRecord(a, text);
    await deleteCurrentRecord(b, textB);
    const beforeGoalDelete = await snapshot(a),
      goalId = beforeGoalDelete.data.goals.find((g) => g.name === goalName).id;
    const earned = beforeGoalDelete.data.points_ledger.filter(
      (p) => p.entryId === entry.id,
    );
    await refresh(a, "/goals");
    await goal
      .getByRole("button", { name: "更多操作：" + goalName, exact: true })
      .click();
    await goal.getByRole("button", { name: "删除", exact: true }).click();
    await expect
      .poll(async () =>
        (await snapshot(a)).data.goals.some((g) => g.id === goalId),
      )
      .toBe(false);
    const afterGoalDelete = await snapshot(a);
    check(
      afterGoalDelete.data.entries.some((e) => e.id === entry.id),
      "Deleting the QA goal removed its historical checkin",
    );
    check(
      JSON.stringify(
        afterGoalDelete.data.points_ledger.filter(
          (p) => p.entryId === entry.id,
        ),
      ) === JSON.stringify(earned),
      "Deleting the QA goal changed already earned points",
    );
    await deleteCurrentRecord(a, checkinText);
    recordCheck(
      "页面删除本次记录/愿望/约定；删除约定保留打卡及积分，再单独删除本次打卡",
    );
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

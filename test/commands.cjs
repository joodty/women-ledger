"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { spawn } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "women-commands-")),
  base = "http://127.0.0.1:24760";
const child = spawn(process.execPath, ["server.cjs"], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, WOMEN_DATA_DIR: dir, PORT: "24760" },
  stdio: "pipe",
});
async function req(url, body, cookie) {
  const r = await fetch(base + url, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const command = (type, payload, expectedVersion) => ({
  id: crypto.randomUUID(),
  type,
  payload,
  ...(expectedVersion === undefined ? {} : { expectedVersion }),
});
(async () => {
  try {
    for (let i = 0; i < 80; i++) {
      try {
        await fetch(base);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const password = "test-password-123";
    await req("/api/register", { username: "alice", password });
    const a = await req("/api/login", { user: "alice", password });
    let first = await req("/api/v2/bootstrap", null, a.cookie);
    assert.equal(first.status, 200);
    const inv = await req("/api/invite", {}, a.cookie);
    await req("/api/register", {
      username: "bob",
      password,
      invitation: inv.data.token,
    });
    const b = await req("/api/login", { user: "bob", password });
    await req("/api/v2/bootstrap", null, b.cookie);
    await req("/api/register", { username: "outsider", password });
    const outsider = await req("/api/login", { user: "outsider", password });
    for (const id of ["one", "two"])
      assert.equal(
        (
          await req(
            "/api/v2/commands",
            command("goal.create", {
              id,
              name: id,
              kind: "repeat",
              scope: "both",
              timesPerWeek: 3,
              pointsPerCheckin: 3,
            }),
            a.cookie,
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await req(
          "/api/v2/commands",
          command("goal.join", { id: "one" }),
          b.cookie,
        )
      ).status,
      200,
    );
    let current = await req("/api/v2/bootstrap", null, b.cookie);
    assert.equal(
      current.data.data.goals.find((g) => g.id === "two").joined,
      false,
    );
    assert.equal(
      (
        await req(
          "/api/v2/commands",
          command("goal.join", { id: "one" }),
          outsider.cookie,
        )
      ).status,
      404,
    );
    const entry = (id, content, visibility = "shared") => ({
      id,
      content,
      start: "10:00",
      end: "11:00",
      date: "2026-11-02",
      visibility,
    });
    const create = command(
      "record.create",
      entry("entry-a", "Alice record", "private"),
    );
    const initial = await req("/api/v2/commands", create, a.cookie);
    assert.equal(initial.status, 200);
    assert.equal(
      (await req("/api/v2/commands", create, a.cookie)).data.replayed,
      true,
    );
    assert.equal(
      (
        await req(
          "/api/v2/commands",
          { ...create, payload: { ...create.payload, content: "tampered" } },
          a.cookie,
        )
      ).status,
      409,
    );
    const simultaneous = await Promise.all([
      req(
        "/api/v2/commands",
        command("record.create", entry("entry-a2", "a2")),
        a.cookie,
      ),
      req(
        "/api/v2/commands",
        command("record.create", entry("entry-b", "b")),
        b.cookie,
      ),
    ]);
    assert(simultaneous.every((r) => r.status === 200));
    current = await req("/api/v2/bootstrap", null, b.cookie);
    assert(!JSON.stringify(current.data).includes("Alice record"));
    assert(!current.data.versions.entries["entry-a"]);
    assert.equal(
      (
        await req(
          "/api/v2/commands",
          command("record.update", entry("entry-a", "forged"), 1),
          b.cookie,
        )
      ).status,
      403,
    );
    const update = command(
      "record.update",
      entry("entry-a", "updated", "private"),
      1,
    );
    assert.equal((await req("/api/v2/commands", update, a.cookie)).status, 200);
    const conflict = await req(
      "/api/v2/commands",
      command("record.update", entry("entry-a", "stale", "private"), 1),
      a.cookie,
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.data.code, "conflict");
    assert.equal(conflict.data.details.current.content, "updated");
    const story = await req(
      "/api/v2/commands",
      command("story.publish", { id: "story-a", text: "字".repeat(10000) }),
      a.cookie,
    );
    assert.equal(story.status, 200);
    assert.equal(
      (
        await req(
          "/api/v2/commands",
          command("story.publish", {
            id: "story-too-long",
            text: "字".repeat(10001),
          }),
          a.cookie,
        )
      ).status,
      400,
    );
    const published = await Promise.all([
      req(
        "/api/v2/commands",
        command("story.publish", { id: "story-2", text: "第二段" }),
        a.cookie,
      ),
      req(
        "/api/v2/commands",
        command("story.publish", { id: "story-3", text: "第三段" }),
        b.cookie,
      ),
    ]);
    assert(published.every((r) => r.status === 200));
    assert.equal(
      new Set(published[1].data.data.story_entries.map((x) => x.seq)).size,
      3,
    );
    const old = await req("/api/state", null, b.cookie);
    old.data.data.story_entries[0].text = "changed by other";
    assert.equal(
      (
        await req(
          "/api/state",
          { revision: old.data.revision, data: old.data.data },
          b.cookie,
        )
      ).status,
      409,
    );
    const own = await req("/api/v2/bootstrap", null, a.cookie);
    assert.equal(
      own.data.data.entries.filter((e) => e.id === "entry-a").length,
      1,
    );
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(dir, "ledger.sqlite"));
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert(db.prepare("SELECT count(*) n FROM entity_rows").get().n > 0);
    assert(db.prepare("SELECT count(*) n FROM command_receipts").get().n > 0);
    db.close();
    console.log(
      "PASS: v2 command isolation, idempotence, concurrent edits, conflict versions, stories and entity storage",
    );
  } finally {
    child.kill();
    setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

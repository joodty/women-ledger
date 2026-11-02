"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawnSync, spawn } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "women-artifact-test-")),
  root = path.join(dir, "live"),
  stage = path.join(dir, "stage"),
  port = 24765;
fs.mkdirSync(root);
process.env.LEDGER_ROOT = root;
process.env.LEDGER_TEST_PORT = String(port);
const updater = require("../ops/updater-v2.cjs");
let child;
function pack() {
  const r = spawnSync(process.execPath, ["ops/package-release.mjs"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
}
(async () => {
  try {
    pack();
    const archive = path.resolve(__dirname, "../dist/women-web-v2.tar.gz"),
      sum = fs.readFileSync(archive + ".sha256", "utf8").split(/\s/)[0];
    assert.equal(updater.digest(archive), sum);
    const meta = updater.unpack(archive, stage);
    assert.equal(meta.schema, 2);
    assert(fs.existsSync(path.join(stage, "runtime.cjs")));
    assert(!fs.existsSync(path.join(stage, "node_modules")));
    const badDir = path.join(dir, "bad");
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, "data.sqlite"), "not allowed");
    const bad = path.join(dir, "bad.tar.gz");
    assert.equal(
      spawnSync("tar", ["-czf", bad, "-C", badDir, "data.sqlite"]).status,
      0,
    );
    assert.throws(
      () => updater.unpack(bad, path.join(dir, "bad-stage")),
      /unsafe archive/,
    );
    if (process.env.LEDGER_TEST_RESTART) {
      for (const name of ["server.cjs", "runtime.cjs"])
        fs.copyFileSync(path.join(stage, name), path.join(root, name));
      fs.cpSync(path.join(stage, "public"), path.join(root, "public"), {
        recursive: true,
      });
      const supervisor = path.join(dir, "supervisor.cjs");
      fs.writeFileSync(
        supervisor,
        "const{spawn}=require('child_process');let c;function start(){c=spawn(process.execPath,[process.argv[2]],{env:process.env,stdio:'ignore'});c.on('exit',()=>setTimeout(start,200))}process.on('SIGTERM',()=>{c.kill();process.exit()});start();",
      );
      child = spawn(
        process.execPath,
        [supervisor, path.join(root, "server.cjs")],
        {
          env: {
            ...process.env,
            PORT: String(port),
            WOMEN_DATA_DIR: path.join(root, "data"),
          },
          stdio: "ignore",
        },
      );
      fs.writeFileSync(path.join(root, "supervisor.pid"), String(child.pid));
      for (let i = 0; i < 80; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(await updater.deploy(stage, meta, "v-test"), true);
      assert.equal(await updater.deploy(stage, meta, "v-test"), false);
      assert.equal(
        JSON.parse(
          fs.readFileSync(path.join(root, "release-updater-state.json")),
        ).deployed,
        meta.commit,
      );
    }
    console.log(
      "PASS: release artifact, checksum, safe extraction, standalone runtime" +
        (process.env.LEDGER_TEST_RESTART ? " and supervised activation" : ""),
    );
  } finally {
    child?.kill();
    setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 500);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

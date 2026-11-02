"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  http = require("node:http"),
  { spawnSync, spawn } = require("node:child_process");
const root = process.env.LEDGER_ROOT || path.join(os.homedir(), "women-ledger"),
  stateFile = path.join(root, "release-updater-state.json"),
  interval = 300000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    ...options,
  });
  if (r.error || r.status !== 0)
    throw Error(
      command +
        " failed: " +
        String(r.error?.message || r.stderr || r.status).slice(0, 250),
    );
  return (r.stdout || "").trim();
}
function state() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
function save(value) {
  fs.writeFileSync(stateFile + ".tmp", JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(stateFile + ".tmp", stateFile);
}
function digest(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
async function download(url, file, max) {
  const r = await fetch(url, {
    headers: { "User-Agent": "women-ledger-updater-v2" },
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok || Number(r.headers.get("content-length")) > max)
    throw Error("artifact download HTTP " + r.status);
  let size = 0;
  const fd = fs.openSync(file, "w", 0o600);
  try {
    for await (const chunk of r.body) {
      size += chunk.length;
      if (size > max) throw Error("artifact too large");
      fs.writeSync(fd, chunk);
    }
  } finally {
    fs.closeSync(fd);
  }
}
function unpack(archive, target) {
  const names = run("tar", ["-tzf", archive]).split("\n");
  for (const raw of names) {
    const name = raw.trim().replace(/\/$/, "");
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      !(
        /^(server\.cjs|runtime\.cjs|release-manifest\.json|release-updater\.cjs)$/.test(
          name,
        ) || /^public(?:\/[a-zA-Z0-9_.-]+)*$/.test(name)
      )
    )
      throw Error("unsafe archive path");
  }
  const list = run("tar", ["-tvzf", archive]);
  if (list.split("\n").some((line) => /^[lh]/.test(line)))
    throw Error("archive links are forbidden");
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  run("tar", ["-xzf", archive, "-C", target]);
  for (const name of [
    "server.cjs",
    "runtime.cjs",
    "public/index.html",
    "public/app-version.json",
    "release-manifest.json",
  ])
    if (!fs.statSync(path.join(target, name)).isFile())
      throw Error("artifact is incomplete");
  const meta = JSON.parse(
    fs.readFileSync(path.join(target, "release-manifest.json"), "utf8"),
  );
  if (meta.schema !== 2 || !/^[0-9a-f]{40}$/.test(meta.commit))
    throw Error("invalid release manifest");
  run(process.execPath, ["--check", path.join(target, "runtime.cjs")]);
  return meta;
}
async function health(port, version, timeout = 25000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      const value = await new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/health`,
          { timeout: 2000 },
          (res) => {
            let s = "";
            res.on("data", (c) => (s += c));
            res.on("end", () => {
              try {
                resolve(JSON.parse(s));
              } catch {
                reject(Error("invalid health"));
              }
            });
          },
        );
        req.on("timeout", () => req.destroy(Error("timeout")));
        req.on("error", reject);
      });
      if (value.ok && (!version || value.version === version)) return;
    } catch {}
    await pause(500);
  }
  throw Error("release health check failed");
}
function serverPid() {
  const parent = Number(
    fs.readFileSync(path.join(root, "supervisor.pid"), "utf8"),
  );
  if (!Number.isSafeInteger(parent) || parent < 2)
    throw Error("invalid supervisor");
  const rows = run("ps", ["-A", "-o", "pid,ppid,args"])
    .split("\n")
    .map((s) => s.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .filter(
      (m) =>
        Number(m[2]) === parent && m[3].includes(path.join(root, "server.cjs")),
    );
  if (rows.length !== 1)
    throw Error("cannot identify supervised ledger process");
  return Number(rows[0][1]);
}
async function restarted(old) {
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    try {
      if (serverPid() !== old) return;
    } catch {}
    await pause(500);
  }
  throw Error("supervisor did not restart the ledger");
}
function replaceFile(source, destination) {
  fs.copyFileSync(source, destination + ".next");
  fs.renameSync(destination + ".next", destination);
}
async function preflight(stage, backup, work, version) {
  const data = path.join(work, "preflight-data");
  fs.mkdirSync(data, { mode: 0o700 });
  fs.copyFileSync(backup, path.join(data, "ledger.sqlite"));
  const net = require("node:net");
  const port = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const child = spawn(process.execPath, [path.join(stage, "server.cjs")], {
    cwd: stage,
    env: {
      ...process.env,
      WOMEN_DATA_DIR: data,
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: "ignore",
  });
  let error;
  child.on("error", (e) => (error = e));
  try {
    await health(port, version, 15000);
    if (error) throw error;
  } finally {
    child.kill();
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      pause(1000),
    ]);
  }
}
async function deploy(stage, manifest, tag) {
  const old = state();
  if (old.deployed === manifest.commit || old.failed === manifest.commit)
    return false;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    work = path.join(root, "release-updater-work", stamp);
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  const backup = path.join(
    root,
    "data",
    "backups",
    "before-v2-" + stamp + ".sqlite",
  );
  run(process.execPath, [path.join(root, "server.cjs"), "backup", backup]);
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(backup, { readOnly: true });
  const ok = db.prepare("PRAGMA integrity_check").get().integrity_check;
  db.close();
  if (ok !== "ok") throw Error("database backup integrity failed");
  await preflight(stage, backup, work, manifest.version);
  const previous = path.join(work, "previous");
  fs.mkdirSync(previous);
  for (const name of ["server.cjs", "runtime.cjs"])
    if (fs.existsSync(path.join(root, name)))
      fs.copyFileSync(path.join(root, name), path.join(previous, name));
  fs.cpSync(path.join(root, "public"), path.join(previous, "public"), {
    recursive: true,
  });
  const publicDir = path.join(root, "public"),
    assets = path.join(stage, "public", "assets");
  if (fs.existsSync(assets))
    fs.cpSync(assets, path.join(publicDir, "assets"), { recursive: true });
  try {
    const pid = serverPid();
    replaceFile(
      path.join(stage, "runtime.cjs"),
      path.join(root, "runtime.cjs"),
    );
    replaceFile(path.join(stage, "server.cjs"), path.join(root, "server.cjs"));
    process.kill(pid, "SIGTERM");
    await restarted(pid);
    await health(
      Number(process.env.LEDGER_TEST_PORT || 18763),
      manifest.version,
    );
    replaceFile(
      path.join(stage, "public", "index.html"),
      path.join(publicDir, "index.html"),
    );
    replaceFile(
      path.join(stage, "public", "app-version.json"),
      path.join(publicDir, "app-version.json"),
    );
    save({
      deployed: manifest.commit,
      tag,
      version: manifest.version,
      at: new Date().toISOString(),
      backup,
      protocol: 2,
    });
    log("deployed", tag, manifest.commit.slice(0, 8));
    return true;
  } catch (e) {
    for (const name of ["server.cjs", "runtime.cjs"])
      if (fs.existsSync(path.join(previous, name)))
        replaceFile(path.join(previous, name), path.join(root, name));
    fs.cpSync(path.join(previous, "public"), publicDir, { recursive: true });
    try {
      process.kill(serverPid(), "SIGTERM");
    } catch {}
    save({
      ...old,
      failed: manifest.commit,
      failedAt: new Date().toISOString(),
      backup,
    });
    throw e;
  }
}
async function poll() {
  const r = await fetch(
    "https://api.github.com/repos/joodty/women-ledger/releases/latest",
    {
      headers: { "User-Agent": "women-ledger-updater-v2" },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (r.status === 404) {
    log("no published release");
    return;
  }
  if (!r.ok) throw Error("GitHub API " + r.status);
  const release = await r.json();
  if (release.draft || release.prerelease) return;
  const tag = release.tag_name;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(tag))
    throw Error("invalid tag");
  const assets = release.assets || [],
    artifact = assets.find((a) => a.name === "women-web-v2.tar.gz"),
    checksum = assets.find((a) => a.name === "women-web-v2.tar.gz.sha256");
  if (!artifact || !checksum) {
    log("waiting for GitHub build artifacts", tag);
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "women-artifact-"));
  try {
    const archive = path.join(work, "release.tar.gz"),
      sum = path.join(work, "checksum.txt");
    for (const a of [artifact, checksum])
      if (
        !a.browser_download_url.startsWith(
          "https://github.com/joodty/women-ledger/releases/download/",
        )
      )
        throw Error("untrusted artifact URL");
    await download(artifact.browser_download_url, archive, 25 * 1024 * 1024);
    await download(checksum.browser_download_url, sum, 1024);
    const expected = fs.readFileSync(sum, "utf8").trim().split(/\s/)[0];
    if (!/^[0-9a-f]{64}$/.test(expected) || digest(archive) !== expected)
      throw Error("artifact checksum mismatch");
    const stage = path.join(work, "stage"),
      meta = unpack(archive, stage);
    if (state().deployed === meta.commit || state().failed === meta.commit) {
      log("already handled", tag);
      return;
    }
    const gitDir = path.join(root, "release-updater-cache.git");
    if (!fs.existsSync(gitDir)) run("git", ["init", "--bare", gitDir]);
    const git = (args) => run("git", ["--git-dir", gitDir, ...args]);
    git([
      "fetch",
      "--no-tags",
      "https://github.com/joodty/women-ledger.git",
      "+refs/heads/main:refs/remotes/origin/main",
      `+refs/tags/${tag}:refs/tags/${tag}`,
    ]);
    if (git(["rev-parse", `refs/tags/${tag}^{commit}`]) !== meta.commit)
      throw Error("artifact commit differs from release tag");
    git([
      "merge-base",
      "--is-ancestor",
      meta.commit,
      "refs/remotes/origin/main",
    ]);
    const version = JSON.parse(
        fs.readFileSync(path.join(stage, "public", "app-version.json"), "utf8"),
      ),
      name = path.basename(version.downloadPath || "");
    if (!/^women-ledger-\d+\.\d+\.\d+\.apk$/.test(name))
      throw Error("invalid native version metadata");
    const target = path.join(root, "public", "downloads", name);
    if (!fs.existsSync(target)) {
      const apk = assets.find((a) => a.name === name);
      if (!apk) {
        log("waiting for signed APK asset", name);
        return;
      }
      if (
        !apk.browser_download_url.startsWith(
          "https://github.com/joodty/women-ledger/releases/download/",
        )
      )
        throw Error("untrusted APK URL");
      const next = path.join(work, name);
      await download(apk.browser_download_url, next, 80 * 1024 * 1024);
      if (
        apk.digest?.startsWith("sha256:") &&
        digest(next) !== apk.digest.slice(7)
      )
        throw Error("APK checksum mismatch");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      replaceFile(next, target);
    }
    await deploy(stage, meta, tag);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
async function main() {
  fs.mkdirSync(root, { recursive: true });
  const pidFile = path.join(root, "release-updater.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    if (Number.isSafeInteger(pid) && pid > 1) {
      try {
        process.kill(pid, 0);
        throw Error("updater already running");
      } catch (e) {
        if (e.code !== "ESRCH") throw e;
      }
    }
    fs.unlinkSync(pidFile);
  }
  fs.writeFileSync(pidFile, String(process.pid), { flag: "wx", mode: 0o600 });
  process.on("exit", () => {
    try {
      if (fs.readFileSync(pidFile, "utf8") === String(process.pid))
        fs.unlinkSync(pidFile);
    } catch {}
  });
  for (const sig of ["SIGTERM", "SIGINT"])
    process.on(sig, () => process.exit());
  do {
    try {
      await poll();
    } catch (e) {
      log("check failed", e.message);
    }
    if (process.argv.includes("--once")) break;
    await pause(interval);
  } while (true);
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { main, unpack, digest, deploy };

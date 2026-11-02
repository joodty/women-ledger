"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
require("./database.cjs");
if (["setup", "passwd", "backup"].includes(process.argv[2])) {
  require("./cli.cjs");
  return;
}
require("./repository.cjs");
const { session } = require("./security.cjs"),
  { send, sameOrigin } = require("./http.cjs"),
  { logError } = require("./errors.cjs");
const auth = require("./routes/auth.cjs"),
  state = require("./routes/state.cjs"),
  redemptions = require("./routes/redemptions.cjs"),
  commands = require("./routes/commands.cjs");
const root = process.env.WOMEN_APP_ROOT,
  publicDir =
    process.env.WOMEN_PUBLIC_DIR ||
    path.join(
      root,
      fs.existsSync(path.join(root, "dist", "public", "index.html"))
        ? "dist/public"
        : "public",
    );
function staticFile(req, res, pathname) {
  if (pathname === "/app-version.json" && req.method === "GET") {
    try {
      const info = JSON.parse(
        fs.readFileSync(path.join(publicDir, "app-version.json"), "utf8"),
      );
      if (
        !Number.isSafeInteger(info.versionCode) ||
        info.versionCode < 1 ||
        !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(info.versionName) ||
        info.downloadPath !==
          "/download/women-ledger-" + info.versionName + ".apk"
      )
        throw Error();
      const apk =
        process.env.WOMEN_APK_PATH ||
        path.join(publicDir, "downloads", path.basename(info.downloadPath));
      if (!fs.statSync(apk).isFile()) throw Error();
      return send(res, 200, info);
    } catch {
      return send(res, 503, { error: "更新包尚未准备好" });
    }
  }
  if (!["GET", "HEAD"].includes(req.method)) return false;
  const apk = /^\/download\/women-ledger-\d{1,3}\.\d{1,3}\.\d{1,3}\.apk$/.test(
    pathname,
  );
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  if (
    !apk &&
    !["index.html"].includes(name) &&
    !/^assets\/[a-zA-Z0-9_.-]+$/.test(name)
  )
    return false;
  const file = apk
    ? process.env.WOMEN_APK_PATH ||
      path.join(publicDir, "downloads", path.basename(pathname))
    : path.join(publicDir, name);
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return send(res, 404, { error: "文件不存在" });
  }
  const type = apk
    ? "application/vnd.android.package-archive"
    : file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".svg")
          ? "image/svg+xml"
          : "text/html";
  res.writeHead(200, {
    "Content-Type": type + (apk ? "" : "; charset=utf-8"),
    "Content-Length": size,
    "Cache-Control": name.startsWith("assets/")
      ? "public, max-age=31536000, immutable"
      : "no-store",
    ...(apk
      ? {
          "Content-Disposition":
            'attachment; filename="' + path.basename(pathname) + '"',
        }
      : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  const stream = fs.createReadStream(file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
  return true;
}
const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  let pathname = "/";
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/health" && req.method === "GET")
      return send(res, 200, {
        ok: true,
        version: require("../package.json").version,
        protocol: 2,
      });
    if (staticFile(req, res, pathname)) return;
    if (req.method === "POST" && !sameOrigin(req))
      return send(res, 403, {
        code: "origin",
        error: "请求来源不匹配",
        requestId,
      });
    if (await auth(req, res, pathname)) return;
    const s = session(req);
    if (!s)
      return send(res, 401, {
        code: "unauthenticated",
        error: "请先登录",
        requestId,
      });
    if (await commands(req, res, pathname, s)) return;
    if (await redemptions(req, res, pathname, s)) return;
    if (await state(req, res, pathname, s)) return;
    send(res, 404, { code: "not_found", error: "未找到", requestId });
  } catch (e) {
    logError(requestId, req.method, pathname, e);
    if (!res.headersSent && !res.destroyed)
      send(res, e.status || 500, {
        code: e.code || "internal",
        error: e.status ? e.message : "服务器暂时无法处理，请稍后重试",
        details: e.details,
        requestId,
      });
  }
});
const { dailyBackup } = require("./backups.cjs");
server.listen(
  Number(process.env.PORT || 18763),
  process.env.HOST || "127.0.0.1",
  () => {
    console.log("账本服务 v2 已启动");
    dailyBackup().catch(() => {});
  },
);
setInterval(() => dailyBackup().catch(() => {}), 86400000).unref();
module.exports = server;

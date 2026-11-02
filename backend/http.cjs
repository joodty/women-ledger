"use strict";
function send(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
  return true;
}
function cookie(req) {
  const match = (req.headers.cookie || "").match(
    /(?:^|;\s*)women_session=([a-f0-9]{64})(?:;|$)/,
  );
  return match && match[1];
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return (
      new URL(origin).host === req.headers.host &&
      ["http:", "https:"].includes(new URL(origin).protocol)
    );
  } catch {
    return false;
  }
}
function getBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Error("请求内容过大"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Error("无效 JSON"));
      }
    });
    req.on("error", reject);
  });
}
module.exports = { send, cookie, sameOrigin, getBody };

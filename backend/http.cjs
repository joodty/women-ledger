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
function getBytes(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0,
      chunks = [];
    req.on("error", reject);
    req.on("aborted", () => reject(Error("请求已中断")));
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Error("请求内容过大"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}
async function getBody(req, limit = 2 * 1024 * 1024) {
  try {
    return JSON.parse((await getBytes(req, limit)).toString("utf8"));
  } catch (e) {
    if (e instanceof SyntaxError) throw Error("无效 JSON");
    throw e;
  }
}
module.exports = { send, cookie, sameOrigin, getBody, getBytes };

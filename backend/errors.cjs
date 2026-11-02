"use strict";
const fs = require("node:fs"),
  path = require("node:path");
class DomainError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
function fail(condition, code, message, status = 400, details) {
  if (!condition) throw new DomainError(code, message, status, details);
}
function logError(id, method, route, error) {
  const folder = path.join(
    process.env.WOMEN_DATA_DIR || path.join(process.env.WOMEN_APP_ROOT, "data"),
    "logs",
  );
  try {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, "errors.jsonl");
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
      if (fs.existsSync(file + ".1")) fs.unlinkSync(file + ".1");
      fs.renameSync(file, file + ".1");
    }
    fs.appendFileSync(
      file,
      JSON.stringify({
        at: new Date().toISOString(),
        requestId: id,
        method,
        route,
        code: error.code || "internal",
        status: error.status || 500,
        errorType: error.name,
      }) + "\n",
      { mode: 0o600 },
    );
  } catch {}
  console.error(
    JSON.stringify({
      requestId: id,
      route,
      code: error.code || "internal",
      errorType: error.name,
    }),
  );
}
module.exports = { DomainError, fail, logError };

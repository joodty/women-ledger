import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
function run(file, args = []) {
  const r = spawnSync(process.execPath, [file, ...args], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
run("node_modules/vue-tsc/bin/vue-tsc.js", ["--noEmit"]);
run("node_modules/vite/bin/vite.js", ["build"]);
await build({
  entryPoints: ["backend/app.cjs"],
  outfile: "dist/runtime.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: false,
});
fs.copyFileSync("server.cjs", "dist/server.cjs");
fs.copyFileSync("public/app-version.json", "dist/public/app-version.json");
await build({
  entryPoints: ["ops/release-updater.cjs"],
  outfile: "dist/release-updater.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
});
console.log("Built Vue frontend and standalone Node runtime.");

import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
fs.writeFileSync(
  "dist/release-manifest.json",
  JSON.stringify({
    schema: 2,
    commit,
    version,
    createdAt: new Date().toISOString(),
  }) + "\n",
);
const artifact = "dist/women-web-v2.tar.gz";
const r = spawnSync(
  "tar",
  [
    "-czf",
    artifact,
    "-C",
    "dist",
    "server.cjs",
    "runtime.cjs",
    "release-manifest.json",
    "release-updater.cjs",
    "public",
  ],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(1);
const hash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(artifact))
  .digest("hex");
fs.writeFileSync(artifact + ".sha256", hash + "  women-web-v2.tar.gz\n");
console.log("Release artifact:", artifact, hash);

#!/usr/bin/env node
// Builds the prebuilt download: release/neatroots.tar.gz and release/neatroots.tar.gz.sha256.
//
//   pnpm install --frozen-lockfile && pnpm build && node scripts/package.mjs
//
// One bundle serves macOS and Linux on arm64 and x64: the code is JavaScript, and better-sqlite3
// ships Node-API binaries for each platform, which work on any Node 22+. install.sh supplies Node
// when the machine has none. Unpacked to ~/.neatroots/app:
//
//   neatroots/dist/cli.js (+ dist/ui, library, proto, node_modules)
//   steer/python/neatroots-steer   steer/ts   skills/   docs/   install.sh   .neatroots-bundle

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "release");
const stage = path.join(outDir, "stage");
const log = (m) => console.log(`[package] ${m}`);
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: "inherit", cwd: root, ...opts });
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

for (const f of ["packages/neatroots/dist/cli.js", "packages/neatroots/dist/ui/index.html", "packages/steer-ts/dist/index.js"]) {
  if (!fs.existsSync(path.join(root, f))) throw new Error(`${f} is missing; run pnpm build first`);
}
const version = JSON.parse(fs.readFileSync(path.join(root, "packages/neatroots/package.json"), "utf8")).version;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// ------------------------------------------------------------ the app
log(`deploying @neatlogs/neatroots ${version} with production dependencies`);
run("pnpm", ["--filter", "@neatlogs/neatroots", "deploy", "--prod", "--legacy", path.join(stage, "neatroots")]);

const sqlite = fs.realpathSync(path.join(stage, "neatroots/node_modules/better-sqlite3"));
// A local build (build/Release) would win over the prebuilt binaries and only fits this machine;
// the SQLite sources are only for compiling.
for (const f of ["build", "deps", "src", "binding.gyp"]) fs.rmSync(path.join(sqlite, f), { recursive: true, force: true });
for (const f of fs.readdirSync(path.join(sqlite, "prebuilds"))) {
  if (f.startsWith("win32-")) fs.rmSync(path.join(sqlite, "prebuilds", f));
}
const platforms = fs.readdirSync(path.join(sqlite, "prebuilds")).map((f) => f.replace(/\.node$/, ""));
for (const want of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]) {
  if (!platforms.includes(want)) throw new Error(`better-sqlite3 has no prebuilt binary for ${want}`);
}
log(`better-sqlite3 binaries: ${platforms.join(", ")}`);

// ------------------------------------------------------------ steering hooks, docs, installer
const copy = (from, to, filter) => fs.cpSync(path.join(root, from), path.join(stage, to), { recursive: true, filter });
const skipCaches = (src) => !/(__pycache__|\.pytest_cache|\.venv|node_modules|\.DS_Store)/.test(src);
for (const f of ["dist", "package.json", "README.md", "LICENSE"]) copy(`packages/steer-ts/${f}`, `steer/ts/${f}`);
for (const f of ["src", "pyproject.toml", "README.md", "LICENSE"]) copy(`python/neatroots-steer/${f}`, `steer/python/neatroots-steer/${f}`, skipCaches);
for (const f of ["getting-started.md", "mcp.md", "steering.md", "checks.md", "cloud.md"]) copy(`docs/${f}`, `docs/${f}`);
copy("skills", "skills", skipCaches);
copy("install.sh", "install.sh");
copy("LICENSE", "LICENSE");
let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {
  /* not a checkout */
}
fs.writeFileSync(path.join(stage, ".neatroots-bundle"), `${JSON.stringify({ version, commit, built: new Date().toISOString() }, null, 2)}\n`);

// ------------------------------------------------------------ smoke test, with this machine's Node
const out = execFileSync(process.execPath, [path.join(stage, "neatroots/dist/cli.js"), "--version"], { encoding: "utf8" }).trim();
execFileSync(process.execPath, ["-e", "const D=require(process.argv[1]);const d=new D(':memory:');d.exec('create virtual table t using fts5(x)');d.close()", sqlite]);
log(`smoke test: neatroots ${out}; SQLite with FTS5 opens on ${process.platform}-${process.arch}, Node ${process.versions.node}`);

// ------------------------------------------------------------ archive
const tarball = path.join(outDir, "neatroots.tar.gz");
run("tar", ["-czf", tarball, "-C", stage, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
fs.writeFileSync(`${tarball}.sha256`, `${sha256(tarball)}  ${path.basename(tarball)}\n`);
log(`${path.relative(root, tarball)} (${(fs.statSync(tarball).size / 1e6).toFixed(1)} MB)`);

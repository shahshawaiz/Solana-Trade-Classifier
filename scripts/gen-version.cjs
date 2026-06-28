// Build-time version stamp. Derives an auto-incrementing version from git so that EVERY new
// commit produces a new version string with no manual bumping:
//
//     version  = <major>.<minor>.<commitCount>     e.g. 2.0.148   (patch = `git rev-list --count HEAD`)
//     display  = v<version> (<shortSha>)           e.g. v2.0.148 (62936ed)
//
// Writes ./version.json (gitignored — regenerated on every build/dev start). The server reads it at
// runtime and exposes it at GET /api/version; the UI shows `display` in the header. Falls back to the
// platform commit SHA (Railway sets RAILWAY_GIT_COMMIT_SHA) when git isn't available at build time.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");

function git(cmd, fallback = "") {
  try {
    return execSync(`git ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return fallback;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const [major = "0", minor = "0"] = String(pkg.version || "0.0.0").split(".");

// Commit count is the auto-incrementing patch. Falls back to 0 when git history is unavailable.
const count = git("rev-list --count HEAD", "0") || "0";
const envSha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.DEPLOYMENT_ID || "";
const fullCommit = git("rev-parse HEAD", envSha);
const commit = (git("rev-parse --short HEAD", "") || envSha.slice(0, 7)) || "unknown";
const branch = git("rev-parse --abbrev-ref HEAD", process.env.RAILWAY_GIT_BRANCH || "");
const dirty = git("status --porcelain", "").length > 0;

const version = `${major}.${minor}.${count}`;
const display = `v${version} (${commit})${dirty ? "*" : ""}`;

const info = {
  version,
  semverBase: pkg.version || "0.0.0",
  build: Number(count) || 0,
  commit,
  fullCommit,
  branch,
  dirty,
  buildTime: new Date().toISOString(),
  display,
};

fs.writeFileSync(path.join(root, "version.json"), JSON.stringify(info, null, 2) + "\n", "utf8");
console.log(`[gen-version] ${display}  (branch ${branch || "?"}, built ${info.buildTime})`);

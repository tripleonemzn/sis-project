#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== SIS Mobile Release Config Check =="

node <<'NODE'
const fs = require("fs");
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const errors = [];
const expo = app.expo || {};

if (!/^\d+\.\d+\.\d+$/.test(pkg.version || "")) {
  errors.push("package.json version harus format semver x.y.z");
}

if (expo.version !== pkg.version) {
  errors.push(`app.json expo.version (${expo.version}) harus sama dengan package.json version (${pkg.version})`);
}

if (!expo.android || !expo.android.package) {
  errors.push("app.json expo.android.package wajib diisi");
}

if (!expo.ios || !expo.ios.bundleIdentifier) {
  errors.push("app.json expo.ios.bundleIdentifier wajib diisi");
}

if (!Number.isInteger(expo.android?.versionCode) || expo.android.versionCode < 1) {
  errors.push("app.json expo.android.versionCode harus integer >= 1");
}

if (!/^\d+$/.test(String(expo.ios?.buildNumber || ""))) {
  errors.push("app.json expo.ios.buildNumber harus angka string, contoh: \"12\"");
}

if (!expo.runtimeVersion || expo.runtimeVersion.policy !== "appVersion") {
  errors.push("app.json expo.runtimeVersion.policy harus \"appVersion\"");
}

if (errors.length) {
  console.error("[FAIL]");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("[OK] Release config valid");
NODE

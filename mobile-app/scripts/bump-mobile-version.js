#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const level = process.argv[2] || "patch";
if (!["major", "minor", "patch"].includes(level)) {
  console.error("Usage: node scripts/bump-mobile-version.js [major|minor|patch]");
  process.exit(1);
}

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const appJsonPath = path.join(rootDir, "app.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

const currentVersion = packageJson.version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion);
if (!match) {
  console.error(`Version tidak valid di package.json: ${currentVersion}`);
  process.exit(1);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

if (level === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (level === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const nextVersion = `${major}.${minor}.${patch}`;
packageJson.version = nextVersion;
if (!appJson.expo) appJson.expo = {};
appJson.expo.version = nextVersion;

if (!appJson.expo.android) appJson.expo.android = {};
const currentVersionCode = Number(appJson.expo.android.versionCode || 0);
appJson.expo.android.versionCode = currentVersionCode + 1;

if (!appJson.expo.ios) appJson.expo.ios = {};
const currentBuildNumber = Number(appJson.expo.ios.buildNumber || 0);
appJson.expo.ios.buildNumber = String(currentBuildNumber + 1);

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

console.log(`Version updated: ${currentVersion} -> ${nextVersion}`);
console.log(`Android versionCode: ${currentVersionCode} -> ${appJson.expo.android.versionCode}`);
console.log(`iOS buildNumber: ${currentBuildNumber} -> ${appJson.expo.ios.buildNumber}`);

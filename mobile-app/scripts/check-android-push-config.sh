#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WARN_ONLY=0
if [ "${1:-}" = "--warn-only" ]; then
  WARN_ONLY=1
fi

node - "$WARN_ONLY" <<'NODE'
const fs = require('fs');
const path = require('path');

const warnOnly = process.argv[2] === '1';
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
const expo = app.expo || {};
const plugins = Array.isArray(expo.plugins) ? expo.plugins : [];
const androidPermissions = Array.isArray(expo.android?.permissions) ? expo.android.permissions : [];
const googleServicesFile =
  typeof expo.android?.googleServicesFile === 'string' ? expo.android.googleServicesFile.trim() : '';

const errors = [];
const warnings = [];

const hasNotificationsPlugin = plugins.some((plugin) => {
  if (typeof plugin === 'string') return plugin === 'expo-notifications';
  return Array.isArray(plugin) && plugin[0] === 'expo-notifications';
});

if (!hasNotificationsPlugin) {
  errors.push('Plugin expo-notifications belum terdaftar di app.json.');
}

if (!androidPermissions.includes('POST_NOTIFICATIONS')) {
  errors.push('Permission POST_NOTIFICATIONS belum terdaftar di app.json expo.android.permissions.');
}

if (!googleServicesFile) {
  errors.push('app.json expo.android.googleServicesFile belum diisi. Push Android saat app tertutup berisiko gagal.');
} else {
  const resolvedPath = path.resolve(googleServicesFile);
  if (!fs.existsSync(resolvedPath)) {
    errors.push(`File google-services.json tidak ditemukan di path: ${googleServicesFile}`);
  }
}

const playInternalProfile = eas.build?.['play-internal'];
if (!playInternalProfile) {
  warnings.push('Profile EAS play-internal belum tersedia. Distribusi lintas merk via Play Store belum siap.');
} else if (playInternalProfile.android?.buildType !== 'app-bundle') {
  errors.push('Profile play-internal harus memakai android.buildType "app-bundle".');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('[OK] Android push config siap.');
  process.exit(0);
}

if (warnOnly) {
  for (const message of errors) console.log(`[WARN] ${message}`);
  for (const message of warnings) console.log(`[WARN] ${message}`);
  process.exit(0);
}

console.error('[FAIL] Android push config belum siap:');
for (const message of errors) console.error(`- ${message}`);
for (const message of warnings) console.error(`- ${message}`);
process.exit(1);
NODE

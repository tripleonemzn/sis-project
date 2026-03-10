#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROLE_MENU_PATH = path.join(PROJECT_ROOT, 'src', 'features', 'dashboard', 'roleMenu.ts');
const APP_ROOT = path.join(PROJECT_ROOT, 'app', '(app)');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs', 'audit');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFilesRecursive(root, extensions = ['.ts', '.tsx']) {
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const children = fs.readdirSync(current).map((name) => path.join(current, name));
      stack.push(...children);
      continue;
    }
    const ext = path.extname(current);
    if (extensions.includes(ext)) {
      results.push(current);
    }
  }
  return results.sort();
}

function transpileRoleMenuModule() {
  const source =
    readFile(ROLE_MENU_PATH) +
    '\nmodule.exports.__ROLE_MENUS = ROLE_MENUS;' +
    '\nmodule.exports.__MATERIALIZE = materializeMenuTargets;';
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    __DEV__: false,
    process,
    console,
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output, sandbox, { filename: 'roleMenu.transpiled.js' });
  return sandbox.module.exports;
}

function resolveRouteToFile(route) {
  if (!route || typeof route !== 'string' || !route.startsWith('/')) return null;
  const cleanRoute = route.split('?')[0].split('#')[0];
  const normalized = cleanRoute.replace(/^\/+/, '');
  if (!normalized) return null;

  const candidates = [
    path.join(APP_ROOT, `${normalized}.tsx`),
    path.join(APP_ROOT, normalized, 'index.tsx'),
  ];

  if (normalized.startsWith('web-module/')) {
    candidates.push(path.join(APP_ROOT, 'web-module', '[moduleKey].tsx'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseLocalImports(filePath) {
  const content = readFile(filePath);
  const matches = content.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g);
  const imports = [];
  for (const match of matches) {
    imports.push(match[1]);
  }
  return imports;
}

function resolveImportToFile(fromFile, importPath) {
  const base = path.resolve(path.dirname(fromFile), importPath);
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function scanRouteOpenUrl(routeFilePath) {
  const visited = new Set();
  const queue = [routeFilePath];
  const hits = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current) || !fs.existsSync(current)) continue;
    visited.add(current);

    const content = readFile(current);
    const openUrlRegex = /Linking\.openURL\s*\(/g;
    let match;
    while ((match = openUrlRegex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      hits.push({
        file: path.relative(PROJECT_ROOT, current),
        line,
      });
    }

    const localImports = parseLocalImports(current);
    for (const importPath of localImports) {
      const resolved = resolveImportToFile(current, importPath);
      if (!resolved) continue;
      if (!resolved.startsWith(SRC_ROOT) && !resolved.startsWith(APP_ROOT)) continue;
      if (visited.has(resolved)) continue;
      queue.push(resolved);
    }
  }

  return hits;
}

function gatherGlobalOpenUrlUsages() {
  const files = listFilesRecursive(APP_ROOT).concat(listFilesRecursive(SRC_ROOT));
  const usages = [];
  for (const file of files) {
    const content = readFile(file);
    const openUrlRegex = /Linking\.openURL\s*\(/g;
    let match;
    while ((match = openUrlRegex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      usages.push({
        file: path.relative(PROJECT_ROOT, file),
        line,
      });
    }
  }
  return usages.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}

function toMode(item) {
  if (!item.route && item.webPath) return 'WEB_ONLY_NO_ROUTE';
  if (item.route && item.route.startsWith('/web-module/')) return 'WEB_BRIDGE_ROUTE';
  if (item.route && item.webPath) return 'NATIVE_WITH_WEB_FALLBACK';
  if (item.route) return 'NATIVE_ONLY';
  return 'UNKNOWN';
}

function buildReport() {
  const exported = transpileRoleMenuModule();
  const roleMenus = exported.__ROLE_MENUS || {};
  const materialize = exported.__MATERIALIZE;

  if (!roleMenus || typeof roleMenus !== 'object' || typeof materialize !== 'function') {
    throw new Error('Gagal membaca role menu dari roleMenu.ts');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    perRoleSummary: [],
    perRoleDetails: {},
    globalOpenUrlUsages: gatherGlobalOpenUrlUsages(),
  };

  const roles = Object.keys(roleMenus).sort();
  for (const role of roles) {
    const rawItems = roleMenus[role] || [];
    const items = materialize(rawItems);
    const detailRows = items.map((item) => {
      const mode = toMode(item);
      const routeFile = item.route ? resolveRouteToFile(item.route) : null;
      const openUrlHits = routeFile ? scanRouteOpenUrl(routeFile) : [];
      return {
        key: item.key,
        label: item.label,
        route: item.route || null,
        webPath: item.webPath || null,
        mode,
        routeFile: routeFile ? path.relative(PROJECT_ROOT, routeFile) : null,
        hasOpenUrlInRouteTree: openUrlHits.length > 0,
        openUrlHits,
      };
    });

    report.perRoleDetails[role] = detailRows;

    const summary = {
      role,
      total: detailRows.length,
      nativeOnly: detailRows.filter((row) => row.mode === 'NATIVE_ONLY').length,
      nativeWithWebFallback: detailRows.filter((row) => row.mode === 'NATIVE_WITH_WEB_FALLBACK').length,
      webBridgeRoute: detailRows.filter((row) => row.mode === 'WEB_BRIDGE_ROUTE').length,
      webOnlyNoRoute: detailRows.filter((row) => row.mode === 'WEB_ONLY_NO_ROUTE').length,
      hasOpenUrlInRouteTree: detailRows.filter((row) => row.hasOpenUrlInRouteTree).length,
    };
    report.perRoleSummary.push(summary);
  }

  return report;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Mobile Parity Audit (All Roles)');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Ringkasan per Role');
  lines.push('');
  lines.push('| Role | Total | Native Only | Native + Web Fallback | Web Bridge Route | Route Tree Punya openURL |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const item of report.perRoleSummary) {
    lines.push(
      `| ${item.role} | ${item.total} | ${item.nativeOnly} | ${item.nativeWithWebFallback} | ${item.webBridgeRoute} | ${item.hasOpenUrlInRouteTree} |`,
    );
  }
  lines.push('');

  lines.push('## Detail Web Bridge per Role');
  lines.push('');
  for (const role of Object.keys(report.perRoleDetails).sort()) {
    const rows = report.perRoleDetails[role].filter((row) => row.mode === 'WEB_BRIDGE_ROUTE');
    lines.push(`### ${role}`);
    if (rows.length === 0) {
      lines.push('- Tidak ada menu web-bridge.');
      lines.push('');
      continue;
    }
    for (const row of rows) {
      lines.push(`- ${row.label} (\`${row.key}\`) -> route \`${row.route}\`, webPath \`${row.webPath}\``);
    }
    lines.push('');
  }

  lines.push('## Route Native Yang Masih Mengandung openURL');
  lines.push('');
  for (const role of Object.keys(report.perRoleDetails).sort()) {
    const rows = report.perRoleDetails[role].filter(
      (row) =>
        (row.mode === 'NATIVE_ONLY' || row.mode === 'NATIVE_WITH_WEB_FALLBACK') &&
        row.hasOpenUrlInRouteTree,
    );
    lines.push(`### ${role}`);
    if (rows.length === 0) {
      lines.push('- Tidak ada.');
      lines.push('');
      continue;
    }
    for (const row of rows) {
      lines.push(`- ${row.label} (\`${row.key}\`)`);
      for (const hit of row.openUrlHits) {
        lines.push(`  - \`${hit.file}:${hit.line}\``);
      }
    }
    lines.push('');
  }

  lines.push('## Semua Pemanggilan Linking.openURL (Global)');
  lines.push('');
  for (const usage of report.globalOpenUrlUsages) {
    lines.push(`- \`${usage.file}:${usage.line}\``);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function writeReport(report) {
  ensureOutputDir();
  const jsonPath = path.join(OUTPUT_DIR, 'mobile_parity_audit_latest.json');
  const mdPath = path.join(OUTPUT_DIR, 'mobile_parity_audit_latest.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, formatMarkdown(report));
  return {
    jsonPath: path.relative(PROJECT_ROOT, jsonPath),
    mdPath: path.relative(PROJECT_ROOT, mdPath),
  };
}

function main() {
  const report = buildReport();
  const output = writeReport(report);
  console.log(`Audit selesai.`);
  console.log(`- JSON: ${output.jsonPath}`);
  console.log(`- Markdown: ${output.mdPath}`);
}

main();

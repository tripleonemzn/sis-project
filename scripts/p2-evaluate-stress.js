#!/usr/bin/env node
const fs = require('fs');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/p2-evaluate-stress.js <report.json>');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`[ERROR] file not found: ${inputPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const summary = report?.summary || {};
const endpoints = Array.isArray(report?.endpointMetrics) ? report.endpointMetrics : [];

const thresholds = {
  maxErrorRatePct: Number(process.env.GUARD_MAX_ERROR_RATE_PCT || 0.1),
  maxAutosaveP95Ms: Number(process.env.GUARD_AUTOSAVE_P95_MS || 40),
  maxAutosaveP99Ms: Number(process.env.GUARD_AUTOSAVE_P99_MS || 100),
  maxStartP95Ms: Number(process.env.GUARD_START_P95_MS || 120),
  maxStartP99Ms: Number(process.env.GUARD_START_P99_MS || 250),
  minOverallRps: Number(process.env.GUARD_MIN_OVERALL_RPS || 120),
  requireCleanupDeleted: String(process.env.GUARD_REQUIRE_CLEANUP_DELETED || 'true') === 'true',
};

function getEndpoint(name) {
  return endpoints.find((e) => e.endpoint === name);
}

function check(name, pass, detail) {
  return { name, pass, detail };
}

const autosave = getEndpoint('student.autosave');
const start = getEndpoint('student.start');

const checks = [
  check(
    'summary.totalErrorRatePct',
    Number(summary.totalErrorRatePct || 0) <= thresholds.maxErrorRatePct,
    `${summary.totalErrorRatePct || 0}% <= ${thresholds.maxErrorRatePct}%`,
  ),
  check(
    'summary.overallRps',
    Number(summary.overallRps || 0) >= thresholds.minOverallRps,
    `${summary.overallRps || 0} >= ${thresholds.minOverallRps}`,
  ),
  check(
    'summary.cleanupStatus',
    thresholds.requireCleanupDeleted ? summary.cleanupStatus === 'deleted' : true,
    `${summary.cleanupStatus || 'unknown'}${thresholds.requireCleanupDeleted ? ' (must be deleted)' : ''}`,
  ),
  check(
    'student.autosave.p95',
    autosave ? Number(autosave.p95Ms || 0) <= thresholds.maxAutosaveP95Ms : false,
    `${autosave?.p95Ms ?? 'n/a'} <= ${thresholds.maxAutosaveP95Ms}`,
  ),
  check(
    'student.autosave.p99',
    autosave ? Number(autosave.p99Ms || 0) <= thresholds.maxAutosaveP99Ms : false,
    `${autosave?.p99Ms ?? 'n/a'} <= ${thresholds.maxAutosaveP99Ms}`,
  ),
  check(
    'student.start.p95',
    start ? Number(start.p95Ms || 0) <= thresholds.maxStartP95Ms : false,
    `${start?.p95Ms ?? 'n/a'} <= ${thresholds.maxStartP95Ms}`,
  ),
  check(
    'student.start.p99',
    start ? Number(start.p99Ms || 0) <= thresholds.maxStartP99Ms : false,
    `${start?.p99Ms ?? 'n/a'} <= ${thresholds.maxStartP99Ms}`,
  ),
];

const failed = checks.filter((c) => !c.pass);
const result = {
  report: inputPath,
  summary: {
    timestamp: summary.timestamp,
    targetUsers: summary.targetUsers,
    simulatedUsers: summary.simulatedUsers,
    totalRequests: summary.totalRequests,
    totalFailures: summary.totalFailures,
    totalErrorRatePct: summary.totalErrorRatePct,
    overallRps: summary.overallRps,
    cleanupStatus: summary.cleanupStatus,
  },
  thresholds,
  checks,
  status: failed.length === 0 ? 'PASS' : 'FAIL',
  failedCount: failed.length,
};

console.log(JSON.stringify(result, null, 2));

if (failed.length > 0) process.exit(2);

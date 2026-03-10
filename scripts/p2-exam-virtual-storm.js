#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const jwt = require('/var/www/sis-project/backend/node_modules/jsonwebtoken');
require('/var/www/sis-project/backend/node_modules/dotenv').config({
  path: path.join('/var/www/sis-project/backend', '.env'),
});

const BASE_URL = process.env.SIS_BASE_URL || 'https://siskgb2.id';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const TARGET_USERS = Number(process.env.TARGET_USERS || 1000);
const AUTOSAVES_PER_USER = Number(process.env.AUTOSAVES_PER_USER || 12);
const AUTOSAVE_DELAY_MS = Number(process.env.AUTOSAVE_DELAY_MS || 900);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const TEACHER_ID = Number(process.env.LOADTEST_TEACHER_ID || 926);
const MEDIA_FETCHES_PER_USER = Number(process.env.MEDIA_FETCHES_PER_USER || 1);
const MONITORING_SAMPLE_MS = Number(process.env.MONITORING_SAMPLE_MS || 1000);
const ANALYSIS_PACKET_ID = Number(process.env.ANALYSIS_PACKET_ID || 0);
const ANALYSIS_STORM_WORKERS = Number(process.env.ANALYSIS_STORM_WORKERS || 20);
const ANALYSIS_STORM_INTERVAL_MS = Number(process.env.ANALYSIS_STORM_INTERVAL_MS || 500);
const ANALYSIS_STORM_DURATION_SEC = Number(process.env.ANALYSIS_STORM_DURATION_SEC || 30);
const MAX_SCHEDULES = Number(process.env.MAX_SCHEDULES || 8);

function signToken(id, role) {
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '2h' });
}
function nowIso() {
  return new Date().toISOString();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function toAbsoluteUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${BASE_URL}${value}`;
  if (value.startsWith('api/')) return `${BASE_URL}/${value}`;
  return null;
}

function extractUrlsFromString(value) {
  const urls = [];
  const attrMatches = value.matchAll(/(?:src=|href=)["']([^"']+)["']/gi);
  for (const m of attrMatches) {
    const abs = toAbsoluteUrl(m[1]);
    if (abs) urls.push(abs);
  }
  return urls;
}

function collectMediaUrls(input, out = new Set()) {
  if (input == null) return out;
  if (typeof input === 'string') {
    const abs = toAbsoluteUrl(input);
    if (abs && abs.includes('/api/uploads/')) out.add(abs);
    if (input.includes('<img') || input.includes('src=')) {
      extractUrlsFromString(input).forEach((u) => {
        if (u.includes('/api/uploads/')) out.add(u);
      });
    }
    return out;
  }
  if (Array.isArray(input)) {
    input.forEach((it) => collectMediaUrls(it, out));
    return out;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === 'string') {
        const maybe = toAbsoluteUrl(v);
        if (maybe && (k.toLowerCase().includes('image') || k.toLowerCase().includes('video') || maybe.includes('/api/uploads/'))) {
          out.add(maybe);
        }
      }
      collectMediaUrls(v, out);
    }
  }
  return out;
}

const endpointStats = new Map();
function record(endpoint, ms, status, ok, error) {
  if (!endpointStats.has(endpoint)) {
    endpointStats.set(endpoint, {
      endpoint,
      total: 0,
      ok: 0,
      fail: 0,
      latencies: [],
      statuses: {},
      errors: {},
    });
  }
  const s = endpointStats.get(endpoint);
  s.total += 1;
  if (ok) s.ok += 1;
  else s.fail += 1;
  s.latencies.push(ms);
  const key = String(status || 'ERR');
  s.statuses[key] = (s.statuses[key] || 0) + 1;
  if (error) s.errors[error] = (s.errors[error] || 0) + 1;
}

async function request({ endpointName, method = 'GET', urlPath, token, body, absoluteUrl = null }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = process.hrtime.bigint();
  try {
    const url = absoluteUrl || `${BASE_URL}${urlPath}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    clearTimeout(timeout);

    let payload = null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) payload = await res.json().catch(() => null);
    else await res.arrayBuffer().catch(() => null);

    const ok = res.status >= 200 && res.status < 300;
    record(endpointName, ms, res.status, ok, null);
    return { ok, status: res.status, ms, payload };
  } catch (err) {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    clearTimeout(timeout);
    const errorName = err?.name || 'RequestError';
    record(endpointName, ms, 0, false, errorName);
    return { ok: false, status: 0, ms, payload: null, error: errorName };
  }
}

function buildAutosaveAnswers(packetQuestions, iteration) {
  const answers = {};
  const q = Array.isArray(packetQuestions) && packetQuestions.length > 0 ? packetQuestions[iteration % packetQuestions.length] : null;
  if (q && Array.isArray(q.options) && q.options.length > 0) {
    const picked = q.options[iteration % q.options.length];
    answers[String(q.id)] = picked?.id ?? null;
  }
  answers.__monitoring = {
    totalViolations: 0,
    tabSwitchCount: 0,
    fullscreenExitCount: 0,
    appSwitchCount: 0,
    lastViolationType: null,
    lastViolationAt: null,
    currentQuestionIndex: Math.max(0, iteration),
    currentQuestionNumber: Math.max(1, iteration + 1),
    currentQuestionId: q ? String(q.id) : null,
  };
  return answers;
}

async function runVirtualStudent(studentId, idx, scheduleId) {
  const token = signToken(studentId, 'STUDENT');
  await sleep((idx % 300) * 10 + Math.floor(Math.random() * 120));

  await request({ endpointName: 'student.available', method: 'GET', urlPath: '/api/exams/available', token });

  const startedExam = await request({
    endpointName: 'student.start',
    method: 'GET',
    urlPath: `/api/exams/${scheduleId}/start`,
    token,
  });
  if (!startedExam.ok) return;

  const packetQuestions = startedExam?.payload?.data?.packet?.questions;
  const mediaUrls = Array.from(collectMediaUrls(packetQuestions)).slice(0, Math.max(0, MEDIA_FETCHES_PER_USER));
  for (const mediaUrl of mediaUrls) {
    await request({ endpointName: 'student.media', method: 'GET', absoluteUrl: mediaUrl, token });
  }

  for (let i = 0; i < AUTOSAVES_PER_USER; i += 1) {
    await request({
      endpointName: 'student.autosave',
      method: 'POST',
      urlPath: `/api/exams/${scheduleId}/answers`,
      token,
      body: {
        answers: buildAutosaveAnswers(packetQuestions, i),
        finish: false,
        is_final_submit: false,
      },
    });
    await sleep(Math.max(120, AUTOSAVE_DELAY_MS + Math.floor(Math.random() * 180) - 90));
  }
}

async function runAnalysisStorm(teacherToken, packetId) {
  const deadline = Date.now() + ANALYSIS_STORM_DURATION_SEC * 1000;
  const worker = async () => {
    while (Date.now() < deadline) {
      await request({
        endpointName: 'teacher.itemAnalysis',
        method: 'GET',
        urlPath: `/api/exams/packets/${packetId}/item-analysis`,
        token: teacherToken,
      });
      await sleep(ANALYSIS_STORM_INTERVAL_MS);
    }
  };
  await Promise.all(Array.from({ length: ANALYSIS_STORM_WORKERS }, () => worker()));
}

async function createTempSchedules(baseSchedule, teacherToken, count) {
  const created = [];
  for (let i = 0; i < count; i += 1) {
    const createResp = await request({
      endpointName: 'setup.createSchedule',
      method: 'POST',
      urlPath: '/api/exams/schedules',
      token: teacherToken,
      body: {
        classId: Number(baseSchedule.classId),
        packetId: Number(baseSchedule.packetId),
        subjectId: Number(baseSchedule.subjectId),
        academicYearId: Number(baseSchedule.academicYearId),
        semester: baseSchedule.semester || baseSchedule.packet?.semester || 'ODD',
        examType: baseSchedule.examType || baseSchedule.packet?.programCode || baseSchedule.packet?.type || 'SAS',
        room: `TEMP-STORM-${Date.now()}-${i + 1}`,
        startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    if (!createResp.ok) {
      throw new Error(`Gagal buat schedule ke-${i + 1}: ${createResp.status}`);
    }
    const scheduleId = Number(createResp.payload?.data?.[0]?.id);
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
      throw new Error(`scheduleId invalid untuk schedule ke-${i + 1}`);
    }
    created.push(scheduleId);
  }
  return created;
}

async function cleanupSchedules(scheduleIds, teacherToken) {
  const results = [];
  for (const scheduleId of scheduleIds) {
    const del = await request({
      endpointName: 'cleanup.deleteSchedule',
      method: 'DELETE',
      urlPath: `/api/exams/schedules/${scheduleId}`,
      token: teacherToken,
    });
    results.push({ scheduleId, ok: del.ok, status: del.status, payload: del.payload });
  }
  return results;
}

async function run() {
  const startedAt = Date.now();
  const adminToken = signToken(1, 'ADMIN');
  const teacherToken = signToken(TEACHER_ID, 'TEACHER');

  console.log(
    `[setup] base=${BASE_URL} targetUsers=${TARGET_USERS} autosaves=${AUTOSAVES_PER_USER} analysisWorkers=${ANALYSIS_STORM_WORKERS}`,
  );

  const studentsResp = await request({
    endpointName: 'setup.getStudents',
    method: 'GET',
    urlPath: '/api/users?role=STUDENT',
    token: adminToken,
  });
  if (!studentsResp.ok) throw new Error(`Gagal ambil siswa: ${studentsResp.status}`);

  const uniqueStudentIds = Array.from(
    new Set(
      (studentsResp.payload?.data || [])
        .map((u) => Number(u?.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!uniqueStudentIds.length) throw new Error('Tidak ada siswa untuk simulasi');

  const schedulesResp = await request({
    endpointName: 'setup.getSchedules',
    method: 'GET',
    urlPath: '/api/exams/schedules',
    token: teacherToken,
  });
  if (!schedulesResp.ok) throw new Error(`Gagal ambil jadwal: ${schedulesResp.status}`);

  const baseSchedule = (schedulesResp.payload?.data || []).find(
    (s) => Number(s?.packetId) > 0 && Number(s?.classId) > 0 && Number(s?.subjectId) > 0,
  );
  if (!baseSchedule) throw new Error('Base schedule tidak ditemukan');

  const schedulesNeeded = Math.min(MAX_SCHEDULES, Math.max(1, Math.ceil(TARGET_USERS / uniqueStudentIds.length)));
  const scheduleIds = await createTempSchedules(baseSchedule, teacherToken, schedulesNeeded);
  console.log(
    `[setup] uniqueStudents=${uniqueStudentIds.length} schedulesNeeded=${schedulesNeeded} scheduleIds=${scheduleIds.join(',')}`,
  );

  const packetIdForAnalysis =
    Number.isFinite(ANALYSIS_PACKET_ID) && ANALYSIS_PACKET_ID > 0
      ? ANALYSIS_PACKET_ID
      : Number(baseSchedule.packetId);

  const virtualUsers = Array.from({ length: TARGET_USERS }, (_, idx) => {
    const studentId = uniqueStudentIds[idx % uniqueStudentIds.length];
    const scheduleId = scheduleIds[Math.floor(idx / uniqueStudentIds.length)] || scheduleIds[0];
    return { virtualId: idx + 1, studentId, scheduleId };
  });

  let monitorStop = false;
  const monitoringSamples = [];
  const monitorLoop = (async () => {
    while (!monitorStop) {
      const m = await request({
        endpointName: 'monitoring.sample',
        method: 'GET',
        urlPath: '/api/server/monitoring',
        token: adminToken,
      });
      const bw = m.payload?.data?.bandwidth;
      if (m.ok && bw) {
        monitoringSamples.push({
          at: nowIso(),
          rxMbps: Number(bw.rxMbps || 0),
          txMbps: Number(bw.txMbps || 0),
        });
      }
      await sleep(MONITORING_SAMPLE_MS);
    }
  })();

  const cleanupMeta = {
    status: 'not_attempted',
    failedCount: 0,
    results: [],
  };

  try {
    await Promise.all([
      Promise.all(virtualUsers.map((v, idx) => runVirtualStudent(v.studentId, idx, v.scheduleId))),
      runAnalysisStorm(teacherToken, packetIdForAnalysis),
    ]);
  } finally {
    monitorStop = true;
    await monitorLoop.catch(() => null);

    const cleanupResults = await cleanupSchedules(scheduleIds, teacherToken);
    cleanupMeta.results = cleanupResults;
    cleanupMeta.failedCount = cleanupResults.filter((r) => !r.ok).length;
    cleanupMeta.status = cleanupMeta.failedCount > 0 ? 'partial_failed' : 'deleted';
  }

  const durationSec = (Date.now() - startedAt) / 1000;
  const endpointMetrics = Array.from(endpointStats.values()).map((s) => {
    const sorted = [...s.latencies].sort((a, b) => a - b);
    return {
      endpoint: s.endpoint,
      total: s.total,
      ok: s.ok,
      fail: s.fail,
      errorRatePct: s.total ? Number(((s.fail / s.total) * 100).toFixed(2)) : 0,
      avgMs: sorted.length
        ? Number((sorted.reduce((acc, v) => acc + v, 0) / sorted.length).toFixed(2))
        : 0,
      p50Ms: Number(percentile(sorted, 50).toFixed(2)),
      p95Ms: Number(percentile(sorted, 95).toFixed(2)),
      p99Ms: Number(percentile(sorted, 99).toFixed(2)),
      maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : 0,
      statuses: s.statuses,
      errors: s.errors,
    };
  });

  const totalRequests = endpointMetrics.reduce((acc, e) => acc + e.total, 0);
  const totalFailures = endpointMetrics.reduce((acc, e) => acc + e.fail, 0);
  const maxRx = monitoringSamples.length ? Math.max(...monitoringSamples.map((s) => s.rxMbps)) : 0;
  const maxTx = monitoringSamples.length ? Math.max(...monitoringSamples.map((s) => s.txMbps)) : 0;
  const avgRx = monitoringSamples.length
    ? monitoringSamples.reduce((acc, s) => acc + s.rxMbps, 0) / monitoringSamples.length
    : 0;
  const avgTx = monitoringSamples.length
    ? monitoringSamples.reduce((acc, s) => acc + s.txMbps, 0) / monitoringSamples.length
    : 0;

  const summary = {
    timestamp: nowIso(),
    baseUrl: BASE_URL,
    targetUsers: TARGET_USERS,
    simulatedUsers: virtualUsers.length,
    uniqueStudents: uniqueStudentIds.length,
    schedulesUsed: scheduleIds.length,
    autosavesPerUser: AUTOSAVES_PER_USER,
    mediaFetchesPerUser: MEDIA_FETCHES_PER_USER,
    analysisPacketId: packetIdForAnalysis,
    analysisStormWorkers: ANALYSIS_STORM_WORKERS,
    analysisStormIntervalMs: ANALYSIS_STORM_INTERVAL_MS,
    analysisStormDurationSec: ANALYSIS_STORM_DURATION_SEC,
    totalRequests,
    totalFailures,
    totalErrorRatePct: totalRequests ? Number(((totalFailures / totalRequests) * 100).toFixed(2)) : 0,
    durationSec: Number(durationSec.toFixed(2)),
    overallRps: durationSec > 0 ? Number((totalRequests / durationSec).toFixed(2)) : 0,
    cleanupStatus: cleanupMeta.status,
    cleanupFailedCount: cleanupMeta.failedCount,
    monitoringSamples: monitoringSamples.length,
    monitoringMaxRxMbps: Number(maxRx.toFixed(2)),
    monitoringMaxTxMbps: Number(maxTx.toFixed(2)),
    monitoringAvgRxMbps: Number(avgRx.toFixed(2)),
    monitoringAvgTxMbps: Number(avgTx.toFixed(2)),
  };

  const report = {
    summary,
    endpointMetrics,
    monitoringSamples,
    cleanupDetails: cleanupMeta.results,
  };
  const outFile = `/tmp/p2_exam_virtual_storm_result_${Date.now()}.json`;
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\n=== ENDPOINTS ===');
  endpointMetrics
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint))
    .forEach((m) => {
      console.log(
        `${m.endpoint} -> total=${m.total} err=${m.errorRatePct}% avg=${m.avgMs}ms p95=${m.p95Ms}ms p99=${m.p99Ms}ms max=${m.maxMs}ms statuses=${JSON.stringify(m.statuses)}`,
      );
    });
  console.log(`\nReport: ${outFile}`);

  if (summary.totalFailures > 0 || cleanupMeta.failedCount > 0) process.exitCode = 2;
}

run().catch((err) => {
  console.error('[fatal]', err?.message || err);
  process.exit(1);
});

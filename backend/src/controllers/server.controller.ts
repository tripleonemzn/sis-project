import { randomInt } from 'crypto';
import { Request, Response } from 'express';
import axios from 'axios';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Role } from '@prisma/client';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { writeAuditLog } from '../utils/auditLog';

const execAsync = promisify(exec);

type StorageUsage = {
  filesystem: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  mountpoint: string;
};

type StorageStatus = StorageUsage & {
  status: 'OK' | 'WARNING' | 'DANGER';
};

type MailcowApiEntry = {
  type?: string;
  msg?: unknown;
  log?: unknown;
};

const MAILCOW_API_TIMEOUT_MS = 15000;
const MIN_MANUAL_WEBMAIL_PASSWORD_LENGTH = 10;
const WEBMAIL_ALLOWED_ROLES: Role[] = ['TEACHER', 'PRINCIPAL', 'STAFF', 'EXTRACURRICULAR_TUTOR'];
const WEBMAIL_RESET_AUDIT_ENTITY = 'WEBMAIL_MAILBOX';
const WEBMAIL_RESET_AUDIT_ACTION = 'RESET_PASSWORD';
const WEBMAIL_PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const WEBMAIL_PASSWORD_LOWERCASE = 'abcdefghijkmnpqrstuvwxyz';
const WEBMAIL_PASSWORD_NUMBERS = '23456789';
const WEBMAIL_PASSWORD_SYMBOLS = '!@#$%^&*()-_=+';

const toMaybeString = (value: unknown): string => String(value ?? '').trim();

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const resolveWebmailMailboxIdentity = (user: { username: string; email: string | null }): string | null => {
  const preferredEmail = toMaybeString(user.email).toLowerCase();
  if (preferredEmail && isValidEmail(preferredEmail)) return preferredEmail;

  const username = toMaybeString(user.username).toLowerCase();
  if (username && isValidEmail(username)) return username;

  const defaultDomain = toMaybeString(process.env.WEBMAIL_DEFAULT_DOMAIN).toLowerCase();
  if (!defaultDomain || !username) return null;

  const inferred = `${username}@${defaultDomain}`;
  return isValidEmail(inferred) ? inferred : null;
};

const createRandomString = (length: number, charset: string): string => {
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += charset[randomInt(0, charset.length)];
  }
  return output;
};

const shuffleString = (value: string): string => {
  const chars = value.split('');
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const generateWebmailPassword = (length = 18): string => {
  const minimumLength = Math.max(length, 14);
  const allChars =
    WEBMAIL_PASSWORD_UPPERCASE +
    WEBMAIL_PASSWORD_LOWERCASE +
    WEBMAIL_PASSWORD_NUMBERS +
    WEBMAIL_PASSWORD_SYMBOLS;
  const seeded =
    createRandomString(1, WEBMAIL_PASSWORD_UPPERCASE) +
    createRandomString(1, WEBMAIL_PASSWORD_LOWERCASE) +
    createRandomString(1, WEBMAIL_PASSWORD_NUMBERS) +
    createRandomString(1, WEBMAIL_PASSWORD_SYMBOLS);
  const remaining = createRandomString(minimumLength - seeded.length, allChars);
  return shuffleString(seeded + remaining);
};

const parseMailcowMessage = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => parseMailcowMessage(item))
      .filter((item) => item.length > 0)
      .join(' ')
      .trim();
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => parseMailcowMessage(item))
      .filter((item) => item.length > 0)
      .join(' ')
      .trim();
  }
  return String(value);
};

const resolveMailcowEditMailboxEndpoint = (): string => {
  const configuredBase = toMaybeString(process.env.MAILCOW_API_BASE_URL || process.env.WEBMAIL_URL);
  if (!configuredBase) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_BASE_URL belum diatur di server');
  }
  const normalizedBase = /^https?:\/\//i.test(configuredBase) ? configuredBase : `https://${configuredBase}`;
  return new URL('/api/v1/edit/mailbox', normalizedBase).toString();
};

const parsePositiveInt = (value: unknown, fallbackValue: number): number => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
};

const parseDfOutput = (output: string): StorageUsage[] => {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return [];
  const result: StorageUsage[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const filesystem = parts[0];
    const sizeBytes = Number(parts[1]);
    const usedBytes = Number(parts[2]);
    const availableBytes = Number(parts[3]);
    const usedPercentRaw = parts[4].replace('%', '');
    const mountpoint = parts[5];
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) continue;
    const usedPercent = Number(usedPercentRaw);
    result.push({
      filesystem,
      sizeBytes,
      usedBytes,
      availableBytes,
      usedPercent: Number.isFinite(usedPercent) ? usedPercent : Math.round((usedBytes / sizeBytes) * 100),
      mountpoint,
    });
  }
  return result;
};

const classifyStorageStatus = (usage: StorageUsage): StorageStatus => {
  if (usage.usedPercent >= 90) {
    return { ...usage, status: 'DANGER' };
  }
  if (usage.usedPercent >= 75) {
    return { ...usage, status: 'WARNING' };
  }
  return { ...usage, status: 'OK' };
};

const readOsRelease = async (): Promise<Record<string, string>> => {
  try {
    const { stdout } = await execAsync('cat /etc/os-release');
    const lines = stdout.split('\n');
    const map: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx);
      let value = trimmed.slice(idx + 1);
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
};

const readLsblk = async () => {
  try {
    const { stdout } = await execAsync(
      'lsblk -b -J -o NAME,SIZE,TYPE,MOUNTPOINT,MODEL,FSTYPE,STATE,ROTA,TRAN',
    );
    const parsed = JSON.parse(stdout);
    return parsed;
  } catch {
    return null;
  }
};

type LinuxMemorySnapshot = {
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
  usedBytes: number;
  usedPercent: number;
  cachedBytes: number;
};

const readLinuxMemorySnapshot = async (): Promise<LinuxMemorySnapshot> => {
  const totalBytes = os.totalmem();
  const osFreeBytes = os.freemem();
  try {
    const { stdout } = await execAsync('cat /proc/meminfo');
    const meminfo = new Map<string, number>();
    stdout.split('\n').forEach((line) => {
      const match = line.match(/^([A-Za-z_]+):\s+(\d+)\s+kB$/);
      if (!match) return;
      meminfo.set(match[1], Number(match[2]) * 1024);
    });

    const memFreeBytes = meminfo.get('MemFree') ?? osFreeBytes;
    const memAvailableBytes = meminfo.get('MemAvailable') ?? memFreeBytes;
    const buffersBytes = meminfo.get('Buffers') ?? 0;
    const cachedBytes = meminfo.get('Cached') ?? 0;
    const reclaimableBytes = meminfo.get('SReclaimable') ?? 0;
    const shmemBytes = meminfo.get('Shmem') ?? 0;
    const effectiveCachedBytes = Math.max(0, buffersBytes + cachedBytes + reclaimableBytes - shmemBytes);
    const boundedAvailable = Math.min(Math.max(memAvailableBytes, 0), totalBytes);
    const usedBytes = Math.max(0, totalBytes - boundedAvailable);
    const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0;

    return {
      totalBytes,
      freeBytes: memFreeBytes,
      availableBytes: boundedAvailable,
      usedBytes,
      usedPercent,
      cachedBytes: effectiveCachedBytes,
    };
  } catch {
    const usedBytes = Math.max(0, totalBytes - osFreeBytes);
    const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0;
    return {
      totalBytes,
      freeBytes: osFreeBytes,
      availableBytes: osFreeBytes,
      usedBytes,
      usedPercent,
      cachedBytes: 0,
    };
  }
};

let defaultRouteInterfaceCache: { iface: string | null; atMs: number } | null = null;
const DEFAULT_ROUTE_CACHE_TTL_MS = 60000;

const getDefaultRouteInterface = async (): Promise<string | null> => {
  if (
    defaultRouteInterfaceCache &&
    Date.now() - defaultRouteInterfaceCache.atMs < DEFAULT_ROUTE_CACHE_TTL_MS
  ) {
    return defaultRouteInterfaceCache.iface;
  }

  try {
    const { stdout } = await execAsync('ip -o route show default');
    const line = stdout
      .split('\n')
      .map((value) => value.trim())
      .find(Boolean);
    if (!line) {
      defaultRouteInterfaceCache = { iface: null, atMs: Date.now() };
      return null;
    }

    const match = line.match(/\bdev\s+([a-zA-Z0-9._:-]+)/);
    const iface = match?.[1] || null;
    defaultRouteInterfaceCache = { iface, atMs: Date.now() };
    return iface;
  } catch {
    defaultRouteInterfaceCache = { iface: null, atMs: Date.now() };
    return null;
  }
};

const getPrimaryInterfaceStats = async () => {
  try {
    const { stdout } = await execAsync('cat /proc/net/dev');
    const lines = stdout.split('\n').slice(2);
    const candidates = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [ifacePart, rest] = line.split(':');
        const iface = ifacePart.trim();
        const fields = rest.trim().split(/\s+/);
        const rxBytes = Number(fields[0] || '0');
        const txBytes = Number(fields[8] || '0');
        return { iface, rxBytes, txBytes };
      })
      .filter((item) => item.iface && item.iface !== 'lo');
    if (candidates.length === 0) return null;

    const defaultIface = await getDefaultRouteInterface();
    if (defaultIface) {
      const matched = candidates.find((item) => item.iface === defaultIface);
      if (matched) return matched;
    }

    return candidates[0];
  } catch {
    return null;
  }
};

const BANDWIDTH_SAMPLE_INTERVAL_MS = 3000;
const BANDWIDTH_SAMPLE_TTL_MS = 20000;
const MONITORING_CACHE_TTL_MS = 4000;
let bandwidthSampleTimer: NodeJS.Timeout | null = null;
let bandwidthSamplePromise: Promise<void> | null = null;
let monitoringMetricsCache: { atMs: number; data: Record<string, unknown> } | null = null;
let bandwidthStatsSnapshot:
  | {
      iface: string;
      rxBytes: number;
      txBytes: number;
      atMs: number;
    }
  | null = null;
let latestBandwidthSample:
  | {
      interface: string;
      rxMbps: number;
      txMbps: number;
      sampledAtMs: number;
    }
  | null = null;

const computeBandwidthSample = async () => {
  if (bandwidthSamplePromise) {
    await bandwidthSamplePromise;
    return;
  }

  bandwidthSamplePromise = (async () => {
    const nowMs = Date.now();
    const current = await getPrimaryInterfaceStats();
    if (!current) return;

    if (bandwidthStatsSnapshot && bandwidthStatsSnapshot.iface === current.iface && nowMs > bandwidthStatsSnapshot.atMs) {
      const deltaSeconds = Math.max((nowMs - bandwidthStatsSnapshot.atMs) / 1000, 0.001);
      const rxDelta = Math.max(0, current.rxBytes - bandwidthStatsSnapshot.rxBytes);
      const txDelta = Math.max(0, current.txBytes - bandwidthStatsSnapshot.txBytes);
      const rxMbps = (rxDelta * 8) / 1_000_000 / deltaSeconds;
      const txMbps = (txDelta * 8) / 1_000_000 / deltaSeconds;

      latestBandwidthSample = {
        interface: current.iface,
        rxMbps: Number.isFinite(rxMbps) ? rxMbps : 0,
        txMbps: Number.isFinite(txMbps) ? txMbps : 0,
        sampledAtMs: nowMs,
      };
    } else {
      // First sample on each worker (or interface switch) still returns a valid snapshot, avoiding intermittent null.
      latestBandwidthSample = {
        interface: current.iface,
        rxMbps: 0,
        txMbps: 0,
        sampledAtMs: nowMs,
      };
    }

    bandwidthStatsSnapshot = {
      iface: current.iface,
      rxBytes: current.rxBytes,
      txBytes: current.txBytes,
      atMs: nowMs,
    };
  })();

  try {
    await bandwidthSamplePromise;
  } finally {
    bandwidthSamplePromise = null;
  }
};

const ensureBandwidthSampler = () => {
  if (bandwidthSampleTimer) return;
  bandwidthSampleTimer = setInterval(() => {
    void computeBandwidthSample();
  }, BANDWIDTH_SAMPLE_INTERVAL_MS);
  bandwidthSampleTimer.unref?.();
  void computeBandwidthSample();
};

const readCachedBandwidthSample = () => {
  if (latestBandwidthSample && Date.now() - latestBandwidthSample.sampledAtMs <= BANDWIDTH_SAMPLE_TTL_MS) {
    return latestBandwidthSample;
  }
  if (bandwidthStatsSnapshot && Date.now() - bandwidthStatsSnapshot.atMs <= BANDWIDTH_SAMPLE_TTL_MS) {
    return {
      interface: bandwidthStatsSnapshot.iface,
      rxMbps: 0,
      txMbps: 0,
      sampledAtMs: bandwidthStatsSnapshot.atMs,
    };
  }
  return null;
};

export const getServerInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Dilarang: Hak akses tidak mencukupi');
  }

  const osRelease = await readOsRelease();
  const cpus = os.cpus() || [];
  const memorySnapshot = await readLinuxMemorySnapshot();

  const dfResult = await execAsync('df -P -B1');
  const storageRaw = parseDfOutput(dfResult.stdout);
  const storage = storageRaw.map((item) => classifyStorageStatus(item));

  let gpuInfo: string | null = null;
  try {
    const { stdout } = await execAsync('lspci | grep -i vga || true');
    gpuInfo = stdout.trim() || null;
  } catch {
    gpuInfo = null;
  }

  const data = {
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptimeSeconds: os.uptime(),
      distro: osRelease.PRETTY_NAME || osRelease.NAME || null,
      kernelVersion: osRelease.VERSION || null,
    },
    cpu: {
      model: cpus[0]?.model || null,
      cores: cpus.length,
      speedMHz: cpus[0]?.speed || null,
    },
    memory: {
      totalBytes: memorySnapshot.totalBytes,
      freeBytes: memorySnapshot.freeBytes,
      availableBytes: memorySnapshot.availableBytes,
      usedBytes: memorySnapshot.usedBytes,
      cachedBytes: memorySnapshot.cachedBytes,
      usedPercent: memorySnapshot.usedPercent,
    },
    storage,
    gpu: {
      summary: gpuInfo,
    },
  };

  const response = new ApiResponse(200, data, 'Info server berhasil diambil');
  res.status(response.statusCode).json(response);
});

export const getStorageOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Dilarang: Hak akses tidak mencukupi');
  }

  const { stdout } = await execAsync('df -P -B1');
  const usages = parseDfOutput(stdout).map((item) => classifyStorageStatus(item));

  const lsblk = await readLsblk();
  const unmountedDevices: any[] = [];
  const disks: { name: string; sizeBytes: number; model: string | null; mediaType: string | null }[] = [];
  if (lsblk && Array.isArray(lsblk.blockdevices)) {
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        const type = String(node.type || node.TYPE || '').toLowerCase();
        const mountpoint = node.mountpoint || node.MOUNTPOINT || null;
        const size = Number(node.size || node.SIZE || 0);
        const rotaRaw = node.rota ?? node.ROTA;
        const tranRaw = node.tran ?? node.TRAN;
        const isRotational =
          typeof rotaRaw === 'number'
            ? rotaRaw === 1
            : typeof rotaRaw === 'string'
            ? Number(rotaRaw) === 1
            : null;
        const name = node.name || node.NAME;
        const model = node.model || node.MODEL || null;
        const nameLower = String(name || '').toLowerCase();
        const tranLower = typeof tranRaw === 'string' ? tranRaw.toLowerCase() : '';
        let mediaType: string | null = null;
        if (nameLower.startsWith('nvme') || tranLower === 'nvme') {
          mediaType = 'NVMe SSD';
        } else if (isRotational === false) {
          mediaType = 'SSD';
        } else if (isRotational === true) {
          mediaType = 'HDD';
        }
        if (type === 'disk' && size > 0) {
          disks.push({
            name,
            sizeBytes: size,
            model,
            mediaType,
          });
        }
        if ((type === 'disk' || type === 'part') && !mountpoint && size > 0) {
          unmountedDevices.push({
            name,
            sizeBytes: size,
            model,
            fstype: node.fstype || node.FSTYPE || null,
            state: node.state || node.STATE || null,
          });
        }
        if (Array.isArray(node.children)) {
          walk(node.children);
        }
      }
    };
    walk(lsblk.blockdevices);
  }

  let worstStatus: 'OK' | 'WARNING' | 'DANGER' = 'OK';
  let maxUsagePercent = 0;
  usages.forEach((item) => {
    if (item.usedPercent > maxUsagePercent) {
      maxUsagePercent = item.usedPercent;
    }
    if (item.status === 'DANGER') {
      worstStatus = 'DANGER';
    } else if (item.status === 'WARNING' && worstStatus !== 'DANGER') {
      worstStatus = 'WARNING';
    }
  });

  const suggestedActions = unmountedDevices.map((dev) => {
    const devicePath = `/dev/${dev.name}`;
    const label = `SIS_DATA_${dev.name.toUpperCase()}`;
    const mkfsCommand = `sudo mkfs.ext4 -L "${label}" ${devicePath}`;
    return {
      device: dev,
      formatCommand: mkfsCommand,
      note: 'Perintah ini tidak dijalankan otomatis. Jalankan manual di terminal sesuai kebijakan admin.',
    };
  });

  const totalDiskCapacityBytes = disks.reduce((sum, item) => sum + item.sizeBytes, 0);

  const data = {
    volumes: usages,
    summary: {
      worstStatus,
      maxUsagePercent,
      thresholdDangerPercent: 90,
      thresholdWarningPercent: 75,
    },
    unmountedDevices,
    suggestedActions,
    diskSummary: {
      totalDisks: disks.length,
      totalCapacityBytes: totalDiskCapacityBytes,
      disks,
    },
  };

  const response = new ApiResponse(200, data, 'Ringkasan storage berhasil diambil');
  res.status(response.statusCode).json(response);
});

export const getMonitoringMetrics = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Dilarang: Hak akses tidak mencukupi');
  }

  if (monitoringMetricsCache && Date.now() - monitoringMetricsCache.atMs <= MONITORING_CACHE_TTL_MS) {
    const cachedResponse = new ApiResponse(200, monitoringMetricsCache.data, 'Monitoring server berhasil diambil');
    res.status(cachedResponse.statusCode).json(cachedResponse);
    return;
  }

  const memorySnapshot = await readLinuxMemorySnapshot();

  const loadAvg = os.loadavg();
  const cpus = os.cpus() || [];
  const coreCount = cpus.length || 1;
  const loadPerCore = loadAvg[0] / coreCount;

  const { stdout } = await execAsync('df -P -B1 /');
  const rootUsages = parseDfOutput(stdout);
  const rootUsage = rootUsages[0] ? classifyStorageStatus(rootUsages[0]) : null;

  ensureBandwidthSampler();
  await computeBandwidthSample();
  const bandwidthSample = readCachedBandwidthSample();

  const cpuStatus = loadPerCore >= 1.2 ? 'DANGER' : loadPerCore >= 0.8 ? 'WARNING' : 'OK';
  const memoryStatus =
    memorySnapshot.usedPercent >= 90 ? 'DANGER' : memorySnapshot.usedPercent >= 75 ? 'WARNING' : 'OK';
  const storageStatus = rootUsage ? rootUsage.status : 'OK';
  let bandwidthStatus: 'OK' | 'WARNING' | 'DANGER' = 'OK';
  if (bandwidthSample) {
    const maxMbps = Math.max(bandwidthSample.rxMbps, bandwidthSample.txMbps);
    if (maxMbps >= 80) {
      bandwidthStatus = 'DANGER';
    } else if (maxMbps >= 50) {
      bandwidthStatus = 'WARNING';
    }
  }

  const data = {
    cpu: {
      loadAvg1: loadAvg[0],
      loadAvg5: loadAvg[1],
      loadAvg15: loadAvg[2],
      coreCount,
      loadPerCore,
      status: cpuStatus,
    },
    memory: {
      totalBytes: memorySnapshot.totalBytes,
      usedBytes: memorySnapshot.usedBytes,
      freeBytes: memorySnapshot.freeBytes,
      availableBytes: memorySnapshot.availableBytes,
      cachedBytes: memorySnapshot.cachedBytes,
      usedPercent: memorySnapshot.usedPercent,
      status: memoryStatus,
    },
    storage: {
      root: rootUsage,
      status: storageStatus,
    },
    bandwidth: bandwidthSample
      ? {
          interface: bandwidthSample.interface,
          rxMbps: Number(bandwidthSample.rxMbps.toFixed(2)),
          txMbps: Number(bandwidthSample.txMbps.toFixed(2)),
          status: bandwidthStatus,
        }
      : null,
  };
  if (data.bandwidth) {
    monitoringMetricsCache = { atMs: Date.now(), data };
  } else {
    monitoringMetricsCache = null;
  }

  const response = new ApiResponse(200, data, 'Monitoring server berhasil diambil');
  res.status(response.statusCode).json(response);
});

export const getWebmailResetHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Dilarang: Hak akses tidak mencukupi');
  }

  const page = Math.max(1, parsePositiveInt(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, parsePositiveInt(req.query.limit, 20)));
  const search = toMaybeString(req.query.search);
  const skip = (page - 1) * limit;

  const where: any = {
    entity: WEBMAIL_RESET_AUDIT_ENTITY,
    action: WEBMAIL_RESET_AUDIT_ACTION,
  };

  if (search) {
    where.OR = [
      { reason: { contains: search, mode: 'insensitive' } },
      { actor: { name: { contains: search, mode: 'insensitive' } } },
      { actor: { username: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [total, logs] = await Promise.all([
    (prisma as any).auditLog.count({ where }),
    (prisma as any).auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const targetUserIds: number[] = Array.from(
    new Set(
      logs
        .map((log: any) => Number(log.entityId))
        .filter((value: number) => Number.isInteger(value) && value > 0),
    ),
  );
  const targetUsers =
    targetUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: targetUserIds } },
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            email: true,
          },
        })
      : [];
  const targetUserMap = new Map(targetUsers.map((item) => [item.id, item]));

  const history = logs.map((log: any) => {
    const afterPayload =
      log.after && typeof log.after === 'object' && !Array.isArray(log.after)
        ? (log.after as Record<string, unknown>)
        : {};
    const targetFromEntity = typeof log.entityId === 'number' ? targetUserMap.get(log.entityId) : undefined;

    return {
      id: log.id,
      createdAt: log.createdAt,
      actor: log.actor,
      targetUser: targetFromEntity || {
        id: typeof log.entityId === 'number' ? log.entityId : null,
        username: toMaybeString(afterPayload.targetUsername) || null,
        name: toMaybeString(afterPayload.targetName) || null,
        role: toMaybeString(afterPayload.targetRole) || null,
        email: toMaybeString(afterPayload.targetEmail) || null,
      },
      mailboxIdentity: toMaybeString(afterPayload.mailboxIdentity) || null,
      generatedBySystem: Boolean(afterPayload.generatedBySystem),
      passwordLength: Number(afterPayload.passwordLength || 0),
      reason: log.reason || null,
    };
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        logs: history,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      'Riwayat reset password webmail berhasil diambil',
    ),
  );
});

export const resetWebmailMailboxPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Dilarang: Hak akses tidak mencukupi');
  }

  const identifier = toMaybeString(req.body?.identifier);
  if (!identifier) {
    throw new ApiError(400, 'Identifier user wajib diisi (username, email, atau userId)');
  }

  const manualPassword = toMaybeString(req.body?.password);
  if (manualPassword && manualPassword.length < MIN_MANUAL_WEBMAIL_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password manual minimal ${MIN_MANUAL_WEBMAIL_PASSWORD_LENGTH} karakter`);
  }

  const isNumericIdentifier = /^\d+$/.test(identifier);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(isNumericIdentifier ? [{ id: Number(identifier) }] : []),
        { username: { equals: identifier, mode: 'insensitive' } },
        { email: { equals: identifier.toLowerCase(), mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      email: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User tidak ditemukan');
  }

  if (!WEBMAIL_ALLOWED_ROLES.includes(user.role)) {
    throw new ApiError(400, `Role ${user.role} tidak memiliki akses mailbox webmail`);
  }

  const mailboxIdentity = resolveWebmailMailboxIdentity(user);
  if (!mailboxIdentity) {
    throw new ApiError(400, 'User belum memiliki identitas mailbox webmail yang valid');
  }

  const mailcowApiKey = toMaybeString(process.env.MAILCOW_API_KEY);
  if (!mailcowApiKey) {
    throw new ApiError(500, 'Konfigurasi MAILCOW_API_KEY belum diatur di server');
  }

  const nextPassword = manualPassword || generateWebmailPassword();
  const endpoint = resolveMailcowEditMailboxEndpoint();

  const response = await axios.post<MailcowApiEntry[] | MailcowApiEntry>(
    endpoint,
    {
      items: [mailboxIdentity],
      attr: {
        password: nextPassword,
        password2: nextPassword,
      },
    },
    {
      timeout: MAILCOW_API_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': mailcowApiKey,
      },
      validateStatus: () => true,
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(502, 'Autentikasi Mailcow API gagal. Periksa API key dan allowlist IP API Mailcow.');
  }

  if (response.status >= 400) {
    throw new ApiError(502, `Mailcow API mengembalikan HTTP ${response.status}`);
  }

  const payloadEntries = Array.isArray(response.data) ? response.data : [response.data];
  const successEntry = payloadEntries.find((entry) => toMaybeString(entry?.type).toLowerCase() === 'success');

  if (!successEntry) {
    const firstEntry = payloadEntries[0];
    const detailMessage = parseMailcowMessage(firstEntry?.msg) || parseMailcowMessage(firstEntry);
    throw new ApiError(
      400,
      detailMessage ? `Gagal reset password mailbox: ${detailMessage}` : 'Gagal reset password mailbox di Mailcow',
    );
  }

  const auditReason = toMaybeString(req.body?.reason) || 'Reset password mailbox webmail oleh admin';
  await writeAuditLog(
    req.user.id,
    String(req.user.role),
    null,
    WEBMAIL_RESET_AUDIT_ACTION,
    WEBMAIL_RESET_AUDIT_ENTITY,
    user.id,
    null,
    {
      targetUsername: user.username,
      targetName: user.name,
      targetRole: user.role,
      targetEmail: user.email || null,
      mailboxIdentity,
      generatedBySystem: !manualPassword,
      passwordLength: nextPassword.length,
    },
    auditReason,
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          email: user.email,
        },
        mailboxIdentity,
        password: nextPassword,
        generatedBySystem: !manualPassword,
        resetAt: new Date().toISOString(),
      },
      'Password mailbox berhasil direset',
    ),
  );
});

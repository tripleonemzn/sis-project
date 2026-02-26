import { Request, Response } from 'express';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AuthRequest } from '../middleware/auth';

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
    return candidates[0];
  } catch {
    return null;
  }
};

const sampleBandwidth = async (durationMs: number) => {
  const start = await getPrimaryInterfaceStats();
  if (!start) return null;
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  const end = await getPrimaryInterfaceStats();
  if (!end) return null;
  if (end.iface !== start.iface) return null;
  const rxDelta = Math.max(0, end.rxBytes - start.rxBytes);
  const txDelta = Math.max(0, end.txBytes - start.txBytes);
  const seconds = durationMs / 1000;
  const rxBps = rxDelta / seconds;
  const txBps = txDelta / seconds;
  const rxMbps = (rxBps * 8) / 1_000_000;
  const txMbps = (txBps * 8) / 1_000_000;
  return {
    interface: start.iface,
    rxMbps,
    txMbps,
  };
};

export const getServerInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    throw new ApiError(403, 'Dilarang: Hak akses tidak mencukupi');
  }

  const osRelease = await readOsRelease();
  const cpus = os.cpus() || [];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

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
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: totalMem - freeMem,
      usedPercent: totalMem > 0 ? Number((((totalMem - freeMem) / totalMem) * 100).toFixed(2)) : 0,
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

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedMemPercent = totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(2)) : 0;

  const loadAvg = os.loadavg();
  const cpus = os.cpus() || [];
  const coreCount = cpus.length || 1;
  const loadPerCore = loadAvg[0] / coreCount;

  const { stdout } = await execAsync('df -P -B1 /');
  const rootUsages = parseDfOutput(stdout);
  const rootUsage = rootUsages[0] ? classifyStorageStatus(rootUsages[0]) : null;

  const bandwidthSample = await sampleBandwidth(1000);

  const cpuStatus = loadPerCore >= 1.2 ? 'DANGER' : loadPerCore >= 0.8 ? 'WARNING' : 'OK';
  const memoryStatus = usedMemPercent >= 90 ? 'DANGER' : usedMemPercent >= 75 ? 'WARNING' : 'OK';
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
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usedPercent: usedMemPercent,
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

  const response = new ApiResponse(200, data, 'Monitoring server berhasil diambil');
  res.status(response.statusCode).json(response);
});

import type { CommitteeEventStatus } from '../../services/committee.service';

export const COMMITTEE_STATUS_LABELS: Record<CommitteeEventStatus, string> = {
  DRAFT: 'Draft',
  MENUNGGU_PERSETUJUAN_KEPSEK: 'Menunggu Persetujuan Kepsek',
  DITOLAK_KEPSEK: 'Ditolak Kepsek',
  MENUNGGU_SK_TU: 'Menunggu SK TU',
  AKTIF: 'Aktif',
  SELESAI: 'Selesai',
  ARSIP: 'Arsip',
};

export function formatCommitteeDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatCommitteeDateTime(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getCommitteeStatusTone(status: CommitteeEventStatus) {
  if (status === 'DRAFT') {
    return 'bg-slate-50 text-slate-700 border border-slate-200';
  }
  if (status === 'MENUNGGU_PERSETUJUAN_KEPSEK') {
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  }
  if (status === 'DITOLAK_KEPSEK') {
    return 'bg-rose-50 text-rose-700 border border-rose-200';
  }
  if (status === 'MENUNGGU_SK_TU') {
    return 'bg-sky-50 text-sky-700 border border-sky-200';
  }
  if (status === 'AKTIF') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }
  if (status === 'SELESAI') {
    return 'bg-violet-50 text-violet-700 border border-violet-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-300';
}

export function humanizeRequesterDuty(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'Guru';
  return normalized.replace(/_/g, ' ');
}


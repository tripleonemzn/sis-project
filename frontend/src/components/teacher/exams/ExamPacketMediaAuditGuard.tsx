import { useMemo, useState } from 'react';
import { AlertTriangle, ImageOff, X } from 'lucide-react';
import type { ExamPacketMediaAudit } from '../../../services/exam.service';

type ExamPacketMediaAuditGuardProps = {
  audit?: ExamPacketMediaAudit | null;
  contextLabel?: string;
};

function getIssueCopy(audit: ExamPacketMediaAudit): { title: string; body: string; panelClassName: string } {
  if (audit.status === 'BLOCKED') {
    return {
      title: `${audit.missingOriginalCount} media soal masih hilang dari storage`,
      body: 'File asli gambar pada paket ini belum lengkap. Sebaiknya rapikan dulu sebelum paket dipakai siswa agar soal tidak tampil kosong di HP ujian.',
      panelClassName: 'border-rose-200 bg-rose-50/90 text-rose-900',
    };
  }

  return {
    title: `${audit.missingThumbnailCount} thumbnail gambar belum siap`,
    body: 'File asli tetap ada dan siswa sudah punya fallback ke gambar asli, tetapi media paket ini sebaiknya tetap dirapikan agar preview lebih konsisten.',
    panelClassName: 'border-amber-200 bg-amber-50/90 text-amber-900',
  };
}

function getIssueLabel(missingOriginal: boolean, missingThumbnail: boolean): string {
  if (missingOriginal) return 'File asli hilang';
  if (missingThumbnail) return 'Thumbnail belum terbentuk';
  return '-';
}

export function ExamPacketMediaAuditGuard({ audit, contextLabel = 'paket ini' }: ExamPacketMediaAuditGuardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const issueCopy = useMemo(() => (audit ? getIssueCopy(audit) : null), [audit]);

  if (!audit || audit.issueCount <= 0 || !issueCopy) return null;

  return (
    <>
      <div className={`rounded-2xl border px-4 py-3 ${issueCopy.panelClassName}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {audit.status === 'BLOCKED' ? (
                <ImageOff className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              )}
              <p className="text-sm font-semibold">{issueCopy.title}</p>
            </div>
            <p className="mt-2 text-sm leading-6">
              Audit media memeriksa gambar internal pada teks soal, media soal, dan media opsi untuk {contextLabel}.{' '}
              {issueCopy.body}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-xs font-medium">
              {audit.referencedMediaCount} referensi dicek
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="rounded-xl border border-current/20 bg-white/80 px-3 py-2 text-sm font-semibold transition hover:bg-white"
            >
              Lihat Detail Media
            </button>
          </div>
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pb-6 pt-24">
          <div className="absolute inset-0 bg-slate-900/15" />
          <div className="relative flex max-h-[calc(100vh-8rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Audit Media Paket</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Tabel ini membantu mendeteksi file gambar yang hilang atau thumbnail yang belum siap sebelum paket dipakai siswa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {audit.status === 'BLOCKED' ? 'Perlu diperbaiki' : 'Perlu dirapikan'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Referensi Dicek</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{audit.referencedMediaCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">File Asli Hilang</div>
                  <div className="mt-1 text-sm font-semibold text-rose-700">{audit.missingOriginalCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thumbnail Belum Siap</div>
                  <div className="mt-1 text-sm font-semibold text-amber-700">{audit.missingThumbnailCount}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Soal</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Lokasi</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Masalah</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Sumber</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {audit.issues.map((issue, index) => (
                        <tr key={`${issue.questionId}-${issue.locationLabel}-${index}`} className="align-top">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">Soal {issue.questionNumber}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{issue.locationLabel}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {getIssueLabel(issue.missingOriginal, issue.missingThumbnail)}
                          </td>
                          <td className="px-4 py-3 text-xs leading-5 text-slate-500">{issue.sourceUrl}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

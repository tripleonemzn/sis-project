import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, ClipboardCheck, FileCheck2, Send, ShieldCheck, XCircle } from 'lucide-react';
import UnderlineTabBar from '../../../components/navigation/UnderlineTabBar';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import {
  teachingResourceProgramService,
  type TeachingResourcePackageStatus,
  type TeachingResourceReviewPackage,
} from '../../../services/teachingResourceProgram.service';

type ReviewView = 'mine' | 'curriculum' | 'principal';

const STATUS_LABEL: Record<TeachingResourcePackageStatus, string> = {
  INCOMPLETE: 'Belum lengkap',
  READY: 'Siap dikirim',
  SUBMITTED_TO_CURRICULUM: 'Menunggu Kurikulum',
  REVISION_REQUESTED: 'Perlu revisi',
  CURRICULUM_APPROVED: 'Disetujui Kurikulum',
  SUBMITTED_TO_PRINCIPAL: 'Menunggu Kepala Sekolah',
  PRINCIPAL_APPROVED: 'Final disetujui',
};

const STATUS_CLASS: Record<TeachingResourcePackageStatus, string> = {
  INCOMPLETE: 'bg-gray-100 text-gray-700 border-gray-200',
  READY: 'bg-blue-50 text-blue-700 border-blue-200',
  SUBMITTED_TO_CURRICULUM: 'bg-amber-50 text-amber-700 border-amber-200',
  REVISION_REQUESTED: 'bg-red-50 text-red-700 border-red-200',
  CURRICULUM_APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUBMITTED_TO_PRINCIPAL: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PRINCIPAL_APPROVED: 'bg-green-50 text-green-700 border-green-200',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function packageTitle(item: TeachingResourceReviewPackage) {
  const subject = item.subjectLabel || 'Mapel belum terbaca';
  const level = item.classLevel ? ` - ${item.classLevel}` : '';
  const className = item.className ? ` (${item.className})` : '';
  return `${subject}${level}${className}`;
}

function ProgressText({ item }: { item: TeachingResourceReviewPackage }) {
  const missing = item.missingDocuments.map((doc) => doc.shortLabel || doc.label).join(', ');
  return (
    <div className="space-y-1">
      <div className="font-medium text-gray-900">
        {item.completedDocuments}/{item.requiredDocuments} dokumen selesai
      </div>
      {missing ? <div className="text-xs text-red-600">Belum ada: {missing}</div> : null}
    </div>
  );
}

export default function LearningResourceReviewSubmissionPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const requestedView = useMemo<ReviewView>(() => {
    const view = new URLSearchParams(location.search).get('view');
    return view === 'curriculum' || view === 'principal' ? view : 'mine';
  }, [location.search]);
  const [activeView, setActiveView] = useState<ReviewView>(requestedView);
  const { data: activeYear } = useActiveAcademicYear();
  const academicYearId = Number(activeYear?.id || activeYear?.academicYearId || 0) || undefined;

  useEffect(() => {
    setActiveView(requestedView);
  }, [requestedView]);

  const queryKey = ['teaching-resource-review-packages', academicYearId || 'active', activeView];
  const packagesQuery = useQuery({
    queryKey,
    queryFn: () => teachingResourceProgramService.getReviewPackages({ academicYearId, view: activeView }),
    enabled: Boolean(academicYearId),
    retry: false,
  });

  const packages = packagesQuery.data?.data?.packages || [];
  const canCurriculumReview = Boolean(packagesQuery.data?.data?.canCurriculumReview);
  const canPrincipalReview = Boolean(packagesQuery.data?.data?.canPrincipalReview);

  const tabs = useMemo(
    () => [
      { id: 'mine', label: 'Paket Saya', icon: ClipboardCheck },
      ...(canCurriculumReview || activeView === 'curriculum'
        ? [{ id: 'curriculum', label: 'Review Kurikulum', icon: FileCheck2 }]
        : []),
      ...(canPrincipalReview || activeView === 'principal'
        ? [{ id: 'principal', label: 'Persetujuan Kepala Sekolah', icon: ShieldCheck }]
        : []),
    ],
    [activeView, canCurriculumReview, canPrincipalReview],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['teaching-resource-review-packages'] });

  const submitMutation = useMutation({
    mutationFn: (item: TeachingResourceReviewPackage) =>
      teachingResourceProgramService.submitReviewPackage({ entryIds: item.entryIds }),
    onSuccess: () => {
      toast.success('Paket berhasil dikirim ke Kurikulum.');
      invalidate();
    },
  });

  const curriculumReviewMutation = useMutation({
    mutationFn: (payload: { item: TeachingResourceReviewPackage; action: 'APPROVE' | 'REJECT'; reviewNote?: string }) =>
      teachingResourceProgramService.reviewPackageByCurriculum({
        entryIds: payload.item.entryIds,
        action: payload.action,
        reviewNote: payload.reviewNote,
      }),
    onSuccess: () => {
      toast.success('Review Kurikulum berhasil disimpan.');
      invalidate();
    },
  });

  const submitPrincipalMutation = useMutation({
    mutationFn: (item: TeachingResourceReviewPackage) =>
      teachingResourceProgramService.submitPackageToPrincipal({ entryIds: item.entryIds }),
    onSuccess: () => {
      toast.success('Paket berhasil diajukan ke Kepala Sekolah.');
      invalidate();
    },
  });

  const principalReviewMutation = useMutation({
    mutationFn: (payload: { item: TeachingResourceReviewPackage; action: 'APPROVE' | 'REJECT'; reviewNote?: string }) =>
      teachingResourceProgramService.reviewPackageByPrincipal({
        entryIds: payload.item.entryIds,
        action: payload.action,
        reviewNote: payload.reviewNote,
      }),
    onSuccess: () => {
      toast.success('Persetujuan Kepala Sekolah berhasil disimpan.');
      invalidate();
    },
  });

  const rejectWithNote = (handler: (note: string) => void) => {
    const note = window.prompt('Tuliskan catatan revisi untuk guru:');
    if (note === null) return;
    handler(note.trim());
  };

  const renderActions = (item: TeachingResourceReviewPackage) => {
    if (activeView === 'mine') {
      const canSubmit = item.status === 'READY' || item.status === 'REVISION_REQUESTED';
      return (
        <button
          type="button"
          disabled={!canSubmit || submitMutation.isPending}
          onClick={() => submitMutation.mutate(item)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <Send size={16} />
          Kirim ke Kurikulum
        </button>
      );
    }

    if (activeView === 'curriculum') {
      if (item.status === 'SUBMITTED_TO_CURRICULUM' || item.status === 'REVISION_REQUESTED') {
        return (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => curriculumReviewMutation.mutate({ item, action: 'APPROVE' })}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
            >
              <CheckCircle2 size={16} />
              Setujui
            </button>
            <button
              type="button"
              onClick={() => rejectWithNote((reviewNote) => curriculumReviewMutation.mutate({ item, action: 'REJECT', reviewNote }))}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"
            >
              <XCircle size={16} />
              Revisi
            </button>
          </div>
        );
      }
      if (item.status === 'CURRICULUM_APPROVED') {
        return (
          <button
            type="button"
            onClick={() => submitPrincipalMutation.mutate(item)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
          >
            <Send size={16} />
            Ajukan ke Kepala Sekolah
          </button>
        );
      }
    }

    if (activeView === 'principal' && item.status === 'SUBMITTED_TO_PRINCIPAL') {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => principalReviewMutation.mutate({ item, action: 'APPROVE' })}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
          >
            <ShieldCheck size={16} />
            Setujui Final
          </button>
          <button
            type="button"
            onClick={() => rejectWithNote((reviewNote) => principalReviewMutation.mutate({ item, action: 'REJECT', reviewNote }))}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600"
          >
            <XCircle size={16} />
            Revisi
          </button>
        </div>
      );
    }

    return <span className="text-xs text-gray-400">Tidak ada aksi</span>;
  };

  return (
    <div className="w-full space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pengajuan Review Perangkat Ajar</h1>
        <p className="mt-1 text-sm text-gray-600">
          Kirim perangkat ajar sebagai satu paket mapel, lalu Kurikulum meneruskan paket final ke Kepala Sekolah.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <UnderlineTabBar
          items={tabs}
          activeId={activeView}
          onChange={(id) => setActiveView(id as ReviewView)}
          className="mb-4"
        />

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Paket Mapel</th>
                <th className="px-4 py-3 text-left">Guru</th>
                <th className="px-4 py-3 text-left">Kelengkapan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Diperbarui</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {packagesQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    Memuat paket perangkat ajar...
                  </td>
                </tr>
              ) : packages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    Belum ada paket perangkat ajar pada tab ini.
                  </td>
                </tr>
              ) : (
                packages.map((item) => (
                  <tr key={item.packageKey} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-gray-900">{packageTitle(item)}</div>
                      {item.reviewNote ? <div className="mt-1 text-xs text-red-600">Catatan: {item.reviewNote}</div> : null}
                    </td>
                    <td className="px-4 py-4 text-gray-700">{item.teacherName || '-'}</td>
                    <td className="px-4 py-4">
                      <ProgressText item={item} />
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{formatDate(item.updatedAt)}</td>
                    <td className="px-4 py-4 text-right">{renderActions(item)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

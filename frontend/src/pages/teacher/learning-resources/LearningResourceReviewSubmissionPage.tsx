import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, ClipboardCheck, Eye, FileCheck2, FileText, MessageSquare, Save, Send, ShieldCheck, X, XCircle } from 'lucide-react';
import UnderlineTabBar from '../../../components/navigation/UnderlineTabBar';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import {
  teachingResourceProgramService,
  type TeachingResourcePackageStatus,
  type TeachingResourceReviewPackage,
  type TeachingResourceReviewPackageDetailEntry,
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

function DocumentPreview({ entry }: { entry: TeachingResourceReviewPackageDetailEntry }) {
  const sections = Array.isArray(entry.content?.sections) ? entry.content.sections : [];

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Isi dokumen belum tersedia untuk ditampilkan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section, sectionIndex) => {
        const columns = Array.isArray(section.columns) ? section.columns : [];
        const rows = Array.isArray(section.rows) ? section.rows : [];
        const hasTable = columns.length > 0 && rows.length > 0;

        return (
          <div key={`${entry.id}-${section.schemaKey || sectionIndex}`} className="rounded-xl border border-slate-200 bg-white p-4">
            {section.title ? <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4> : null}
            {section.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{section.body}</p> : null}
            {hasTable ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {columns.map((column, columnIndex) => (
                        <th key={`${column.key || columnIndex}`} className="border border-slate-200 px-3 py-2 text-left font-semibold">
                          {column.label || column.key || `Kolom ${columnIndex + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`${entry.id}-${sectionIndex}-${rowIndex}`}>
                        {columns.map((column, columnIndex) => {
                          const key = String(column.key || '');
                          const value = key ? row[key] : '';
                          return (
                            <td key={`${key || columnIndex}-${rowIndex}`} className="border border-slate-200 px-3 py-2 align-top text-slate-700">
                              {String(value || '-')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
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
  const [selectedPackage, setSelectedPackage] = useState<TeachingResourceReviewPackage | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [packageCommentDraft, setPackageCommentDraft] = useState('');
  const [documentCommentDrafts, setDocumentCommentDrafts] = useState<Record<number, string>>({});
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
  const detailQueryKey = [
    'teaching-resource-review-package-detail',
    selectedPackage?.packageKey || 'none',
    selectedPackage?.entryIds.join(',') || '',
    activeView,
  ];
  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () =>
      teachingResourceProgramService.getReviewPackageDetail({
        entryIds: selectedPackage?.entryIds || [],
        view: activeView,
      }),
    enabled: Boolean(selectedPackage?.entryIds?.length),
    retry: false,
  });
  const detailEntries = detailQuery.data?.data?.entries || [];
  const activeDetailEntry = detailEntries.find((entry) => Number(entry.id) === Number(selectedEntryId)) || detailEntries[0] || null;
  const canEditReviewComments = activeView === 'curriculum' && canCurriculumReview;

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
  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: ['teaching-resource-review-package-detail'] });

  useEffect(() => {
    if (!detailQuery.data?.data) return;
    const detail = detailQuery.data.data;
    setPackageCommentDraft(detail.package.reviewNote || '');
    setDocumentCommentDrafts(
      Object.fromEntries(
        detail.entries.map((entry) => [entry.id, entry.reviewFeedback?.documentComment || entry.reviewNote || '']),
      ),
    );
    setSelectedEntryId((current) => current || detail.entries[0]?.id || null);
  }, [detailQuery.data]);

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
      invalidateDetail();
      setSelectedPackage(null);
    },
  });

  const submitPrincipalMutation = useMutation({
    mutationFn: (item: TeachingResourceReviewPackage) =>
      teachingResourceProgramService.submitPackageToPrincipal({ entryIds: item.entryIds }),
    onSuccess: () => {
      toast.success('Paket berhasil diajukan ke Kepala Sekolah.');
      invalidate();
      invalidateDetail();
      setSelectedPackage(null);
    },
  });

  const saveFeedbackMutation = useMutation({
    mutationFn: (item: TeachingResourceReviewPackage) =>
      teachingResourceProgramService.saveReviewPackageFeedback({
        entryIds: item.entryIds,
        packageComment: packageCommentDraft,
        documentComments: Object.entries(documentCommentDrafts).map(([entryId, comment]) => ({
          entryId: Number(entryId),
          comment,
        })),
      }),
    onSuccess: () => {
      toast.success('Komentar review berhasil disimpan.');
      invalidate();
      invalidateDetail();
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
      invalidateDetail();
      setSelectedPackage(null);
    },
  });

  const openReviewDetail = (item: TeachingResourceReviewPackage) => {
    setSelectedPackage(item);
    setSelectedEntryId(null);
    setPackageCommentDraft(item.reviewNote || '');
    setDocumentCommentDrafts({});
  };

  const hasReviewComment = () =>
    Boolean(packageCommentDraft.trim()) || Object.values(documentCommentDrafts).some((comment) => String(comment || '').trim());

  const saveFeedbackBeforeDecision = async (item: TeachingResourceReviewPackage) => {
    if (!canEditReviewComments || !hasReviewComment()) return true;
    try {
      await saveFeedbackMutation.mutateAsync(item);
      return true;
    } catch {
      return false;
    }
  };

  const handleCurriculumDecision = async (item: TeachingResourceReviewPackage, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT' && !hasReviewComment()) {
      toast.error('Isi catatan paket atau catatan dokumen sebelum meminta revisi.');
      return;
    }
    const saved = await saveFeedbackBeforeDecision(item);
    if (!saved) return;
    curriculumReviewMutation.mutate({
      item,
      action,
      reviewNote: packageCommentDraft.trim() || undefined,
    });
  };

  const handlePrincipalDecision = (item: TeachingResourceReviewPackage, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT' && !packageCommentDraft.trim()) {
      toast.error('Isi catatan paket sebelum meminta revisi.');
      return;
    }
    principalReviewMutation.mutate({
      item,
      action,
      reviewNote: packageCommentDraft.trim() || undefined,
    });
  };

  const renderActions = (item: TeachingResourceReviewPackage) => {
    if (activeView === 'mine') {
      const canSubmit = item.status === 'READY' || item.status === 'REVISION_REQUESTED';
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => openReviewDetail(item)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Eye size={16} />
            Lihat Detail
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitMutation.isPending}
            onClick={() => submitMutation.mutate(item)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            <Send size={16} />
            Kirim ke Kurikulum
          </button>
        </div>
      );
    }

    if (activeView === 'curriculum') {
      return (
        <button
          type="button"
          onClick={() => openReviewDetail(item)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          <Eye size={16} />
          Review Detail
        </button>
      );
    }

    if (activeView === 'principal') {
      return (
        <button
          type="button"
          onClick={() => openReviewDetail(item)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          <Eye size={16} />
          Review Detail
        </button>
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

      {selectedPackage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4 py-6">
          <div className="flex max-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Review Detail</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{packageTitle(selectedPackage)}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedPackage.teacherName || '-'} • {selectedPackage.completedDocuments}/{selectedPackage.requiredDocuments} dokumen selesai
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPackage(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Tutup review detail"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="border-b border-slate-200 bg-slate-50/80 p-4 lg:border-b-0 lg:border-r">
                <div className="space-y-2">
                  {detailQuery.isLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">Memuat dokumen...</div>
                  ) : detailEntries.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">Belum ada dokumen.</div>
                  ) : (
                    detailEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedEntryId(entry.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                          Number(activeDetailEntry?.id) === Number(entry.id)
                            ? 'border-blue-300 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <FileText size={15} />
                          {entry.programShortLabel || entry.programLabel}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{entry.title}</div>
                        {entry.reviewFeedback?.documentComment ? (
                          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                            <MessageSquare size={12} />
                            Ada catatan
                          </div>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </aside>

              <section className="min-h-0 overflow-y-auto p-5">
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Catatan Paket</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Catatan umum untuk seluruh paket mapel. Gunakan ini untuk keputusan revisi agar guru tidak menebak.
                      </p>
                    </div>
                    {canEditReviewComments ? (
                      <button
                        type="button"
                        disabled={saveFeedbackMutation.isPending}
                        onClick={() => saveFeedbackMutation.mutate(selectedPackage)}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-amber-300"
                      >
                        <Save size={15} />
                        Simpan Komentar
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    value={packageCommentDraft}
                    onChange={(event) => setPackageCommentDraft(event.target.value)}
                    readOnly={!canEditReviewComments && activeView !== 'principal'}
                    rows={3}
                    className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-500 focus:outline-none disabled:bg-slate-50"
                    placeholder="Tulis catatan paket atau alasan revisi..."
                  />
                </div>

                {activeDetailEntry ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {activeDetailEntry.programLabel}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-slate-900">{activeDetailEntry.title}</h3>
                          {activeDetailEntry.summary ? <p className="mt-1 text-sm text-slate-600">{activeDetailEntry.summary}</p> : null}
                        </div>
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          {activeDetailEntry.status}
                        </span>
                      </div>
                      <div className="mt-4">
                        <DocumentPreview entry={activeDetailEntry} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Catatan Dokumen</p>
                          <p className="mt-1 text-sm text-slate-600">Komentar khusus untuk dokumen ini, seperti pola catatan kisi-kisi/kartu soal.</p>
                        </div>
                        {activeDetailEntry.reviewFeedback?.reviewedAt ? (
                          <div className="text-xs text-slate-500">
                            {activeDetailEntry.reviewFeedback.reviewer?.name
                              ? `Terakhir oleh ${activeDetailEntry.reviewFeedback.reviewer.name}`
                              : 'Catatan tersimpan'}
                            {' • '}
                            {formatDate(activeDetailEntry.reviewFeedback.reviewedAt)}
                          </div>
                        ) : null}
                      </div>
                      <textarea
                        value={documentCommentDrafts[activeDetailEntry.id] || ''}
                        onChange={(event) =>
                          setDocumentCommentDrafts((current) => ({
                            ...current,
                            [activeDetailEntry.id]: event.target.value,
                          }))
                        }
                        readOnly={!canEditReviewComments}
                        rows={5}
                        className="mt-3 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                        placeholder="Tulis komentar bila dokumen ini perlu diperbaiki."
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              {activeView === 'curriculum' && ['SUBMITTED_TO_CURRICULUM', 'REVISION_REQUESTED'].includes(selectedPackage.status) ? (
                <>
                  <button
                    type="button"
                    disabled={curriculumReviewMutation.isPending || saveFeedbackMutation.isPending}
                    onClick={() => handleCurriculumDecision(selectedPackage, 'REJECT')}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                  >
                    <XCircle size={16} />
                    Minta Revisi
                  </button>
                  <button
                    type="button"
                    disabled={curriculumReviewMutation.isPending || saveFeedbackMutation.isPending}
                    onClick={() => handleCurriculumDecision(selectedPackage, 'APPROVE')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-emerald-300"
                  >
                    <CheckCircle2 size={16} />
                    Setujui Paket
                  </button>
                </>
              ) : null}
              {activeView === 'curriculum' && selectedPackage.status === 'CURRICULUM_APPROVED' ? (
                <button
                  type="button"
                  disabled={submitPrincipalMutation.isPending}
                  onClick={() => submitPrincipalMutation.mutate(selectedPackage)}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-indigo-300"
                >
                  <Send size={16} />
                  Ajukan ke Kepala Sekolah
                </button>
              ) : null}
              {activeView === 'principal' && selectedPackage.status === 'SUBMITTED_TO_PRINCIPAL' ? (
                <>
                  <button
                    type="button"
                    disabled={principalReviewMutation.isPending}
                    onClick={() => handlePrincipalDecision(selectedPackage, 'REJECT')}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-60"
                  >
                    <XCircle size={16} />
                    Minta Revisi
                  </button>
                  <button
                    type="button"
                    disabled={principalReviewMutation.isPending}
                    onClick={() => handlePrincipalDecision(selectedPackage, 'APPROVE')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-emerald-300"
                  >
                    <ShieldCheck size={16} />
                    Setujui Final
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

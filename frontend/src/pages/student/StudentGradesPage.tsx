import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  CalendarDays,
  Clock3,
  FileText,
  GraduationCap,
  LayoutList,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import ExamProgramFilterBar from '../../components/teacher/exams/ExamProgramFilterBar';
import { authService } from '../../services/auth.service';
import {
  gradeService,
  type StudentGradeOverviewData,
  type StudentGradeOverviewSubjectComponent,
  type StudentGradeOverviewSubjectRow,
  type StudentSemesterReportData,
  type StudentSemesterReportSubjectRow,
} from '../../services/grade.service';
import { UnderlineTabBar } from '../../components/navigation/UnderlineTabBar';

type StudentGradesOutletContext = {
  user?: {
    id?: number | string;
    role?: string | null;
  } | null;
};

type GradeTabKey = 'PROGRAM' | 'REPORT';
type ReportSemesterValue = '' | 'ODD' | 'EVEN';

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatSemesterLabel(value: 'ODD' | 'EVEN') {
  return value === 'EVEN' ? 'Genap' : 'Ganjil';
}

function calculateAverage(values: number[]) {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function SummaryCard(props: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'amber' | 'red';
  subtitle?: string;
}) {
  const tone = props.tone || 'blue';

  return (
    <div
      className={clsx(
        'rounded-2xl border p-4',
        tone === 'blue' && 'border-blue-100 bg-blue-50/70',
        tone === 'green' && 'border-emerald-100 bg-emerald-50/70',
        tone === 'amber' && 'border-amber-100 bg-amber-50/70',
        tone === 'red' && 'border-rose-100 bg-rose-50/70',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            tone === 'blue' && 'bg-white text-blue-600',
            tone === 'green' && 'bg-white text-emerald-600',
            tone === 'amber' && 'bg-white text-amber-600',
            tone === 'red' && 'bg-white text-rose-600',
          )}
        >
          {props.icon}
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{props.value}</p>
      {props.subtitle ? <p className="mt-2 text-xs text-slate-500">{props.subtitle}</p> : null}
    </div>
  );
}

function getReportSubjectMeta(item: StudentSemesterReportSubjectRow) {
  if (item.status === 'LOCKED') {
    return {
      label: 'Menunggu Rilis',
      toneClassName: 'bg-amber-100 text-amber-700',
      note: 'Detail rapor semester masih terkunci sampai tanggal rilis tiba.',
    };
  }

  if (item.status === 'PENDING') {
    return {
      label: 'Menunggu Input',
      toneClassName: 'bg-slate-200 text-slate-600',
      note: 'Nilai rapor untuk mapel ini belum lengkap dan masih menunggu sinkronisasi nilai akhir.',
    };
  }

  return {
    label: 'Tersedia',
    toneClassName: 'bg-emerald-100 text-emerald-700',
    note: item.description || 'Deskripsi rapor belum tersedia.',
  };
}

export default function StudentGradesPage() {
  const { user: contextUser } = useOutletContext<StudentGradesOutletContext>() || {};
  const [activeTab, setActiveTab] = useState<GradeTabKey>('PROGRAM');
  const [activeProgramCode, setActiveProgramCode] = useState<string>('');
  const [selectedReportSemester, setSelectedReportSemester] = useState<ReportSemesterValue>('');
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const overviewQuery = useQuery<StudentGradeOverviewData>({
    queryKey: ['student-grade-overview', user?.id, selectedReportSemester || 'ACTIVE'],
    queryFn: () =>
      gradeService.getStudentOverview({
        reportSemester: selectedReportSemester || undefined,
      }),
    enabled: Boolean(user?.id) && String(user?.role || '').toUpperCase() === 'STUDENT',
    staleTime: 1000 * 60,
  });

  const data = overviewQuery.data;
  const reportCard = data?.reportCard as StudentSemesterReportData | undefined;
  const effectiveReportSemester = (selectedReportSemester || reportCard?.semester || data?.meta.semester || 'ODD') as 'ODD' | 'EVEN';
  const effectiveReportSemesterLabel = formatSemesterLabel(effectiveReportSemester);
  const programTabSubtitle = useMemo(() => {
    if (!data || data.components.length === 0) {
      return 'Tab ini menampilkan nilai per program ujian aktif seperti SBTS, SAS, atau SAT pada setiap mata pelajaran.';
    }
    const labels = Array.from(
      new Set(data.components.map((component) => component.reportSlotCode).filter(Boolean)),
    );
    if (labels.length === 1) {
      return `Tab ini menampilkan skor ${labels[0]} per mata pelajaran. Jika sekolah hanya memakai satu program ujian aktif, nilainya akan muncul di sini.`;
    }
    return `Tab ini menampilkan skor per program ujian aktif. Pilih ${labels.join(', ')} untuk melihat nilai ujian yang berbeda pada mata pelajaran yang sama.`;
  }, [data]);
  const reportTabSubtitle = useMemo(
    () =>
      `Tab ini menampilkan hasil akhir rapor semester: nilai akhir per mapel, kehadiran, dan catatan wali kelas. Ini bukan skor satu ujian tertentu, tetapi ringkasan akhir semester ${data?.meta.semesterLabel || '-'}.`,
    [data?.meta.semesterLabel],
  );
  const programTabs = useMemo(() => {
    if (!data) return [];
    return Array.from(
      new Map(
        data.components.map((component) => [
          component.reportSlotCode,
          {
            code: component.reportSlotCode,
            label: component.label,
            shortLabel: component.reportSlotCode,
            release: component.release,
          },
        ]),
      ).values(),
    );
  }, [data]);
  const activeProgram = useMemo(
    () => programTabs.find((program) => program.code === activeProgramCode) || programTabs[0] || null,
    [programTabs, activeProgramCode],
  );
  const activeProgramSubjects = useMemo(() => {
    if (!data || !activeProgram) return [];
    return data.subjects
      .map((subject) => {
        const component = subject.components.find((row) => row.reportSlotCode === activeProgram.code) || null;
        if (!component) return null;
        return { subject, component };
      })
      .filter(
        (row): row is { subject: StudentGradeOverviewSubjectRow; component: StudentGradeOverviewSubjectComponent } =>
          row !== null,
      );
  }, [data, activeProgram]);
  const activeProgramSummary = useMemo(() => {
    const totalSubjects = activeProgramSubjects.length;
    const availableSubjects = activeProgramSubjects.filter((row) => row.component.status === 'AVAILABLE').length;
    const pendingSubjects = Math.max(totalSubjects - availableSubjects, 0);
    const scores = activeProgramSubjects
      .map((row) => row.component.score)
      .filter((value): value is number => value !== null && value !== undefined);

    return {
      totalSubjects,
      availableSubjects,
      pendingSubjects,
      averageScore: calculateAverage(scores),
    };
  }, [activeProgramSubjects]);
  const activeProgramRelease = activeProgram?.release || null;
  const isProgramReleaseLocked = Boolean(activeProgramRelease && !activeProgramRelease.canViewDetails);
  const isReportTabActive = activeTab === 'REPORT';
  const programReleaseDateLabel = activeProgramRelease?.effectiveDate
    ? formatDateLabel(activeProgramRelease.effectiveDate)
    : activeProgramRelease?.mode === 'REPORT_DATE'
      ? 'Tanggal rapor belum diatur'
      : 'Tanggal publikasi belum diatur';

  useEffect(() => {
    if (!programTabs.length) {
      if (activeProgramCode) setActiveProgramCode('');
      return;
    }
    if (!programTabs.some((program) => program.code === activeProgramCode)) {
      setActiveProgramCode(programTabs[0].code);
    }
  }, [programTabs, activeProgramCode]);

  if (String(user?.role || '').toUpperCase() !== 'STUDENT') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Nilai Saya</h1>
        <p className="mt-2 text-sm text-slate-500">Fitur nilai siswa hanya tersedia untuk role siswa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nilai Saya</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan nilai siswa dipisahkan antara program ujian aktif dan rapor semester berjalan.
          </p>
        </div>
        {data ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
            <GraduationCap className="h-4 w-4" />
            Semester {data.meta.semesterLabel}
          </div>
        ) : null}
      </div>

      {overviewQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : null}

      {overviewQuery.isError ? (
        <div className="rounded-3xl border border-red-100 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Gagal memuat nilai siswa</h2>
          <p className="mt-2 text-sm text-red-600">Silakan coba muat ulang halaman ini.</p>
        </div>
      ) : null}

      {data ? (
        <>
          {activeTab === 'PROGRAM' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={<LayoutList className="h-5 w-5" />}
                label="Total Mapel"
                value={String(activeProgramSummary.totalSubjects)}
                subtitle={activeProgram ? `${activeProgram.shortLabel} • ${activeProgram.label}` : 'Mapel program aktif'}
                tone="blue"
              />
              <SummaryCard
                icon={<GraduationCap className="h-5 w-5" />}
                label="Mapel Tersedia"
                value={String(activeProgramSummary.availableSubjects)}
                subtitle={isProgramReleaseLocked ? 'Menunggu publikasi program' : 'Nilai program sudah tampil'}
                tone={isProgramReleaseLocked ? 'amber' : 'green'}
              />
              <SummaryCard
                icon={<TrendingUp className="h-5 w-5" />}
                label={activeProgram ? `Rata-rata ${activeProgram.shortLabel}` : 'Rata-rata'}
                value={formatScore(activeProgramSummary.averageScore)}
                subtitle="Dihitung dari nilai program yang sudah tersedia"
                tone="blue"
              />
              <SummaryCard
                icon={<Clock3 className="h-5 w-5" />}
                label="Mapel Menunggu"
                value={String(activeProgramSummary.pendingSubjects)}
                subtitle={isProgramReleaseLocked ? 'Masih tertahan policy publikasi' : 'Masih menunggu input/sinkron nilai'}
                tone={activeProgramSummary.pendingSubjects > 0 ? 'amber' : 'green'}
              />
            </div>
          ) : null}

          {isReportTabActive && reportCard ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={<LayoutList className="h-5 w-5" />}
                label="Mapel Siap"
                value={`${reportCard.summary.availableSubjects}/${reportCard.summary.expectedSubjects}`}
                subtitle={`Semester ${effectiveReportSemesterLabel}`}
                tone={reportCard.status.tone === 'green' ? 'green' : reportCard.status.tone === 'amber' ? 'amber' : 'red'}
              />
              <SummaryCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="Rata-rata"
                value={formatScore(reportCard.summary.averageFinalScore)}
                tone="blue"
                subtitle={`Semester ${effectiveReportSemesterLabel}`}
              />
              <SummaryCard
                icon={<UserCheck className="h-5 w-5" />}
                label="Kehadiran"
                value={String(reportCard.attendance.hadir)}
                subtitle={`${reportCard.attendance.sakit} sakit • ${reportCard.attendance.izin} izin • ${reportCard.attendance.alpha} alpha`}
                tone="green"
              />
              <SummaryCard
                icon={<Clock3 className="h-5 w-5" />}
                label="Mapel Menunggu"
                value={String(reportCard.summary.missingSubjects)}
                tone={reportCard.summary.missingSubjects > 0 ? 'amber' : 'green'}
              />
            </div>
          ) : null}

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <UnderlineTabBar
                  items={[
                    { id: 'PROGRAM', label: 'Nilai Program Ujian', icon: GraduationCap },
                    { id: 'REPORT', label: 'Rapor Semester', icon: FileText },
                  ]}
                  activeId={activeTab}
                  onChange={(next) => setActiveTab(next as GradeTabKey)}
                  ariaLabel="Tab nilai siswa"
                />
                <p className="mt-3 text-sm text-slate-500">
                  {activeTab === 'PROGRAM' ? programTabSubtitle : reportTabSubtitle}
                </p>
              </div>

              {isReportTabActive && reportCard ? (
                <label className="flex min-w-[280px] items-center gap-3 text-sm text-slate-600 xl:justify-end">
                  <span className="shrink-0 font-medium text-slate-700">Semester Rapor</span>
                  <select
                    value={effectiveReportSemester}
                    onChange={(event) => setSelectedReportSemester((event.target.value as ReportSemesterValue) || '')}
                    className="min-w-0 flex-1 px-4 py-3 text-sm font-medium text-slate-700 outline-none"
                  >
                    <option value="ODD">Semester Ganjil</option>
                    <option value="EVEN">Semester Genap</option>
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          {activeTab === 'PROGRAM' ? (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Program Ujian Aktif</h2>
                    <p className="mt-1 text-sm text-slate-500">{programTabSubtitle}</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                    <Clock3 className="h-4 w-4" />
                    Mengikuti semester berjalan
                  </div>
                </div>

                <div className="mt-5">
                  <ExamProgramFilterBar
                    programs={programTabs}
                    activeProgramCode={activeProgram?.code || ''}
                    onProgramChange={setActiveProgramCode}
                    emptyMessage="Belum ada Program Ujian aktif yang relevan untuk semester berjalan."
                  />
                </div>
              </div>

              {isProgramReleaseLocked ? (
                <div className="rounded-3xl border border-amber-100 bg-amber-50/80 p-5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-amber-700">
                    <CalendarDays className="h-4 w-4" />
                    Nilai program menunggu publikasi
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {activeProgramRelease?.source === 'HOMEROOM'
                      ? `Nilai ${activeProgram?.code || 'program ujian'} masih ditahan wali kelas. ${activeProgramRelease?.description}`
                      : `Nilai ${activeProgram?.code || 'program ujian'} untuk siswa belum dibuka. Rilis saat ini mengikuti ${programReleaseDateLabel}. ${activeProgramRelease?.description}`}
                  </p>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-5">
                  <h2 className="text-xl font-bold text-slate-900">
                    Daftar Nilai {activeProgram?.label || 'Program Ujian'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeProgramSummary.totalSubjects} mata pelajaran aktif • {activeProgramSummary.pendingSubjects} mapel belum bisa dibaca siswa
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Mata Pelajaran</th>
                        <th className="px-4 py-3 text-left font-semibold">Guru</th>
                        <th className="px-4 py-3 text-left font-semibold">KKM</th>
                        <th className="px-4 py-3 text-left font-semibold">Program</th>
                        <th className="px-4 py-3 text-left font-semibold">Status</th>
                        <th className="px-4 py-3 text-left font-semibold">Nilai</th>
                        <th className="px-4 py-3 text-left font-semibold">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {activeProgramSubjects.map(({ subject, component }) => {
                        const isAvailable = component.status === 'AVAILABLE';
                        const statusLabel = isProgramReleaseLocked
                          ? 'Menunggu publikasi'
                          : isAvailable
                            ? 'Tersedia'
                            : 'Menunggu';

                        return (
                          <tr key={`${subject.subject.id}-${component.reportSlotCode}`} className="align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{subject.subject.name}</div>
                              <div className="mt-1 text-xs text-slate-500">{subject.subject.code}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{subject.teacher?.name || '-'}</td>
                            <td className="px-4 py-3 text-slate-900">{subject.kkm}</td>
                            <td className="px-4 py-3 text-slate-900">{component.reportSlotCode}</td>
                            <td className="px-4 py-3">
                              <span
                                className={clsx(
                                  'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                  isProgramReleaseLocked && 'bg-amber-100 text-amber-700',
                                  !isProgramReleaseLocked && isAvailable && 'bg-emerald-100 text-emerald-700',
                                  !isProgramReleaseLocked && !isAvailable && 'bg-slate-200 text-slate-600',
                                )}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-900">
                              <div className="font-medium">
                                {isProgramReleaseLocked ? '-' : formatScore(component.score)}
                              </div>
                              {!isProgramReleaseLocked && component.series.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {component.series.map((score, index) => (
                                    <span
                                      key={`${component.code}-series-${index}`}
                                      className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                                    >
                                      NF{index + 1}: {formatScore(score)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {component.entryMode === 'NF_SERIES' ? 'Seri NF' : 'Skor tunggal'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {activeProgramSubjects.length > 0 ? (
                null
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <FileText className="mx-auto h-12 w-12 text-slate-300" />
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">Belum ada data nilai program</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {isProgramReleaseLocked
                      ? `Nilai ${activeProgram?.code || 'program ini'} akan tampil setelah policy publikasi program terpenuhi.`
                      : `Nilai ${activeProgram?.code || 'program ini'} untuk semester berjalan belum tersedia.`}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {reportCard ? (
                <>
                  {reportCard.release.canViewDetails && reportCard.homeroomNote ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                      <h2 className="text-xl font-bold text-slate-900">Catatan Wali Kelas</h2>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{reportCard.homeroomNote}</p>
                    </div>
                  ) : null}

                  {reportCard.subjects.length > 0 ? (
                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-200 px-5 py-5">
                        <h2 className="text-xl font-bold text-slate-900">Daftar Nilai Rapor Semester</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {reportCard.subjects.length} mata pelajaran semester {effectiveReportSemesterLabel.toLowerCase()}
                          {reportCard.release.canViewDetails
                            ? ' siap dibaca sesuai status rilis rapor semester.'
                            : ' sudah ditampilkan, tetapi detail nilai akhir baru terbuka setelah rapor semester dirilis.'}
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold">Mata Pelajaran</th>
                              <th className="px-4 py-3 text-left font-semibold">Guru</th>
                              <th className="px-4 py-3 text-left font-semibold">KKM</th>
                              <th className="px-4 py-3 text-left font-semibold">Nilai Akhir</th>
                              <th className="px-4 py-3 text-left font-semibold">Predikat</th>
                              <th className="px-4 py-3 text-left font-semibold">Status</th>
                              <th className="px-4 py-3 text-left font-semibold">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {reportCard.subjects.map((subject) => {
                              const statusMeta = getReportSubjectMeta(subject);
                              const isLocked = subject.status === 'LOCKED';
                              const isPending = subject.status === 'PENDING';

                              return (
                                <tr key={subject.subject.id} className="align-top">
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-slate-900">{subject.subject.name}</div>
                                    <div className="mt-1 text-xs text-slate-500">{subject.subject.code}</div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{subject.teacher?.name || '-'}</td>
                                  <td className="px-4 py-3 text-slate-900">{subject.kkm}</td>
                                  <td className="px-4 py-3 font-medium text-slate-900">
                                    {isLocked || isPending ? '-' : formatScore(subject.finalScore)}
                                  </td>
                                  <td className="px-4 py-3 font-medium text-slate-900">
                                    {isLocked || isPending ? '-' : subject.predicate || '-'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', statusMeta.toneClassName)}>
                                      {statusMeta.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">{statusMeta.note}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                      <FileText className="mx-auto h-12 w-12 text-slate-300" />
                      <h2 className="mt-4 text-lg font-semibold text-slate-900">Belum ada data rapor semester</h2>
                      <p className="mt-2 text-sm text-slate-500">Rapor semester berjalan belum siap ditampilkan.</p>
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

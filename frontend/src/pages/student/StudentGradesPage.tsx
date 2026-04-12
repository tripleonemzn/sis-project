import { type ReactNode, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  LayoutList,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { authService } from '../../services/auth.service';
import {
  gradeService,
  type StudentGradeOverviewData,
  type StudentGradeOverviewSubjectComponent,
  type StudentGradeOverviewSubjectRow,
  type StudentSemesterReportData,
  type StudentSemesterReportSubjectRow,
} from '../../services/grade.service';

type StudentGradesOutletContext = {
  user?: {
    id?: number | string;
    role?: string | null;
  } | null;
};

type GradeTabKey = 'PROGRAM' | 'REPORT';

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

function TabButton(props: {
  active: boolean;
  label: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        'rounded-2xl border px-4 py-3 text-left transition',
        props.active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
      )}
    >
      <p className="text-sm font-semibold">{props.label}</p>
      <p className={clsx('mt-1 text-xs', props.active ? 'text-blue-600' : 'text-slate-500')}>{props.subtitle}</p>
    </button>
  );
}

function ComponentCard({ item }: { item: StudentGradeOverviewSubjectComponent }) {
  const available = item.status === 'AVAILABLE';

  return (
    <div
      className={clsx(
        'rounded-2xl border p-3',
        available ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{item.reportSlotCode.replace(/_/g, ' ')}</p>
        </div>
        <span
          className={clsx(
            'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
            available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
          )}
        >
          {available ? 'Tersedia' : 'Belum tersedia'}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Nilai</p>
          <p className="text-2xl font-bold text-slate-900">{formatScore(item.score)}</p>
        </div>
        <p className="text-xs text-slate-500">{item.entryMode === 'NF_SERIES' ? 'Seri NF' : 'Skor tunggal'}</p>
      </div>

      {item.series.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.series.map((score, index) => (
            <span
              key={`${item.code}-series-${index}`}
              className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700"
            >
              NF{index + 1}: {formatScore(score)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubjectCard({ item }: { item: StudentGradeOverviewSubjectRow }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-blue-600">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{item.subject.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {item.subject.code}
                {item.teacher?.name ? ` • ${item.teacher.name}` : ''}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">KKM</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{item.kkm}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nilai Akhir</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{formatScore(item.finalScore)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Komponen</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {item.componentSummary.availableCount}/{item.componentSummary.totalCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {item.components.map((component) => (
            <ComponentCard key={`${item.subject.id}-${component.code}`} item={component} />
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Predikat</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{item.predicate || '-'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Catatan Kompetensi</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{item.description || 'Deskripsi nilai belum tersedia.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportSubjectCard({ item }: { item: StudentSemesterReportSubjectRow }) {
  const isLocked = item.status === 'LOCKED';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{item.subject.name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {item.subject.code}
            {item.teacher?.name ? ` • ${item.teacher.name}` : ''}
          </p>
        </div>
        {isLocked ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-700">
            Nilai rapor untuk mapel ini akan tampil setelah rapor semester dirilis.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">KKM</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{item.kkm}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nilai Akhir</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{formatScore(item.finalScore)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Predikat</p>
              <p className="mt-2 text-xl font-bold text-slate-900">{item.predicate || '-'}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {isLocked ? 'Status Rilis' : 'Catatan Kompetensi'}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {isLocked ? 'Detail rapor semester masih terkunci sampai tanggal rilis tiba.' : item.description || 'Deskripsi rapor belum tersedia.'}
        </p>
      </div>
    </div>
  );
}

export default function StudentGradesPage() {
  const { user: contextUser } = useOutletContext<StudentGradesOutletContext>() || {};
  const [activeTab, setActiveTab] = useState<GradeTabKey>('PROGRAM');
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;

  const overviewQuery = useQuery<StudentGradeOverviewData>({
    queryKey: ['student-grade-overview', user?.id],
    queryFn: () => gradeService.getStudentOverview(),
    enabled: Boolean(user?.id) && String(user?.role || '').toUpperCase() === 'STUDENT',
    staleTime: 1000 * 60,
  });

  const data = overviewQuery.data;
  const programTabSubtitle = useMemo(() => {
    if (!data || data.components.length === 0) {
      return 'Lihat komponen nilai program ujian aktif per mata pelajaran.'
    }
    const labels = Array.from(
      new Set(data.components.map((component) => component.reportSlotCode).filter(Boolean)),
    )
    if (labels.length === 1) {
      return `Lihat komponen ${labels[0]} per mata pelajaran.`
    }
    if (labels.length === 2) {
      return `Lihat komponen ${labels[0]} dan ${labels[1]} per mata pelajaran.`
    }
    return `Lihat komponen ${labels.slice(0, -1).join(', ')}, dan ${labels[labels.length - 1]} per mata pelajaran.`
  }, [data]);
  const programSummary = useMemo(() => {
    if (!data) return [];
    return data.components.map((component) => {
      const availableSubjects = data.subjects.filter((subject) =>
        subject.components.some((row) => row.code === component.code && row.status === 'AVAILABLE'),
      ).length;

      return {
        code: component.code,
        label: component.label,
        reportSlotCode: component.reportSlotCode,
        availableSubjects,
        pendingSubjects: Math.max(data.subjects.length - availableSubjects, 0),
      };
    });
  }, [data]);

  if (String(user?.role || '').toUpperCase() !== 'STUDENT') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Nilai Saya</h1>
        <p className="mt-2 text-sm text-slate-500">Fitur nilai siswa hanya tersedia untuk role siswa.</p>
      </div>
    );
  }

  const reportCard = data?.reportCard as StudentSemesterReportData | undefined;

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
          <div className="grid gap-3 lg:grid-cols-2">
            <TabButton
              active={activeTab === 'PROGRAM'}
              label="Nilai Program Ujian"
              subtitle={programTabSubtitle}
              onClick={() => setActiveTab('PROGRAM')}
            />
            <TabButton
              active={activeTab === 'REPORT'}
              label="Rapor Semester"
              subtitle="Lihat ringkasan nilai akhir semester, kehadiran, dan catatan wali kelas."
              onClick={() => setActiveTab('REPORT')}
            />
          </div>

          {activeTab === 'PROGRAM' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  icon={<BookOpen className="h-5 w-5" />}
                  label="Total Mapel"
                  value={String(data.summary.totalSubjects)}
                  tone="blue"
                />
                <SummaryCard
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  label="Mapel Tersedia"
                  value={String(data.summary.subjectsWithAnyScore)}
                  tone="green"
                />
                <SummaryCard
                  icon={<LayoutList className="h-5 w-5" />}
                  label="Komponen Tersedia"
                  value={String(data.summary.availableComponents)}
                  tone="green"
                />
                <SummaryCard
                  icon={<TrendingUp className="h-5 w-5" />}
                  label="Rata-rata Akhir"
                  value={formatScore(data.summary.averageFinalScore)}
                  tone="amber"
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Ringkasan Program Ujian</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Status komponen nilai aktif untuk semester berjalan pada setiap mata pelajaran.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                    <Clock3 className="h-4 w-4" />
                    Mengikuti semester berjalan
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {programSummary.map((component) => (
                    <div
                      key={component.code}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{component.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{component.reportSlotCode.replace(/_/g, ' ')}</p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                          {component.availableSubjects}/{data.summary.totalSubjects}
                        </span>
                      </div>
                      <p className="mt-4 text-sm text-slate-600">
                        {component.availableSubjects} mapel sudah tersedia • {component.pendingSubjects} mapel masih menunggu
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <h2 className="text-xl font-bold text-slate-900">Daftar Nilai Program Ujian</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {data.summary.totalSubjects} mata pelajaran aktif • {data.summary.pendingComponents} komponen belum tersedia
                </p>
              </div>

              {data.subjects.length > 0 ? (
                <div className="grid gap-5">
                  {data.subjects.map((subject) => (
                    <SubjectCard key={subject.subject.id} item={subject} />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                  <FileText className="mx-auto h-12 w-12 text-slate-300" />
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">Belum ada data nilai program</h2>
                  <p className="mt-2 text-sm text-slate-500">Komponen nilai untuk semester berjalan belum tersedia.</p>
                </div>
              )}
            </>
          ) : (
            <>
              {reportCard ? (
                <>
                  <div
                    className={clsx(
                      'rounded-3xl border p-5',
                      reportCard.release.tone === 'green' && 'border-emerald-100 bg-emerald-50/80',
                      reportCard.release.tone === 'amber' && 'border-amber-100 bg-amber-50/80',
                      reportCard.release.tone === 'red' && 'border-rose-100 bg-rose-50/80',
                    )}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-700">
                          <CalendarDays className="h-4 w-4" />
                          Rilis Semester: {reportCard.release.label}
                        </div>
                        <p className="mt-3 text-sm text-slate-700">{reportCard.release.description}</p>
                        <p className="mt-2 text-xs font-medium text-slate-600">
                          Kesiapan data: {reportCard.status.label}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">
                          {reportCard.reportDate ? formatDateLabel(reportCard.reportDate.date) : 'Tanggal rapor belum diatur'}
                        </p>
                        <p className="mt-1">
                          {reportCard.reportDate?.place || 'Lokasi rapor belum diatur'} • {reportCard.semesterType}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                      icon={<LayoutList className="h-5 w-5" />}
                      label="Mapel Siap"
                      value={`${reportCard.summary.availableSubjects}/${reportCard.summary.expectedSubjects}`}
                      tone={reportCard.status.tone === 'green' ? 'green' : reportCard.status.tone === 'amber' ? 'amber' : 'red'}
                    />
                    <SummaryCard
                      icon={<TrendingUp className="h-5 w-5" />}
                      label="Rata-rata"
                      value={formatScore(reportCard.summary.averageFinalScore)}
                      tone="blue"
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

                  {!reportCard.release.canViewDetails ? (
                    <div className="rounded-3xl border border-amber-100 bg-amber-50/80 p-5">
                      <h2 className="text-xl font-bold text-slate-900">Detail Rapor Menunggu Rilis</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Nama mapel semester sudah ditampilkan agar Anda tahu cakupan rapor yang akan keluar, tetapi nilai akhir, predikat, dan catatan kompetensi baru akan terbuka setelah tanggal rilis rapor.
                      </p>
                    </div>
                  ) : null}

                  {reportCard.release.canViewDetails && reportCard.homeroomNote ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                      <h2 className="text-xl font-bold text-slate-900">Catatan Wali Kelas</h2>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{reportCard.homeroomNote}</p>
                    </div>
                  ) : null}

                  {reportCard.subjects.length > 0 ? (
                    <div className="grid gap-5">
                      {reportCard.subjects.map((subject) => (
                        <ReportSubjectCard key={subject.subject.id} item={subject} />
                      ))}
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

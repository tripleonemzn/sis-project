import type { ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  LayoutList,
  TrendingUp,
} from 'lucide-react';
import { authService } from '../../services/auth.service';
import {
  gradeService,
  type StudentGradeOverviewData,
  type StudentGradeOverviewSubjectComponent,
  type StudentGradeOverviewSubjectRow,
} from '../../services/grade.service';

type StudentGradesOutletContext = {
  user?: {
    id?: number | string;
    role?: string | null;
  } | null;
};

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
}

function SummaryCard(props: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'amber';
}) {
  const tone = props.tone || 'blue';

  return (
    <div
      className={clsx(
        'rounded-2xl border p-4',
        tone === 'blue' && 'border-blue-100 bg-blue-50/70',
        tone === 'green' && 'border-emerald-100 bg-emerald-50/70',
        tone === 'amber' && 'border-amber-100 bg-amber-50/70',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            tone === 'blue' && 'bg-white text-blue-600',
            tone === 'green' && 'bg-white text-emerald-600',
            tone === 'amber' && 'bg-white text-amber-600',
          )}
        >
          {props.icon}
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{props.value}</p>
    </div>
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

export default function StudentGradesPage() {
  const { user: contextUser } = useOutletContext<StudentGradesOutletContext>() || {};
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

  if (String(user?.role || '').toUpperCase() !== 'STUDENT') {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Nilai</h1>
        <p className="mt-2 text-sm text-slate-500">Fitur nilai siswa hanya tersedia untuk role siswa.</p>
      </div>
    );
  }

  const data = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nilai Saya</h1>
          <p className="mt-1 text-sm text-slate-500">Ringkasan komponen nilai semester berjalan untuk setiap mata pelajaran.</p>
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
                <h2 className="text-xl font-bold text-slate-900">Daftar Nilai Mata Pelajaran</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {data.summary.totalSubjects} mata pelajaran aktif • {data.summary.pendingComponents} komponen belum tersedia
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                <Clock3 className="h-4 w-4" />
                Mengikuti semester berjalan
              </div>
            </div>
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
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Belum ada data nilai aktif</h2>
              <p className="mt-2 text-sm text-slate-500">Nilai untuk semester berjalan belum tersedia.</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Loader2, Printer, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { academicYearService } from '../../services/academicYear.service';
import { examCardService, type ExamCardOverviewRow, type ExamGeneratedCardPayload } from '../../services/examCard.service';
import { examService, type ExamProgram } from '../../services/exam.service';
import { isNonScheduledExamProgram } from '../../lib/examProgramMenu';

type StatusFilter = 'ALL' | 'PUBLISHED' | 'ELIGIBLE' | 'BLOCKED';

function formatDateTime(value?: string | null) {
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

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openPrintWindow(title: string, bodyHtml: string) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!printWindow) {
    toast.error('Popup print diblokir browser.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #f8fafc; }
          .sheet { page-break-after: always; background: #fff; border: 1px solid #d9e2f3; border-radius: 20px; padding: 22px; margin-bottom: 18px; }
          .sheet:last-child { page-break-after: auto; }
          .header { display: grid; grid-template-columns: 92px 1fr; gap: 18px; align-items: center; border-bottom: 2px solid #dbe7fb; padding-bottom: 16px; }
          .logo-box { width: 92px; height: 92px; display: flex; align-items: center; justify-content: center; border-radius: 18px; background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #bfdbfe; }
          .logo-box img { width: 72px; height: 72px; object-fit: contain; }
          .school-name { font-size: 22px; font-weight: 800; letter-spacing: 0.02em; }
          .header-title { margin-top: 6px; font-size: 18px; font-weight: 800; }
          .header-subtitle { margin-top: 4px; color: #475569; font-size: 13px; }
          .identity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 18px; }
          .identity-card { border: 1px solid #dbe7fb; border-radius: 16px; padding: 14px; background: #f8fbff; }
          .identity-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .identity-grid { display: grid; grid-template-columns: 72px 10px 1fr; gap: 8px; row-gap: 8px; margin-top: 10px; font-size: 13px; }
          .schedule-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          .schedule-table th, .schedule-table td { border: 1px solid #dbe7fb; padding: 10px; font-size: 12px; vertical-align: top; }
          .schedule-table th { background: #eff6ff; text-align: left; font-weight: 700; }
          .legality { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
          .legal-card { border: 1px solid #dbe7fb; border-radius: 16px; padding: 14px; min-height: 178px; display: flex; flex-direction: column; justify-content: space-between; }
          .barcode { width: 104px; height: 104px; object-fit: contain; margin: 10px 0; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; padding: 6px; }
          .muted { color: #64748b; }
          @media print {
            body { background: #fff; padding: 0; }
            .sheet { border: none; border-radius: 0; margin: 0; padding: 16mm; box-shadow: none; }
          }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

function buildExamCardSheet(card: ExamGeneratedCardPayload) {
  return `
    <section class="sheet">
      <div class="header">
        <div class="logo-box">
          <img src="/logo_sis_kgb2.png" alt="Logo KGB2" />
        </div>
        <div>
          <div class="school-name">${escapeHtml(card.schoolName)}</div>
          <div class="header-title">${escapeHtml(card.headerTitle)}</div>
          <div class="header-subtitle">${escapeHtml(card.headerSubtitle)}</div>
        </div>
      </div>

      <div class="identity">
        <div class="identity-card">
          <div class="identity-title">Identitas Siswa</div>
          <div class="identity-grid">
            <strong>Nama</strong><span>:</span><span>${escapeHtml(card.student.name)}</span>
            <strong>NIS</strong><span>:</span><span>${escapeHtml(card.student.nis || '-')}</span>
            <strong>NISN</strong><span>:</span><span>${escapeHtml(card.student.nisn || '-')}</span>
            <strong>Kelas</strong><span>:</span><span>${escapeHtml(card.student.className || '-')}</span>
          </div>
        </div>
        <div class="identity-card">
          <div class="identity-title">Informasi Kartu</div>
          <div class="identity-grid">
            <strong>Program</strong><span>:</span><span>${escapeHtml(card.programLabel)}</span>
            <strong>Semester</strong><span>:</span><span>${escapeHtml(card.semester === 'EVEN' ? 'Genap' : 'Ganjil')}</span>
            <strong>Tahun</strong><span>:</span><span>${escapeHtml(card.academicYearName)}</span>
            <strong>Generate</strong><span>:</span><span>${escapeHtml(formatDateTime(card.generatedAt))}</span>
          </div>
        </div>
      </div>

      <table class="schedule-table">
        <thead>
          <tr>
            <th>Ruang</th>
            <th>Sesi</th>
            <th>Kursi</th>
            <th>Mulai</th>
            <th>Selesai</th>
          </tr>
        </thead>
        <tbody>
          ${card.entries
            .map(
              (entry) => `
                <tr>
                  <td>${escapeHtml(entry.roomName || '-')}</td>
                  <td>${escapeHtml(entry.sessionLabel || '-')}</td>
                  <td>${escapeHtml(entry.seatLabel || '-')}</td>
                  <td>${escapeHtml(formatDateTime(entry.startTime))}</td>
                  <td>${escapeHtml(formatDateTime(entry.endTime))}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>

      <div class="legality">
        <div class="legal-card">
          <div>
            <div class="identity-title">Legalitas Kepala Sekolah</div>
            <p class="muted" style="margin-top: 10px;">${escapeHtml(card.legality.signatureLabel)}</p>
            ${card.legality.principalBarcodeDataUrl ? `<img class="barcode" src="${card.legality.principalBarcodeDataUrl}" alt="Barcode Kepala Sekolah" />` : ''}
          </div>
          <div>
            <div style="font-weight: 700;">${escapeHtml(card.legality.principalName)}</div>
            <div class="muted" style="font-size: 12px;">Kepala Sekolah</div>
          </div>
        </div>
        <div class="legal-card">
          <div>
            <div class="identity-title">Validasi Tata Usaha</div>
            <p class="muted" style="margin-top: 10px;">Kartu ini diterbitkan secara digital oleh Kepala TU dan berlaku selama data ruang ujian belum berubah.</p>
          </div>
          <div>
            <div style="font-weight: 700;">${escapeHtml(card.generatedBy.name)}</div>
            <div class="muted" style="font-size: 12px;">Kepala Tata Usaha</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function matchesSearch(keyword: string, values: Array<string | null | undefined>) {
  if (!keyword) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(keyword));
}

export function HeadTuExamCardsPanel() {
  const queryClient = useQueryClient();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [activeProgramCode, setActiveProgramCode] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const academicYearsQuery = useQuery({
    queryKey: ['head-tu-exam-cards-academic-years'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const academicYears =
    academicYearsQuery.data?.data?.academicYears || academicYearsQuery.data?.academicYears || [];
  const activeYear = academicYears.find((item: { isActive?: boolean }) => item.isActive) || academicYears[0] || null;

  useEffect(() => {
    if (!activeYear?.id) return;
    setSelectedAcademicYearId((current) => current ?? Number(activeYear.id));
  }, [activeYear?.id]);

  const programsQuery = useQuery({
    queryKey: ['head-tu-exam-cards-programs', selectedAcademicYearId || 'none'],
    enabled: Boolean(selectedAcademicYearId),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examService.getPrograms({
        academicYearId: selectedAcademicYearId || undefined,
        roleContext: 'all',
        includeInactive: false,
      }),
  });

  const visiblePrograms = useMemo(
    () =>
      (programsQuery.data?.data?.programs || [])
        .filter((program: ExamProgram) => Boolean(program.isActive) && !isNonScheduledExamProgram(program))
        .sort((a: ExamProgram, b: ExamProgram) => a.order - b.order || a.label.localeCompare(b.label, 'id-ID')),
    [programsQuery.data?.data?.programs],
  );

  useEffect(() => {
    if (visiblePrograms.length === 0) {
      setActiveProgramCode('');
      return;
    }
    setActiveProgramCode((current) =>
      visiblePrograms.some((program) => program.code === current) ? current : visiblePrograms[0].code,
    );
  }, [visiblePrograms]);

  const overviewQuery = useQuery({
    queryKey: ['head-tu-exam-cards-overview', selectedAcademicYearId || 'none', activeProgramCode || 'none'],
    enabled: Boolean(selectedAcademicYearId) && Boolean(activeProgramCode),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await examCardService.getOverview({
        academicYearId: Number(selectedAcademicYearId),
        programCode: activeProgramCode,
      });
      return response.data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      examCardService.generate({
        academicYearId: Number(selectedAcademicYearId),
        programCode: activeProgramCode,
        semester: overviewQuery.data?.semester,
      }),
    onSuccess: async (response) => {
      toast.success(response.message || 'Kartu ujian berhasil digenerate.');
      await queryClient.invalidateQueries({ queryKey: ['head-tu-exam-cards-overview'] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal generate kartu ujian.');
    },
  });

  const classOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (overviewQuery.data?.rows || [])
            .map((row) => String(row.className || '').trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, 'id-ID', { sensitivity: 'base' })),
    [overviewQuery.data?.rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (overviewQuery.data?.rows || []).filter((row) => {
      const statusMatches =
        statusFilter === 'ALL' ||
        (statusFilter === 'PUBLISHED' && Boolean(row.card)) ||
        (statusFilter === 'ELIGIBLE' && row.eligibility.isEligible && !row.card) ||
        (statusFilter === 'BLOCKED' && !row.eligibility.isEligible);
      const classMatches = classFilter === 'ALL' || String(row.className || '') === classFilter;
      const keywordMatches = matchesSearch(keyword, [
        row.studentName,
        row.username,
        row.nis,
        row.nisn,
        row.className,
        ...row.entries.flatMap((entry) => [entry.roomName, entry.sessionLabel, entry.seatLabel]),
      ]);
      return statusMatches && classMatches && keywordMatches;
    });
  }, [classFilter, overviewQuery.data?.rows, search, statusFilter]);

  const printableCards = useMemo(
    () =>
      filteredRows
        .map((row) => row.card?.payload)
        .filter((payload): payload is ExamGeneratedCardPayload => Boolean(payload)),
    [filteredRows],
  );

  const handlePrintAll = () => {
    if (printableCards.length === 0) return;
    openPrintWindow('Kartu Ujian', printableCards.map((card) => buildExamCardSheet(card)).join(''));
  };

  const handlePrintOne = (row: ExamCardOverviewRow) => {
    if (!row.card?.payload) return;
    openPrintWindow(`Kartu Ujian - ${row.studentName}`, buildExamCardSheet(row.card.payload));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Kartu Ujian</h2>
          <p className="mt-1 text-sm text-gray-500">
            Generate kartu ujian digital untuk siswa yang layak mengikuti ujian, lalu cetak dokumen resminya dari Kepala TU.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void overviewQuery.refetch()}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={!overviewQuery.data || overviewQuery.data.summary.eligibleStudents === 0 || generateMutation.isPending}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Kartu Ujian
          </button>
          <button
            type="button"
            onClick={handlePrintAll}
            disabled={printableCards.length === 0}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Semua
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tahun Ajaran</label>
          <select
            value={selectedAcademicYearId || ''}
            onChange={(event) => setSelectedAcademicYearId(Number(event.target.value) || null)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {academicYears.map((academicYear: { id: number; name: string }) => (
              <option key={academicYear.id} value={academicYear.id}>
                {academicYear.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Program Ujian</label>
          <div className="flex flex-wrap gap-2">
            {visiblePrograms.map((program) => {
              const isActive = program.code === activeProgramCode;
              return (
                <button
                  key={program.code}
                  type="button"
                  onClick={() => setActiveProgramCode(program.code)}
                  className={`rounded-full border px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800'
                  }`}
                >
                  {program.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Peserta Program</div>
          <div className="mt-2 text-2xl font-bold text-blue-900">{overviewQuery.data?.summary.totalStudents || 0}</div>
          <div className="mt-1 text-xs text-blue-800/80">Seluruh siswa yang terdaftar di ruang ujian program ini.</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Siap Digenerate</div>
          <div className="mt-2 text-2xl font-bold text-emerald-900">{overviewQuery.data?.summary.eligibleStudents || 0}</div>
          <div className="mt-1 text-xs text-emerald-800/80">Layak ikut ujian dan punya data ruang ujian aktif.</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Belum Layak</div>
          <div className="mt-2 text-2xl font-bold text-amber-900">{overviewQuery.data?.summary.blockedStudents || 0}</div>
          <div className="mt-1 text-xs text-amber-800/80">Masih terblokir nilai atau restriction manual.</div>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Sudah Dipublikasikan</div>
          <div className="mt-2 text-2xl font-bold text-rose-900">{overviewQuery.data?.summary.publishedCards || 0}</div>
          <div className="mt-1 text-xs text-rose-800/80">Siswa yang sudah menerima kartu ujian digital di akun mereka.</div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama siswa, NIS, kelas, ruang, sesi, atau kursi..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none lg:max-w-xs"
            >
              <option value="ALL">Semua Kelas</option>
              {classOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none lg:max-w-xs"
            >
              <option value="ALL">Semua Status</option>
              <option value="PUBLISHED">Sudah Dipublikasikan</option>
              <option value="ELIGIBLE">Siap Digenerate</option>
              <option value="BLOCKED">Belum Layak</option>
            </select>
          </div>
          <div className="text-sm text-gray-500">
            {filteredRows.length} siswa • Semester {overviewQuery.data?.semester === 'EVEN' ? 'Genap' : 'Ganjil'}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {overviewQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
            Memuat overview kartu ujian...
          </div>
        ) : overviewQuery.isError ? (
          <div className="py-12 text-center text-sm text-red-600">
            Gagal memuat overview kartu ujian. Coba muat ulang lagi.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">Belum ada data siswa yang sesuai dengan filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Siswa</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Ruang & Kursi</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Catatan</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredRows.map((row) => (
                  <tr key={row.studentId}>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{row.studentName}</div>
                      <div className="mt-1 text-xs text-gray-500">@{row.username}</div>
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        <div>NIS: {row.nis || '-'}</div>
                        <div>NISN: {row.nisn || '-'}</div>
                        <div>Kelas: {row.className || '-'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      <div className="space-y-2">
                        {row.entries.length === 0 ? (
                          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            Belum punya data ruang ujian aktif.
                          </div>
                        ) : (
                          row.entries.map((entry) => (
                            <div key={`${row.studentId}-${entry.sittingId}`} className="rounded-lg border border-gray-100 px-3 py-2">
                              <div className="font-medium text-gray-900">{entry.roomName}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {entry.sessionLabel || '-'} • Kursi {entry.seatLabel || '-'}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {formatDateTime(entry.startTime)} - {formatDateTime(entry.endTime)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      {row.card ? (
                        <div className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                          Sudah Dipublikasikan
                        </div>
                      ) : row.eligibility.isEligible ? (
                        <div className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          Siap Digenerate
                        </div>
                      ) : (
                        <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                          Belum Layak
                        </div>
                      )}
                      {row.eligibility.financeExceptionApplied ? (
                        <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                          Ada pengecualian finance dari wali kelas.
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      {row.eligibility.isEligible ? (
                        <div className="text-xs text-emerald-700">
                          {row.card
                            ? `Sudah digenerate pada ${formatDateTime(row.card.generatedAt)}.`
                            : 'Siswa memenuhi syarat kartu ujian digital.'}
                        </div>
                      ) : (
                        <div className="space-y-2 text-xs text-amber-700">
                          <div>{row.eligibility.reason || 'Masih ada syarat ujian yang belum terpenuhi.'}</div>
                          {row.eligibility.automatic.details.belowKkmSubjects.length > 0 ? (
                            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                              {row.eligibility.automatic.details.belowKkmSubjects
                                .slice(0, 3)
                                .map((subject) => `${subject.subjectName} (${subject.score}/${subject.kkm})`)
                                .join(', ')}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-700">
                      <button
                        type="button"
                        onClick={() => handlePrintOne(row)}
                        disabled={!row.card?.payload}
                        className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

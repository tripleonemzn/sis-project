import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  Loader2,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { examCardService, type ExamCardOverviewRow, type ExamGeneratedCardPayload } from '../../services/examCard.service';
import { examService, type ExamProgram } from '../../services/exam.service';
import { isNonScheduledExamProgram } from '../../lib/examProgramMenu';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

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

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function resolveAbsoluteUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  if (raw.startsWith('/')) return new URL(raw, window.location.origin).toString();
  return new URL(`/api/uploads/${raw.replace(/^\/+/, '')}`, window.location.origin).toString();
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function printHtmlDocument(title: string, htmlDocument: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';

  let printed = false;
  let objectUrl = '';
  const cleanup = () => {
    window.setTimeout(() => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      iframe.remove();
    }, 400);
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        toast.error('Gagal membuka pratinjau cetak kartu ujian.');
        cleanup();
        return;
      }
      frameWindow.document.title = title;
      frameWindow.focus();
      frameWindow.print();
    } catch {
      toast.error('Gagal menjalankan print kartu ujian.');
    } finally {
      cleanup();
    }
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      toast.error('Gagal menyiapkan pratinjau cetak kartu ujian.');
      cleanup();
      return;
    }

    frameDocument.title = title;
    const imageLoads = Array.from(frameDocument.images || []).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    });

    Promise.all(imageLoads)
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(triggerPrint, 180);
      });
  };

  document.body.appendChild(iframe);
  objectUrl = URL.createObjectURL(new Blob([htmlDocument], { type: 'text/html' }));
  iframe.src = objectUrl;
}

function buildExamCardMarkup(card: ExamGeneratedCardPayload) {
  const schoolLogoUrl = resolveAbsoluteUrl('/logo-kgb2.png');
  const watermarkLogoUrl = resolveAbsoluteUrl('/logo_sis_kgb2.png');
  const photoUrl = resolveAbsoluteUrl(card.student.photoUrl || '');
  const roomLabel = card.placement?.roomName || card.entries[0]?.roomName || '-';
  const sessionLabel = card.placement?.sessionLabel || card.entries[0]?.sessionLabel || '-';
  const issueSignLabel =
    card.issue?.signLabel ||
    `${card.issue?.location || 'Bekasi'}, ${formatDateOnly(card.issue?.date || card.generatedAt)}`;

  return `
    <article class="exam-card">
      <div class="card-watermark">
        <img src="${escapeHtml(watermarkLogoUrl)}" alt="" />
      </div>

      <div class="card-header">
        <div class="card-header-logo">
          <img src="${escapeHtml(schoolLogoUrl)}" alt="Logo KGB2" />
        </div>
        <div class="card-header-copy">
          <div class="card-title">${escapeHtml(card.cardTitle || 'KARTU PESERTA')}</div>
          <div class="card-program">${escapeHtml(card.examTitle || card.programLabel)}</div>
          <div class="card-school">${escapeHtml(card.institutionName || card.schoolName)}</div>
          <div class="card-year">${escapeHtml(card.academicYearName)}</div>
        </div>
      </div>

      <div class="card-body">
        <div class="card-photo-box">
          ${
            photoUrl
              ? `<img src="${escapeHtml(photoUrl)}" alt="Foto siswa" class="card-photo" />`
              : `<div class="card-photo-placeholder">Foto formal dari profil dokumen pendukung</div>`
          }
        </div>

        <div class="card-detail-grid">
          <div class="detail-label">Nama Siswa</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(card.student.name)}</div>
          <div class="detail-label">Kelas</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(card.student.className || '-')}</div>
          <div class="detail-label">Username</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(card.student.username || '-')}</div>
          <div class="detail-label">No. Peserta</div><div class="detail-separator">:</div><div class="detail-value detail-number">${escapeHtml(card.participantNumber || '-')}</div>
          <div class="detail-label">Ruang</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(roomLabel)}</div>
          <div class="detail-label">Sesi</div><div class="detail-separator">:</div><div class="detail-value">${escapeHtml(sessionLabel || '-')}</div>
        </div>

        <div class="card-signature-block">
          <div class="card-sign-date">${escapeHtml(issueSignLabel)}</div>
          <div class="card-sign-role">${escapeHtml(card.legality.principalTitle || 'Kepala Sekolah')}</div>
          ${
            card.legality.principalBarcodeDataUrl
              ? `<img class="card-barcode" src="${escapeHtml(card.legality.principalBarcodeDataUrl)}" alt="Barcode Kepala Sekolah" />`
              : ''
          }
          <div class="card-principal-name">${escapeHtml(card.legality.principalName || '-')}</div>
        </div>
      </div>

      <div class="card-footer-note">${escapeHtml(card.legality.footerNote || 'Berkas digital yang sah secara internal')}</div>
    </article>
  `;
}

function buildExamCardsPrintHtml(cards: ExamGeneratedCardPayload[], title: string) {
  return `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: auto; margin: 6mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html, body { margin: 0; padding: 0; background: #f8fafc; color: #111827; font-family: "Segoe UI", Arial, sans-serif; }
          body { padding: 0; }
          .cards-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(94mm, 1fr));
            gap: 4mm;
            align-content: start;
          }
          .exam-card {
            position: relative;
            min-height: 65mm;
            height: 65mm;
            border: 0.35mm solid #cbd5e1;
            border-radius: 4mm;
            background: #ffffff;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .card-watermark {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            opacity: 0.08;
          }
          .card-watermark img {
            width: 42mm;
            height: 42mm;
            object-fit: contain;
          }
          .card-header {
            position: relative;
            z-index: 1;
            display: grid;
            grid-template-columns: 22mm 1fr;
            gap: 3mm;
            align-items: center;
            padding: 3.2mm 3.4mm 2.8mm;
            border-bottom: 0.3mm solid #dbe2ea;
          }
          .card-header-logo {
            height: 16mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card-header-logo img {
            width: 15mm;
            height: 15mm;
            object-fit: contain;
          }
          .card-header-copy {
            text-align: center;
            line-height: 1.05;
          }
          .card-title {
            font-size: 4.1mm;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .card-program, .card-school, .card-year {
            margin-top: 0.7mm;
            font-size: 3.1mm;
            font-weight: 600;
          }
          .card-body {
            position: relative;
            z-index: 1;
            display: grid;
            grid-template-columns: 21mm minmax(0, 1fr) 34mm;
            gap: 2.8mm;
            padding: 3.2mm 3.4mm 3.4mm;
          }
          .card-photo-box {
            width: 100%;
            height: 27mm;
            border: 0.3mm solid #cbd5e1;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .card-photo {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .card-photo-placeholder {
            padding: 1.2mm;
            text-align: center;
            font-size: 2.5mm;
            color: #475569;
            line-height: 1.2;
          }
          .card-detail-grid {
            align-content: start;
            display: grid;
            grid-template-columns: 19mm 2mm minmax(0, 1fr);
            column-gap: 0.8mm;
            row-gap: 0.35mm;
            font-size: 2.75mm;
            line-height: 1.2;
          }
          .detail-label {
            font-weight: 500;
          }
          .detail-value {
            overflow-wrap: anywhere;
          }
          .detail-number {
            font-weight: 700;
            letter-spacing: 0.04em;
          }
          .card-signature-block {
            display: flex;
            min-height: 27mm;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            text-align: center;
            line-height: 1.15;
          }
          .card-sign-date,
          .card-sign-role,
          .card-principal-name {
            font-size: 2.7mm;
          }
          .card-barcode {
            width: 16mm;
            height: 16mm;
            object-fit: contain;
            margin: 1mm 0 0.6mm;
            background: #fff;
          }
          .card-principal-name {
            margin-top: auto;
            font-weight: 700;
          }
          .card-footer-note {
            position: absolute;
            left: 3.4mm;
            right: 3.4mm;
            bottom: 2.4mm;
            font-size: 2.2mm;
            font-style: italic;
            color: #047857;
          }
          @media print {
            html, body { background: #fff; }
          }
        </style>
      </head>
      <body>
        <div class="cards-grid">
          ${cards.map((card) => buildExamCardMarkup(card)).join('')}
        </div>
      </body>
    </html>
  `;
}

function matchesSearch(keyword: string, values: Array<string | null | undefined>) {
  if (!keyword) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(keyword));
}

function getProgramTabIcon(programCode: string) {
  const normalized = String(programCode || '').trim().toUpperCase();
  if (normalized === 'SBTS') return CalendarRange;
  if (normalized === 'SAS') return FileSpreadsheet;
  if (normalized === 'SAT') return GraduationCap;
  if (normalized === 'ASAJ') return ClipboardCheck;
  if (normalized === 'ASAJP') return Briefcase;
  return ClipboardList;
}

function formatEntryMeta(entry: ExamCardOverviewRow['entries'][number]) {
  const parts = [String(entry.sessionLabel || '').trim(), entry.seatLabel ? `Kursi ${entry.seatLabel}` : ''].filter(Boolean);
  return parts.join(' • ');
}

function formatEntryTimeRange(entry: ExamCardOverviewRow['entries'][number]) {
  if (entry.startTime && entry.endTime) {
    return `${formatDateTime(entry.startTime)} - ${formatDateTime(entry.endTime)}`;
  }
  if (entry.startTime || entry.endTime) return 'Waktu ujian belum lengkap';
  return '';
}

export function HeadTuExamCardsPanel() {
  const queryClient = useQueryClient();
  const [activeProgramCode, setActiveProgramCode] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [issueLocation, setIssueLocation] = useState('Bekasi');
  const [issueDate, setIssueDate] = useState(() => formatDateInputValue(new Date()));
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);

  const activeYearQuery = useActiveAcademicYear();
  const activeYear = activeYearQuery.data || null;
  const selectedAcademicYearId = Number(activeYear?.id || activeYear?.academicYearId || 0) || null;

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
        issueLocation: issueLocation.trim() || 'Bekasi',
        issueDate,
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
        row.participantNumber,
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
    printHtmlDocument('Kartu Ujian', buildExamCardsPrintHtml(printableCards, 'Kartu Ujian'));
  };

  const handlePrintOne = (row: ExamCardOverviewRow) => {
    if (!row.card?.payload) return;
    printHtmlDocument(
      `Kartu Ujian - ${row.studentName}`,
      buildExamCardsPrintHtml([row.card.payload], `Kartu Ujian - ${row.studentName}`),
    );
  };

  if (activeYearQuery.isLoading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-blue-600" />
        <div className="text-sm text-gray-500">Memuat konteks kartu ujian...</div>
      </div>
    );
  }

  if (!selectedAcademicYearId) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
        Tahun ajaran aktif belum tersedia. Kartu ujian tidak bisa diproses sebelum header aplikasi memiliki tahun ajaran aktif.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Kartu Ujian</h2>
        <p className="mt-1 text-sm text-gray-500">
          Generate kartu ujian digital untuk siswa yang layak mengikuti ujian, lalu cetak dokumen resminya dari Kepala TU.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="border-b border-gray-200 pb-1">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide">
            {visiblePrograms.map((program) => {
              const Icon = getProgramTabIcon(program.code);
              const isActive = program.code === activeProgramCode;
              return (
                <button
                  key={program.code}
                  type="button"
                  onClick={() => setActiveProgramCode(program.code)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {program.shortLabel || program.label || program.code}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_auto_auto] xl:items-end">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Lokasi TTD Kepala Sekolah</label>
            <input
              type="text"
              value={issueLocation}
              onChange={(event) => setIssueLocation(event.target.value)}
              placeholder="Contoh: Bekasi"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Lokasi ini dipakai pada area legalitas kartu ujian digital dan hasil print fisik.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal Terbit</label>
            <input
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">Tanggal ini dipakai untuk generate seluruh kartu program yang dipilih.</p>
          </div>
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={
              !overviewQuery.data ||
              !issueDate ||
              issueLocation.trim().length === 0 ||
              overviewQuery.data.summary.eligibleStudents === 0 ||
              generateMutation.isPending
            }
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Kartu Ujian
          </button>
          <button
            type="button"
            onClick={handlePrintAll}
            disabled={printableCards.length === 0}
            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Semua
          </button>
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
          <div className="mt-2 text-[11px] font-medium text-rose-700/90">Kartu aktif siap dicetak ulang dan sudah sinkron ke akun siswa.</div>
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
                placeholder="Cari nama siswa, no. peserta, NIS, kelas, ruang, sesi, atau kursi..."
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

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
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
          <div className="divide-y divide-gray-200">
            {filteredRows.map((row) => {
              const primaryEntry = row.card?.payload?.placement || row.entries[0] || null;
              const isExpanded = expandedStudentId === row.studentId;
              return (
                <div key={row.studentId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedStudentId((current) => (current === row.studentId ? null : row.studentId))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setExpandedStudentId((current) => (current === row.studentId ? null : row.studentId));
                      }
                    }}
                    className="grid cursor-pointer gap-4 px-5 py-4 transition-colors hover:bg-slate-50 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_240px_260px_auto]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{row.studentName}</div>
                      <div className="mt-1 text-xs text-gray-500">@{row.username}</div>
                      <div className="mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        No. Peserta {row.participantNumber || '-'}
                      </div>
                      <div className="mt-2 text-xs text-gray-600">Kelas: {row.className || '-'}</div>
                    </div>

                    <div className="min-w-0 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{primaryEntry?.roomName || 'Belum ada ruang aktif'}</div>
                      {primaryEntry ? (
                        <>
                          {formatEntryMeta(primaryEntry as ExamCardOverviewRow['entries'][number]) ? (
                            <div className="mt-1 text-xs text-gray-500">{formatEntryMeta(primaryEntry as ExamCardOverviewRow['entries'][number])}</div>
                          ) : null}
                          {formatEntryTimeRange(primaryEntry as ExamCardOverviewRow['entries'][number]) ? (
                            <div className="mt-1 text-xs text-gray-500">
                              {formatEntryTimeRange(primaryEntry as ExamCardOverviewRow['entries'][number])}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="mt-1 text-xs text-amber-700">Denah/ruang belum sinkron.</div>
                      )}
                    </div>

                    <div className="text-sm text-gray-700">
                      {row.card ? (
                        <>
                          <div className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                            Sudah Dipublikasikan
                          </div>
                          <div className="mt-2 text-xs text-rose-700">
                            Kartu aktif • diterbitkan {formatDateTime(row.card.generatedAt)}.
                          </div>
                        </>
                      ) : row.eligibility.isEligible ? (
                        <>
                          <div className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Siap Digenerate
                          </div>
                          <div className="mt-2 text-xs text-emerald-700">Siswa memenuhi syarat kartu ujian digital.</div>
                        </>
                      ) : (
                        <>
                          <div className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                            Belum Layak
                          </div>
                          <div className="mt-2 text-xs text-amber-700">{row.eligibility.reason || 'Masih ada syarat ujian yang belum terpenuhi.'}</div>
                        </>
                      )}
                    </div>

                    <div className="text-sm text-gray-700">
                      {row.eligibility.financeExceptionApplied ? (
                        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                          Ada pengecualian finance dari wali kelas.
                        </div>
                      ) : row.card ? (
                        <div className="text-xs text-emerald-700">Sudah digenerate pada {formatDateTime(row.card.generatedAt)}.</div>
                      ) : row.eligibility.isEligible ? (
                        <div className="text-xs text-emerald-700">Siap dipublikasikan setelah generate kartu.</div>
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
                    </div>

                    <div className="flex items-start justify-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePrintOne(row);
                        }}
                        disabled={!row.card?.payload}
                        className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                      </button>
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-gray-100 bg-slate-50/80 px-5 py-4">
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detail Siswa</div>
                          <div className="mt-3 grid grid-cols-[110px_12px_minmax(0,1fr)] gap-y-1 text-sm text-slate-700">
                            <div className="font-medium">Nama</div><div>:</div><div>{row.studentName}</div>
                            <div className="font-medium">Username</div><div>:</div><div>@{row.username}</div>
                            <div className="font-medium">No. Peserta</div><div>:</div><div className="font-semibold text-blue-700">{row.participantNumber || '-'}</div>
                            <div className="font-medium">NIS</div><div>:</div><div>{row.nis || '-'}</div>
                            <div className="font-medium">NISN</div><div>:</div><div>{row.nisn || '-'}</div>
                            <div className="font-medium">Kelas</div><div>:</div><div>{row.className || '-'}</div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ruang & Kursi</div>
                          <div className="mt-3 space-y-3">
                            {row.entries.length === 0 ? (
                              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Belum punya data ruang ujian aktif atau denah belum dipublikasikan.
                              </div>
                            ) : (
                              row.entries.map((entry) => (
                                <div key={`${row.studentId}-${entry.sittingId}`} className="rounded-lg border border-slate-200 px-3 py-3">
                                  <div className="font-medium text-slate-900">{entry.roomName}</div>
                                  {formatEntryMeta(entry) ? (
                                    <div className="mt-1 text-xs text-slate-500">{formatEntryMeta(entry)}</div>
                                  ) : null}
                                  {formatEntryTimeRange(entry) ? (
                                    <div className="mt-1 text-xs text-slate-500">{formatEntryTimeRange(entry)}</div>
                                  ) : null}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

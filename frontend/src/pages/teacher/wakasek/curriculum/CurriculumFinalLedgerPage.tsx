import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, Filter, Loader2, Printer, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { academicYearService } from '../../../../services/academicYear.service';
import { classService, type Class } from '../../../../services/class.service';
import { userService } from '../../../../services/user.service';
import {
  reportService,
  type FinalLedgerPreviewResult,
  type FinalLedgerPreviewRow,
} from '../../../../services/report.service';
import type { User } from '../../../../types/auth';

type AcademicYearOption = {
  id: number;
  name: string;
  isActive?: boolean;
};

type LedgerSignatories = {
  principal: string;
  curriculum: string;
  headAdministration: string;
};

const parseAcademicYears = (raw: unknown): AcademicYearOption[] => {
  const response = raw as any;
  const rows =
    response?.data?.academicYears ||
    response?.data?.items ||
    response?.academicYears ||
    response?.items ||
    [];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item: any) => ({
      id: Number(item?.id || 0),
      name: String(item?.name || ''),
      isActive: Boolean(item?.isActive || item?.is_active),
    }))
    .filter((item) => item.id > 0 && item.name);
};

const parseClassRows = (raw: unknown): Class[] => {
  const response = raw as any;
  const rows = response?.data?.classes || response?.classes || response?.data || [];
  if (!Array.isArray(rows)) return [];
  return rows.filter((item) => Number(item?.id || 0) > 0);
};

const formatScore = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return Number(value).toFixed(2);
};

const average = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const SIGNATORY_PLACEHOLDER = '___________________________';

const normalizeCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

const hasAdditionalDuty = (user: User, dutyCode: string) => {
  const expected = normalizeCode(dutyCode);
  return Array.isArray(user.additionalDuties)
    ? user.additionalDuties.some((duty) => normalizeCode(duty) === expected)
    : false;
};

const resolveSignatories = (
  principalUsers: User[],
  teacherUsers: User[],
  staffUsers: User[],
): LedgerSignatories => {
  const principalName =
    principalUsers.find((user) => normalizeCode(user.role) === 'PRINCIPAL')?.name?.trim() || SIGNATORY_PLACEHOLDER;

  const curriculumName =
    teacherUsers.find((user) => hasAdditionalDuty(user, 'WAKASEK_KURIKULUM'))?.name?.trim() ||
    teacherUsers.find((user) => hasAdditionalDuty(user, 'SEKRETARIS_KURIKULUM'))?.name?.trim() ||
    SIGNATORY_PLACEHOLDER;

  const headAdministrationName =
    staffUsers.find((user) => {
      const ptkType = normalizeCode(user.ptkType);
      return ptkType === 'KEPALA_TU' || ptkType === 'KEPALA_TATA_USAHA';
    })?.name?.trim() || SIGNATORY_PLACEHOLDER;

  return {
    principal: principalName,
    curriculum: curriculumName,
    headAdministration: headAdministrationName,
  };
};

export default function CurriculumFinalLedgerPage() {
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedYearIds, setSelectedYearIds] = useState<number[]>([]);
  const [semesterOdd, setSemesterOdd] = useState(true);
  const [semesterEven, setSemesterEven] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printHtml, setPrintHtml] = useState('');
  const [printFrameReady, setPrintFrameReady] = useState(false);
  const [preview, setPreview] = useState<FinalLedgerPreviewResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [signatories, setSignatories] = useState<LedgerSignatories>({
    principal: SIGNATORY_PLACEHOLDER,
    curriculum: SIGNATORY_PLACEHOLDER,
    headAdministration: SIGNATORY_PLACEHOLDER,
  });
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let active = true;
    const loadMeta = async () => {
      setLoadingMeta(true);
      try {
        const [yearsRes, classesRes, principalRes, teacherRes, staffRes] = await Promise.all([
          academicYearService.list({ page: 1, limit: 100 }),
          classService.list({ page: 1, limit: 1000 }),
          userService.getUsers({ role: 'PRINCIPAL', limit: 50 }),
          userService.getUsers({ role: 'TEACHER', limit: 1000 }),
          userService.getUsers({ role: 'STAFF', limit: 1000 }),
        ]);
        if (!active) return;
        const years = parseAcademicYears(yearsRes);
        const classRows = parseClassRows(classesRes);
        const principalUsers = Array.isArray((principalRes as any)?.data) ? ((principalRes as any).data as User[]) : [];
        const teacherUsers = Array.isArray((teacherRes as any)?.data) ? ((teacherRes as any).data as User[]) : [];
        const staffUsers = Array.isArray((staffRes as any)?.data) ? ((staffRes as any).data as User[]) : [];

        setAcademicYears(years);
        setClasses(classRows);
        setSignatories(resolveSignatories(principalUsers, teacherUsers, staffUsers));

        const activeYear = years.find((item) => item.isActive);
        if (activeYear) {
          setSelectedYearIds([activeYear.id]);
        } else if (years.length > 0) {
          setSelectedYearIds([years[0].id]);
        }
      } catch {
        toast.error('Gagal memuat data filter leger nilai akhir.');
      } finally {
        if (active) setLoadingMeta(false);
      }
    };

    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  const selectedSemesters = useMemo<Array<'ODD' | 'EVEN'>>(() => {
    const rows: Array<'ODD' | 'EVEN'> = [];
    if (semesterOdd) rows.push('ODD');
    if (semesterEven) rows.push('EVEN');
    return rows;
  }, [semesterOdd, semesterEven]);

  const filteredRows = useMemo(() => {
    if (!preview?.rows) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return preview.rows;
    return preview.rows.filter((row) => {
      const studentName = String(row.student.name || '').toLowerCase();
      const nis = String(row.student.nis || '').toLowerCase();
      const nisn = String(row.student.nisn || '').toLowerCase();
      const className = String(row.student.class?.name || '').toLowerCase();
      return (
        studentName.includes(q) || nis.includes(q) || nisn.includes(q) || className.includes(q)
      );
    });
  }, [preview, searchQuery]);

  const runPreview = async () => {
    if (!selectedYearIds.length) {
      toast.error('Pilih minimal satu tahun ajaran sumber.');
      return;
    }
    if (!selectedSemesters.length) {
      toast.error('Pilih minimal satu semester.');
      return;
    }

    setLoadingPreview(true);
    try {
      const result = await reportService.getFinalLedgerPreview({
        academicYearIds: selectedYearIds,
        semesters: selectedSemesters,
        classId: selectedClassId ? Number(selectedClassId) : undefined,
        limitStudents: 1000,
      });
      setPreview(result);
      toast.success('Preview leger nilai akhir berhasil dihitung.');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal menghitung preview leger.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const exportExcel = async () => {
    if (!selectedYearIds.length) {
      toast.error('Pilih minimal satu tahun ajaran sumber.');
      return;
    }
    if (!selectedSemesters.length) {
      toast.error('Pilih minimal satu semester.');
      return;
    }

    setExporting(true);
    try {
      const blob = await reportService.exportFinalLedgerPreview({
        academicYearIds: selectedYearIds,
        semesters: selectedSemesters,
        classId: selectedClassId ? Number(selectedClassId) : undefined,
        limitStudents: 1000,
      });

      const now = new Date();
      const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `leger-nilai-akhir-${datePart}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export Excel berhasil diunduh.');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Gagal export Excel leger.');
    } finally {
      setExporting(false);
    }
  };

  const averageRow = useMemo(() => {
    if (!preview || filteredRows.length === 0) return null;

    const semesterAverages = preview.columns.semesterColumns.reduce<Record<string, number | null>>(
      (acc, column) => {
        acc[column.key] = average(filteredRows.map((row) => row.portfolioBySemester?.[column.key]));
        return acc;
      },
      {},
    );

    const subjectAverages = preview.columns.subjectColumns.reduce<Record<string, number | null>>(
      (acc, subject) => {
        acc[String(subject.id)] = average(filteredRows.map((row) => row.ledgerBySubject?.[String(subject.id)]));
        return acc;
      },
      {},
    );

    return {
      semesterAverages,
      subjectAverages,
      portfolioAverage: average(filteredRows.map((row) => row.portfolioAverage)),
      assignmentScore: average(filteredRows.map((row) => row.assignmentScore)),
      usAverage: average(filteredRows.map((row) => row.usAverage)),
      pklScore: average(filteredRows.map((row) => row.pklScore)),
      finalScore: average(filteredRows.map((row) => row.finalScore)),
    };
  }, [preview, filteredRows]);

  const printReady = () => {
    if (!preview) {
      toast.error('Jalankan Hitung Preview terlebih dahulu.');
      return;
    }
    if (!filteredRows.length) {
      toast.error('Tidak ada data untuk dicetak.');
      return;
    }

    setPrinting(true);
    try {
      const selectedYearNames = preview.filters.academicYears.map((item) => item.name).join(', ') || '-';
      const selectedSemesterLabels = preview.filters.semesters
        .map((item) => (item === 'ODD' ? 'Ganjil' : 'Genap'))
        .join(', ');
      const classLabel =
        selectedClassId && classes.length
          ? classes.find((item) => String(item.id) === String(selectedClassId))?.name || 'Semua Kelas'
          : 'Semua Kelas';
      const generatedAt = new Date().toLocaleString('id-ID');
      const principalSigner = escapeHtml(signatories.principal || SIGNATORY_PLACEHOLDER);
      const curriculumSigner = escapeHtml(signatories.curriculum || SIGNATORY_PLACEHOLDER);
      const headAdministrationSigner = escapeHtml(signatories.headAdministration || SIGNATORY_PLACEHOLDER);

      const headerCols = [
        '<th>No</th>',
        '<th>Nama Siswa</th>',
        '<th>NIS</th>',
        '<th>NISN</th>',
        '<th>Kelas</th>',
        ...preview.columns.semesterColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`),
        '<th>Rata-rata Portofolio</th>',
        ...preview.columns.subjectColumns.map(
          (subject) => `<th>${escapeHtml(`${subject.code} - ${subject.name}`)}</th>`,
        ),
        '<th>Penugasan</th>',
        '<th>Rata-rata US</th>',
        '<th>Nilai PKL</th>',
        '<th>Nilai Akhir</th>',
      ].join('');

      const bodyRows = filteredRows
        .map((row, index) => {
          const semesterCells = preview.columns.semesterColumns
            .map((column) => `<td class="num">${formatScore(row.portfolioBySemester?.[column.key])}</td>`)
            .join('');
          const subjectCells = preview.columns.subjectColumns
            .map((subject) => `<td class="num">${formatScore(row.ledgerBySubject?.[String(subject.id)])}</td>`)
            .join('');

          return `
            <tr>
              <td class="num">${index + 1}</td>
              <td>${escapeHtml(row.student.name || '-')}</td>
              <td>${escapeHtml(row.student.nis || '-')}</td>
              <td>${escapeHtml(row.student.nisn || '-')}</td>
              <td>${escapeHtml(row.student.class?.name || '-')}</td>
              ${semesterCells}
              <td class="num">${formatScore(row.portfolioAverage)}</td>
              ${subjectCells}
              <td class="num">${formatScore(row.assignmentScore)}</td>
              <td class="num">${formatScore(row.usAverage)}</td>
              <td class="num">${formatScore(row.pklScore)}</td>
              <td class="num">${formatScore(row.finalScore)}</td>
            </tr>
          `;
        })
        .join('');

      const footerRow = averageRow
        ? `
        <tr class="footer-row">
          <td colspan="5">RATA-RATA</td>
          ${preview.columns.semesterColumns
            .map((column) => `<td class="num">${formatScore(averageRow.semesterAverages[column.key])}</td>`)
            .join('')}
          <td class="num">${formatScore(averageRow.portfolioAverage)}</td>
          ${preview.columns.subjectColumns
            .map((subject) => `<td class="num">${formatScore(averageRow.subjectAverages[String(subject.id)])}</td>`)
            .join('')}
          <td class="num">${formatScore(averageRow.assignmentScore)}</td>
          <td class="num">${formatScore(averageRow.usAverage)}</td>
          <td class="num">${formatScore(averageRow.pklScore)}</td>
          <td class="num">${formatScore(averageRow.finalScore)}</td>
        </tr>
      `
        : '';

      const html = `
        <!doctype html>
        <html lang="id">
          <head>
            <meta charset="utf-8" />
            <title>Leger Nilai Akhir</title>
            <style>
              @page { size: A4 landscape; margin: 10mm; }
              body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
              .header { margin-bottom: 10px; }
              .header h1 { font-size: 18px; margin: 0 0 4px; }
              .header p { margin: 0; font-size: 11px; color: #475569; }
              .meta { margin: 10px 0; font-size: 11px; color: #334155; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 20px; }
              .table-wrap { overflow: auto; border: 1px solid #cbd5e1; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th, td { border: 1px solid #cbd5e1; padding: 4px 6px; white-space: nowrap; }
              th { background: #f8fafc; text-align: center; font-weight: 700; }
              td.num { text-align: center; }
              .footer-row td { font-weight: 700; background: #f8fafc; }
              .signatures { margin-top: 22px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; font-size: 11px; }
              .sig-box { text-align: center; }
              .sig-space { height: 56px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Leger Nilai Akhir</h1>
              <p>SMKS Karya Guna Bhakti 2</p>
            </div>
            <div class="meta">
              <div><strong>Tahun Ajaran Sumber:</strong> ${escapeHtml(selectedYearNames)}</div>
              <div><strong>Semester Sumber:</strong> ${escapeHtml(selectedSemesterLabels || '-')}</div>
              <div><strong>Scope Kelas:</strong> ${escapeHtml(classLabel)}</div>
              <div><strong>Waktu Cetak:</strong> ${escapeHtml(generatedAt)}</div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>${headerCols}</tr>
                </thead>
                <tbody>
                  ${bodyRows}
                </tbody>
                <tfoot>
                  ${footerRow}
                </tfoot>
              </table>
            </div>
            <div class="signatures">
              <div class="sig-box">
                <div>Kepala Sekolah</div>
                <div class="sig-space"></div>
                <div>(${principalSigner})</div>
              </div>
              <div class="sig-box">
                <div>Wakasek Kurikulum</div>
                <div class="sig-space"></div>
                <div>(${curriculumSigner})</div>
              </div>
              <div class="sig-box">
                <div>Kepala Tata Usaha</div>
                <div class="sig-space"></div>
                <div>(${headAdministrationSigner})</div>
              </div>
            </div>
          </body>
        </html>
      `;

      setPrintFrameReady(false);
      setPrintHtml(html);
      setShowPrintModal(true);
      toast.success('Dokumen print-ready berhasil disiapkan.');
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintFromModal = () => {
    const frameWindow = printFrameRef.current?.contentWindow;
    if (!frameWindow) {
      toast.error('Preview cetak belum siap. Coba tunggu sebentar.');
      return;
    }
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      toast.error('Gagal membuka dialog cetak browser.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[28px] font-semibold text-gray-900">Leger Nilai Akhir</h2>
        <p className="text-sm text-gray-500">
          Rekap kolektif nilai lintas semester untuk kebutuhan kurikulum dan tata usaha.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Filter size={16} />
          Filter Data
        </div>

        {loadingMeta ? (
          <div className="py-10 text-center text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Memuat data filter...
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-1 lg:col-span-12">
              <label className="text-xs font-medium text-gray-600">Tahun Ajaran Sumber</label>
              <div className="max-h-24 overflow-auto rounded-lg border border-gray-200 p-2 grid gap-2 sm:grid-cols-3">
                {academicYears.map((year) => {
                  const checked = selectedYearIds.includes(year.id);
                  return (
                    <label key={year.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedYearIds((prev) => {
                            if (event.target.checked) {
                              return Array.from(new Set([...prev, year.id]));
                            }
                            return prev.filter((id) => id !== year.id);
                          });
                        }}
                      />
                      <span>{year.name}</span>
                      {year.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          AKTIF
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1 lg:col-span-3">
              <label className="text-xs font-medium text-gray-600">Semester Sumber</label>
              <div className="h-11 rounded-lg border border-gray-300 px-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={semesterOdd} onChange={(event) => setSemesterOdd(event.target.checked)} />
                  Ganjil
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={semesterEven} onChange={(event) => setSemesterEven(event.target.checked)} />
                  Genap
                </label>
              </div>
            </div>

            <div className="space-y-1 lg:col-span-4">
              <label className="text-xs font-medium text-gray-600">Scope Kelas (Opsional)</label>
              <select
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Kelas</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.major?.name || '-'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end lg:col-span-5">
              <button
                onClick={runPreview}
                disabled={loadingPreview}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingPreview ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
                Hitung Preview
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Hasil Leger</h3>
            <p className="text-xs text-gray-500">
              Kolom mapel disusun dinamis ke samping sesuai data mapel yang tersedia.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <button
              type="button"
              onClick={exportExcel}
              disabled={exporting || loadingMeta}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Export Excel
            </button>
            <button
              type="button"
              onClick={printReady}
              disabled={printing || loadingMeta}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              Print Ready
            </button>
            <div className="relative w-full md:w-72">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari nama/NIS/NISN..."
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {preview ? (
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <p className="text-xs text-blue-700">Total Siswa</p>
              <p className="text-xl font-semibold text-blue-900">{preview.summary.totalStudents}</p>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs text-emerald-700">Mapel Tercakup</p>
              <p className="text-xl font-semibold text-emerald-900">{preview.summary.totalSubjects}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
              <p className="text-xs text-amber-700">Rata-rata Portofolio</p>
              <p className="text-xl font-semibold text-amber-900">{formatScore(preview.summary.averagePortfolio)}</p>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3">
              <p className="text-xs text-violet-700">Rata-rata US</p>
              <p className="text-xl font-semibold text-violet-900">{formatScore(preview.summary.averageUs)}</p>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-xs text-rose-700">Rata-rata Nilai Akhir</p>
              <p className="text-xl font-semibold text-rose-900">{formatScore(preview.summary.averageFinal)}</p>
            </div>
          </div>
        ) : null}

        {!preview ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
            Jalankan <span className="font-semibold">Hitung Preview</span> untuk melihat hasil leger nilai akhir.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500">
            Tidak ada siswa yang cocok dengan pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200 whitespace-nowrap">
                  <th className="py-2 pr-3">No</th>
                  <th className="py-2 pr-3">Nama Siswa</th>
                  <th className="py-2 pr-3">Kelas</th>
                  {preview.columns.semesterColumns.map((column) => (
                    <th key={column.key} className="py-2 px-3 text-center">
                      <div className="text-xs font-semibold text-gray-700">{column.label}</div>
                      <div className="text-[11px] text-gray-400">{column.academicYearName} · {column.semester === 'ODD' ? 'Ganjil' : 'Genap'}</div>
                    </th>
                  ))}
                  <th className="py-2 px-3 text-center">Rata-rata Portofolio</th>
                  {preview.columns.subjectColumns.map((subject) => (
                    <th key={subject.id} className="py-2 px-3 text-center min-w-[110px]">
                      <div className="text-xs font-semibold text-gray-700">{subject.code}</div>
                      <div className="text-[11px] text-gray-400">{subject.name}</div>
                    </th>
                  ))}
                  <th className="py-2 px-3 text-center">Penugasan</th>
                  <th className="py-2 px-3 text-center">Rata-rata US</th>
                  <th className="py-2 px-3 text-center">Nilai PKL</th>
                  <th className="py-2 px-3 text-center">Nilai Akhir</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row: FinalLedgerPreviewRow, index) => (
                  <tr key={row.student.id} className="border-b border-gray-100 whitespace-nowrap">
                    <td className="py-2 pr-3 text-gray-600">{index + 1}</td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{row.student.name}</p>
                      <p className="text-xs text-gray-500">
                        NIS: {row.student.nis || '-'} · NISN: {row.student.nisn || '-'}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{row.student.class?.name || '-'}</td>
                    {preview.columns.semesterColumns.map((column) => (
                      <td key={`${row.student.id}-${column.key}`} className="py-2 px-3 text-center text-gray-700">
                        {formatScore(row.portfolioBySemester?.[column.key])}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-center font-semibold text-gray-900">{formatScore(row.portfolioAverage)}</td>
                    {preview.columns.subjectColumns.map((subject) => (
                      <td key={`${row.student.id}-${subject.id}`} className="py-2 px-3 text-center text-gray-700">
                        {formatScore(row.ledgerBySubject?.[String(subject.id)])}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-center text-gray-700">{formatScore(row.assignmentScore)}</td>
                    <td className="py-2 px-3 text-center font-semibold text-gray-900">{formatScore(row.usAverage)}</td>
                    <td className="py-2 px-3 text-center text-gray-700">{formatScore(row.pklScore)}</td>
                    <td className="py-2 px-3 text-center font-semibold text-blue-700">{formatScore(row.finalScore)}</td>
                  </tr>
                ))}
              </tbody>
              {averageRow ? (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 whitespace-nowrap">
                    <td className="py-2 pr-3 text-gray-700 font-semibold" colSpan={3}>RATA-RATA</td>
                    {preview.columns.semesterColumns.map((column) => (
                      <td key={`avg-${column.key}`} className="py-2 px-3 text-center font-semibold text-gray-800">
                        {formatScore(averageRow.semesterAverages[column.key])}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-center font-semibold text-gray-900">{formatScore(averageRow.portfolioAverage)}</td>
                    {preview.columns.subjectColumns.map((subject) => (
                      <td key={`avg-sub-${subject.id}`} className="py-2 px-3 text-center font-semibold text-gray-800">
                        {formatScore(averageRow.subjectAverages[String(subject.id)])}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-center font-semibold text-gray-900">{formatScore(averageRow.assignmentScore)}</td>
                    <td className="py-2 px-3 text-center font-semibold text-gray-900">{formatScore(averageRow.usAverage)}</td>
                    <td className="py-2 px-3 text-center font-semibold text-gray-900">{formatScore(averageRow.pklScore)}</td>
                    <td className="py-2 px-3 text-center font-semibold text-blue-700">{formatScore(averageRow.finalScore)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </div>

      {showPrintModal ? (
        <div className="fixed inset-0 z-[120]">
          <div className="absolute inset-0 bg-slate-900/55" onClick={() => setShowPrintModal(false)} />
          <div className="relative z-10 mx-auto mt-6 h-[calc(100vh-3rem)] w-[min(1280px,96vw)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Print Ready - Leger Nilai Akhir</h3>
                <p className="text-xs text-gray-500">Preview dokumen sebelum dicetak.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintFromModal}
                  disabled={!printFrameReady}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Printer size={14} />
                  Cetak
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700"
                >
                  Tutup
                </button>
              </div>
            </div>
            <div className="h-[calc(100%-62px)] bg-slate-100 p-2">
              <iframe
                ref={printFrameRef}
                title="Preview Print Leger"
                srcDoc={printHtml}
                onLoad={() => setPrintFrameReady(true)}
                className="h-full w-full rounded-lg border border-gray-300 bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

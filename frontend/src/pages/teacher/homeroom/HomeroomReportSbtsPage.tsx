import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Save, Search } from 'lucide-react';
import { classService } from '../../../services/class.service';
import api from '../../../services/api';
import { usePersistentSchoolPrintAddress } from './usePersistentSchoolPrintAddress';

interface HomeroomReportSbtsPageProps {
  classId: number;
  academicYearId?: number;
  semester: 'ODD' | 'EVEN' | '';
  reportType?: string;
  programCode?: string;
  reportLabel?: string;
}

type StudentListItem = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  gender?: string | null;
};

type ReportRow = {
  no?: string | number;
  name?: string;
  positionName?: string | null;
  divisionName?: string | null;
  teacherName?: string;
  kkm?: string | number;
  isHeader?: boolean;
  rowCount?: number;
  skipNoColumn?: boolean;
  col1?: { score?: string | number | null; predicate?: string | null };
  col2?: { score?: string | number | null; predicate?: string | null; description?: string | null };
  final?: { score?: string | number | null; predicate?: string | null };
  description?: string | null;
  grade?: string | null;
};

type StudentReportPayload = {
  header: {
    studentName?: string;
    schoolName?: string;
    academicYear?: string;
    fase?: string;
    class?: string;
    semester?: string;
    nisn?: string;
    nis?: string;
  };
  body: {
    meta?: { col1Label?: string; col2Label?: string };
    groups: {
      A: ReportRow[];
      B: ReportRow[];
      C: ReportRow[];
    };
    extracurriculars: ReportRow[];
    organizations?: ReportRow[];
    homeroomNote?: string;
    attendance?: {
      sick?: number;
      s?: number;
      permission?: number;
      i?: number;
      absent?: number;
      a?: number;
    };
    presenceSummary?: {
      checkInRecorded?: number;
      checkOutRecorded?: number;
      openPresence?: number;
      averageCheckInTime?: string | null;
      averageCheckOutTime?: string | null;
    };
  };
  footer: {
    date?: string;
    place?: string;
    legality?: {
      verificationToken?: string;
      verificationUrl?: string;
      verificationQrDataUrl?: string;
    };
    signatures: {
      parent: { title?: string; name?: string };
      homeroom: { title?: string; name?: string; nip?: string | null };
    };
  };
};

export const HomeroomReportSbtsPage = ({
  classId,
  academicYearId,
  semester,
  reportType,
  programCode,
  reportLabel,
}: HomeroomReportSbtsPageProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const {
    printSchoolAddress,
    setPrintSchoolAddress,
    savePrintSchoolAddress,
    hasUnsavedChanges,
    defaultSchoolPrintAddress,
  } = usePersistentSchoolPrintAddress();
  const printIframeRef = useRef<HTMLIFrameElement>(null);
  const resolvedReportType = String(reportType || '').toUpperCase();
  const resolvedReportLabel = String(reportLabel || resolvedReportType || 'Rapor');

  const { data: classData, isLoading } = useQuery({
    queryKey: ['class-students', classId],
    queryFn: () => classService.getById(classId).then(res => res.data),
    enabled: !!classId && !!semester
  });

  const students: StudentListItem[] = classData?.students || [];
  const filteredStudents = students.filter((s) => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.nis && s.nis.includes(searchQuery))
  );

  // formatDate removed as we use pre-formatted string input
  // const formatDate = (dateString: string) => { ... }

  const handlePrint = async (studentId: number) => {
    try {
      const response = await api.get('/reports/student', {
        params: {
          studentId,
          ...(academicYearId ? { academicYearId } : {}),
          semester,
          ...(programCode ? { programCode } : {}),
          ...(!programCode && resolvedReportType ? { type: resolvedReportType } : {}),
        }
      });
      const reportData = response.data.data as StudentReportPayload;
      printReport(reportData);
    } catch (error) {
      console.error('Failed to fetch report', error);
      alert('Gagal mengambil data rapor');
    }
  };

  const printReport = (data: StudentReportPayload) => {
    const iframe = printIframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      console.error('Print iframe not found');
      return;
    }
    const printDoc = iframe.contentWindow.document;
    const meta = data?.body?.meta || {};
    const col1Label = String(meta.col1Label || 'Komponen 1');
    const col2Label = String(meta.col2Label || resolvedReportLabel || 'Komponen 2');
    const escapeHtml = (value: unknown): string =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const normalizeSbtsHeaderCode = (value: unknown): string => {
      const normalized = String(value || '').trim().toUpperCase();
      const compact = normalized.replace(/[^A-Z0-9]+/g, '');
      if (
        compact.includes('SBTS') ||
        compact.includes('MIDTERM') ||
        compact.includes('SUMATIFBERSAMATENGAHSEMESTER') ||
        compact.includes('SUMATIFTENGAHSEMESTER') ||
        ['PTS', 'UTS'].includes(compact)
      ) {
        return 'SBTS';
      }
      return normalized || 'SBTS';
    };
    const col2HeaderLabel = `NILAI ${normalizeSbtsHeaderCode(col2Label)}`;
    const resolvedSchoolAddress = String(printSchoolAddress || '').trim() || defaultSchoolPrintAddress;
    const resolvedPrintPlace = String(data.footer.place || '').trim() || 'Bekasi';
    const resolvedPrintDate =
      String(data.footer.date || '').trim() || 'Tanggal rapor belum diatur';
    const homeroomVerificationQrDataUrl = String(data.footer.legality?.verificationQrDataUrl || '').trim();
    const homeroomNip = String(data.footer.signatures.homeroom.nip || '').trim();

    const parseNumeric = (value: string | number | null | undefined): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const formatDisplayScore = (value: string | number | null | undefined): string => {
      const numericValue = parseNumeric(value);
      if (numericValue === null) return String(value ?? '-');
      return numericValue.toFixed(2);
    };

    const isBelowKkm = (
      value: string | number | null | undefined,
      kkm: string | number | null | undefined,
    ): boolean => {
      const numericValue = parseNumeric(value);
      const numericKkm = parseNumeric(kkm);
      if (numericValue === null || numericKkm === null) return false;
      return numericValue < numericKkm;
    };

    const resolveStatus = (item: ReportRow): string => {
      const availableScores = [parseNumeric(item.col1?.score), parseNumeric(item.col2?.score)].filter(
        (value): value is number => value !== null,
      );
      if (availableScores.length === 0) return '-';
      const numericKkm = parseNumeric(item.kkm);
      if (numericKkm === null) return '-';
      return availableScores.some((score) => score < numericKkm) ? 'Belum Tuntas' : 'Tuntas';
    };

    const resolveStatusColor = (status: string): string =>
      status === 'Belum Tuntas' ? '#dc2626' : '#111827';

    const resolveCellColor = (
      value: string | number | null | undefined,
      kkm: string | number | null | undefined,
    ): string => (isBelowKkm(value, kkm) ? '#dc2626' : '#111827');

    const renderRows = (items: ReportRow[]) => {
      if (!items || items.length === 0) return '';
      return items.map((item) => {
        let noCell = '';
        if (item.isHeader) {
            noCell = `<td class="center align-top" style="vertical-align: top; font-weight: bold;" rowspan="${(item.rowCount || 0) + 1}">${item.no}</td>`;
        } else if (item.skipNoColumn) {
            noCell = '';
        } else {
            noCell = `<td class="center align-middle">${item.no}</td>`;
        }

        if (item.isHeader) {
           return `
            <tr>
              ${noCell}
              <td colspan="7" class="align-middle" style="font-weight: bold;">${item.name}</td>
            </tr>
           `;
        }

        const col1Color = resolveCellColor(item.col1?.score, item.kkm);
        const col2Color = resolveCellColor(item.col2?.score, item.kkm);
        const hasCol1Value =
          parseNumeric(item.col1?.score) !== null || String(item.col1?.predicate || '').trim().length > 0;
        const hasCol2Value =
          parseNumeric(item.col2?.score) !== null || String(item.col2?.predicate || '').trim().length > 0;
        const status = resolveStatus(item);
        const statusColor = resolveStatusColor(status);
        const col1Cells = hasCol1Value
          ? `
          <td class="center align-middle" style="color: ${col1Color}; font-weight: ${col1Color === '#dc2626' ? '700' : '400'};">${formatDisplayScore(item.col1?.score)}</td>
          <td class="center align-middle" style="color: ${col1Color}; font-weight: ${col1Color === '#dc2626' ? '700' : '400'};">${item.col1?.predicate ?? '-'}</td>
          `
          : `<td colspan="2" class="center align-middle empty-component-cell">Tidak ada Penilaian</td>`;
        const col2Cells = hasCol2Value
          ? `
          <td class="center align-middle" style="color: ${col2Color}; font-weight: ${col2Color === '#dc2626' ? '700' : '400'};">${formatDisplayScore(item.col2?.score)}</td>
          <td class="center align-middle" style="color: ${col2Color}; font-weight: ${col2Color === '#dc2626' ? '700' : '400'};">${item.col2?.predicate ?? '-'}</td>
          `
          : `
          <td class="center align-middle">-</td>
          <td class="center align-middle">-</td>
          `;
        
        return `
        <tr>
          ${noCell}
          <td class="align-middle">
            <div style="font-weight: bold;">${item.name}</div>
            <div style="font-size: 9.5px; font-style: italic; margin-top: 1px; line-height: 1.08;">${item.teacherName || '-'}</div>
          </td>
          <td class="center align-middle">${item.kkm}</td>
          
          <!-- Kolom 1 Dinamis -->
          ${col1Cells}
          
          <!-- Kolom 2 Dinamis -->
          ${col2Cells}
          
          <td style="padding: 3px 6px; font-size: 10.5px; line-height: 1.08; color: ${statusColor}; font-weight: ${status === 'Belum Tuntas' ? '700' : '600'};" class="center align-middle ket-cell">${status}</td>
        </tr>
      `}).join('');
    };

    const renderGroupSection = (groupTitle: string, items: ReportRow[]) => {
      if (!items || items.length === 0) return '';
      return `
        <tr>
          <td colspan="8" style="background-color: #f9f9f9; font-weight: bold; padding: 4px;">${groupTitle}</td>
        </tr>
        ${renderRows(items)}
      `;
    };

    const renderExtracurriculars = (items: ReportRow[]) => {
      if (!items || items.length === 0) return '';
      
      const rows = items.map((item, index) => `
        <tr>
          <td class="center align-middle">${index + 1}</td>
          <td class="align-middle">${item.name}</td>
          <td class="center align-middle">${item.grade}</td>
          <td class="align-middle">${item.description}</td>
        </tr>
      `).join('');

      return `
        <div style="margin-top: 15px;">
          <div style="font-weight: bold; margin-bottom: 5px;">F. EKSTRAKURIKULER</div>
          <table class="content-table">
            <thead>
              <tr>
                <th width="5%">No</th>
                <th width="30%">Nama Kegiatan</th>
                <th width="10%">Predikat</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    };

    const renderOrganizations = (items: ReportRow[]) => {
      if (!items || items.length === 0) return '';

      const rows = items.map((item, index) => {
        const roleLabel = [item.positionName, item.divisionName].filter(Boolean).join(' • ');
        return `
        <tr>
          <td class="center align-middle">${index + 1}</td>
          <td class="align-middle">${roleLabel || item.name || 'OSIS'}</td>
          <td class="center align-middle">${item.grade}</td>
          <td class="align-middle">${item.description}</td>
        </tr>
      `;
      }).join('');

      return `
        <div style="margin-top: 15px;">
          <div style="font-weight: bold; margin-bottom: 5px;">G. ORGANISASI SISWA (OSIS)</div>
          <table class="content-table">
            <thead>
              <tr>
                <th width="5%">No</th>
                <th width="30%">Jabatan / Posisi</th>
                <th width="10%">Predikat</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    };

    const att = data.body.attendance || {};
    const sick = att.sick ?? att.s ?? 0;
    const permission = att.permission ?? att.i ?? 0;
    const absent = att.absent ?? att.a ?? 0;
    const homeroomNoteHtml = escapeHtml(data.body.homeroomNote || '-').replace(/\n/g, '<br>');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapor ${resolvedReportLabel} - ${data.header.studentName}</title>
        <style>
          @page { size: A4; margin: 0.9cm; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11.5px; line-height: 1.18; }
          .header { text-align: center; margin-bottom: 14px; }
          .header-title { font-weight: bold; font-size: 14px; }
          .header-school { font-weight: bold; font-size: 14px; margin: 2px 0; }
          .header-year { font-weight: bold; font-size: 12px; }
          
          .info-table { width: 100%; margin-bottom: 8px; font-size: 11.5px; border-collapse: collapse; line-height: 1.08; }
          .info-table td { padding: 1px 2px; vertical-align: top; line-height: 1.08; }
          
          .content-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11.5px; }
          .content-table th, .content-table td { border: 1px solid black; padding: 3px 4px; line-height: 1.1; }
          .content-table th { text-align: center; background-color: #f0f0f0; font-weight: bold; vertical-align: middle; }
          .ket-header, .ket-cell { white-space: nowrap; width: 1%; }
          .empty-component-cell { text-align: center; color: #64748b; font-style: italic; white-space: nowrap; }
          .attendance-note-row { display: flex; align-items: stretch; gap: 12px; margin: 10px 0; page-break-inside: avoid; }
          .report-side-section { display: flex; flex-direction: column; min-width: 0; }
          .attendance-section { flex: 0 0 auto; }
          .note-section { flex: 1 1 auto; }
          .side-section-title { font-weight: bold; margin-bottom: 4px; }
          .attendance-table { width: auto; border-collapse: collapse; margin: 0; font-size: 11.5px; table-layout: auto; }
          .attendance-table td { border: 1px solid black; padding: 3px 7px; white-space: nowrap; line-height: 1.08; }
          .attendance-value-cell { min-width: 54px; }
          .note-box { border: 1px solid black; box-sizing: border-box; flex: 1 1 auto; min-height: 0; padding: 3px 7px; line-height: 1.18; white-space: normal; word-break: break-word; }
          
          .center { text-align: center; }
          .align-middle { vertical-align: middle; }
          
          .footer { margin-top: 18px; page-break-inside: avoid; }
          .signature-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
          .signature-box { text-align: center; width: 250px; }
          .signature-space { height: 56px; }
          .signature-box.with-qr .signature-space { height: 14px; }
          .signature-qr {
            display: block;
            width: 68px;
            height: 68px;
            object-fit: contain;
            margin: 0 auto 3px;
            background: #fff;
          }
          .signature-name { display: inline-block; margin-top: 2px; }
          .signature-nip { margin-top: 3px; font-size: 10.5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-title">KARTU HASIL STUDI (KHS)</div>
          <div class="header-school">${data.header.schoolName}</div>
          <div class="header-year">TAHUN AJARAN ${data.header.academicYear}</div>
        </div>
        
        <table class="info-table">
          <tr>
            <td width="20%">Nama Sekolah</td><td width="2%">:</td><td width="40%">${data.header.schoolName}</td>
            <td width="15%">Fase</td><td width="2%">:</td><td width="21%">${data.header.fase}</td>
          </tr>
          <tr>
            <td>Alamat</td><td>:</td><td>${resolvedSchoolAddress}</td>
            <td>Kelas</td><td>:</td><td>${data.header.class}</td>
          </tr>
          <tr>
            <td>Nama Peserta Didik</td><td>:</td><td>${data.header.studentName}</td>
            <td>Semester</td><td>:</td><td>${data.header.semester}</td>
          </tr>
          <tr>
            <td>NISN/NIS</td><td>:</td><td>${data.header.nisn} / ${data.header.nis}</td>
            <td>Tahun Ajaran</td><td>:</td><td>${data.header.academicYear}</td>
          </tr>
        </table>

        <table class="content-table">
          <thead>
            <tr>
              <th rowspan="2" width="5%">No</th>
              <th rowspan="2" width="49%">MATA PELAJARAN</th>
              <th rowspan="2" width="5%">KKTP</th>
              <th colspan="2">${col1Label.toUpperCase()}</th>
              <th colspan="2">${col2HeaderLabel}</th>
              <th rowspan="2" class="ket-header">STATUS</th>
            </tr>
            <tr>
              <th width="5%">Angka</th>
              <th width="5%">Predikat</th>
              <th width="5%">Angka</th>
              <th width="5%">Predikat</th>
            </tr>
          </thead>
          <tbody>
            ${renderGroupSection('A. KELOMPOK MATA PELAJARAN UMUM', data.body.groups.A)}
            ${renderGroupSection('B. KELOMPOK MATA PELAJARAN KEJURUAN', data.body.groups.B)}
            ${renderGroupSection('C. KELOMPOK MUATAN LOKAL', data.body.groups.C)}
          </tbody>
        </table>

        <div class="attendance-note-row">
          <div class="report-side-section attendance-section">
            <div class="side-section-title">D. KETIDAKHADIRAN</div>
            <table class="attendance-table">
              <tr>
                <td>Sakit</td>
                <td class="attendance-value-cell">: ${sick} hari</td>
              </tr>
              <tr>
                <td>Izin</td>
                <td class="attendance-value-cell">: ${permission} hari</td>
              </tr>
              <tr>
                <td>Tanpa Keterangan</td>
                <td class="attendance-value-cell">: ${absent} hari</td>
              </tr>
            </table>
          </div>
          <div class="report-side-section note-section">
            <div class="side-section-title">E. CATATAN WALI KELAS</div>
            <div class="note-box">${homeroomNoteHtml}</div>
          </div>
        </div>

        ${renderExtracurriculars(data.body.extracurriculars)}
        ${renderOrganizations(data.body.organizations || [])}

        <div class="footer">
          <div class="signature-row">
            <div class="signature-box">
              Mengetahui,<br>
              ${data.footer.signatures.parent.title},
              <div class="signature-space"></div>
              <u>${data.footer.signatures.parent.name}</u>
            </div>
            
            <div class="signature-box ${homeroomVerificationQrDataUrl ? 'with-qr' : ''}">
               ${resolvedPrintPlace}, ${resolvedPrintDate}<br>
               ${data.footer.signatures.homeroom.title},
               <div class="signature-space"></div>
               ${
                 homeroomVerificationQrDataUrl
                   ? `<img src="${escapeHtml(homeroomVerificationQrDataUrl)}" alt="QR Verifikasi Wali Kelas" class="signature-qr" />`
                   : ''
               }
               <u class="signature-name">${data.footer.signatures.homeroom.name}</u>
               ${
                 homeroomNip && homeroomNip !== '-'
                   ? `<div class="signature-nip">NIP/NUPTK: ${escapeHtml(homeroomNip)}</div>`
                   : ''
               }
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    
    printDoc.open();
    printDoc.write(html);
    printDoc.close();

    const triggerPrint = () => {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    };

    const waitForAssetsAndPrint = () => {
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        triggerPrint();
        return;
      }

      const imageNodes = Array.from(doc.images || []);
      const imagePromises = imageNodes.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
      );

      const fontsReady =
        typeof doc.fonts?.ready?.then === 'function' ? doc.fonts.ready.catch(() => undefined) : Promise.resolve();

      Promise.all([fontsReady, ...imagePromises]).finally(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            triggerPrint();
          });
        });
      });
    };

    if (iframe.contentWindow.document.readyState === 'complete') {
      waitForAssetsAndPrint();
      return;
    }

    iframe.onload = () => {
      iframe.onload = null;
      waitForAssetsAndPrint();
    };
  };

  if (!semester) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <p className="text-blue-700 font-medium">Silakan pilih semester terlebih dahulu untuk menampilkan data rapor siswa.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cari siswa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full pl-9 pr-4 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase font-bold text-gray-500 whitespace-nowrap">Alamat</label>
            <input
              type="text"
              value={printSchoolAddress}
              onChange={(e) => setPrintSchoolAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hasUnsavedChanges) {
                  e.preventDefault();
                  savePrintSchoolAddress();
                }
              }}
              className="h-10 w-64 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Alamat Sekolah"
            />
            <button
              type="button"
              onClick={savePrintSchoolAddress}
              disabled={!hasUnsavedChanges}
              className={`inline-flex h-10 items-center gap-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                hasUnsavedChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              Simpan
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-500 whitespace-nowrap">
          Total: {filteredStudents.length} Siswa
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-medium">
            <tr>
              <th className="px-6 py-3 w-12">No</th>
              <th className="px-6 py-3">NIS/NISN</th>
              <th className="px-6 py-3">Nama Siswa</th>
              <th className="px-6 py-3 text-center">L/P</th>
              <th className="px-6 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Tidak ada data siswa
                </td>
              </tr>
            ) : (
              filteredStudents.map((student, index: number) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">{index + 1}</td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900">{student.nis}</div>
                    <div className="text-xs text-gray-500">{student.nisn}</div>
                  </td>
                  <td className="px-6 py-3 font-medium text-gray-900">{student.name}</td>
                  <td className="px-6 py-3 text-center">
                    {student.gender === 'MALE' ? 'L' : 'P'}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handlePrint(student.id)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {`Cetak Rapor ${resolvedReportLabel}`}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Hidden iframe for printing */}
      <iframe 
        ref={printIframeRef} 
        style={{ position: 'absolute', width: '0px', height: '0px', border: 'none', visibility: 'hidden' }}
        title="print-frame"
      />
    </div>
  );
};

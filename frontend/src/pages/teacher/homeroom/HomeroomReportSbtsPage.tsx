import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Search } from 'lucide-react';
import { classService } from '../../../services/class.service';
import api from '../../../services/api';

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
  };
  footer: {
    signatures: {
      parent: { title?: string; name?: string };
      homeroom: { title?: string; name?: string };
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
  const [printPlace, setPrintPlace] = useState('Bekasi');
  const [printDate, setPrintDate] = useState(() =>
    new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
  );
  const [printSchoolAddress, setPrintSchoolAddress] = useState('Jl. Anggrek 1, Duren Jaya Bekasi Timur');
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

    const parseNumeric = (value: string | number | null | undefined): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
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
      const numericKkm = parseNumeric(item.kkm);
      const referenceScore =
        parseNumeric(item.final?.score) ??
        parseNumeric(item.col2?.score) ??
        parseNumeric(item.col1?.score);
      if (numericKkm === null || referenceScore === null) return '-';
      return referenceScore >= numericKkm ? 'Tuntas' : 'Belum Tuntas';
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
        const status = resolveStatus(item);
        const statusColor = resolveStatusColor(status);
        
        return `
        <tr>
          ${noCell}
          <td class="align-middle">
            <div style="font-weight: bold;">${item.name}</div>
            <div style="font-size: 10px; font-style: italic; margin-top: 2px;">${item.teacherName || '-'}</div>
          </td>
          <td class="center align-middle">${item.kkm}</td>
          
          <!-- Kolom 1 Dinamis -->
          <td class="center align-middle" style="color: ${col1Color}; font-weight: ${col1Color === '#dc2626' ? '700' : '400'};">${item.col1?.score ?? '-'}</td>
          <td class="center align-middle" style="color: ${col1Color}; font-weight: ${col1Color === '#dc2626' ? '700' : '400'};">${item.col1?.predicate ?? '-'}</td>
          
          <!-- Kolom 2 Dinamis -->
          <td class="center align-middle" style="color: ${col2Color}; font-weight: ${col2Color === '#dc2626' ? '700' : '400'};">${item.col2?.score ?? '-'}</td>
          <td class="center align-middle" style="color: ${col2Color}; font-weight: ${col2Color === '#dc2626' ? '700' : '400'};">${item.col2?.predicate ?? '-'}</td>
          
          <td style="padding: 4px 8px; font-size: 11px; color: ${statusColor}; font-weight: ${status === 'Belum Tuntas' ? '700' : '600'};" class="align-middle">${status}</td>
        </tr>
      `}).join('');
    };

    const renderGroupSection = (groupTitle: string, items: ReportRow[]) => {
      if (!items || items.length === 0) return '';
      return `
        <tr>
          <td colspan="8" style="background-color: #f9f9f9; font-weight: bold; padding: 5px;">${groupTitle}</td>
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
          <div style="font-weight: bold; margin-bottom: 5px;">D. EKSTRAKURIKULER</div>
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
          <div style="font-weight: bold; margin-bottom: 5px;">E. ORGANISASI SISWA (OSIS)</div>
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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapor ${resolvedReportLabel} - ${data.header.studentName}</title>
        <style>
          @page { size: A4; margin: 1cm; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; line-height: 1.3; }
          .header { text-align: center; margin-bottom: 20px; }
          .header-title { font-weight: bold; font-size: 14px; }
          .header-school { font-weight: bold; font-size: 14px; margin: 2px 0; }
          .header-year { font-weight: bold; font-size: 12px; }
          
          .info-table { width: 100%; margin-bottom: 15px; font-size: 12px; }
          .info-table td { padding: 2px; vertical-align: top; }
          
          .content-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .content-table th, .content-table td { border: 1px solid black; padding: 4px; }
          .content-table th { text-align: center; background-color: #f0f0f0; font-weight: bold; vertical-align: middle; }
          
          .center { text-align: center; }
          .align-middle { vertical-align: middle; }
          
          .footer { margin-top: 30px; page-break-inside: avoid; }
          .signature-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .signature-box { text-align: center; width: 250px; }
          .signature-space { height: 70px; }
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
            <td>Alamat</td><td>:</td><td>${printSchoolAddress}</td>
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
              <th rowspan="2" width="50%">MATA PELAJARAN</th>
              <th rowspan="2" width="5%">KKTP</th>
              <th colspan="2">${col1Label.toUpperCase()}</th>
              <th colspan="2">${col2Label.toUpperCase()}</th>
              <th rowspan="2" width="10%">KET</th>
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
            
            <div class="signature-box">
               ${printPlace}, ${printDate}<br>
               ${data.footer.signatures.homeroom.title},
               <div class="signature-space"></div>
               <u>${data.footer.signatures.homeroom.name}</u>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    
    printDoc.open();
    printDoc.write(html);
    printDoc.close();

    // Wait for content to load/render before printing
    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    }, 500);
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
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
                <label className="text-xs uppercase font-bold text-gray-500 whitespace-nowrap">Alamat</label>
                <input 
                    type="text" 
                    value={printSchoolAddress}
                    onChange={(e) => setPrintSchoolAddress(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Alamat Sekolah"
                />
            </div>
            <div className="flex items-center gap-2">
                <label className="text-xs uppercase font-bold text-gray-500 whitespace-nowrap">Tempat</label>
                <input 
                    type="text" 
                    value={printPlace}
                    onChange={(e) => setPrintPlace(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Bekasi"
                />
            </div>
            <div className="flex items-center gap-2">
                <label className="text-xs uppercase font-bold text-gray-500 whitespace-nowrap">Tanggal</label>
                <input 
                    type="text" 
                    value={printDate}
                    onChange={(e) => setPrintDate(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="DD MMMM YYYY"
                />
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

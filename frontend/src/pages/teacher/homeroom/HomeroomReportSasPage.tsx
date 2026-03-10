import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Search } from 'lucide-react';
import { classService } from '../../../services/class.service';
import api from '../../../services/api';

interface HomeroomReportSasPageProps {
  classId: number;
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
};

type ReportRow = {
  no?: string | number;
  name?: string;
  teacherName?: string;
  isHeader?: boolean;
  rowCount?: number;
  skipNoColumn?: boolean;
  col1?: { score?: string | number | null };
  col2?: { description?: string | null };
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
  };
  footer: {
    signatures: {
      parent: { title?: string; name?: string };
      homeroom: { title?: string; name?: string };
    };
  };
};

export const HomeroomReportSasPage = ({
  classId,
  semester,
  reportType,
  programCode,
  reportLabel,
}: HomeroomReportSasPageProps) => {
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

  const handlePrint = async (studentId: number) => {
    try {
      const response = await api.get('/reports/student', {
        params: { 
          studentId, 
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
    const col1Label = String(meta.col1Label || 'Nilai Akhir');
    const col2Label = String(meta.col2Label || 'Komponen 2');

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
              <td colspan="3" class="align-middle" style="font-weight: bold;">${item.name}</td>
            </tr>
           `;
        }
        
        return `
        <tr>
          ${noCell}
          <td class="align-middle">
            <div style="font-weight: bold;">${item.name}</div>
            <div style="font-size: 10px; font-style: italic; margin-top: 2px;">${item.teacherName || '-'}</div>
          </td>
          
          <!-- Kolom Nilai Dinamis -->
          <td class="center align-middle">${item.col1?.score ?? '-'}</td>
          
          <!-- Kolom Capaian Dinamis -->
          <td style="padding: 4px 8px; font-size: 11px;" class="align-middle">${item.col2?.description || item.description || '-'}</td>
        </tr>
      `}).join('');
    };

    const renderGroupSection = (groupTitle: string, items: ReportRow[]) => {
      if (!items || items.length === 0) return '';
      return `
        <tr>
          <td colspan="4" style="background-color: #f9f9f9; font-weight: bold; padding: 5px;">${groupTitle}</td>
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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapor ${resolvedReportLabel} - ${data.header.studentName}</title>
        <style>
          @page { size: A4; margin: 1cm; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; line-height: 1.2; }
          .header { text-align: center; margin-bottom: 20px; }
          .header-title { font-weight: bold; font-size: 14px; }
          .header-school { font-weight: bold; font-size: 14px; margin: 2px 0; }
          .header-year { font-weight: bold; font-size: 12px; }
          
          .info-table { width: 100%; margin-bottom: 10px; font-size: 12px; border-collapse: collapse; }
          .info-table td { padding: 0px 2px; vertical-align: top; }
          
          .content-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .content-table th, .content-table td { border: 1px solid black; padding: 4px; }
          .content-table th { text-align: center; background-color: #f0f0f0; font-weight: bold; vertical-align: middle; padding: 8px; }
          
          .center { text-align: center; }
          .align-middle { vertical-align: middle; }
          
          .footer { margin-top: 30px; page-break-inside: avoid; }
          .signature-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .signature-box { text-align: center; width: 250px; }
          .signature-space { height: 70px; }
        </style>
      </head>
      <body>
        
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
              <th width="5%">No</th>
              <th width="35%">MATA PELAJARAN</th>
              <th width="10%">${col1Label.toUpperCase()}</th>
              <th>${col2Label.toUpperCase()}</th>
            </tr>
          </thead>
          <tbody>
            ${renderGroupSection('A. KELOMPOK MATA PELAJARAN UMUM', data.body.groups.A)}
            ${renderGroupSection('B. KELOMPOK MATA PELAJARAN KEJURUAN', data.body.groups.B)}
            ${renderGroupSection('C. KELOMPOK MUATAN LOKAL', data.body.groups.C)}
          </tbody>
        </table>

        ${renderExtracurriculars(data.body.extracurriculars)}

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">No</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">NIS/NISN</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    Tidak ada data siswa
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student, index: number) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>{student.nis}</div>
                      <div className="text-xs text-gray-500">{student.nisn}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{student.name}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handlePrint(student.id)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Printer size={14} />
                        {`Cetak Rapor ${resolvedReportLabel}`}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Hidden Iframe for Printing */}
      <iframe 
        ref={printIframeRef}
        style={{ position: 'absolute', width: '0', height: '0', border: '0', visibility: 'hidden' }}
        title={`Print Rapor ${resolvedReportLabel}`}
      />
    </div>
  );
};

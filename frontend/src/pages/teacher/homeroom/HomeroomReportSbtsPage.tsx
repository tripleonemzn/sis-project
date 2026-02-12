import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Search } from 'lucide-react';
import { classService } from '../../../services/class.service';
import api from '../../../services/api';

interface HomeroomReportSbtsPageProps {
  classId: number;
  semester: 'ODD' | 'EVEN' | '';
}

export const HomeroomReportSbtsPage = ({ classId, semester }: HomeroomReportSbtsPageProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [printPlace, setPrintPlace] = useState('Bekasi');
  const [printDate, setPrintDate] = useState('');
  const [printSchoolAddress, setPrintSchoolAddress] = useState('Jl. Anggrek 1, Duren Jaya Bekasi Timur');
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  // Set default date to today formatted ID
  useEffect(() => {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    setPrintDate(today.toLocaleDateString('id-ID', options));
  }, []);

  const { data: classData, isLoading } = useQuery({
    queryKey: ['class-students', classId],
    queryFn: () => classService.getById(classId).then(res => res.data),
    enabled: !!classId && !!semester
  });

  const students = classData?.students || [];
  const filteredStudents = students.filter((s: any) => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.nis && s.nis.includes(searchQuery))
  );

  // formatDate removed as we use pre-formatted string input
  // const formatDate = (dateString: string) => { ... }

  const handlePrint = async (studentId: number) => {
    try {
      const response = await api.get('/reports/student/sbts', {
        params: { studentId, semester }
      });
      const reportData = response.data.data;
      printReport(reportData);
    } catch (error) {
      console.error('Failed to fetch report', error);
      alert('Gagal mengambil data rapor');
    }
  };

  const printReport = (data: any) => {
    const iframe = printIframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      console.error('Print iframe not found');
      return;
    }
    const printDoc = iframe.contentWindow.document;

    const renderRows = (items: any[]) => {
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
              <td colspan="9" class="align-middle" style="font-weight: bold;">${item.name}</td>
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
          <td class="center align-middle">${item.kkm}</td>
          
          <!-- Formatif -->
          <td class="center align-middle">${item.formatif?.score ?? '-'}</td>
          <td class="center align-middle">${item.formatif?.predicate ?? '-'}</td>
          
          <!-- SBTS -->
          <td class="center align-middle">${item.sbts?.score ?? '-'}</td>
          <td class="center align-middle">${item.sbts?.predicate ?? '-'}</td>
          
          <!-- Nilai Akhir -->
          <td class="center align-middle">${item.final?.score ?? '-'}</td>
          <td class="center align-middle">${item.final?.predicate ?? '-'}</td>
          
          <td style="padding: 4px 8px; font-size: 11px;" class="align-middle">${item.description}</td>
        </tr>
      `}).join('');
    };

    const renderGroupSection = (groupTitle: string, items: any[]) => {
      if (!items || items.length === 0) return '';
      return `
        <tr>
          <td colspan="10" style="background-color: #f9f9f9; font-weight: bold; padding: 5px;">${groupTitle}</td>
        </tr>
        ${renderRows(items)}
      `;
    };

    const renderExtracurriculars = (items: any[]) => {
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
        <title>Rapor SBTS - ${data.header.studentName}</title>
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
              <th colspan="2">FORMATIF</th>
              <th colspan="2">SBTS</th>
              <th colspan="2">NILAI AKHIR</th>
              <th rowspan="2" width="10%">KET</th>
            </tr>
            <tr>
              <th width="5%">Angka</th>
              <th width="5%">Predikat</th>
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
              filteredStudents.map((student: any, index: number) => (
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
                      Cetak Rapor
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

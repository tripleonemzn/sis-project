import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, Save, Search } from 'lucide-react';
import { classService } from '../../../services/class.service';
import api from '../../../services/api';
import { usePersistentSchoolPrintAddress } from './usePersistentSchoolPrintAddress';

interface HomeroomReportPage2Props {
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
};

type ReportRow = {
  name?: string;
  ekskulName?: string;
  positionName?: string | null;
  divisionName?: string | null;
  grade?: string | null;
  description?: string | null;
  rank?: string | number | null;
  level?: string | null;
  year?: string | number | null;
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
    extracurriculars: ReportRow[];
    organizations?: ReportRow[];
    achievements: ReportRow[];
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
    homeroomNote?: string;
  };
  footer: {
    date?: string;
    place?: string;
    signatures: {
      parent: { title?: string; name?: string };
      homeroom: { title?: string; name?: string };
      principal: { title?: string; name?: string };
    };
  };
};

export const HomeroomReportPage2 = ({
  classId,
  academicYearId,
  semester,
  reportType,
  programCode,
  reportLabel,
}: HomeroomReportPage2Props) => {
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
    const resolvedSchoolAddress = String(printSchoolAddress || '').trim() || defaultSchoolPrintAddress;
    const resolvedPrintPlace = String(data.footer.place || '').trim() || 'Bekasi';
    const resolvedPrintDate =
      String(data.footer.date || '').trim() || 'Tanggal rapor belum diatur';
    const normalizedSemesterLabel = String(data?.header?.semester || '').trim().toUpperCase();
    const isSat =
      String(semester || '').toUpperCase() === 'EVEN' ||
      normalizedSemesterLabel.includes('GENAP');

    // Helper for Extracurriculars
    const renderExtracurriculars = (items: ReportRow[]) => {
      if (!items || items.length === 0) {
        return `
          <tr>
            <td colspan="4" class="center">Tidak ada data ekstrakurikuler</td>
          </tr>
        `;
      }
      
      return items.map((item, index) => `
        <tr>
          <td class="center align-middle">${index + 1}</td>
          <td class="align-middle">${item.name || item.ekskulName}</td>
          <td class="center align-middle">${item.grade || '-'}</td>
          <td class="align-middle">${item.description || '-'}</td>
        </tr>
      `).join('');
    };

    const renderOrganizations = (items: ReportRow[]) => {
      if (!items || items.length === 0) {
        return `
          <tr>
            <td colspan="4" class="center">Tidak ada data OSIS</td>
          </tr>
        `;
      }

      return items.map((item, index) => {
        const roleLabel = [item.positionName, item.divisionName].filter(Boolean).join(' • ');
        return `
          <tr>
            <td class="center align-middle">${index + 1}</td>
            <td class="align-middle">${roleLabel || item.name || 'OSIS'}</td>
            <td class="center align-middle">${item.grade || '-'}</td>
            <td class="align-middle">${item.description || '-'}</td>
          </tr>
        `;
      }).join('');
    };

    // Helper for Achievements (Mocked if missing)
    const renderAchievements = (items: ReportRow[]) => {
      if (!items || items.length === 0) {
        return `
          <tr>
            <td colspan="3" class="center">Tidak ada data prestasi</td>
          </tr>
        `;
      }
      
      return items.map((item, index) => {
        // Construct description from rank/level/year if description is missing
        let desc = item.description;
        if (!desc && (item.rank || item.level)) {
           desc = `Juara ${item.rank || '-'} Tingkat ${item.level || '-'} (${item.year || '-'})`;
        }

        return `
        <tr>
          <td class="center align-middle">${index + 1}</td>
          <td class="align-middle">${item.name}</td>
          <td class="align-middle">${desc || '-'}</td>
        </tr>
      `}).join('');
    };

    // Helper for Attendance (Mocked if missing)
    const att = data.body.attendance || {};
    const sick = att.sick ?? att.s ?? 0;
    const permission = att.permission ?? att.i ?? 0;
    const absent = att.absent ?? att.a ?? 0;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapor ${resolvedReportLabel} Halaman 2 - ${data.header.studentName}</title>
        <style>
          @page { size: A4; margin: ${isSat ? '0.8cm' : '1cm'}; }
          body { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; line-height: 1.3; }
          
          .info-table { width: 100%; margin-bottom: 20px; font-size: 12px; border-collapse: collapse; }
          .info-table td { padding: 2px; vertical-align: top; }
          
          .section-title { font-weight: bold; margin-top: 15px; margin-bottom: 5px; }
          
          .content-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
          .content-table th, .content-table td { border: 1px solid black; padding: 4px; }
          .content-table th { text-align: center; background-color: #f0f0f0; font-weight: bold; vertical-align: middle; }
          
          .attendance-table { width: 60%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
          .attendance-table td { border: 1px solid black; padding: 4px; }
          
          .note-box { border: 1px solid black; border-radius: 8px; padding: 10px; min-height: ${isSat ? '50px' : '80px'}; margin-bottom: 12px; }
          .keputusan-box { border: 1px solid black; border-radius: 8px; padding: 8px; font-size: 11px; line-height: 1.2; margin-bottom: 12px; }
          
          .center { text-align: center; }
          .align-middle { vertical-align: middle; }
          
          .footer { margin-top: ${isSat ? '20px' : '40px'}; page-break-inside: avoid; }
          .signature-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: ${isSat ? '40px' : '60px'}; }
          .signature-center { text-align: center; margin-top: 20px; }
          .signature-box { text-align: center; width: 250px; }
          .signature-space { height: ${isSat ? '50px' : '70px'}; }
        </style>
      </head>
      <body>
        
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

        <!-- D. EKSTRAKURIKULER -->
        <div class="section-title">D. KEGIATAN EKSTRAKURIKULER</div>
        <table class="content-table">
          <thead>
            <tr>
              <th width="5%">No</th>
              <th width="40%">Nama Kegiatan</th>
              <th width="15%">Nilai</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${renderExtracurriculars(data.body.extracurriculars)}
          </tbody>
        </table>

        <!-- E. ORGANISASI SISWA -->
        <div class="section-title">E. ORGANISASI SISWA (OSIS)</div>
        <table class="content-table">
          <thead>
            <tr>
              <th width="5%">No</th>
              <th width="40%">Jabatan / Posisi</th>
              <th width="15%">Nilai</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${renderOrganizations(data.body.organizations || [])}
          </tbody>
        </table>

        <!-- F. PRESTASI -->
        <div class="section-title">F. PRESTASI</div>
        <table class="content-table">
          <thead>
            <tr>
              <th width="5%">No</th>
              <th width="40%">Jenis Prestasi</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${renderAchievements(data.body.achievements)}
          </tbody>
        </table>

        <!-- G. KETIDAKHADIRAN -->
        <div class="section-title">G. KETIDAKHADIRAN</div>
        <table class="attendance-table">
          <tr>
            <td width="40%">Sakit</td>
            <td>: ${sick} hari</td>
          </tr>
          <tr>
            <td>Izin</td>
            <td>: ${permission} hari</td>
          </tr>
          <tr>
            <td>Tanpa Keterangan</td>
            <td>: ${absent} hari</td>
          </tr>
        </table>

        <!-- H. CATATAN WALI KELAS -->
        <div class="section-title">H. CATATAN WALI KELAS</div>
        <div class="note-box">
          ${data.body.homeroomNote || '-'}
        </div>

        <!-- I. TANGGAPAN ORANG TUA/WALI -->
        <div class="section-title">I. TANGGAPAN ORANG TUA/WALI</div>
        <div class="note-box">
          <br><br>
        </div>

        ${isSat ? `
        <div class="keputusan-box" style="margin-top: 8px;">
            <strong>Keputusan:</strong><br>
            Berdasarkan pencapaian kompetensi pada semester 1 dan 2, peserta didik ditetapkan:<br>
            <div style="margin-top: 5px; margin-left: 10px;">
                [ &nbsp; ] Naik ke Kelas ........... <br>
                [ &nbsp; ] Tinggal di Kelas ...........
            </div>
        </div>
        ` : ''}

        <div class="footer">
          <div class="signature-row">
            <div class="signature-box">
              Mengetahui<br>
              ${data.footer.signatures.parent.title},
              <div class="signature-space"></div>
              _____________________
            </div>
            
            <div class="signature-box">
               ${resolvedPrintPlace}, ${resolvedPrintDate}<br>
               ${data.footer.signatures.homeroom.title},
               <div class="signature-space"></div>
               <u style="font-weight: bold;">${data.footer.signatures.homeroom.name}</u><br>
            </div>
          </div>

          <div class="signature-center">
            Menyetujui<br>
            Kepala ${data.header.schoolName}
            <div class="signature-space"></div>
            <u style="font-weight: bold;">${data.footer.signatures.principal?.name || '.........................'}</u><br>
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
                        Cetak Rapor 2
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
        title="Print Rapor Halaman 2"
      />
    </div>
  );
};

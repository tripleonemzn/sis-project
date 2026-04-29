import React, { useState, useEffect } from 'react';
import PrintLayout from './PrintLayout';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { internshipService } from '../../services/internship.service';
import { userService } from '../../services/user.service';
import { Loader2, AlertCircle, Printer, X } from 'lucide-react';

type PklPrintStudent = {
  id?: number;
  name: string;
  nis?: string;
  className?: string;
  studentClass?: {
    name?: string;
  };
};

const PklLetterPrint: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const normalizedInternshipId = Number(id);
  const hasValidInternshipId = Number.isInteger(normalizedInternshipId) && normalizedInternshipId > 0;

  // Fungsi pembantu untuk memformat tanggal dengan aman
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const formatDateDisplay = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return '-';
    }
  };

  // 1. Ambil config dari localStorage secara INSTAN (sebelum render pertama)
  const savedConfig = React.useMemo(() => {
    const saved = localStorage.getItem(`pkl_print_config_${id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        console.log("DEBUG: Config loaded from localStorage:", parsed);
        return parsed;
      } catch (e) {
        console.error("DEBUG: Failed to parse saved config", e);
      }
    }
    return null;
  }, [id]);

  // 2. Inisialisasi state LANGSUNG dengan data dari config (jika ada)
  const [letterNumber, setLetterNumber] = useState(savedConfig?.letterNumber || '');
  const [attachment] = useState(savedConfig?.attachment || '1 (Satu) Lembar');
  const [subject] = useState(savedConfig?.subject || 'PERMOHONAN PRAKTIK KERJA LAPANGAN (PKL)');
  const [letterDate] = useState(savedConfig?.date || savedConfig?.letterDate || new Date().toISOString().split('T')[0]);
  const [companyName, setCompanyName] = useState(savedConfig?.companyName || '');
  const [companyAddress, setCompanyAddress] = useState(savedConfig?.companyAddress || 'Di Tempat');
  const [recipientName, setRecipientName] = useState(savedConfig?.recipientName || '');
  const [openingText, setOpeningText] = useState(savedConfig?.openingText || '');
  const [closingText] = useState(savedConfig?.closingText || 'Demikian permohonan ini kami sampaikan, atas perhatian dan kerja sama Bapak / Ibu kami ucapkan terima kasih.');
  const [students] = useState<PklPrintStudent[]>(() => {
    const mainStudent = savedConfig?.student;
    if (mainStudent) {
      return [{
        id: mainStudent.id,
        name: mainStudent.name,
        nis: mainStudent.nis,
        className: mainStudent.studentClass?.name || mainStudent.className || '-'
      }];
    }
    return [];
  });
  const [contactPersons] = useState<{ name: string; phone: string }[]>(savedConfig?.contactPersons || []);
  const [startDate, setStartDate] = useState(formatDate(savedConfig?.startDate));
  const [endDate, setEndDate] = useState(formatDate(savedConfig?.endDate));
  const [signatureSpace] = useState(savedConfig?.signatureSpace || 5);
  const [useBarcode] = useState(savedConfig?.useBarcode || false);

  const { data: internshipData, isLoading: isLoadingInternship, error: internshipError } = useQuery({
    queryKey: ['internship-detail-print', normalizedInternshipId],
    queryFn: () => internshipService.getInternshipDetail(normalizedInternshipId),
    enabled: hasValidInternshipId,
  });

  const { data: principalData, isLoading: isLoadingPrincipal } = useQuery({
    queryKey: ['active-principal'],
    queryFn: () => userService.getUsers({ role: 'PRINCIPAL', limit: 1 }),
  });

  const { data: verificationQr } = useQuery({
    queryKey: ['pkl-letter-verification-qr', normalizedInternshipId, letterDate, letterNumber, companyName],
    enabled: useBarcode && hasValidInternshipId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (letterDate) params.set('date', letterDate);
      if (letterNumber) params.set('letterNumber', letterNumber);
      if (companyName) params.set('companyName', companyName);
      const response = await fetch(`/api/public/pkl-letters/qr/${normalizedInternshipId}?${params.toString()}`);
      if (!response.ok) {
        throw new Error('QR verifikasi surat PKL gagal dibuat.');
      }
      const payload = await response.json();
      return payload?.data as { qrDataUrl: string; verificationUrl: string };
    },
    retry: false,
  });

  const internship = internshipData?.data?.data || internshipData?.data;
  const principal = principalData?.data?.[0];
  const isLoading = isLoadingInternship || isLoadingPrincipal;
  const error = internshipError;

  // Render Loader hanya jika benar-benar TIDAK ADA data sama sekali (baik dari URL/localStorage maupun API)
  const hasConfigData = !!(savedConfig && savedConfig.companyName && (savedConfig.student || (savedConfig.colleagues && savedConfig.colleagues.length > 0)));
  const showLoader = isLoading && !hasConfigData;

  // Sync state dengan data dari database jika config tidak lengkap
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    console.log("DEBUG: useEffect sync running", { internship: !!internship, savedConfig: !!savedConfig });
    
    if (internship || savedConfig) {
      // Prioritas data: savedConfig (Modal) > internship (DB)
      
      if (!letterNumber) {
        setLetterNumber(savedConfig?.letterNumber || internship?.letterNumber || `421.5/PKL/SMK/${new Date().getFullYear()}`);
      }
      
      // FIX: Paksa update jika companyName masih kosong tapi internship ada
      if (!companyName || companyName === '') {
        const cName = savedConfig?.companyName || internship?.companyName;
        if (cName) setCompanyName(cName);
      }
      
      if (!companyAddress || companyAddress === 'Di Tempat') {
        const cAddr = savedConfig?.companyAddress || internship?.companyAddress;
        if (cAddr) setCompanyAddress(cAddr || 'Di Tempat');
      }

      if (!recipientName || recipientName === '') {
        const rName = savedConfig?.recipientName || internship?.mentorName;
        if (rName) setRecipientName(rName);
      }

      if (!startDate || startDate === '') {
        const sDate = savedConfig?.startDate || internship?.startDate;
        if (sDate) setStartDate(formatDate(sDate));
      }

      if (!endDate || endDate === '') {
        const eDate = savedConfig?.endDate || internship?.endDate;
        if (eDate) setEndDate(formatDate(eDate));
      }

      if (!openingText || openingText === '') {
        const academicYearName = savedConfig?.academicYear?.name || internship?.academicYear?.name || '2025/2026';
        setOpeningText(`Sesuai dengan Kurikulum Merdeka untuk Sekolah Menengah Kejuruan (SMK) Karya Guna Bhakti 2 diwajibkan untuk melaksanakan Program Praktik Kerja Lapangan pada semester IV Tahun Ajaran ${academicYearName} bagi siswa/i tingkat XI (Sebelas).
Kepala SMK Karya Guna Bhakti 2 Kota Bekasi mengajukan permohonan siswa/i kami untuk dapat diberikan kesempatan melaksanakan Praktik Kerja Lapangan pada Perusahaan / Instansi yang Bapak / Ibu pimpin.`);
      }

      // Inisialisasi daftar siswa dengan logika yang lebih kuat
      // Untuk cetak INDIVIDU, kita abaikan colleagues dan hanya ambil pengaju utama
      const mainStudent = savedConfig?.student || internship?.student;
      if (mainStudent && students.length === 0) {
        // Karena students adalah state, kita tidak bisa mengandalkan penimpaan jika tidak ada setter
        // Namun di cetak individu, kita ingin data ini STATIS dari awal
        console.log("DEBUG: Individual print student locked to:", mainStudent.name);
      }
    }
  }, [
    internship,
    savedConfig,
    letterNumber,
    companyName,
    companyAddress,
    recipientName,
    startDate,
    endDate,
    openingText,
    students.length,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-print effect - Gunakan delay yang cukup
  useEffect(() => {
    // Hanya pemicu print jika data esensial SUDAH TERISI
    const isDataReady = (companyName || internship?.companyName) && (students.length > 0 || internship?.student);
    
    if (!isLoading && (internship || savedConfig) && isDataReady) {
      console.log("DEBUG: Data ready, starting print timer...");
      const timer = setTimeout(() => {
        try {
          // Double check before printing
          if (document.querySelector('.text-red-500')) {
             console.warn("DEBUG: Found error text on page, delaying print...");
             return;
          }
          console.log("DEBUG: Executing window.print()");
          window.focus();
          window.print();
        } catch (err) {
          console.error("DEBUG: Print failed:", err);
        }
      }, 800); // Reduced from 2.5s to 800ms for faster response
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, internship, savedConfig, companyName, students]);

  if (showLoader) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-800">Memuat Data Surat...</h1>
        </div>
      </div>
    );
  }

  if (error && !hasConfigData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-red-50">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-red-900">Gagal Memuat Data</h1>
        <p className="text-red-700 mt-2">Data pengajuan PKL tidak ditemukan atau terjadi kesalahan sistem.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Coba Lagi
        </button>
      </div>
    );
  }
 
   return (
    <div className="bg-[#525659] min-h-screen">
      {/* Slim & Professional Control Header */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-6 py-3 z-[99999] shadow-md">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-600 rounded-lg shadow-sm">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 leading-none uppercase tracking-tight">Pratinjau Surat PKL</h2>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-1">Dokumen Siap Dicetak</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => {
                console.log("Cetak diklik");
                window.focus();
                window.print();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg transition-all flex items-center gap-2 font-black text-sm shadow-[0_4px_0_rgb(30,64,175)] active:shadow-none active:translate-y-[4px] cursor-pointer"
              style={{ pointerEvents: 'auto', position: 'relative', zIndex: 100000 }}
            >
              <Printer className="w-4 h-4" />
              CETAK SEKARANG
            </button>
            
            <button 
              onClick={() => window.close()}
              className="bg-white border-2 border-gray-200 text-gray-500 px-4 py-2.5 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-bold text-sm active:scale-95 flex items-center gap-2 cursor-pointer"
              style={{ pointerEvents: 'auto' }}
            >
              <X className="w-4 h-4" />
              TUTUP
            </button>
          </div>
        </div>
      </div>

      <PrintLayout title={`Surat PKL - ${companyName}`}>
        {/* THE ACTUAL LETTER */}
        <div className="text-[#000] mx-4" style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: '14px', lineHeight: '1.2' }}>
          {/* KOP SURAT */}
          <div className="flex items-center justify-between border-b-4 border-double border-black pb-1 mb-4">
            <div className="w-[85px] flex justify-center items-center">
              <img src="/logo-yayasan.png" alt="Logo Yayasan" className="w-[85px] h-auto" />
            </div>
            <div className="text-center flex-1 px-1" style={{ lineHeight: '1.2', fontFamily: "'Times New Roman', Times, serif" }}>
              <h3 className="m-0 font-bold tracking-tight uppercase" style={{ fontSize: '14px' }}>YAYASAN PENDIDIKAN AL AMIEN</h3>
              <h2 className="m-0 font-bold whitespace-nowrap uppercase" style={{ fontSize: '14px' }}>SEKOLAH MENENGAH KEJURUAN (SMK) KARYA GUNA BHAKTI 2</h2>
              <p className="m-0 font-normal" style={{ fontSize: '13px' }}>Teknik Komputer dan Jaringan  |  Manajemen Perkantoran  |  Akuntansi</p>
              <p className="m-0" style={{ fontSize: '12px' }}>NSS : 342026504072  |  NPSN : 20223112</p>
              <p className="mt-1 mb-1 font-bold uppercase" style={{ fontSize: '14px' }}>STATUS TERAKREDITASI "A"</p>
              <p className="m-0" style={{ fontSize: '10px' }}>Kampus A : Jl. Anggrek 1 RT/RW. 002/016 Duren Jaya Bekasi Timur Telp. (021) 883525851</p>
              <p className="m-0" style={{ fontSize: '10px' }}>Kampus B : Jl. H. Ujan RT/RW. 005/007 Duren Jaya Bekasi Timur Telp. 081211625618</p>
              <p className="m-0" style={{ fontSize: '10px' }}>Email : informasi@smkkgb2.sch.id  |  Website : www.smkkgb2.sch.id</p>
            </div>
            <div className="w-[85px] flex justify-center items-center">
              <img src="/logo-kgb2.png" alt="Logo KGB2" className="w-[85px] h-auto" />
            </div>
          </div>

          <div className="px-16">
            {/* Header Surat */}
            <div className="flex mb-8">
            <div className="w-[95px] flex flex-col gap-1">
              <div>Nomor</div>
              <div>Lampiran</div>
              <div>Perihal</div>
            </div>
            <div className="flex flex-col gap-1">
              <div>: {letterNumber}</div>
              <div>: {attachment}</div>
              <div className="font-bold underline">: {subject}</div>
            </div>
            <div className="ml-auto">
              Bekasi, {new Date(letterDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Alamat Tujuan */}
          <div className="ml-[95px] mb-8">
            <div>Kepada Yth,</div>
            <div className="font-bold uppercase">Pimpinan / HRD {companyName || internship?.companyName || '(Nama Perusahaan Belum Terisi)'}</div>
            {recipientName && (
              <div>Up. {recipientName}</div>
            )}
            <div className="max-w-[400px] whitespace-pre-wrap">{companyAddress || internship?.companyAddress || 'Di Tempat'}</div>
          </div>

          {/* Body Surat */}
          <div className="space-y-4 text-justify ml-[95px]">
            <p>Dengan hormat,</p>
            <div className="whitespace-pre-wrap">
              {openingText}
            </div>
          </div>

          {/* Tabel Siswa */}
          <div className="my-6 ml-[95px]">
            <table className="w-full border-collapse border border-black text-center">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-black py-2 px-3 w-12">No</th>
                  <th className="border border-black py-2 px-3">Nama Siswa</th>
                  <th className="border border-black py-2 px-3">NIS</th>
                  <th className="border border-black py-2 px-3">Kelas</th>
                </tr>
              </thead>
              <tbody>
                {students.length > 0 ? (
                  students.map((s, index) => (
                    <tr key={index}>
                      <td className="border border-black py-2 px-3">{index + 1}</td>
                      <td className="border border-black py-2 px-3 font-bold text-left uppercase">{s.name}</td>
                      <td className="border border-black py-2 px-3">{s.nis || '-'}</td>
                      <td className="border border-black py-2 px-3">{s.className || '-'}</td>
                    </tr>
                  ))
                ) : (
                  internship?.student ? (
                    <tr>
                      <td className="border border-black py-2 px-3">1</td>
                      <td className="border border-black py-2 px-3 font-bold text-left uppercase">{internship.student.name}</td>
                      <td className="border border-black py-2 px-3">{internship.student.nis || '-'}</td>
                      <td className="border border-black py-2 px-3">{internship.student.studentClass?.name || internship.student.className || '-'}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={4} className="border border-black py-4 italic text-gray-500 text-center font-bold text-red-500">
                        DATA SISWA TIDAK DITEMUKAN - HARAP REFRESH HALAMAN (F5)
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Rencana Pelaksanaan */}
          <div className="ml-[95px] mb-6 font-bold">
            <p>Rencana Pelaksanaan PKL: {
              startDate && startDate !== '' 
                ? formatDateDisplay(startDate) 
                : formatDateDisplay(internship?.startDate)
            } s.d. {
              endDate && endDate !== '' 
                ? formatDateDisplay(endDate) 
                : formatDateDisplay(internship?.endDate)
            }</p>
          </div>

          {/* Penutup */}
          <div className="text-justify mb-12 ml-[95px]">
            <div className="whitespace-pre-wrap">{closingText}</div>
          </div>

          {/* Tanda Tangan */}
          <div className="flex justify-end text-right">
            <div className="w-[250px] text-left">
              <p className="mb-0">Hormat Kami,</p>
              <p className="mb-0">Kepala Sekolah</p>
              
              <div style={{ 
                height: useBarcode ? 'auto' : `${signatureSpace * 20}px`, 
                margin: useBarcode ? '10px 0' : '0',
                display: 'flex',
                alignItems: 'center'
              }}>
                {useBarcode && verificationQr?.qrDataUrl && (
                  <img 
                    src={verificationQr.qrDataUrl}
                    alt="QR Verifikasi Surat PKL"
                    className="w-[100px] h-[100px]" 
                  />
                )}
              </div>
              {useBarcode && verificationQr?.verificationUrl && (
                <div className="mb-2 -mt-1 max-w-[220px] break-all text-[8px] italic leading-tight text-slate-600">
                  Verifikasi: {verificationQr.verificationUrl}
                </div>
              )}

              <p className="font-bold underline mb-0">{principal?.name || 'H. IYAN RASTIYAN, S.Pd., M.Pd'}</p>
              <p className="mt-0 text-sm">NUPTK. {principal?.nuptk || '-'}</p>
            </div>
          </div>

          {/* CP Section */}
          <div className="mt-8">
            <p className="font-bold underline mb-2">Contact Person:</p>
            <div className="flex flex-wrap gap-x-12 gap-y-4 mt-2">
              {contactPersons.map((cp, idx) => (
                <div key={idx} className="flex flex-col">
                  <div className="font-bold text-[13px]">{cp.name}</div>
                  <div className="text-[12px]">{cp.phone}</div>
                </div>
              ))}
              {contactPersons.length === 0 && (
                <div className="text-gray-400 italic text-[12px]">Tidak ada contact person yang dicantumkan.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      </PrintLayout>
    </div>
  );
};

export default PklLetterPrint;

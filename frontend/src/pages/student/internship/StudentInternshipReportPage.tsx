import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { internshipService } from '../../../services/internship.service';
import { 
  Book, 
  FileCheck, 
  Building2, 
  User, 
  FileText, 
  Upload, 
  Printer, 
  Loader2, 
  AlertCircle,
  Save,
  Pencil
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { uploadService } from '../../../services/upload.service';
import { SchoolApprovalPrintDocument } from '../../../components/reports/SchoolApprovalPrintDocument';

type InternshipOfficials = {
  activeAcademicYear?: { name?: string | null } | null;
  headOfMajor?: { name?: string | null; nuptk?: string | null } | null;
  wakasekHumas?: { name?: string | null; nuptk?: string | null } | null;
  principal?: { name?: string | null; nuptk?: string | null } | null;
};

type InternshipStudent = {
  id?: number;
  name?: string;
  nis?: string;
  nisn?: string | null;
  studentClass?: { name?: string; major?: { name?: string } | null } | null;
};

type InternshipRecord = {
  id: number;
  companyName?: string;
  companyAddress?: string | null;
  mentorName?: string | null;
  mentorPhone?: string | null;
  reportUrl?: string | null;
  academicYear?: { name?: string | null } | null;
  student?: InternshipStudent | null;
  examiner?: { name?: string | null; nuptk?: string | null } | null;
  officials?: InternshipOfficials;
  reportTitle?: string | null;
  schoolApprovalDate?: string | null;
  lastActiveTab?: string | null;
};

const PrintCoverTemplate = ({
  internship,
  title,
  customCompanyName,
  customAcademicYear,
}: {
  internship: InternshipRecord;
  title: string;
  customCompanyName?: string;
  customAcademicYear?: string;
}) => {
  // Modified to be always INDIVIDUAL (Ignore colleagues/grouping)
  const students: InternshipStudent[] = internship.student ? [internship.student] : [];

  return (
    <div className="bg-white text-black" style={{ 
      width: '210mm', 
      minHeight: '297mm', 
      padding: '4cm 3cm 3cm 4cm', // Top Right Bottom Left (Standard Margin)
      fontFamily: '"Times New Roman", Times, serif',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '3cm' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14pt', lineHeight: '1.5' }}>
          <div>LAPORAN</div>
          <div>PRAKTIK KERJA LAPANGAN</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2cm' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14pt', marginBottom: '10px' }}>{title}</div>
        <div style={{ fontWeight: 'bold', fontSize: '14pt' }}>di {customCompanyName || internship.companyName}</div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2cm' }}>
        <div style={{ fontSize: '12pt', marginBottom: '5px', fontWeight: 'bold' }}>Diajukan Sebagai Salah Satu Syarat Kelulusan</div>
        <div style={{ 
          display: 'inline-block', 
          marginTop: '5px',
          fontWeight: 'bold'
        }}>
          Tahun Ajaran {customAcademicYear || internship.academicYear?.name || new Date().getFullYear()}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2cm', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
         <img src="/logo-kgb2.png" alt="Logo Sekolah" style={{ width: '150px', height: 'auto', objectFit: 'contain' }} />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '3cm' }}>
         <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Oleh :</div>
         <table style={{ 
           margin: '0 auto', 
           width: '100%', 
           maxWidth: '550px',
           borderCollapse: 'collapse', 
           fontSize: '12pt' 
         }}>
           <thead>
             <tr>
               <th style={{ padding: '5px', textAlign: 'center', width: '40px' }}>No</th>
               <th style={{ padding: '5px', textAlign: 'left' }}>Nama Siswa</th>
               <th style={{ padding: '5px', textAlign: 'center' }}>NIS</th>
               <th style={{ padding: '5px', textAlign: 'center' }}>Kelas</th>
             </tr>
           </thead>
           <tbody>
              {students.map((student, index: number) => {
                return (
                  <tr key={index}>
                    <td style={{ textAlign: 'center', padding: '5px' }}>{index + 1}.</td>
                    <td style={{ textAlign: 'left', padding: '5px' }}>{student.name}</td>
                    <td style={{ textAlign: 'center', padding: '5px' }}>{student.nis}</td>
                    <td style={{ textAlign: 'center', padding: '5px' }}>{student.studentClass?.name}</td>
                  </tr>
                );
              })}
           </tbody>
         </table>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14pt', lineHeight: '1.5' }}>
        <div style={{ textTransform: 'uppercase' }}>{internship.student?.studentClass?.major?.name || 'TEKNIK KOMPUTER DAN JARINGAN'}</div>
        <div style={{ textTransform: 'uppercase' }}>SMKS KARYA GUNA BHAKTI 2</div>
        <div>TERAKREDITASI "A" (UNGGUL)</div>
        <div style={{ marginTop: '10px' }}>{new Date().getFullYear()}</div>
      </div>
    </div>
  );
};

// View Component for Screen Display Only (No Print Styles)
const SchoolApprovalView = ({
  internship,
  title,
  customDate,
  setCustomDate,
}: {
  internship: InternshipRecord;
  title: string;
  customDate: string;
  setCustomDate: (date: string) => void;
}) => {
  const { officials } = internship;
  const activeYearName = officials?.activeAcademicYear?.name || new Date().getFullYear().toString();
  
  // Logic for Promoted Year (XI -> +1)
  const getPromotedYear = (baseYear: string, className: string) => {
    if (!baseYear) return baseYear;
    const isXI = className && className.trim().toUpperCase().startsWith('XI') && !className.trim().toUpperCase().startsWith('XII');
    if (isXI) {
       const parts = baseYear.split('/');
       if (parts.length === 2) {
         const start = parseInt(parts[0]);
         const end = parseInt(parts[1]);
         if (!isNaN(start) && !isNaN(end)) {
           return `${start + 1}/${end + 1}`;
         }
       }
    }
    return baseYear;
  };

  const promotedYearName = getPromotedYear(
    internship.academicYear?.name || '',
    internship.student?.studentClass?.name || '',
  );

  return (
    <div className="bg-white text-black p-8 mx-auto shadow-sm" style={{ 
      width: '210mm', 
      minHeight: '297mm', 
      padding: '2cm 2cm 2cm 3cm', // Standard margins
      fontFamily: '"Times New Roman", Times, serif',
      boxSizing: 'border-box',
    }}>
      <div className="text-center font-bold text-lg mb-6" style={{ lineHeight: '1.5' }}>
        <div className="text-xl mb-1">LEMBAR PENGESAHAN SEKOLAH</div>
        <div className="mb-1">LAPORAN PRAKTIK KERJA LAPANGAN</div>
        <div>Tahun Ajaran {activeYearName}</div>
      </div>

      <div className="text-center font-bold text-lg mb-8" style={{ lineHeight: '1.5' }}>
        <div className="mb-2 uppercase">{title}</div>
        <div>Diajukan Sebagai Salah Satu Syarat Kelulusan</div>
        <div>Tahun Ajaran {promotedYearName}</div>
      </div>

      <div className="mb-8 font-serif text-lg">
        <div className="flex items-center gap-2 justify-center">
          <span>Pada Tanggal:</span>
          <input 
            type="text" 
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="border-b border-black outline-none px-2 w-48 text-center font-serif bg-transparent focus:bg-blue-50 focus:border-blue-500 transition-colors"
            placeholder="... ... ..."
          />
        </div>
      </div>

      <div className="text-center font-bold text-lg mb-12">
        Mengesahkan:
      </div>

      {/* Signatories Grid */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-24 text-center font-serif">
        {/* Row 1 */}
        <div>
          <div className="font-bold mb-20">Kepala Bidang Keahlian</div>
          <div className="font-bold underline">{officials?.headOfMajor?.name || '.........................'}</div>
          <div>NUPTK. {officials?.headOfMajor?.nuptk || '-'}</div>
        </div>
        <div>
          <div className="font-bold mb-20">Penguji Sidang</div>
          <div className="font-bold underline">{internship.examiner?.name || '.........................'}</div>
          <div>NUPTK. {internship.examiner?.nuptk || '-'}</div>
        </div>

        {/* Row 2 */}
        <div>
           <div className="font-bold mb-20">Wakil Kepala Sekolah<br/>Bidang Hubungan Industri</div>
           <div className="font-bold underline">{officials?.wakasekHumas?.name || '.........................'}</div>
           <div>NUPTK. {officials?.wakasekHumas?.nuptk || '-'}</div>
        </div>
        <div>
           <div className="font-bold mb-20">Kepala SMKS Karya Guna Bhakti 2</div>
           <div className="font-bold underline">{officials?.principal?.name || '.........................'}</div>
           <div>NUPTK. {officials?.principal?.nuptk || '-'}</div>
        </div>
      </div>
    </div>
  );
};

const StudentInternshipReportPage = () => {
  // State Management (Database synced)
  const [activeTab, setActiveTab] = useState('cover');
  const [internship, setInternship] = useState<InternshipRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Cover Edit State
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [reportTitle, setReportTitle] = useState('Judul Laporan'); // Changed default
  const [savingTitle, setSavingTitle] = useState(false);

  // Additional Editable Fields State
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [approvalDate, setApprovalDate] = useState(''); // Date for school approval form

  // Helper to save active tab to DB
  const handleTabChange = async (tabId: string) => {
    setActiveTab(tabId);
    try {
      // Fire and forget update
      await internshipService.updateMyInternship({ lastActiveTab: tabId });
    } catch (err) {
      console.error('Failed to save active tab state', err);
    }
  };

  // Debounced save for approval date
	  useEffect(() => {
	    const timeoutId = setTimeout(async () => {
	      if (internship && approvalDate !== internship.schoolApprovalDate) {
	        try {
	           await internshipService.updateMyInternship({ schoolApprovalDate: approvalDate });
	           // Update local internship reference to avoid re-triggering if no change
	           setInternship((prev) => (prev ? { ...prev, schoolApprovalDate: approvalDate } : prev));
	        } catch (err) {
	          console.error('Failed to save approval date', err);
	        }
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [approvalDate, internship]);

  // Print State (Iframe Portal)
  const [isPrinting, setIsPrinting] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const [iframeBody, setIframeBody] = useState<HTMLElement | null>(null);
  
  // Helper for academic year logic
  const getReportAcademicYear = (currentYearName: string, className: string) => {
    if (!currentYearName) return new Date().getFullYear().toString();
    
    // Logic: XI -> Year+1, XII -> Year
    const isXI = className && className.trim().toUpperCase().startsWith('XI') && !className.trim().toUpperCase().startsWith('XII');
    
    if (isXI) {
      const parts = currentYearName.split('/');
      if (parts.length === 2) {
        const start = parseInt(parts[0]);
        const end = parseInt(parts[1]);
        if (!isNaN(start) && !isNaN(end)) {
          return `${start + 1}/${end + 1}`;
        }
      }
    }
    return currentYearName;
  };

  // Fetch internship data
  const fetchInternship = useCallback(async () => {
    try {
      setLoading(true);
      const res = await internshipService.getMyInternship();
      if (res.data.success && res.data.data?.internship) {
        const { internship: internshipData, officials } = res.data.data;
        const data = { ...internshipData, officials };
        
        setInternship(data);

        if (data.reportTitle) {
          setReportTitle(data.reportTitle);
        }
        if (data.schoolApprovalDate) {
          setApprovalDate(data.schoolApprovalDate);
        }
        if (data.lastActiveTab) {
          setActiveTab(data.lastActiveTab);
        }
        setCompanyName(data.companyName || '');
        
        const yearName = data.academicYear?.name || new Date().getFullYear().toString();
        const className = data.student?.studentClass?.name || '';
        setAcademicYear(getReportAcademicYear(yearName, className));
      }
	    } catch (err: unknown) {
	      console.error('Error fetching internship:', err);
	      setError('Gagal memuat data PKL');
		    } finally {
	      setLoading(false);
	    }
	  }, []);

	  useEffect(() => {
	    fetchInternship();
	  }, [fetchInternship]);

	  // Set iframe body when ref is available
	  useEffect(() => {
	    if (printFrameRef.current?.contentDocument?.body) {
	      setIframeBody(printFrameRef.current.contentDocument.body);
	    }
	  }, [printFrameRef]);

  const handlePrint = () => {
    if (!printFrameRef.current?.contentWindow) return;
    
    setIsPrinting(true);
    
    // Allow time for render
    setTimeout(() => {
        printFrameRef.current?.contentWindow?.print();
        setIsPrinting(false);
    }, 500);
  };

  const handleReportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    if (!internship) return;

    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB');
      return;
    }

    setUploading(true);
    try {
      const uploadRes = await uploadService.uploadInternshipFile(file);
      await internshipService.uploadReport(internship.id, uploadRes.url);
      toast.success('Laporan PKL berhasil diupload!');
      fetchInternship();
	    } catch (error: unknown) {
	      const message =
	        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
	        (error instanceof Error ? error.message : '') ||
	        'Gagal mengupload laporan';
	      toast.error(message);
	    } finally {
	      setUploading(false);
	    }
  };

  const handleSaveTitle = async () => {
    if (!internship) return;
    setSavingTitle(true);
    try {
      await internshipService.updateMyInternship({
        reportTitle: reportTitle
      });
      toast.success('Judul laporan berhasil disimpan');
      setIsEditingTitle(false);
      // Update local internship state
      setInternship({ ...internship, reportTitle });
	    } catch (error: unknown) {
	      toast.error('Gagal menyimpan judul laporan');
	      console.error(error);
	    } finally {
      setSavingTitle(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!internship) return;
    setSavingMeta(true);
    try {
      await internshipService.updateMyInternship({
        companyName: companyName,
      });
      toast.success('Data cover berhasil disimpan');
      setIsEditingMeta(false);
      setInternship({ ...internship, companyName });
	    } catch (error: unknown) {
	      toast.error('Gagal menyimpan data');
	      console.error(error);
	    } finally {
      setSavingMeta(false);
    }
  };

  const tabs = [
    { id: 'cover', label: 'Cover Laporan', icon: Book },
    { id: 'school-approval', label: 'Lembar Pengesahan Sekolah', icon: FileCheck },
    { id: 'industry-approval', label: 'Lembar Pengesahan Industri', icon: FileCheck },
    { id: 'school-profile', label: 'Profile Sekolah', icon: Building2 },
    { id: 'industry-profile', label: 'Identitas Industri', icon: Building2 },
    { id: 'biodata', label: 'Biodata', icon: User },
    { id: 'statement', label: 'Surat Pernyataan', icon: FileText },
    { id: 'document', label: 'Dokumen Laporan', icon: Upload },
  ];

  const renderContent = () => {
    if (!internship) {
      return (
        <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-yellow-900">Belum Ada Data PKL</h3>
          <p className="text-yellow-700 mt-2">Anda belum memiliki data PKL yang aktif. Silakan ajukan PKL terlebih dahulu.</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'school-approval':
        return (
          <div className="space-y-6">
             <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h3 className="text-xl font-bold flex items-center gap-2">
                     <FileCheck className="w-6 h-6 text-blue-600" />
                     Lembar Pengesahan Sekolah
                   </h3>
                   <p className="text-gray-600 mt-1">
                     Pastikan data di bawah ini sudah sesuai.
                   </p>
                 </div>
                 <button
                    onClick={handlePrint}
                    disabled={isPrinting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                 >
                    {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    Cetak
                 </button>
               </div>
               
               <div className="bg-gray-500 p-8 rounded-xl overflow-auto flex justify-center">
                 <SchoolApprovalView 
                    internship={internship} 
                    title={reportTitle} 
                    customDate={approvalDate}
                    setCustomDate={setApprovalDate}
                 />
               </div>
             </div>
          </div>
        );

      case 'cover':
        return (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                   <h3 className="text-xl font-bold flex items-center gap-2">
                    <Book className="w-6 h-6 text-blue-600" />
                    Cover Laporan PKL
                  </h3>
                  <p className="text-gray-600 mt-1">
                    Sesuaikan judul laporan di bawah ini sebelum mencetak cover.
                  </p>
                </div>
                {/* Print button removed as per user request */}
              </div>

              {/* Editable Title Section */}
              <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">Judul Laporan</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    {isEditingTitle ? (
                      <input
                        type="text"
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                        placeholder="Masukkan Judul Laporan..."
                      />
                    ) : (
                      <div className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-800 font-medium">
                        {reportTitle}
                      </div>
                    )}
                  </div>
                  {isEditingTitle ? (
                    <button
                      onClick={handleSaveTitle}
                      disabled={savingTitle}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Simpan
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit Judul
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  *Judul laporan akan dicetak sesuai dengan penulisan yang Anda inputkan.
                </p>
              </div>

              {/* Editable Meta Section */}
              <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-bold text-gray-800">Data Cover Laporan</h4>
                  {!isEditingMeta ? (
                    <button
                      onClick={() => setIsEditingMeta(true)}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit Data
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveMeta}
                      disabled={savingMeta}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Simpan Perubahan
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nama Instansi / Perusahaan</label>
                    {isEditingMeta ? (
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                      />
                    ) : (
                      <div className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-800 font-medium">
                        {companyName}
                      </div>
                    )}
                  </div>
                  {/* Tahun Ajaran removed from form as per user request (logic handled automatically) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nama Siswa</label>
                    <div className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 font-medium cursor-not-allowed">
                      {internship.student?.name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">NIS / NISN</label>
                    <div className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 font-medium cursor-not-allowed">
                      {internship.student?.nis} / {internship.student?.nisn}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Kelas</label>
                    <div className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 font-medium cursor-not-allowed">
                      {internship.student?.studentClass?.name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Kompetensi Keahlian</label>
                    <div className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 font-medium cursor-not-allowed">
                      {internship.student?.studentClass?.major?.name || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Preview (Scaled Down) */}
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-100 overflow-hidden flex justify-center">
                 <div className="scale-[0.6] origin-top shadow-lg">
                    <PrintCoverTemplate 
                      internship={internship} 
                      title={reportTitle} 
                      customCompanyName={companyName}
                      customAcademicYear={academicYear}
                    />
                 </div>
              </div>
            </div>
          </div>
        );
      
      case 'industry-approval':
        return (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-purple-600" />
              Lembar Pengesahan Industri
            </h3>
            <p className="text-gray-600 mb-6">
              Lembar ini harus ditandatangani oleh Pembimbing Lapangan (Mentor) dan Pimpinan Perusahaan/Instansi.
            </p>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Printer className="w-4 h-4" />
              Cetak Lembar Pengesahan Industri
            </button>
          </div>
        );

      case 'school-profile':
        return (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-orange-600" />
              Profile Sekolah
            </h3>
            <p className="text-gray-600 mb-6">
              Halaman ini berisi identitas sekolah, visi misi, dan struktur organisasi sekolah.
            </p>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Printer className="w-4 h-4" />
              Cetak Profile Sekolah
            </button>
          </div>
        );

      case 'industry-profile':
        return (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-teal-600" />
              Identitas Industri
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="text-sm text-gray-500">Nama Perusahaan</label>
                <p className="font-medium text-lg">{internship.companyName}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Alamat</label>
                <p className="font-medium text-lg">{internship.companyAddress || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Pembimbing Lapangan</label>
                <p className="font-medium text-lg">{internship.mentorName || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Kontak</label>
                <p className="font-medium text-lg">{internship.mentorPhone || '-'}</p>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Printer className="w-4 h-4" />
              Cetak Identitas Industri
            </button>
          </div>
        );

      case 'biodata':
        return (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <User className="w-6 h-6 text-indigo-600" />
              Biodata Siswa
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="text-sm text-gray-500">Nama Lengkap</label>
                <p className="font-medium text-lg">{internship.student?.name}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">NIS/NISN</label>
                <p className="font-medium text-lg">{internship.student?.nis || '-'} / {internship.student?.nisn || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Kelas</label>
                <p className="font-medium text-lg">{internship.student?.studentClass?.name || '-'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Program Keahlian</label>
                <p className="font-medium text-lg">{internship.student?.studentClass?.major?.name || '-'}</p>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Printer className="w-4 h-4" />
              Cetak Biodata
            </button>
          </div>
        );

      case 'statement':
        return (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-red-600" />
              Surat Pernyataan
            </h3>
            <p className="text-gray-600 mb-6">
              Surat pernyataan siswa untuk mematuhi tata tertib selama pelaksanaan Praktik Kerja Lapangan.
            </p>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Printer className="w-4 h-4" />
              Cetak Surat Pernyataan
            </button>
          </div>
        );

      case 'document':
        return (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Upload className="w-6 h-6 text-blue-600" />
              Dokumen Laporan Akhir
            </h3>
            
            {internship.reportUrl ? (
               <div className="bg-teal-50 p-6 rounded-lg mb-6 flex items-start gap-4">
                 <div className="p-3 bg-teal-100 rounded-lg">
                    <FileText className="w-8 h-8 text-teal-600" />
                 </div>
                 <div className="flex-1">
                    <h4 className="text-lg font-semibold text-teal-900">Laporan Telah Dikumpulkan</h4>
                    <p className="text-teal-700 mt-1 mb-4">
                      Anda sudah mengupload laporan akhir. Anda dapat melihat atau memperbarui file jika diperlukan.
                    </p>
                    <div className="flex gap-3">
                      <a 
                        href={internship.reportUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-white border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 font-medium text-sm"
                      >
                        Lihat Laporan
                      </a>
                      <div className="relative">
                        <input
                          type="file"
                          id="report-upload-update"
                          className="hidden"
                          accept=".pdf"
                          onChange={handleReportUpload}
                          disabled={uploading}
                        />
                        <label 
                           htmlFor="report-upload-update"
                           className={`px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium text-sm cursor-pointer inline-block ${uploading ? 'opacity-50' : ''}`}
                        >
                           {uploading ? 'Mengupload...' : 'Ganti File'}
                        </label>
                      </div>
                    </div>
                 </div>
               </div>
            ) : (
               <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
                 <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Upload className="w-8 h-8 text-blue-600" />
                 </div>
                 <h4 className="text-lg font-medium text-gray-900 mb-2">Upload Laporan Akhir</h4>
                 <p className="text-gray-500 max-w-md mx-auto mb-6">
                   Upload file laporan akhir lengkap (PDF) yang sudah digabungkan dari semua bab dan lampiran. Maksimal 5MB.
                 </p>
                 
                 <input
                   type="file"
                   id="report-upload"
                   className="hidden"
                   accept=".pdf"
                   onChange={handleReportUpload}
                   disabled={uploading}
                 />
                 <label 
                   htmlFor="report-upload"
                   className={`px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-2 ${uploading ? 'opacity-50' : ''}`}
                 >
                   {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                   {uploading ? 'Mengupload...' : 'Pilih File PDF'}
                 </label>
               </div>
            )}

            <div className="mt-6 bg-blue-50 p-4 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-800 font-medium">Petunjuk Penyusunan Laporan:</p>
                <ul className="list-disc list-inside text-sm text-blue-700 mt-1 space-y-1">
                  <li>Gunakan format kertas A4 dengan margin 4-4-3-3 cm.</li>
                  <li>Font Times New Roman ukuran 12pt, spasi 1.5.</li>
                  <li>Susunan laporan harus sesuai dengan urutan tab menu di atas (Cover s/d Lampiran).</li>
                  <li>Pastikan semua lembar pengesahan sudah ditandatangani dan distempel basah.</li>
                </ul>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-red-900">Terjadi Kesalahan</h3>
          <p className="text-red-700 mt-2">{error}</p>
          <button 
            onClick={fetchInternship}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Laporan PKL</h1>
        <p className="text-gray-500">Kelola dokumen dan penyusunan laporan akhir PKL</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-4 ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="text-left">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {renderContent()}
        </div>
      </div>

      {/* Hidden Print Iframe */}
      <iframe 
        ref={printFrameRef}
        className="fixed opacity-0 pointer-events-none"
        title="Print Frame"
        style={{ width: '0px', height: '0px', position: 'absolute', left: '-9999px' }}
      />

      {/* Portal Content for Print */}
      {iframeBody && internship && activeTab === 'school-approval' && createPortal(
        <SchoolApprovalPrintDocument 
           internship={internship} 
           title={reportTitle} 
           customDate={approvalDate}
        />,
        iframeBody
      )}

    </div>
  );
};

export default StudentInternshipReportPage;

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { authService } from '../../../services/auth.service';
import { CpAnalysisDocument } from '../../../components/documents/CpAnalysisDocument';
import { 
  Bot, 
  Sparkles, 
  BookOpen, 
  Target, 
  List,
  FileText,
  Plus,
  Trash2,
  Printer,
  Save,
  Edit3
} from 'lucide-react';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import type { TeacherAssignment } from '../../../services/teacherAssignment.service';
import { academicYearService } from '../../../services/academicYear.service';
import { userService } from '../../../services/user.service';
import { cpTpAnalysisService } from '../../../services/cpTpAnalysis.service';

// --- Types ---

interface AnalysisItem {
  id: string;
  competency: string; // Kompetensi (Kata Kerja)
  material: string;   // Konten/Materi
  tp: string;         // Tujuan Pembelajaran
  profiles: string[]; // Dimensi Profil Lulusan
}

interface AnalysisRow {
  id: string;
  element: string;    // Elemen
  cpText: string;     // Capaian Pembelajaran
  items: AnalysisItem[];
}

const PROFILE_DIMENSIONS = [
  "Beriman, bertakwa kepada Tuhan YME, dan berakhlak mulia",
  "Berkebinekaan global",
  "Bergotong royong",
  "Mandiri",
  "Bernalar kritis",
  "Kreatif"
];

const CpPage = () => {
  const queryClient = useQueryClient();

  const { user: contextUser } = useOutletContext<{ user: any, activeYear: any }>() || {};

  // --- Auth & Preferences ---
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  const user = contextUser || authData?.data;
  const userId = user?.id;

  const { data: userData } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => userService.getById(userId!),
    enabled: !!userId,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => userService.update(userId!, data),
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
    }
  });

  // --- State ---
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  
  // Form State
  const [element, setElement] = useState('');
  const [cpText, setCpText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);
  
  // Document State
  const [documentRows, setDocumentRows] = useState<AnalysisRow[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null); // Track editing state
  const [principalName, setPrincipalName] = useState('...................................');
  const [titimangsa, setTitimangsa] = useState(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle'); // Robust persistence guard
  
  // Ref to track latest documentRows without triggering effects
  const documentRowsRef = useRef<AnalysisRow[]>([]);
  
  // Update ref whenever documentRows changes
  useEffect(() => {
    documentRowsRef.current = documentRows;
  }, [documentRows]);
  
  // Context State
  const [academicYear, setAcademicYear] = useState<{ id: number; name: string } | null>(null);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Combined Context Selection
  const [selectedContextKey, setSelectedContextKey] = useState<string>('');
  const [selectedContext, setSelectedContext] = useState<{
    subjectId: number;
    subjectName: string;
    level: string;
    phase: 'E' | 'F';
    program?: string; // Program Keahlian
  } | null>(null);

  // --- Init ---
  useEffect(() => {
    const initData = async () => {
      try {
        const ayResponse = await academicYearService.getActive();
        const activeAy = ayResponse.data;
        setAcademicYear(activeAy);

        // Fetch Principal
        try {
          const usersRes = await userService.getAll({ role: 'PRINCIPAL', limit: 1 });
          if (usersRes.data && usersRes.data.length > 0) {
             setPrincipalName(usersRes.data[0].name);
          }
        } catch (err) {
          console.error('Failed to fetch principal', err);
        }

        if (activeAy?.id) {
          const assignResponse = await teacherAssignmentService.list({
            academicYearId: activeAy.id,
            limit: 100
          });
          setAssignments(assignResponse.data.assignments);
          if (assignResponse.data.assignments.length > 0) {
             setCurrentTeacherId(assignResponse.data.assignments[0].teacherId);
          }
        }
      } catch (e) {
        console.error('Failed to initialize page data', e);
      }
    };
    initData();
  }, []);

  // Restore preferences
  useEffect(() => {
    if (userData?.data?.preferences && assignments.length > 0 && !selectedContextKey) {
        // @ts-ignore
        const savedKey = userData.data.preferences['cp-last-context-key'];
        if (savedKey) {
            setSelectedContextKey(savedKey);
        }
    }
  }, [userData, assignments, selectedContextKey]);

  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Persistence & Loading Logic ---
  
  // 1. Load data when context changes
  useEffect(() => {
    if (!selectedContextKey || !selectedContext || !currentTeacherId || !academicYear) {
      setDocumentRows([]);
      setLoadStatus('idle');
      return;
    }

    setLoadStatus('loading'); // Disable saving while loading

    const loadData = async () => {
      try {
        const res = await cpTpAnalysisService.getAnalysis({
            teacherId: currentTeacherId,
            subjectId: selectedContext.subjectId,
            level: selectedContext.level,
            academicYearId: academicYear.id
        });
        
        // Fix: Access res.data.data because API wraps response in ApiResponse object
        const analysisData = res.data?.data;

        if (analysisData) {
            setDocumentRows(analysisData.content || []);
            if (analysisData.principalName) setPrincipalName(analysisData.principalName);
            if (analysisData.titimangsa) setTitimangsa(analysisData.titimangsa);
            if (analysisData.updatedAt) setLastSaved(new Date(analysisData.updatedAt));
        } else {
            setDocumentRows([]);
            setLastSaved(null);
        }
        setLoadStatus('success');
      } catch (e) {
        console.error('Failed to load analysis', e);
        setDocumentRows([]); 
        setLoadStatus('error'); // Prevent auto-save
      }
    };

    loadData();
  }, [selectedContextKey, selectedContext, currentTeacherId, academicYear]);

  // --- Auto Save (REMOVED due to Data Loss Issues) ---
  // We now rely on Explicit Saves (saveRow, deleteRow) and onBlur events.
  
  // --- Helpers ---
  const teachingContexts = assignments.reduce((acc, curr) => {
    const level = curr.class.level;
    const phase = level === 'X' ? 'E' : 'F';
    const uniqueKey = `${curr.subject.id}-${level}`;
    const majorName = curr.class?.major?.name || 'Umum';

    const existing = acc.find(c => c.key === uniqueKey);
    if (existing) {
      if (!existing.majors.includes(majorName)) {
        existing.majors.push(majorName);
      }
    } else {
      acc.push({
        key: uniqueKey,
        subjectId: curr.subject.id,
        subjectName: curr.subject.name,
        subjectCode: curr.subject.code,
        level: level,
        phase: phase,
        majors: [majorName],
        label: `${curr.subject.name} - Kelas ${level} (Fase ${phase})`
      });
    }
    return acc;
  }, [] as any[]);

  const handleContextChange = (key: string) => {
    // Just update the key; let the useEffect handle loading
    setSelectedContextKey(key);
    
    // Persist to database preferences
    if (userId) {
        // @ts-ignore
        const currentPrefs = userData?.data?.preferences || {};
        updateProfileMutation.mutate({
            preferences: { ...currentPrefs, 'cp-last-context-key': key }
        });
    }
    
    const found = teachingContexts.find(c => c.key === key);
    if (found) {
      setSelectedContext({
        subjectId: found.subjectId,
        subjectName: found.subjectName,
        level: found.level,
        phase: found.phase,
        program: found.majors.join(', ')
      });
    } else {
      setSelectedContext(null);
    }
  };

  // Re-sync context object when selectedContextKey is restored or contexts loaded
  useEffect(() => {
    if (selectedContextKey && teachingContexts.length > 0 && !selectedContext) {
       const found = teachingContexts.find(c => c.key === selectedContextKey);
       if (found) {
         setSelectedContext({
           subjectId: found.subjectId,
           subjectName: found.subjectName,
           level: found.level,
           phase: found.phase,
           program: found.majors.join(', ')
         });
       }
    }
  }, [selectedContextKey, teachingContexts, selectedContext]);

  // Manual Save Handler
  const handleManualSave = async (silent = false) => {
    // CRITICAL: Prevent saving if data hasn't loaded successfully
    if (loadStatus !== 'success') {
        if (!silent) alert('Tunggu data termuat sepenuhnya sebelum menyimpan!');
        return;
    }

    // Check for unsaved draft in Editor (only if not silent)
    if (!silent && activeTab === 'editor' && (analysisItems.length > 0 || (element && cpText))) {
        const confirmSave = window.confirm(
            '⚠️ PERHATIAN: DATA BELUM MASUK DOKUMEN\n\n' +
            'Anda masih memiliki isian di Editor yang belum ditambahkan ke tabel dokumen (tombol Hijau "Simpan ke Dokumen").\n\n' +
            'Sistem HANYA menyimpan data yang sudah masuk ke tabel dokumen.\n\n' +
            'Klik "Cancel" untuk kembali dan klik "Simpan ke Dokumen" dulu.\n' +
            'Klik "OK" jika Anda yakin ingin menyimpan dokumen SAJA (mengabaikan isian editor).'
        );
        if (!confirmSave) return;
    }

    if (!selectedContextKey || !selectedContext || !currentTeacherId || !academicYear) {
        if (!silent) alert('Data belum siap atau Mata Pelajaran belum dipilih!');
        return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    try {
        await cpTpAnalysisService.saveAnalysis({
            teacherId: currentTeacherId,
            subjectId: selectedContext.subjectId,
            level: selectedContext.level,
            academicYearId: academicYear.id,
            content: documentRows,
            principalName,
            titimangsa
        });
        setLastSaved(new Date());
        if (!silent) alert('✅ Data BERHASIL disimpan permanen ke database!');
    } catch (e) {
        console.error('Failed to save analysis', e);
        setSaveError('Gagal menyimpan data.');
        if (!silent) alert('❌ Gagal menyimpan data! Cek console untuk detail.');
    } finally {
        setIsSaving(false);
    }
  };

  // --- Local Analysis Logic ---
  const handleAnalysis = () => {
    if (!selectedContextKey) {
      alert('WAJIB: Pilih Mata Pelajaran & Kelas terlebih dahulu pada panel Identitas!');
      return;
    }

    if (!cpText.trim()) return;
    setIsAnalyzing(true);

    setTimeout(() => {
      // Split sentences
      const sentences = cpText.split(/[.;]+/).filter(s => s.trim().length > 10);
      
      const newItems: AnalysisItem[] = sentences.map((s, idx) => {
        const trimmed = s.trim();
        // Heuristic: Find verb
        const verbMatch = trimmed.match(/(?:mampu|dapat)\s+(\w+)/i) || trimmed.match(/^(\w+)/);
        const verb = verbMatch ? verbMatch[1] : 'memahami';
        
        // Heuristic: Find noun/material (next 3-4 words after verb)
        const words = trimmed.split(' ');
        const verbIndex = words.findIndex(w => w.toLowerCase().includes(verb.toLowerCase()));
        const material = verbIndex >= 0 && words.length > verbIndex + 1 
          ? words.slice(verbIndex + 1, verbIndex + 5).join(' ').replace(/[,.;]+$/, '')
          : 'Materi Esensial';

        return {
          id: Date.now().toString() + idx,
          competency: verb,
          material: material,
          tp: `${documentRows.length + 1}.${idx + 1} ${verb.charAt(0).toUpperCase() + verb.slice(1)} ${material}`,
          profiles: ['Bernalar kritis', 'Mandiri'] // Default
        };
      });

      setAnalysisItems(newItems);
      setIsAnalyzing(false);
    }, 1000);
  };

  // --- CRUD Operations ---
  const addItem = () => {
    setAnalysisItems([...analysisItems, {
      id: Date.now().toString(),
      competency: '',
      material: '',
      tp: '',
      profiles: []
    }]);
  };

  const updateItem = (id: string, field: keyof AnalysisItem, value: any) => {
    setAnalysisItems(items => items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const deleteItem = (id: string) => {
    setAnalysisItems(items => items.filter(item => item.id !== id));
  };

  // --- Internal Save Helper ---
  const saveToBackend = async (rowsToSave: AnalysisRow[]) => {
      if (!selectedContextKey || !selectedContext || !currentTeacherId || !academicYear) {
          return false; // Context not ready
      }
      
      setIsSaving(true);
      setSaveError(null);
      try {
          await cpTpAnalysisService.saveAnalysis({
              teacherId: currentTeacherId,
              subjectId: selectedContext.subjectId,
              level: selectedContext.level,
              academicYearId: academicYear.id,
              content: rowsToSave,
              principalName,
              titimangsa
          });
          setLastSaved(new Date());
          return true;
      } catch (e) {
          console.error('Failed to save analysis', e);
          setSaveError('Gagal menyimpan data ke database.');
          alert('❌ Gagal menyimpan data ke database! Periksa koneksi internet Anda.');
          return false;
      } finally {
          setIsSaving(false);
      }
  };

  const saveRow = async () => {
    if (!selectedContextKey) {
      alert('WAJIB: Pilih Mata Pelajaran & Kelas terlebih dahulu pada panel Identitas!');
      return;
    }

    if (!element || !cpText || analysisItems.length === 0) {
      alert('Mohon lengkapi Elemen, CP, dan minimal 1 hasil analisis.');
      return;
    }

    const newRow: AnalysisRow = {
      id: editingRowId || Date.now().toString(),
      element,
      cpText,
      items: analysisItems
    };

    let updatedRows: AnalysisRow[];
    if (editingRowId) {
      updatedRows = documentRows.map(r => r.id === editingRowId ? newRow : r);
      setDocumentRows(updatedRows);
      setEditingRowId(null);
    } else {
      updatedRows = [...documentRows, newRow];
      setDocumentRows(updatedRows);
    }
    
    // IMMEDIATE SAVE
    const success = await saveToBackend(updatedRows);
    
    if (success) {
        alert(editingRowId ? 'Data berhasil diperbarui dan tersimpan permanen!' : 'Data berhasil ditambahkan dan tersimpan permanen!');
    }
    
    // Reset form
    setElement('');
    setCpText('');
    setAnalysisItems([]);
  };

  const editRow = (row: AnalysisRow) => {
    setElement(row.element);
    setCpText(row.cpText);
    setAnalysisItems(row.items);
    setEditingRowId(row.id);
    setActiveTab('editor');
  };

  const deleteRow = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus baris ini dari dokumen?')) return;

    const updatedRows = documentRows.filter(r => r.id !== id);
    setDocumentRows(updatedRows);
    
    if (editingRowId === id) {
      setEditingRowId(null);
      setElement('');
      setCpText('');
      setAnalysisItems([]);
    }

    // IMMEDIATE SAVE
    await saveToBackend(updatedRows);
  };

  // --- Printing ---
  const [printTarget, setPrintTarget] = useState<HTMLElement | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = () => {
    if (!selectedContext) {
      alert('Mohon pilih konteks mata pelajaran terlebih dahulu.');
      return;
    }

    if (isPrinting) return;
    setIsPrinting(true);

    // Reset previous print target to force re-render
    setPrintTarget(null);

    setTimeout(() => {
      // 1. Create or get hidden iframe
      let iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.position = 'absolute';
        iframe.style.top = '-9999px';
        iframe.style.left = '-9999px';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }

      // 2. Setup iframe content
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write('<!DOCTYPE html><html><head><title>Print</title></head><body><div id="print-root"></div></body></html>');
        doc.close();

        // 3. Copy styles from parent to iframe
        const styles = document.querySelectorAll('link[rel="stylesheet"], style');
        styles.forEach(node => {
          doc.head.appendChild(node.cloneNode(true));
        });

        // 4. Set document title for print job
        doc.title = `Analisis_CP_${selectedContext.subjectName}`;

        // 5. Set target for React Portal
        const root = doc.getElementById('print-root');
        if (root) setPrintTarget(root);
      }
    }, 50);
  };

  // Trigger print when content is ready in iframe
  useEffect(() => {
    if (printTarget) {
      const timer = setTimeout(() => {
        const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setIsPrinting(false);
        }
      }, 1000); // 1s delay for better style loading
      return () => clearTimeout(timer);
    }
  }, [printTarget]);

  // --- Render Document Content (Shared) ---
  const renderDocumentContent = () => (
    <CpAnalysisDocument
      academicYearName={academicYear?.name || '..........'}
      subjectName={selectedContext?.subjectName || '....................'}
      level={selectedContext?.level || '...'}
      program={selectedContext?.program || 'Teknik Komputer dan Jaringan'}
      principalName={principalName}
      teacherName={assignments[0]?.teacher.name || '...................................'}
      titimangsa={titimangsa}
      rows={documentRows}
    />
  );

  // --- Render ---
  return (
    <>
      <div className="pb-20 print:hidden">
  
      {/* Header Actions - Sticky */}
      <div className="sticky top-0 z-30 bg-[#f8f9fa] pt-4 pb-4 mb-6 border-b border-gray-200 shadow-sm -mx-8 px-8 transition-all">
        {saveError && (
           <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
             <span className="font-bold">Gagal Menyimpan:</span> {saveError}
           </div>
        )}
        {loadStatus === 'error' && (
           <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
             <span className="font-bold">Error:</span> Gagal memuat data dari server. Perubahan tidak akan disimpan otomatis. Silakan refresh halaman.
           </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analisis CP & TP</h1>
            <div className="flex items-center gap-2 text-gray-500">
              <p>Generator dokumen Analisis Capaian Pembelajaran</p>
              {isSaving ? (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200 flex items-center gap-1">
                  <Sparkles size={10} className="animate-spin" /> Saving...
                </span>
              ) : lastSaved ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200">
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              ) : (
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">
                  Ready
                </span>
              )}
            </div>
          </div>
          <div className="flex space-x-1 bg-white p-1 rounded-lg border border-gray-200 w-fit">
             <button 
               onClick={() => setActiveTab('editor')}
               className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                 activeTab === 'editor' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
               }`}
             >
               <Edit3 size={16} /> Editor
             </button>
             <button 
               onClick={() => setActiveTab('preview')}
               className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                 activeTab === 'preview' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
               }`}
             >
               <FileText size={16} /> Preview Dokumen ({documentRows.length})
             </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left: Input Form */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Identity Card */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BookOpen size={18} className="text-blue-600" /> Identitas & Opsi
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Konteks Mapel</label>
                  <select
                    value={selectedContextKey}
                    onChange={(e) => handleContextChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Mata Pelajaran...</option>
                    {teachingContexts.map(ctx => (
                      <option key={ctx.key} value={ctx.key}>{ctx.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Titimangsa</label>
                    <input
                      type="text"
                      value={titimangsa}
                      onChange={(e) => setTitimangsa(e.target.value)}
                      onBlur={() => handleManualSave(true)}
                      placeholder="Contoh: 27 Januari 2026"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nama Kepsek</label>
                    <input
                      type="text"
                      value={principalName}
                      onChange={(e) => setPrincipalName(e.target.value)}
                      onBlur={() => handleManualSave(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CP Input Card */}
            <div className={`bg-white p-5 rounded-xl shadow-sm border border-gray-200 transition-opacity ${!selectedContextKey ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                 <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                   <Target size={18} className="text-blue-600" /> Sumber CP
                 </h3>
                 <div className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase rounded border border-blue-200">
                   Cloud Sync
                 </div>
              </div>
              
              {!selectedContextKey && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                  <strong>PENTING:</strong> Pilih <strong>Konteks Mapel</strong> di atas terlebih dahulu untuk mengisi form ini.
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Elemen CP</label>
                  <input
                    type="text"
                    value={element}
                    onChange={(e) => setElement(e.target.value)}
                    placeholder="Contoh: Perencanaan dan Pengalamatan Jaringan"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={!selectedContextKey}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Teks Capaian Pembelajaran</label>
                  <textarea
                    value={cpText}
                    onChange={(e) => setCpText(e.target.value)}
                    placeholder="Paste teks CP untuk elemen ini..."
                    className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={!selectedContextKey}
                  />
                </div>
                
                <button
                  onClick={handleAnalysis}
                  disabled={!cpText.trim() || isAnalyzing || !selectedContextKey}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? <Sparkles size={16} className="animate-spin" /> : <Bot size={16} />}
                  {isAnalyzing ? 'Menganalisis...' : 'Analisis Otomatis'}
                </button>
              </div>
            </div>

          </div>

          {/* Right: Analysis Results Editor */}
          <div className="lg:col-span-2 space-y-4">
             <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 min-h-[500px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <List size={18} className="text-blue-600" /> Hasil Analisis (Edit & Finalisasi)
                  </h3>
                  <button onClick={addItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                    <Plus size={16} /> Tambah Item
                  </button>
                </div>

                {analysisItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                    <FileText size={40} className="mb-2 opacity-20" />
                    <p className="text-sm">Belum ada item analisis.</p>
                    <p className="text-xs">Isi Elemen & CP, lalu klik "Analisis Otomatis".</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {analysisItems.map((item) => (
                      <div key={item.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200 relative group">
                        <button 
                          onClick={() => deleteItem(item.id)}
                          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </button>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Kompetensi</label>
                            <input 
                              type="text" 
                              value={item.competency}
                              onChange={(e) => updateItem(item.id, 'competency', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Materi</label>
                            <input 
                              type="text" 
                              value={item.material}
                              onChange={(e) => updateItem(item.id, 'material', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-sm"
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                           <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tujuan Pembelajaran (TP)</label>
                           <input 
                              type="text" 
                              value={item.tp}
                              onChange={(e) => updateItem(item.id, 'tp', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-sm"
                            />
                        </div>

                        <div>
                           <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Profil Pelajar Pancasila</label>
                           <div className="flex flex-wrap gap-2">
                             {PROFILE_DIMENSIONS.map(dim => {
                               const isSelected = item.profiles.includes(dim);
                               return (
                                 <button
                                   key={dim}
                                   onClick={() => {
                                      const newProfiles = isSelected 
                                        ? item.profiles.filter(p => p !== dim)
                                        : [...item.profiles, dim];
                                      updateItem(item.id, 'profiles', newProfiles);
                                   }}
                                   className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                                      isSelected 
                                        ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' 
                                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'
                                   }`}
                                 >
                                   {dim}
                                 </button>
                               );
                             })}
                           </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={addItem}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Plus size={16} /> Tambah Baris Analisis Baru
                    </button>

                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                      {editingRowId && (
                         <button
                           onClick={() => {
                             setEditingRowId(null);
                             setElement('');
                             setCpText('');
                             setAnalysisItems([]);
                           }}
                           className="mr-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium"
                         >
                           Batal Edit
                         </button>
                      )}
                      <button
                        onClick={saveRow}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
                      >
                        <Save size={16} /> {editingRowId ? 'Update Dokumen' : 'Simpan ke Dokumen'}
                      </button>
                    </div>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div className="space-y-6">
          <div className="sticky top-[100px] z-20 bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Total <b>{documentRows.length}</b> Elemen dalam dokumen.
            </div>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm z-10 ${
                isPrinting 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gray-900 hover:bg-black text-white active:scale-95 cursor-pointer'
              }`}
            >
              {isPrinting ? (
                <>
                  <Sparkles size={16} className="animate-spin" /> Menyiapkan...
                </>
              ) : (
                <>
                  <Printer size={16} /> Cetak / Download PDF
                </>
              )}
            </button>
          </div>

          {/* Printable Area */}
          <div className="bg-gray-100 p-8 overflow-auto flex justify-center">
            {renderDocumentContent()}
          </div>
          
          {/* Row Management (Delete) */}
          {documentRows.length > 0 && (
             <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
               <h3 className="font-semibold text-gray-900 mb-3">Kelola Data Dokumen</h3>
               <div className="space-y-2">
                 {documentRows.map(row => (
                   <div key={row.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{row.element}</div>
                        <div className="text-xs text-gray-500 truncate max-w-md">{row.cpText.substring(0, 50)}...</div>
                      </div>
                      <div className="flex items-center">
                        <button 
                          onClick={() => editRow(row)}
                          disabled={isSaving || loadStatus !== 'success'}
                          className="text-blue-600 hover:text-blue-800 p-2 disabled:text-gray-400"
                          title="Edit Elemen"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button 
                          onClick={() => deleteRow(row.id)}
                          disabled={isSaving || loadStatus !== 'success'}
                          className="text-red-500 hover:text-red-700 p-2 disabled:text-gray-400"
                          title="Hapus Elemen"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                   </div>
                 ))}
               </div>
             </div>
          )}
        </div>
      )}
      </div>

      {/* Print Portal - Rendered into Hidden Iframe */}
      {printTarget && createPortal(
        renderDocumentContent(),
        printTarget
      )}
    </>
  );
};

export default CpPage;

import { useRef, useState } from 'react';
import { Download, Upload, FileText, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { dataService } from '../../../services/data.service';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export const ImportExportPage = () => {
  const teacherInputRef = useRef<HTMLInputElement | null>(null);
  const studentInputRef = useRef<HTMLInputElement | null>(null);
  const parentInputRef = useRef<HTMLInputElement | null>(null);

  const [isTeacherImporting, setIsTeacherImporting] = useState(false);
  const [isStudentImporting, setIsStudentImporting] = useState(false);
  const [isParentImporting, setIsParentImporting] = useState(false);

  const handleExportTeachers = async () => {
    try {
      const blob = await dataService.exportTeachers();
      downloadBlob(blob, 'guru.xlsx');
      toast.success('File guru berhasil di-download');
    } catch (error) {
      toast.error('Gagal mengekspor data guru');
      console.error(error);
    }
  };

  const handleExportStudents = async () => {
    try {
      const blob = await dataService.exportStudents();
      downloadBlob(blob, 'siswa.xlsx');
      toast.success('File siswa berhasil di-download');
    } catch (error) {
      toast.error('Gagal mengekspor data siswa');
      console.error(error);
    }
  };

  const handleExportParents = async () => {
    try {
      const blob = await dataService.exportParents();
      downloadBlob(blob, 'orangtua.xlsx');
      toast.success('File orang tua berhasil di-download');
    } catch (error) {
      toast.error('Gagal mengekspor data orang tua');
      console.error(error);
    }
  };

  const handleImportTeachers = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTeacherImporting(true);
    try {
      const res = await dataService.importTeachers(file);
      const message =
        (res && (res.message || res?.data?.message)) ||
        'Import data guru berhasil';
      toast.success(message);
    } catch (error) {
      const anyErr = error as {
        response?: { data?: { message?: string } };
      };
      const message =
        anyErr.response?.data?.message || 'Gagal mengimport data guru';
      toast.error(message);
    } finally {
      setIsTeacherImporting(false);
      if (teacherInputRef.current) {
        teacherInputRef.current.value = '';
      }
    }
  };

  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsStudentImporting(true);
    try {
      const res = await dataService.importStudents(file);
      const message =
        (res && (res.message || res?.data?.message)) ||
        'Import data siswa berhasil';
      toast.success(message);
    } catch (error) {
      const anyErr = error as {
        response?: { data?: { message?: string } };
      };
      const message =
        anyErr.response?.data?.message || 'Gagal mengimport data siswa';
      toast.error(message);
    } finally {
      setIsStudentImporting(false);
      if (studentInputRef.current) {
        studentInputRef.current.value = '';
      }
    }
  };

  const handleImportParents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParentImporting(true);
    try {
      const res = await dataService.importParents(file);
      const message =
        (res && (res.message || res?.data?.message)) ||
        'Import data orang tua berhasil';
      toast.success(message);
    } catch (error) {
      const anyErr = error as {
        response?: { data?: { message?: string } };
      };
      const message =
        anyErr.response?.data?.message || 'Gagal mengimport data orang tua';
      toast.error(message);
    } finally {
      setIsParentImporting(false);
      if (parentInputRef.current) {
        parentInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Export / Import</h1>
        <p className="text-gray-500 text-sm">
          Kelola data Guru, Siswa, dan Orang Tua melalui file Excel (.xlsx).
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start">
        <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
        <div className="text-xs sm:text-sm text-blue-900 space-y-1">
          <p className="font-medium">Catatan penting sebelum import:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              Gunakan file Excel (.xlsx) dengan header sesuai contoh hasil
              export.
            </li>
            <li>
              Baris pertama dianggap sebagai header kolom dan tidak akan
              di-import.
            </li>
            <li>
              Data dengan username / NISN yang sudah ada akan diperbarui, bukan
              dibuat baru.
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Guru */}
        <div className="bg-white rounded-xl shadow-md border-0 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Data Guru
              </h2>
              <p className="text-xs text-gray-500">
                Wajib: Username, Nama. Kolom lain opsional.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleExportTeachers}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Template Excel Guru
            </button>

            <button
              type="button"
              onClick={() => teacherInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs sm:text-sm text-gray-700 font-medium bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              disabled={isTeacherImporting}
            >
              {isTeacherImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import Excel Guru
            </button>

            <input
              ref={teacherInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleImportTeachers}
            />
          </div>
        </div>

        {/* Siswa */}
        <div className="bg-white rounded-xl shadow-md border-0 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Data Siswa
              </h2>
              <p className="text-xs text-gray-500">
                Wajib: NISN, Nama. Jika Class diisi harus sesuai data kelas.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleExportStudents}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Template Excel Siswa
            </button>

            <button
              type="button"
              onClick={() => studentInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs sm:text-sm text-gray-700 font-medium bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              disabled={isStudentImporting}
            >
              {isStudentImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import Excel Siswa
            </button>

            <input
              ref={studentInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleImportStudents}
            />
          </div>
        </div>

        {/* Orang Tua */}
        <div className="bg-white rounded-xl shadow-md border-0 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Data Orang Tua
              </h2>
              <p className="text-xs text-gray-500">
                Wajib: Username, Nama. Anak diisi dengan NISN dipisah koma.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleExportParents}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs sm:text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Template Excel Orang Tua
            </button>

            <button
              type="button"
              onClick={() => parentInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-xs sm:text-sm text-gray-700 font-medium bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              disabled={isParentImporting}
            >
              {isParentImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import Excel Orang Tua
            </button>

            <input
              ref={parentInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleImportParents}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

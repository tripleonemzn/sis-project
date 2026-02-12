import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { academicYearService } from '../../../services/academicYear.service';
import { toast } from 'react-hot-toast';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { useTitle } from '../../../hooks/useTitle';

interface PklConfigForm {
  pklEligibleGrades: string;
}

import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';

export const HumasSettingsPage: React.FC = () => {
  useTitle('Pengaturan PKL | Wakasek Humas');
  const queryClient = useQueryClient();

  const { data: activeYear, isLoading } = useActiveAcademicYear();

  const { register, handleSubmit, setValue } = useForm<PklConfigForm>({
    defaultValues: {
      pklEligibleGrades: 'XI', // Default fallback
    },
  });

  // Update form when data loads
  React.useEffect(() => {
    if (activeYear) {
      setValue('pklEligibleGrades', activeYear.pklEligibleGrades || 'XI');
    }
  }, [activeYear, setValue]);

  const mutation = useMutation({
    mutationFn: (data: PklConfigForm) => 
      academicYearService.updatePklConfig(data.pklEligibleGrades),
    onSuccess: () => {
      toast.success('Konfigurasi PKL berhasil disimpan');
      queryClient.invalidateQueries({ queryKey: ['active-academic-year'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menyimpan konfigurasi');
    },
  });

  const onSubmit = (data: PklConfigForm) => {
    mutation.mutate(data);
  };

  if (isLoading) {
    return <div className="p-8 text-center">Memuat data...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-100 p-2 rounded-lg">
          <Settings className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pengaturan PKL</h1>
          <p className="text-gray-500 text-sm">Konfigurasi pelaksanaan Praktik Kerja Lapangan</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500" />
            Konfigurasi Tahun Ajaran Aktif ({activeYear?.name})
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-6">
            Pengaturan ini akan berlaku untuk seluruh siswa pada tahun ajaran aktif saat ini.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="max-w-md">
            <label htmlFor="pklEligibleGrades" className="block text-sm font-medium text-gray-700 mb-2">
              Tingkat Kelas PKL
            </label>
            <select
              id="pklEligibleGrades"
              {...register('pklEligibleGrades')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="XI">Kelas XI (Sebelas)</option>
              <option value="XII">Kelas XII (Dua Belas)</option>
              <option value="XI, XII">Kelas XI & XII (Gabungan)</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Pilih tingkat kelas yang diizinkan untuk mengakses menu dan fitur PKL. 
              Siswa di tingkat lain tidak akan melihat menu PKL.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


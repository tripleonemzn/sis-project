import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { internshipService } from '../../services/internship.service';
import { toast } from 'react-hot-toast';
import { Loader2, Building2, User, School, CheckCircle, AlertCircle } from 'lucide-react';

export const InternshipGradeInputPage = () => {
  const { accessCode } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [score, setScore] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (accessCode) {
      verifyCode(accessCode);
    }
  }, [accessCode]);

  const verifyCode = async (code: string) => {
    try {
      const response = await internshipService.verifyAccessCode(code);
      setData(response.data.data);
      if (response.data.data.industryScore) {
         setScore(response.data.data.industryScore);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Link tidak valid atau kadaluarsa');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode || score === '') return;

    setSubmitting(true);
    try {
      await internshipService.submitIndustryGradeViaLink({
        accessCode,
        industryScore: Number(score)
      });
      setSuccess(true);
      toast.success('Nilai berhasil disimpan');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan nilai');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Akses Ditolak</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nilai Berhasil Disimpan</h2>
          <p className="text-gray-600 mb-6">Terima kasih telah memberikan penilaian untuk siswa kami.</p>
          <div className="bg-gray-50 p-4 rounded-lg text-left text-sm">
             <p className="font-medium text-gray-900 mb-1">Ringkasan:</p>
             <p className="text-gray-600">Siswa: {data?.studentName}</p>
             <p className="text-gray-600">Nilai: {score}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
             {/* Logo Placeholder or School Name */}
             <School className="w-12 h-12 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Input Nilai PKL</h1>
          <p className="mt-2 text-gray-600">Silahkan isi nilai akhir dari industri untuk siswa berikut.</p>
        </div>

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
          <div className="bg-blue-600 px-6 py-4">
            <h2 className="text-white text-lg font-medium flex items-center gap-2">
              <User className="w-5 h-5" />
              Informasi Siswa
            </h2>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Nama Siswa</label>
              <div className="text-lg font-medium text-gray-900">{data?.studentName}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">NIS</label>
              <div className="text-lg font-medium text-gray-900">{data?.nis}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Perusahaan</label>
              <div className="text-lg font-medium text-gray-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                {data?.companyName}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Mentor</label>
              <div className="text-lg font-medium text-gray-900">{data?.mentorName || '-'}</div>
            </div>
          </div>

          <div className="border-t border-gray-100 p-6 bg-gray-50">
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label htmlFor="score" className="block text-sm font-medium text-gray-700 mb-2">
                  Nilai Industri (0 - 100)
                </label>
                <div className="relative rounded-md shadow-sm max-w-xs">
                  <input
                    type="number"
                    name="score"
                    id="score"
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    className="block w-full rounded-md border-gray-300 pl-4 pr-12 focus:border-blue-500 focus:ring-blue-500 py-3 text-lg"
                    placeholder="0"
                    value={score}
                    onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-gray-500 sm:text-sm">/ 100</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Masukkan nilai dalam skala 0-100. Gunakan titik (.) untuk desimal.
                </p>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`
                    flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm
                    ${submitting ? 'opacity-75 cursor-not-allowed' : ''}
                  `}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan Nilai'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

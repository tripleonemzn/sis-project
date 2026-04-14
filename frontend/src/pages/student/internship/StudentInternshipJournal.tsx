import React, { useState, useEffect } from 'react';
import { internshipService } from '../../../services/internship.service';
import { BookOpen, Plus, X, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

type InternshipRecord = {
  id: number;
  status: string;
};

type InternshipJournalItem = {
  id: number;
  date: string;
  activity: string;
  description?: string | null;
  imageUrl?: string | null;
  feedback?: string | null;
  status: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const StudentInternshipJournal = () => {
  // Use auth service or just fetch directly as token is handled by interceptor
  const [internship, setInternship] = useState<InternshipRecord | null>(null);
  const [journals, setJournals] = useState<InternshipJournalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    activity: '',
    description: '',
    imageUrl: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await internshipService.getMyInternship();
      if (res.data.success && res.data.data && res.data.data.internship) {
        setInternship(res.data.data.internship);
        if (res.data.data.internship.id) {
          try {
            const journalsRes = await internshipService.getJournals(res.data.data.internship.id);
            setJournals(journalsRes.data.data);
          } catch (journalError) {
            console.error('Error fetching journals:', journalError);
            // Don't fail the whole page if journals fail to load, just show empty
          }
        }
      } else {
        setInternship(null);
      }
    } catch (error: unknown) {
      console.error('Error fetching internship:', error);
      const statusCode = (error as { response?: { status?: number } }).response?.status;
      if (statusCode !== 404) {
        setError(getErrorMessage(error, 'Gagal memuat data PKL'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!internship) return;
    
    try {
      await internshipService.createJournal(internship.id, formData);
      toast.success('Jurnal berhasil ditambahkan');
      setIsModalOpen(false);
      setFormData({
         date: new Date().toISOString().split('T')[0],
         activity: '',
         description: '',
         imageUrl: '',
      });
      fetchData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menambahkan jurnal'));
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 p-4 rounded-lg text-red-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
          <button 
            onClick={fetchData}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm font-medium transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (!internship || internship.status !== 'APPROVED') {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 p-4 rounded-lg text-yellow-800 flex items-center gap-3">
          <BookOpen className="w-5 h-5" />
          <p>Fitur Jurnal hanya tersedia setelah pengajuan PKL Anda disetujui (APPROVED).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-page-title font-bold text-gray-800">Jurnal Harian PKL</h1>
           <p className="text-gray-500">Catat kegiatan harian Anda selama PKL</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Jurnal
        </button>
      </div>

      <div className="space-y-4">
        {journals.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
             <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
             <p className="text-gray-500">Belum ada jurnal kegiatan.</p>
          </div>
        ) : (
          journals.map((journal) => (
            <div key={journal.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex gap-6">
               <div className="flex-shrink-0 w-16 text-center">
                  <div className="text-sm font-bold text-gray-500 uppercase">
                    {new Date(journal.date).toLocaleDateString('id-ID', { month: 'short' })}
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {new Date(journal.date).getDate()}
                  </div>
               </div>
               <div className="flex-1">
                 <h3 className="text-lg font-semibold text-gray-900 mb-2">{journal.activity}</h3>
                 <p className="text-gray-600 whitespace-pre-line">{journal.description || '-'}</p>
                 {journal.imageUrl && (
                   <div className="mt-4">
                      <img src={journal.imageUrl} alt="Dokumentasi" className="h-32 rounded-lg object-cover" />
                   </div>
                 )}
                 {journal.feedback && (
                   <div className="mt-4 bg-green-50 p-3 rounded-lg text-sm text-green-800">
                      <strong>Feedback Pembimbing:</strong> {journal.feedback}
                   </div>
                 )}
               </div>
               <div className="flex-shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    journal.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 
                    journal.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {journal.status}
                  </span>
               </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Tambah Jurnal Kegiatan</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul Kegiatan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Membuat Desain Database"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={formData.activity}
                  onChange={e => setFormData({...formData, activity: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Detail</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Jelaskan apa yang Anda kerjakan..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

               {/* TODO: Image Upload Integration if needed, for now just text or url */}
               
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Simpan Jurnal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentInternshipJournal;

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  Loader2, 
  FileText, 
  Building2, 
  User, 
  X,
  BookOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { internshipService } from '../../../services/internship.service';
import { classService } from '../../../services/class.service';

const JournalMonitoringPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedInternship, setSelectedInternship] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch Classes for Filter
  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const res = await classService.list({ limit: 100 });
      return res.data;
    }
  });

  // Fetch Internships
  const { data: internshipsData, isLoading } = useQuery({
    queryKey: ['all-internships', page, limit, search, selectedClassId],
    queryFn: async () => {
      const res = await internshipService.getAllInternships({
        page,
        limit,
        search,
        classId: selectedClassId ? Number(selectedClassId) : undefined,
        status: 'APPROVED' // Only show active internships
      });
      return res.data;
    }
  });

  // Fetch Journals for Selected Internship
  const { data: journalsData, isLoading: isLoadingJournals } = useQuery({
    queryKey: ['internship-journals', selectedInternship?.id],
    queryFn: async () => {
      if (!selectedInternship?.id) return null;
      const res = await internshipService.getJournals(selectedInternship.id);
      return res.data;
    },
    enabled: !!selectedInternship?.id
  });

  const handleViewJournals = (internship: any) => {
    setSelectedInternship(internship);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedInternship(null);
  };

  const internships = internshipsData?.data?.internships || [];
  const pagination = internshipsData?.data?.pagination;
  const journals = journalsData?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring Jurnal PKL</h1>
          <p className="text-gray-500">Pantau aktivitas jurnal harian siswa PKL</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-end md:items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Cari nama siswa atau NISN..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Pilih Kelas:</span>
            <select
              className="w-full sm:w-48 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">Semua Kelas</option>
              {classesData?.classes?.map((cls: any) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Tampilkan:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="w-full sm:w-20 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={35}>35</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">NISN/NIS</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">NAMA SISWA</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kelas</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tempat PKL</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Alamat</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="flex justify-center items-center gap-2 text-gray-500">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : internships.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <BookOpen className="w-12 h-12 text-gray-300 mb-3" />
                      <p>Tidak ada data siswa PKL ditemukan.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                internships.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-600 font-mono text-sm">
                      {item.student?.nisn || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                          {item.student?.name?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{item.student?.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {item.student?.studentClass?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-sm truncate max-w-[200px]" title={item.industry?.name}>
                          {item.industry?.name || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm max-w-[200px] truncate" title={item.industry?.address}>
                      {item.industry?.address || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewJournals(item)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Lihat Jurnal
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Menampilkan <span className="font-medium">{((page - 1) * limit) + 1}</span> sampai <span className="font-medium">{Math.min(page * limit, pagination.total)}</span> dari <span className="font-medium">{pagination.total}</span> data
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page === pagination.totalPages}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Journal Detail Modal */}
      {isModalOpen && selectedInternship && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Jurnal Kegiatan Siswa</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  <User className="w-4 h-4" />
                  <span>{selectedInternship.student?.name}</span>
                  <span className="mx-1">•</span>
                  <Building2 className="w-4 h-4" />
                  <span>{selectedInternship.industry?.name}</span>
                </div>
              </div>
              <button 
                onClick={closeModal}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
              {isLoadingJournals ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" />
                  <p>Memuat data jurnal...</p>
                </div>
              ) : journals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300 p-8">
                  <BookOpen className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="text-lg font-medium">Belum ada jurnal kegiatan</p>
                  <p className="text-sm">Siswa ini belum mengisi jurnal harian PKL.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {journals.map((journal: any) => (
                    <div key={journal.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-6">
                      {/* Date Section */}
                      <div className="flex-shrink-0 md:w-24 flex flex-row md:flex-col items-center md:items-start gap-2 md:gap-0 md:border-r md:border-gray-100 md:pr-6">
                        <div className="text-sm font-bold text-gray-500 uppercase">
                          {new Date(journal.date).toLocaleDateString('id-ID', { month: 'short' })}
                        </div>
                        <div className="text-3xl font-bold text-gray-900">
                          {new Date(journal.date).getDate()}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(journal.date).toLocaleDateString('id-ID', { weekday: 'long' })}
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{journal.activity}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ml-2 ${
                            journal.status === 'VERIFIED' ? 'bg-green-100 text-green-700' : 
                            journal.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {journal.status === 'VERIFIED' ? 'Disetujui' : 
                             journal.status === 'REJECTED' ? 'Ditolak' : 'Menunggu'}
                          </span>
                        </div>
                        
                        <p className="text-gray-600 whitespace-pre-line mb-4 text-sm leading-relaxed">
                          {journal.description || '-'}
                        </p>

                        {/* Image */}
                        {journal.imageUrl && (
                          <div className="mb-4">
                            <img 
                              src={journal.imageUrl} 
                              alt="Dokumentasi" 
                              className="h-48 w-auto rounded-lg object-cover border border-gray-100 shadow-sm"
                            />
                          </div>
                        )}

                        {/* Feedback */}
                        {journal.feedback && (
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <p className="text-sm text-blue-800">
                              <span className="font-semibold">Catatan Pembimbing:</span> {journal.feedback}
                            </p>
                          </div>
                        )}
                        
                        <div className="mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400 flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          <span>Diinput pada {new Date(journal.createdAt).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium shadow-sm transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Icon Component
const ClockIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export default JournalMonitoringPage;

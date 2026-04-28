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
import { classService, type Class } from '../../../services/class.service';

type InternshipRow = {
  id: number;
  student?: {
    nisn?: string | null;
    name?: string | null;
    studentClass?: {
      name?: string | null;
    } | null;
  } | null;
  industry?: {
    name?: string | null;
    address?: string | null;
  } | null;
};

type InternshipPagination = {
  totalPages: number;
  total: number;
};

type InternshipJournalRow = {
  id: number;
  date: string;
  activity?: string | null;
  status?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  feedback?: string | null;
  createdAt?: string | null;
};

function formatJournalDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString('id-ID', options ?? {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatJournalDateTime(date?: string | null) {
  return date ? new Date(date).toLocaleString('id-ID') : '-';
}

function getJournalStatusLabel(status?: string | null) {
  switch (status) {
    case 'VERIFIED':
    case 'APPROVED':
      return 'Disetujui';
    case 'REJECTED':
      return 'Ditolak';
    case 'PENDING':
      return 'Menunggu';
    default:
      return status || '-';
  }
}

function getJournalStatusClassName(status?: string | null) {
  switch (status) {
    case 'VERIFIED':
    case 'APPROVED':
      return 'bg-green-100 text-green-700';
    case 'REJECTED':
      return 'bg-red-100 text-red-700';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

const JournalMonitoringPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedInternship, setSelectedInternship] = useState<InternshipRow | null>(null);
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

  const handleViewJournals = (internship: InternshipRow) => {
    setSelectedInternship(internship);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedInternship(null);
  };

  const classes: Class[] = Array.isArray(classesData?.classes)
    ? (classesData.classes as Class[])
    : [];
  const internships: InternshipRow[] = Array.isArray(internshipsData?.data?.internships)
    ? (internshipsData.data.internships as InternshipRow[])
    : [];
  const pagination: InternshipPagination | undefined =
    internshipsData?.data?.pagination as InternshipPagination | undefined;
  const journals: InternshipJournalRow[] = Array.isArray(journalsData?.data)
    ? (journalsData.data as InternshipJournalRow[])
    : [];

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
              {classes.map((cls) => (
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
                internships.map((item) => (
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
                        <span className="text-sm truncate max-w-[200px]" title={item.industry?.name || undefined}>
                          {item.industry?.name || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm max-w-[200px] truncate" title={item.industry?.address || undefined}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[calc(100vh-7rem)] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
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
            <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
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
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                      <thead className="bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Tanggal
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Kegiatan
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Dokumentasi
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Feedback
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Status
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Diinput
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {journals.map((journal) => (
                          <tr key={journal.id} className="align-top">
                            <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-gray-900">
                              <div>{formatJournalDate(journal.date)}</div>
                              <div className="mt-1 text-xs font-normal text-gray-500">
                                {formatJournalDate(journal.date, { weekday: 'long' })}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-semibold text-gray-900">{journal.activity || '-'}</p>
                              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                                {journal.description || '-'}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              {journal.imageUrl ? (
                                <a
                                  href={journal.imageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                >
                                  <img
                                    src={journal.imageUrl}
                                    alt="Dokumentasi jurnal"
                                    className="h-10 w-10 rounded-md object-cover"
                                  />
                                  Lihat foto
                                </a>
                              ) : (
                                <span className="text-sm text-gray-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">{journal.feedback || '-'}</td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getJournalStatusClassName(journal.status)}`}>
                                {getJournalStatusLabel(journal.status)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                              {formatJournalDateTime(journal.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

export default JournalMonitoringPage;

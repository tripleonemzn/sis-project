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
  ChevronRight,
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

  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const res = await classService.list({ limit: 100 });
      return res.data;
    },
  });

  const { data: internshipsData, isLoading } = useQuery({
    queryKey: ['all-internships', page, limit, search, selectedClassId],
    queryFn: async () => {
      const res = await internshipService.getAllInternships({
        page,
        limit,
        search,
        classId: selectedClassId ? Number(selectedClassId) : undefined,
        status: 'APPROVED',
      });
      return res.data;
    },
  });

  const { data: journalsData, isLoading: isLoadingJournals } = useQuery({
    queryKey: ['internship-journals', selectedInternship?.id],
    queryFn: async () => {
      if (!selectedInternship?.id) return null;
      const res = await internshipService.getJournals(selectedInternship.id);
      return res.data;
    },
    enabled: !!selectedInternship?.id,
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring Jurnal PKL</h1>
          <p className="text-gray-500">Pantau aktivitas jurnal harian siswa PKL</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama siswa atau NISN..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex w-full flex-col gap-4 sm:flex-row md:w-auto">
          <label className="flex w-full items-center gap-2 text-sm font-medium text-gray-700 sm:w-auto">
            <span className="whitespace-nowrap">Pilih Kelas:</span>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:w-48"
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Kelas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </label>

          <label className="flex w-full items-center gap-2 text-sm font-medium text-gray-700 sm:w-auto">
            <span className="whitespace-nowrap">Tampilkan:</span>
            <select
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:w-20"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={35}>35</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">NISN/NIS</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Nama Siswa</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Kelas</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Tempat PKL</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Alamat</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Memuat data...
                    </div>
                  </td>
                </tr>
              ) : internships.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <BookOpen className="mb-3 h-12 w-12 text-gray-300" />
                      <p>Tidak ada data siswa PKL ditemukan.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                internships.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-sm text-gray-600">
                      {item.student?.nisn || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600">
                          {item.student?.name?.charAt(0) || 'S'}
                        </div>
                        <p className="font-medium text-gray-900">{item.student?.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {item.student?.studentClass?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="max-w-[200px] truncate text-sm" title={item.industry?.name || undefined}>
                          {item.industry?.name || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-6 py-4 text-sm text-gray-600" title={item.industry?.address || undefined}>
                      {item.industry?.address || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewJournals(item)}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
                      >
                        <FileText className="h-4 w-4" />
                        Lihat Jurnal
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination ? (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                disabled={page === pagination.totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                Menampilkan <span className="font-medium">{((page - 1) * limit) + 1}</span> sampai{' '}
                <span className="font-medium">{Math.min(page * limit, pagination.total)}</span> dari{' '}
                <span className="font-medium">{pagination.total}</span> data
              </p>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                  disabled={page === pagination.totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        ) : null}
      </div>

      {isModalOpen && selectedInternship ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[calc(100vh-7rem)] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Jurnal Kegiatan Siswa</h2>
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                  <User className="h-4 w-4" />
                  <span>{selectedInternship.student?.name}</span>
                  <span className="mx-1">•</span>
                  <Building2 className="h-4 w-4" />
                  <span>{selectedInternship.industry?.name}</span>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-200"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
              {isLoadingJournals ? (
                <div className="flex h-64 flex-col items-center justify-center text-gray-500">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-600" />
                  <p>Memuat data jurnal...</p>
                </div>
              ) : journals.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-8 text-gray-500">
                  <BookOpen className="mb-4 h-16 w-16 text-gray-300" />
                  <p className="text-lg font-medium">Belum ada jurnal kegiatan</p>
                  <p className="text-sm">Siswa ini belum mengisi jurnal harian PKL.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-left">
                      <thead className="bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tanggal</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kegiatan</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Dokumentasi</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Feedback</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Diinput</th>
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

            <div className="flex justify-end rounded-b-xl border-t border-gray-200 bg-gray-50 p-4">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default JournalMonitoringPage;

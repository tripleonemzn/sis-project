import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../../../services/user.service';
import type { User } from '../../../types/auth';
import { Search, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } } };
    return anyErr.response?.data?.message || 'Terjadi kesalahan';
  }
  return 'Terjadi kesalahan';
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ROLE_OPTIONS: { value: 'ALL' | User['role']; label: string }[] = [
  { value: 'ALL', label: 'Semua Role' },
  { value: 'TEACHER', label: 'Guru' },
  { value: 'STUDENT', label: 'Siswa' },
  { value: 'PARENT', label: 'Orang Tua' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'PRINCIPAL', label: 'Kepala Sekolah' },
  { value: 'ADMIN', label: 'Admin' },
];

export const UserVerificationPage = () => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_OPTIONS)[number]['value']>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ['users', 'verification'],
    queryFn: async () => userService.getAll({ verificationStatus: 'PENDING' }),
  });

  const users = data?.data || [];

  const normalizedSearch = search.toLowerCase();

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== 'ALL' && user.role !== roleFilter) {
      return false;
    }

    if (!normalizedSearch) return true;

    return (
      user.name.toLowerCase().includes(normalizedSearch) ||
      user.username.toLowerCase().includes(normalizedSearch)
    );
  });

  filteredUsers.sort((a, b) => {
    const aDate = new Date(a.createdAt).getTime();
    const bDate = new Date(b.createdAt).getTime();
    return bDate - aDate;
  });

  const total = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil((total || 1) / limit));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * limit;
  const endIndex = Math.min(startIndex + limit, total);
  const pageItems = filteredUsers.slice(startIndex, endIndex);

  const verifyMutation = useMutation({
    mutationFn: async (userId: number) => {
      return userService.update(userId, { verificationStatus: 'VERIFIED' });
    },
    onSuccess: () => {
      toast.success('User berhasil diverifikasi');
      queryClient.invalidateQueries({ queryKey: ['users', 'verification'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  const bulkVerifyMutation = useMutation({
    mutationFn: async (userIds: number[]) => {
      return userService.verifyBulk(userIds);
    },
    onSuccess: (result) => {
      const count = result.data.updatedCount;
      toast.success(`Berhasil memverifikasi ${count} akun`);
      queryClient.invalidateQueries({ queryKey: ['users', 'verification'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error));
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verifikasi Akun Pengguna</h1>
          <p className="text-gray-500">
            Admin dapat memverifikasi akun yang masih menunggu persetujuan tanpa perlu akses database.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm">
          <ShieldCheck className="w-4 h-4" />
          <span>Hanya menampilkan akun dengan status PENDING</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/60">
          <div className="flex-1 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                id="search-user-verification"
                name="search-user-verification"
                placeholder="Cari nama atau username..."
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 placeholder:text-gray-400"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label htmlFor="role-filter" className="text-sm text-gray-600">
                Filter Role:
              </label>
              <select
                id="role-filter"
                name="role-filter"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as (typeof ROLE_OPTIONS)[number]['value']);
                  setPage(1);
                }}
                className="w-40 sm:w-44 pl-3 pr-8 py-2.5 bg-white text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="limit-user-verification" className="text-sm text-gray-600">
                Tampilkan:
              </label>
              <select
                id="limit-user-verification"
                name="limit-user-verification"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="w-24 sm:w-28 pl-3 pr-8 py-2.5 bg-white text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={35}>35</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Total akun menunggu verifikasi:{' '}
            <span className="font-semibold text-gray-900">{total}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (filteredUsers.length === 0) return;
                const confirmed = window.confirm(
                  `Verifikasi semua akun pada daftar saat ini (${filteredUsers.length} akun)?`,
                );
                if (!confirmed) return;
                const ids = filteredUsers.map((u) => u.id);
                bulkVerifyMutation.mutate(ids);
              }}
              disabled={filteredUsers.length === 0 || bulkVerifyMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {bulkVerifyMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Verifikasi Semua</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-100 text-xs tracking-wide">
              <tr>
                <th className="px-6 py-3">USERNAME</th>
                <th className="px-6 py-3">NAMA</th>
                <th className="px-6 py-3 whitespace-nowrap">TANGGAL REQUEST</th>
                <th className="px-6 py-3">ROLE</th>
                <th className="px-6 py-3">STATUS</th>
                <th className="px-6 py-3 w-40 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    Belum ada akun dengan status PENDING yang perlu diverifikasi.
                  </td>
                </tr>
              ) : (
                pageItems.map((user) => (
                  <tr key={user.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-600">{user.username}</td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900 group-hover:text-blue-700">
                        {user.name}
                      </div>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-gray-600">
                      {formatDateTime(user.createdAt)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          user.role === 'TEACHER'
                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                            : user.role === 'STUDENT'
                              ? 'bg-green-50 text-green-700 border-green-100'
                              : user.role === 'PARENT'
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : user.role === 'STAFF'
                                  ? 'bg-purple-50 text-purple-700 border-purple-100'
                                  : user.role === 'PRINCIPAL'
                                    ? 'bg-red-50 text-red-700 border-red-100'
                                    : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800 border border-yellow-100">
                        PENDING
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => verifyMutation.mutate(user.id)}
                        disabled={verifyMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {verifyMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>Verifikasi</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-white border-t border-gray-100">
          <p className="text-sm text-gray-600">
            Menampilkan {total === 0 ? 0 : startIndex + 1}–{endIndex} dari {total} akun
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <span className="text-sm text-gray-700">
              Halaman {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { auditService, type AuditLog } from '../../../services/audit.service';
import { authService } from '../../../services/auth.service';
import { AlertTriangle, Search, Filter, Eye, RefreshCw } from 'lucide-react';
import type { User } from '../../../types/auth';

export const AuditLogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    authService.getMe().then((res) => setMe(res.data)).catch(() => setMe(null));
  }, []);

  const page = Number(searchParams.get('page') || 1);
  const limit = Number(searchParams.get('limit') || 20);
  const search = searchParams.get('search') || '';
  const action = searchParams.get('action') || '';
  const entity = searchParams.get('entity') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', page, limit, search, action, entity, startDate, endDate],
    queryFn: () => auditService.list({ page, limit, search, action: action || undefined, entity: entity || undefined, startDate: startDate || undefined, endDate: endDate || undefined }),
    staleTime: 30_000,
  });

  const logs = data?.logs || [];
  const pagination = data?.pagination || { page, limit, total: 0, totalPages: 1 };

  const canView = useMemo(() => {
    if (!me) return false;
    if (me.role === 'ADMIN') return true;
    const duties = (me.additionalDuties || []).map((d) => String(d).trim().toUpperCase());
    return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
  }, [me]);

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  if (me && !canView) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="w-full bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-yellow-50 flex items-center justify-center">
            <AlertTriangle className="text-yellow-600" size={24} />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Akses Ditolak</h2>
          <p className="text-sm text-gray-600 mt-1">Anda tidak memiliki hak akses untuk melihat Riwayat Audit.</p>
        </div>
      </div>
    );
  }

  const setParam = (key: string, value: string) => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      if (value) p.set(key, value); else p.delete(key);
      p.set('page', '1');
      return p;
    });
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const clearFilters = () => {
    const p = new URLSearchParams();
    p.set('page', '1');
    p.set('limit', String(limit));
    setSearchParams(p);
  };

  const actionChipClasses = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-50 text-green-700 border border-green-100';
      case 'UPDATE':
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'DELETE':
        return 'bg-red-50 text-red-700 border border-red-100';
      case 'UPSERT':
        return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
      case 'TEACHER_ASSIGNMENT_COMPETENCY':
        return 'bg-teal-50 text-teal-700 border border-teal-100';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <nav className="text-sm text-gray-600">
          <ol className="list-reset flex">
            <li><a href="/dashboard" className="text-blue-600">Dashboard</a></li>
            <li className="mx-2 text-gray-400">/</li>
            <li className="text-gray-800 font-semibold">Riwayat Audit</li>
          </ol>
        </nav>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Riwayat Audit</h1>
            <p className="text-body text-gray-600">Pantau perubahan data kurikulum yang terekam.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={clearFilters}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Reset filter
            </button>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <div className="absolute left-3 top-2.5 text-gray-400"><Search size={16} /></div>
            <input
              value={search}
              onChange={(e) => setParam('search', e.target.value)}
              placeholder="Cari nama, username, aksi, entitas, alasan..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <select
              value={action}
              onChange={(e) => setParam('action', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Pilih Aksi</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="UPSERT">UPSERT</option>
              <option value="TEACHER_ASSIGNMENT_COMPETENCY">TEACHER_ASSIGNMENT_COMPETENCY</option>
            </select>
          </div>
          <div>
            <select
              value={entity}
              onChange={(e) => setParam('entity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Pilih Entitas</option>
              <option value="SUBJECT">SUBJECT</option>
              <option value="SUBJECT_CATEGORY">SUBJECT_CATEGORY</option>
              <option value="TEACHER_ASSIGNMENT">TEACHER_ASSIGNMENT</option>
              <option value="TEACHER_ASSIGNMENTS">TEACHER_ASSIGNMENTS</option>
              <option value="TEACHER_ASSIGNMENT_COMPETENCY">TEACHER_ASSIGNMENT_COMPETENCY</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setParam('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setParam('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="px-6 py-2">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600">WAKTU</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600">AKTOR</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600">AKSI</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600">ENTITAS</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600">DETAIL</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-gray-600">TINDAKAN</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                          <Filter className="text-gray-400" size={22} />
                        </div>
                        <p className="text-sm text-gray-600">Memuat data...</p>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                          <AlertTriangle className="text-gray-400" size={22} />
                        </div>
                        <p className="text-sm text-gray-600">Tidak ada data</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-700">{formatDateTime(log.createdAt)}</td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900 font-medium">{log.actor?.name || '-'}</div>
                        <div className="text-xs text-gray-500">{log.actor?.username} • {log.actorRole}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(log.actorDuties || []).map((d, i) => (
                            <span key={`${d}-${i}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
                              {d.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${actionChipClasses(log.action)}`}>
                          {log.action}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">{log.reason || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            {log.entity}
                          </span>
                          <span className="text-xs text-gray-500">ID: {log.entityId ?? '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-gray-600">
                          {log.before ? 'Ada data sebelum' : 'Tidak ada'} • {log.after ? 'Ada data sesudah' : 'Tidak ada'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
                        >
                          <Eye size={16} /> Lihat
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-600">Total: {pagination.total}</div>
          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => setParam('limit', e.target.value)}
              className="w-24 pl-3 pr-8 py-2.5 bg-gray-50 text-sm text-gray-700 rounded-xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={35}>35</option>
              <option value={50}>50</option>
            </select>
            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setParam('page', String(pagination.page - 1))}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <span className="text-sm text-gray-700 px-2">Hal {pagination.page} / {pagination.totalPages}</span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setParam('page', String(pagination.page + 1))}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/20 flex items-center justify-center z-50 backdrop-blur-[2px]">
          <div className="bg-white w-[400px] max-w-[90vw] rounded shadow-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-gray-700" />
                <h3 className="text-sm font-semibold text-gray-900">Detail Perubahan</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-gray-500 hover:text-gray-700 text-sm">Tutup</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-500">Sebelum</p>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-48">{JSON.stringify(selectedLog.before ?? {}, null, 2)}</pre>
              </div>
              <div>
                <p className="text-xs text-gray-500">Sesudah</p>
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-48">{JSON.stringify(selectedLog.after ?? {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

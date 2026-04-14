import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Loader2, Plus, Search, Warehouse, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation, useSearchParams } from 'react-router-dom';
import { tutorService } from '../../services/tutor.service';
import { isOsisExtracurricularCategory, type ExtracurricularCategory } from '../../features/extracurricular/category';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

interface InventoryItem {
  id: number;
  name: string;
  brand?: string | null;
  quantity?: number | null;
  goodQty?: number | null;
  minorDamageQty?: number | null;
  majorDamageQty?: number | null;
}

interface InventoryOverviewRow {
  assignmentId: number;
  ekskulId: number;
  ekskulName: string;
  ekskulCategory?: ExtracurricularCategory;
  academicYearId: number;
  academicYearName: string;
  room: {
    id: number;
    name: string;
    location?: string | null;
    categoryName?: string | null;
    inventoryTemplateKey?: string | null;
  } | null;
  items: InventoryItem[];
}

function resolveInventoryScope(pathname: string, rawScope: string | null): 'osis' | 'extracurricular' {
  const normalizedScope = String(rawScope || '').trim().toLowerCase();
  if (normalizedScope === 'osis') return 'osis';
  if (normalizedScope === 'extracurricular') return 'extracurricular';
  return pathname
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .includes('osis')
    ? 'osis'
    : 'extracurricular';
}

export const TutorInventoryPage = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedScope = resolveInventoryScope(location.pathname, searchParams.get('scope'));
  const scopeLabel = selectedScope === 'osis' ? 'OSIS' : 'Ekskul';
  const scopeLabelLower = selectedScope === 'osis' ? 'OSIS' : 'ekskul';
  const scopeTitle = selectedScope === 'osis' ? 'Kelola Inventaris OSIS' : 'Kelola Inventaris';
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [targetAssignmentId, setTargetAssignmentId] = useState<number | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemBrand, setItemBrand] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [goodQty, setGoodQty] = useState(1);
  const [minorDamageQty, setMinorDamageQty] = useState(0);
  const [majorDamageQty, setMajorDamageQty] = useState(0);
  const queryClient = useQueryClient();
  const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();

  const effectiveYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0) || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['tutor-inventory-overview', effectiveYearId],
    queryFn: () => tutorService.getInventoryOverview(effectiveYearId),
    enabled: !!effectiveYearId,
  });

  const rows: InventoryOverviewRow[] = useMemo(
    () => (data?.data || []) as InventoryOverviewRow[],
    [data],
  );
  const scopedRows = useMemo(
    () =>
      rows.filter((row) =>
        selectedScope === 'osis'
          ? isOsisExtracurricularCategory(row.ekskulCategory)
          : !isOsisExtracurricularCategory(row.ekskulCategory),
      ),
    [rows, selectedScope],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return scopedRows;
    return scopedRows.filter((row) => {
      const haystacks = [
        row.ekskulName,
        row.room?.name || '',
        row.room?.location || '',
        row.room?.categoryName || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [scopedRows, search]);

  const rowsWithRoom = useMemo(
    () => scopedRows.filter((row) => Boolean(row.room?.id)),
    [scopedRows],
  );

  const effectiveTargetAssignmentId = useMemo(() => {
    if (rowsWithRoom.length === 0) return null;
    if (targetAssignmentId && rowsWithRoom.some((row) => row.assignmentId === targetAssignmentId)) {
      return targetAssignmentId;
    }
    return rowsWithRoom[0].assignmentId;
  }, [rowsWithRoom, targetAssignmentId]);

  const resetCreateForm = () => {
    setItemName('');
    setItemBrand('');
    setItemDescription('');
    setGoodQty(1);
    setMinorDamageQty(0);
    setMajorDamageQty(0);
  };

  const createItemMutation = useMutation({
    mutationFn: tutorService.createInventoryItem,
    onSuccess: () => {
      toast.success('Item inventaris berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['tutor-inventory-overview'] });
      setIsCreateModalOpen(false);
      resetCreateForm();
    },
    onError: (error: unknown) => {
      let message = selectedScope === 'osis'
        ? 'Gagal menambahkan item inventaris OSIS'
        : 'Gagal menambahkan item inventaris ekskul';
      if (typeof error === 'object' && error !== null) {
        const maybeResponse = (error as { response?: { data?: { message?: unknown } } }).response;
        if (typeof maybeResponse?.data?.message === 'string' && maybeResponse.data.message.trim()) {
          message = maybeResponse.data.message;
        }
      }
      toast.error(message);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">{scopeTitle}</h1>
          <p className="text-sm text-gray-500">
            Data inventaris ini terhubung dari modul Sarpras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!rowsWithRoom.length) {
              toast.error(
                selectedScope === 'osis'
                  ? 'Ruang inventaris OSIS belum ditautkan oleh Sarpras.'
                  : 'Ruang inventaris ekskul belum ditautkan oleh Sarpras.',
              );
              return;
            }
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          disabled={!rowsWithRoom.length}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Tambah Item
        </button>
      </div>

      {!isLoadingActiveAcademicYear && !effectiveYearId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar inventaris pembina tidak ambigu.
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={selectedScope === 'osis' ? 'Cari OSIS / ruang inventaris...' : 'Cari ekskul / ruang inventaris...'}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-500">
            <Loader2 className="inline w-5 h-5 mr-2 animate-spin" />
            Memuat inventaris {scopeLabelLower}...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-500">
            Belum ada data inventaris {scopeLabelLower} untuk tahun ajaran ini.
          </div>
        ) : (
          filteredRows.map((row) => {
            const totalQty = row.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return (
              <div key={row.assignmentId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{row.ekskulName}</h2>
                    <p className="text-xs text-gray-500">{row.academicYearName}</p>
                  </div>
                  {row.room ? (
                    <div className="text-xs text-gray-600 text-right">
                      <p className="font-semibold text-gray-700">{row.room.name}</p>
                      <p>{row.room.categoryName || 'Kategori ruang belum diatur'}</p>
                      {row.room.location ? <p>{row.room.location}</p> : null}
                    </div>
                  ) : (
                    <div className="inline-flex items-center text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                      <Warehouse className="w-3.5 h-3.5 mr-1" />
                      Ruang inventaris {scopeLabelLower} belum ditautkan oleh Sarpras
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <span>Total Item: {row.items.length}</span>
                  <span>Total Qty: {totalQty}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-5 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barang</th>
                        <th className="px-5 py-2 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                        <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">Baik</th>
                        <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rusak Ringan</th>
                        <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rusak Berat</th>
                        <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {row.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-4 text-center text-sm text-gray-500">
                            Belum ada item inventaris untuk {scopeLabelLower} ini.
                          </td>
                        </tr>
                      ) : (
                        row.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-5 py-3 text-sm text-gray-900">
                              <div className="inline-flex items-center">
                                <Box className="w-4 h-4 mr-2 text-gray-400" />
                                {item.name}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-sm text-gray-500">{item.brand || '-'}</td>
                            <td className="px-5 py-3 text-sm text-right text-gray-700">{item.goodQty ?? 0}</td>
                            <td className="px-5 py-3 text-sm text-right text-gray-700">{item.minorDamageQty ?? 0}</td>
                            <td className="px-5 py-3 text-sm text-right text-gray-700">{item.majorDamageQty ?? 0}</td>
                            <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900">{item.quantity ?? 0}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
              <h3 className="font-semibold text-gray-900">Tambah Item {scopeTitle}</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="p-6 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!effectiveTargetAssignmentId) {
                  toast.error(`Pilih ${scopeLabel} tujuan terlebih dahulu.`);
                  return;
                }
                if (!itemName.trim()) {
                  toast.error('Nama barang wajib diisi.');
                  return;
                }
                if (goodQty < 0 || minorDamageQty < 0 || majorDamageQty < 0) {
                  toast.error('Jumlah inventaris tidak boleh negatif.');
                  return;
                }

                createItemMutation.mutate({
                  assignmentId: effectiveTargetAssignmentId,
                  name: itemName.trim(),
                  brand: itemBrand.trim() || undefined,
                  description: itemDescription.trim() || undefined,
                  goodQty,
                  minorDamageQty,
                  majorDamageQty,
                });
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{scopeLabel} Tujuan</label>
                <select
                  value={effectiveTargetAssignmentId || ''}
                  onChange={(event) => setTargetAssignmentId(Number(event.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                >
                  {rowsWithRoom.map((row) => (
                    <option key={row.assignmentId} value={row.assignmentId}>
                      {row.ekskulName} - {row.room?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Barang</label>
                <input
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  placeholder="Contoh: Bola Futsal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Merk</label>
                <input
                  value={itemBrand}
                  onChange={(event) => setItemBrand(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  placeholder="Contoh: Molten"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Baik</label>
                  <input
                    type="number"
                    min={0}
                    value={goodQty}
                    onChange={(event) => setGoodQty(Number(event.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rusak Ringan</label>
                  <input
                    type="number"
                    min={0}
                    value={minorDamageQty}
                    onChange={(event) => setMinorDamageQty(Number(event.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rusak Berat</label>
                  <input
                    type="number"
                    min={0}
                    value={majorDamageQty}
                    onChange={(event) => setMajorDamageQty(Number(event.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                <textarea
                  rows={3}
                  value={itemDescription}
                  onChange={(event) => setItemDescription(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  placeholder="Catatan tambahan inventaris (opsional)."
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createItemMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  {createItemMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Simpan Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

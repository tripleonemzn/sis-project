import { useState } from 'react';
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Box,
  Tag,
  Calendar,
  Banknote
} from 'lucide-react';
import { inventoryService, type InventoryItem, type CreateInventoryPayload } from '../../../../services/inventory.service';
import { authService } from '../../../../services/auth.service';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export const InventoryDetailPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const { user: contextUser } = useOutletContext<{ user: any }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  
  const user = contextUser || authData?.data;
  
  // Check if user has write access
  const canEdit = user?.role === 'ADMIN' || 
                  user?.additionalDuties?.includes('WAKASEK_SARPRAS') || 
                  user?.additionalDuties?.includes('SEKRETARIS_SARPRAS') ||
                  user?.additionalDuties?.includes('KEPALA_LAB') ||
                  user?.additionalDuties?.includes('KEPALA_PERPUSTAKAAN');

  // Fetch Room Details
  const { data: roomData, isLoading: isRoomLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => inventoryService.getRoom(Number(roomId)),
    enabled: !!roomId
  });

  // Fetch Inventory Items
  const { data: itemsData, isLoading: isItemsLoading } = useQuery({
    queryKey: ['inventory', roomId],
    queryFn: () => inventoryService.getInventoryByRoom(Number(roomId)),
    enabled: !!roomId
  });

  const room = roomData?.data;
  const items = itemsData?.data || [];

  const filteredItems = items.filter((item: InventoryItem) => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.brand?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const deleteMutation = useMutation({
    mutationFn: inventoryService.deleteInventory,
    onSuccess: () => {
      toast.success('Item berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['inventory', roomId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menghapus item');
    }
  });

  const handleDelete = (id: number) => {
    if (confirm('Apakah Anda yakin ingin menghapus item ini?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isRoomLoading) {
    return <div className="p-6 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!room) {
    return <div className="p-6 text-center text-gray-500">Ruangan tidak ditemukan</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <button 
          onClick={() => {
            const base =
              location.pathname.includes('/teacher/head-lab')
                ? '/teacher/head-lab/inventory'
                : location.pathname.includes('/teacher/head-library')
                  ? '/teacher/head-library/inventory'
                  : '/teacher/sarpras/inventory';
            const suffix = room?.categoryId ? `?tab=${room.categoryId}` : '';
            const filter = location.pathname.includes('/teacher/head-lab')
              ? (suffix ? '&filter=lab' : '?filter=lab')
              : location.pathname.includes('/teacher/head-library')
                ? (suffix ? '&filter=library' : '?filter=library')
                : '';
            navigate(`${base}${suffix}${filter}`);
          }}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors w-fit"
        >
          <ArrowLeft size={20} />
          Kembali ke Daftar Ruangan
        </button>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Box className="text-blue-600" />
              Inventaris: {room.name}
            </h1>
            <p className="text-gray-500 flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium uppercase tracking-wide">
                {room.type}
              </span>
              <span>•</span>
              <span>{items.length} Item</span>
            </p>
          </div>
          
          {canEdit && (
            <button
              onClick={() => {
                setEditingItem(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors gap-2"
            >
              <Plus size={20} />
              <span>Tambah Item</span>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Cari nama barang, kode, atau merk..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-96 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border border-gray-200">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="divide-x divide-gray-200 border-b border-gray-200">
                <th rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">NAMA BARANG</th>
                <th rowSpan={2} className="px-3 h-12 font-medium text-gray-700 text-center align-middle w-20">JUMLAH</th>
                <th className="px-4 h-12 font-medium text-gray-700 text-center align-middle border-r border-gray-200" colSpan={3}>KONDISI</th>
                <th rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">KETERANGAN</th>
                <th rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">INFO PEMBELIAN</th>
                {canEdit && <th rowSpan={2} className="px-3 h-12 font-medium text-gray-700 text-center align-middle w-20">AKSI</th>}
              </tr>
              <tr className="divide-x divide-gray-200">
                <th className="px-3 py-2 font-medium text-gray-700 text-center align-middle w-20 whitespace-normal break-words">BAIK</th>
                <th className="px-3 py-2 font-medium text-gray-700 text-center align-middle w-20 whitespace-normal break-words">RUSAK RINGAN</th>
                <th className="px-3 py-2 font-medium text-gray-700 text-center align-middle w-20 whitespace-normal break-words border-r border-gray-200">RUSAK BERAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isItemsLoading ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-6 py-12 text-center text-gray-500">
                    Belum ada data inventaris
                  </td>
                </tr>
              ) : (
                filteredItems.map((item: InventoryItem) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors divide-x divide-gray-200">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-gray-900 text-left">{item.name}</div>
                    </td>
                    <td className="px-3 py-3 align-middle text-center w-20">
                      <span className="font-medium">{item.quantity}</span>
                      <span className="text-gray-500 text-xs ml-1">Unit</span>
                    </td>
                    {(() => {
                      const good = item.goodQty ?? (item.condition === 'BAIK' ? item.quantity : 0);
                      const minor = item.minorDamageQty ?? (item.condition === 'RUSAK_RINGAN' ? item.quantity : 0);
                      const major = item.majorDamageQty ?? (item.condition === 'RUSAK_BERAT' ? item.quantity : 0);
                      return (
                        <>
                          <td className="px-3 py-3 text-center w-20 align-middle">
                            <span className="font-medium">{good}</span>
                          </td>
                          <td className="px-3 py-3 text-center w-20 align-middle">
                            <span className="font-medium">{minor}</span>
                          </td>
                          <td className="px-3 py-3 text-center w-20 align-middle border-r border-gray-200">
                            <span className="font-medium">{major}</span>
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-4 py-3 align-middle text-center">
                      {item.description ? (
                        <div className="text-gray-600 text-sm">{item.description}</div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 align-middle text-center">
                      <div className="flex flex-col gap-1 text-xs items-center">
                        {item.purchaseDate && (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            {format(new Date(item.purchaseDate), 'dd MMM yyyy', { locale: idLocale })}
                          </div>
                        )}
                        {item.price && (
                          <div className="flex items-center gap-1">
                            <Banknote size={12} />
                            Rp {item.price.toLocaleString('id-ID')}
                          </div>
                        )}
                        {item.source && (
                          <div className="flex items-center gap-1">
                            <Tag size={12} />
                            {item.source}
                          </div>
                        )}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-3 text-center w-20 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleEdit(item)}
                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <InventoryModal 
          roomId={Number(roomId)}
          item={editingItem}
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
};

const InventoryModal = ({ roomId, item, onClose }: { roomId: number, item: InventoryItem | null, onClose: () => void }) => {
  const queryClient = useQueryClient();
  const isEditing = !!item;
  
  const [formData, setFormData] = useState<Partial<CreateInventoryPayload>>({
    roomId,
    name: item?.name || '',
    code: item?.code || '',
    brand: item?.brand || '',
    quantity: item?.quantity || 0,
    goodQty: item?.goodQty || 0,
    minorDamageQty: item?.minorDamageQty || 0,
    majorDamageQty: item?.majorDamageQty || 0,
    condition: item?.condition || 'BAIK', // Legacy
    purchaseDate: item?.purchaseDate ? new Date(item.purchaseDate).toISOString().split('T')[0] : '',
    price: item?.price || 0,
    source: item?.source || '',
    description: item?.description || ''
  });

  // Calculate total quantity automatically
  const totalQuantity = (formData.goodQty || 0) + (formData.minorDamageQty || 0) + (formData.majorDamageQty || 0);

  const mutation = useMutation({
    mutationFn: (data: CreateInventoryPayload) => {
      return isEditing 
        ? inventoryService.updateInventory(item!.id, data)
        : inventoryService.createInventory(data);
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Item berhasil diperbarui' : 'Item berhasil ditambahkan');
      queryClient.invalidateQueries({ queryKey: ['inventory', String(roomId)] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menyimpan item');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure total quantity matches sum
    if (totalQuantity === 0) {
      toast.error('Total jumlah barang tidak boleh 0');
      return;
    }
    mutation.mutate({
      ...formData,
      quantity: totalQuantity
    } as CreateInventoryPayload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 m-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Item Inventaris' : 'Tambah Item Baru'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nama Barang <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Contoh: Meja Guru"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kode Barang</label>
              <input
                type="text"
                value={formData.code}
                onChange={e => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Opsional"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Merk / Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={e => setFormData({ ...formData, brand: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Opsional"
              />
            </div>

            {/* Quantity Breakdown Section */}
            <div className="col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-900 mb-3">Rincian Kondisi & Jumlah</label>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-green-700 mb-1">Baik</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.goodQty}
                    onChange={e => setFormData({ ...formData, goodQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-yellow-700 mb-1">Rusak Ringan</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minorDamageQty}
                    onChange={e => setFormData({ ...formData, minorDamageQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">Rusak Berat</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.majorDamageQty}
                    onChange={e => setFormData({ ...formData, majorDamageQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end items-center gap-2 text-sm">
                <span className="text-gray-500">Total Jumlah:</span>
                <span className="font-bold text-gray-900 text-lg">{totalQuantity}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Pembelian</label>
              <input
                type="date"
                value={formData.purchaseDate}
                onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Harga Satuan (Rp)</label>
              <input
                type="number"
                min="0"
                value={formData.price}
                onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Sumber Dana</label>
              <input
                type="text"
                value={formData.source}
                onChange={e => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Contoh: BOS 2024, Hibah Alumni, dll"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Keterangan tambahan..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

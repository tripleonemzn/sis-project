import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useOutletContext, useNavigate, useLocation } from 'react-router-dom';
import { 
  School, 
  FlaskConical, 
  Dumbbell, 
  Landmark, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  MapPin, 
  Users, 
  Box, 
  Layers
} from 'lucide-react';
import { inventoryService, type Room, type CreateRoomPayload, type RoomCategory } from '../../../../services/inventory.service';
import { authService } from '../../../../services/auth.service';
import toast from 'react-hot-toast';

export const InventoryHubPage = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTabId = searchParams.get('tab');
  // Derive filter from URL param or pathname context
  let filterParam = (searchParams.get('filter') || '').toLowerCase(); // 'lab' | 'library' | ''
  const pathname = location.pathname.toLowerCase();
  if (!filterParam) {
    if (pathname.includes('/teacher/head-lab')) filterParam = 'lab';
    else if (pathname.includes('/teacher/head-library')) filterParam = 'library';
  }
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isEditCategoryModalOpen, setIsEditCategoryModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const queryClient = useQueryClient(); // Ensure this is available if not already
  
  const { user: contextUser } = useOutletContext<{ user: any }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  
  const user = contextUser || authData?.data;

  // Check if user has write access (Wakasek Sarpras or Secretary)
  const canEdit = user?.role === 'ADMIN' || 
                  user?.additionalDuties?.includes('WAKASEK_SARPRAS') || 
                  user?.additionalDuties?.includes('SEKRETARIS_SARPRAS');

  // Fetch Categories
  const { data: categoriesData } = useQuery({
    queryKey: ['roomCategories'],
    queryFn: inventoryService.getRoomCategories,
  });

  const categories: RoomCategory[] = (categoriesData?.data || []).filter((c: RoomCategory) => {
    const name = c.name.toLowerCase();
    if (filterParam === 'lab') {
      return name.includes('praktik') || name.includes('lab');
    }
    if (filterParam === 'library') {
      return name.includes('perpustakaan') || name.includes('pustaka');
    }
    return true;
  });

  const activeCategory = categories.find(c => c.id === Number(currentTabId)) || categories[0];

  const deleteCategoryMutation = useMutation({
    mutationFn: inventoryService.deleteRoomCategory,
    onSuccess: () => {
      toast.success('Kategori berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['roomCategories'] });
      setSearchParams({});
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menghapus kategori');
    }
  });

  const handleDeleteCategory = () => {
    if (!activeCategory) return;
    if (confirm(`Apakah Anda yakin ingin menghapus kategori "${activeCategory.name}"? Semua ruangan di dalamnya harus dihapus terlebih dahulu.`)) {
      deleteCategoryMutation.mutate(activeCategory.id);
    }
  };

  // Set default tab if none selected
  useEffect(() => {
    if ((!currentTabId || !categories.some(c => c.id === Number(currentTabId))) && categories.length > 0) {
      const params: Record<string, string> = { tab: String(categories[0].id) };
      if (filterParam) params.filter = filterParam;
      setSearchParams(params);
    }
  }, [categories, currentTabId, setSearchParams]);

  const { data: roomsData, isLoading } = useQuery({
    queryKey: ['rooms', activeCategory?.id],
    queryFn: () => activeCategory ? inventoryService.getRooms({ categoryId: activeCategory.id }) : { data: [] },
    enabled: !!activeCategory,
  });

  const rooms = roomsData?.data || [];
  const filteredRooms = rooms.filter((room: Room) => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const pageTitle = filterParam === 'lab'
    ? 'Inventaris Lab'
    : filterParam === 'library'
      ? 'Inventaris Perpustakaan'
      : 'Aset Sekolah';
  const pageSubtitle = filterParam === 'lab'
    ? 'Kelola data ruangan dan inventaris laboratorium'
    : filterParam === 'library'
      ? 'Kelola data ruangan dan inventaris perpustakaan'
      : 'Kelola data ruangan dan aset sekolah';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-500">{pageSubtitle}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors gap-2"
          >
            <Layers size={20} />
            <span>Tambah Kategori Ruang</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="border-b border-gray-200 mb-4">
          <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-hide">
            {categories.map((category) => {
              const isActive = Number(currentTabId) === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSearchParams({ tab: String(category.id) })}
                  className={`
                    flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors
                    ${isActive 
                      ? 'border-blue-600 text-blue-600 font-medium' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                  `}
                >
                  {category.name.toLowerCase().includes('kelas') ? <School size={18} /> :
                   category.name.toLowerCase().includes('lab') ? <FlaskConical size={18} /> :
                   category.name.toLowerCase().includes('olahraga') ? <Dumbbell size={18} /> :
                   category.name.toLowerCase().includes('ibadah') ? <Landmark size={18} /> :
                   <Box size={18} />}
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Cari ruangan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-96 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {canEdit && activeCategory && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditCategoryModalOpen(true)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
                title="Edit Kategori"
              >
                <Edit size={20} />
              </button>
              <button
                onClick={handleDeleteCategory}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
                title="Hapus Kategori"
              >
                <Trash2 size={20} />
              </button>
              <button
                onClick={() => setIsRoomModalOpen(true)}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors gap-2"
              >
                <Plus size={20} />
                <span>Tambah Ruangan</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <div className="bg-white p-4 rounded-full inline-block shadow-sm mb-4">
            <School className="text-gray-400" size={32} />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Belum ada data ruangan</h3>
          <p className="text-gray-500 mt-1">
            Silakan tambahkan ruangan baru untuk kategori <strong>{activeCategory?.name}</strong>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredRooms.map((room: Room) => (
            <RoomCard 
              key={room.id} 
              room={room} 
              canEdit={canEdit}
              onEdit={(room) => {
                setEditingRoom(room);
                setIsEditRoomModalOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Add Category Modal */}
      {isCategoryModalOpen && (
        <AddCategoryModal 
          onClose={() => setIsCategoryModalOpen(false)} 
        />
      )}

      {/* Edit Category Modal */}
      {isEditCategoryModalOpen && activeCategory && (
        <EditCategoryModal 
          category={activeCategory}
          onClose={() => setIsEditCategoryModalOpen(false)} 
        />
      )}

      {/* Add Room Modal */}
      {isRoomModalOpen && activeCategory && (
        <AddRoomModal 
          onClose={() => setIsRoomModalOpen(false)} 
          categoryId={activeCategory.id}
          categoryName={activeCategory.name}
        />
      )}

      {/* Edit Room Modal */}
      {isEditRoomModalOpen && editingRoom && (
        <EditRoomModal 
          room={editingRoom}
          onClose={() => setIsEditRoomModalOpen(false)} 
        />
      )}
    </div>
  );
};

const RoomCard = ({ room, canEdit, onEdit }: { room: Room; canEdit: boolean; onEdit?: (room: Room) => void }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const deleteMutation = useMutation({
    mutationFn: inventoryService.deleteRoom,
    onSuccess: () => {
      toast.success('Ruangan berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal menghapus ruangan');
    }
  });

  const handleDelete = () => {
    if ((room._count?.items || 0) > 0) {
      toast.error('Ruangan tidak dapat dihapus karena masih memiliki Item/Daftar Inventaris di dalamnya.');
      return;
    }
    if (confirm('Apakah Anda yakin ingin menghapus ruangan ini?')) {
      deleteMutation.mutate(room.id);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <School size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{room.name}</h3>
            <p className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-1 animate-pulse
              ${room.condition === 'BAIK' ? 'bg-green-100 text-green-700' : 
                room.condition === 'RUSAK_RINGAN' ? 'bg-yellow-100 text-yellow-700' : 
                'bg-red-100 text-red-700'}
            `}>
              {room.condition?.replace('_', ' ') || 'KONDISI TIDAK DIKETAHUI'}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(room);
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit Ruangan"
            >
              <Edit size={18} />
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Hapus Ruangan"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3 text-sm text-gray-600 mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-gray-400" />
          <span>{room.location || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          <span>Kapasitas: {room.capacity || 0} orang</span>
        </div>
        <div className="flex items-center gap-2">
          <Box size={16} className="text-gray-400" />
          <span>{room._count?.items || 0} Item Inventaris</span>
        </div>
      </div>

      <button 
        onClick={() => navigate(String(room.id))}
        className="w-full py-2 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
      >
        Lihat Detail Inventaris
      </button>
    </div>
  );
};

const AddCategoryModal = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: inventoryService.createRoomCategory,
    onSuccess: () => {
      toast.success('Kategori berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['roomCategories'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal membuat kategori');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name, description });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Tambah Kategori Ruang</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kategori</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Kantin, Gudang, Parkiran"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi (Opsional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Keterangan singkat kategori ini"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Kategori'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddRoomModal = ({ onClose, categoryId, categoryName }: { onClose: () => void; categoryId: number; categoryName: string }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateRoomPayload>>({
    name: '',
    categoryId: categoryId,
    capacity: 0,
    location: '',
    condition: 'BAIK',
    description: ''
  });

  const createMutation = useMutation({
    mutationFn: inventoryService.createRoom,
    onSuccess: () => {
      toast.success('Ruangan berhasil dibuat');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal membuat ruangan');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData as CreateRoomPayload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Tambah Ruangan Baru</h2>
            <p className="text-sm text-gray-500">Kategori: {categoryName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Ruangan</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Lab Komputer 1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kondisi</label>
              <select
                value={formData.condition}
                onChange={e => setFormData({ ...formData, condition: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="BAIK">Baik</option>
                <option value="RUSAK_RINGAN">Rusak Ringan</option>
                <option value="RUSAK_BERAT">Rusak Berat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
            <input
              type="text"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Gedung A Lt. 2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kondisi</label>
            <select
              value={formData.condition}
              onChange={e => setFormData({ ...formData, condition: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="BAIK">Baik</option>
              <option value="RUSAK_RINGAN">Rusak Ringan</option>
              <option value="RUSAK_BERAT">Rusak Berat</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan Ruangan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EditRoomModal = ({ room, onClose }: { room: Room; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateRoomPayload>>({
    name: room.name,
    categoryId: room.categoryId,
    capacity: room.capacity || 0,
    location: room.location || '',
    condition: room.condition || 'BAIK',
    description: room.description || ''
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateRoomPayload>) => inventoryService.updateRoom(room.id, data),
    onSuccess: () => {
      toast.success('Ruangan berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal memperbarui ruangan');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Ruangan</h2>
            <p className="text-sm text-gray-500">{room.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Ruangan</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Lab Komputer 1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kondisi</label>
              <select
                value={formData.condition}
                onChange={e => setFormData({ ...formData, condition: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="BAIK">Baik</option>
                <option value="RUSAK_RINGAN">Rusak Ringan</option>
                <option value="RUSAK_BERAT">Rusak Berat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kapasitas</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
            <input
              type="text"
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Gedung A Lt. 2"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryHubPage;

const EditCategoryModal = ({ category, onClose }: { category: RoomCategory; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description || '');

  const updateMutation = useMutation({
    mutationFn: (data: any) => inventoryService.updateRoomCategory(category.id, data),
    onSuccess: () => {
      toast.success('Kategori berhasil diperbarui');
      queryClient.invalidateQueries({ queryKey: ['roomCategories'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Gagal memperbarui kategori');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, description });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Edit Kategori Ruang</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Kategori <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Contoh: Laboratorium"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deskripsi
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Deskripsi singkat kategori..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

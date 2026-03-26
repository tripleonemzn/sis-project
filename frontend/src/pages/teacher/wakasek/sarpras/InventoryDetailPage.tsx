import { useMemo, useState } from 'react';
import { useParams, useNavigate, useOutletContext, useLocation, Navigate } from 'react-router-dom';
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
import {
  getInventoryTemplateProfile,
  resolveInventoryTemplateKey,
  type InventoryAttributeField,
  type InventoryTemplateProfile,
} from '../../../../features/inventory/inventoryTemplateProfiles';
import { authService } from '../../../../services/auth.service';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

type InventoryAttributeMap = Record<string, string | number>;
type InventoryDetailContextUser = {
  id?: number;
  role?: string;
  additionalDuties?: string[] | null;
  managedInventoryRooms?: {
    id: number;
    name: string;
    managerUserId?: number | null;
  }[] | null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return err.response?.data?.message || err.message || fallback;
  }
  return fallback;
};

function normalizeItemAttributes(item?: InventoryItem | null): InventoryAttributeMap {
  if (!item?.attributes || typeof item.attributes !== 'object' || Array.isArray(item.attributes)) {
    return {};
  }
  const entries = Object.entries(item.attributes as Record<string, unknown>);
  const next: InventoryAttributeMap = {};
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' || typeof value === 'string') {
      next[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      next[key] = value ? 'Ya' : 'Tidak';
      continue;
    }
  }
  return next;
}

function toAttributeText(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export const InventoryDetailPage = () => {
  const { roomId } = useParams();
  const normalizedRoomId = Number(roomId);
  const hasValidRoomId = Number.isInteger(normalizedRoomId) && normalizedRoomId > 0;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const { user: contextUser } = useOutletContext<{ user?: InventoryDetailContextUser }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  });
  
  const user = contextUser || authData?.data;
  
  // Check if user has write access
  const baseCanEdit = user?.role === 'ADMIN' || 
                user?.additionalDuties?.includes('WAKASEK_SARPRAS') || 
                user?.additionalDuties?.includes('SEKRETARIS_SARPRAS') ||
                user?.additionalDuties?.includes('KEPALA_LAB') ||
                user?.additionalDuties?.includes('KEPALA_PERPUSTAKAAN');

  // Fetch Room Details
  const { data: roomData, isLoading: isRoomLoading } = useQuery({
    queryKey: ['room', normalizedRoomId],
    queryFn: () => inventoryService.getRoom(normalizedRoomId),
    enabled: hasValidRoomId,
  });

  const isAssignedInventoryPath = location.pathname.includes('/assigned-inventory');
  const { data: assignedRoomsData } = useQuery({
    queryKey: ['assigned-rooms-fallback', user?.id],
    queryFn: () => inventoryService.getAssignedRooms(),
    enabled: hasValidRoomId && isAssignedInventoryPath,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Fetch Inventory Items
  const { data: itemsData, isLoading: isItemsLoading } = useQuery({
    queryKey: ['inventory', normalizedRoomId],
    queryFn: () => inventoryService.getInventoryByRoom(normalizedRoomId),
    enabled: hasValidRoomId,
  });

  const assignedRoomFallbackFromQuery = Array.isArray(assignedRoomsData?.data)
    ? assignedRoomsData.data.find((entry: { id?: number }) => Number(entry?.id) === normalizedRoomId)
    : null;
  const assignedRoomFallbackFromProfile = Array.isArray(user?.managedInventoryRooms)
    ? user.managedInventoryRooms.find((entry) => Number(entry?.id) === normalizedRoomId)
    : null;
  const assignedRoomFallback = assignedRoomFallbackFromQuery || assignedRoomFallbackFromProfile || null;
  const room = roomData?.data || assignedRoomFallback;
  const canEdit = Boolean(baseCanEdit || (user?.id && room?.managerUserId && Number(user.id) === Number(room.managerUserId)));
  const items = itemsData?.data || [];
  const isAssignedFallbackLoading = Boolean(isAssignedInventoryPath && !roomData?.data && !assignedRoomFallback && assignedRoomsData === undefined);

  const templateKey = useMemo(
    () =>
      resolveInventoryTemplateKey({
        templateKey: room?.category?.inventoryTemplateKey,
        categoryName: room?.category?.name,
      }),
    [room?.category?.inventoryTemplateKey, room?.category?.name],
  );

  const templateProfile = useMemo(() => getInventoryTemplateProfile(templateKey), [templateKey]);
  const tableAttributeFields = useMemo(
    () => templateProfile.attributeFields.filter((field) => field.table),
    [templateProfile.attributeFields],
  );
  const totalColumnCount = useMemo(() => {
    let total = 0;
    total += 1; // item name
    total += 1; // quantity
    total += 3; // condition breakdown
    total += tableAttributeFields.length; // dynamic attributes
    total += 1; // description
    if (templateProfile.showPurchaseInfo) total += 1; // purchase info
    if (canEdit) total += 1; // actions
    return total;
  }, [tableAttributeFields.length, templateProfile.showPurchaseInfo, canEdit]);

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
      queryClient.invalidateQueries({ queryKey: ['inventory', normalizedRoomId] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus item'));
    }
  });

  const handleDelete = (id: number) => {
    if (confirm('Apakah Anda yakin ingin menghapus item ini?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isRoomLoading || isAssignedFallbackLoading) {
    return <div className="p-6 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (location.pathname.includes('/tutor/assigned-inventory')) {
    const normalizedRoomName = String(room?.name || assignedRoomFallback?.name || '').trim().toUpperCase();
    if (!room || normalizedRoomName.includes('OSIS')) {
      return <Navigate to="/tutor/inventory" replace />;
    }
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
              location.pathname.includes('/teacher/assigned-inventory')
                ? '/teacher/assigned-inventory'
                : location.pathname.includes('/tutor/assigned-inventory')
                  ? '/tutor/assigned-inventory'
                : location.pathname.includes('/staff/assigned-inventory')
                  ? '/staff/assigned-inventory'
                  : location.pathname.includes('/principal/assigned-inventory')
                    ? '/principal/assigned-inventory'
                    : location.pathname.includes('/teacher/head-lab')
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
            navigate(location.pathname.includes('/assigned-inventory') ? base : `${base}${suffix}${filter}`);
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
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium uppercase tracking-wide">
                Template {templateProfile.label}
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
                <th rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">
                  {templateProfile.itemNameLabel.toUpperCase()}
                </th>
                <th rowSpan={2} className="px-3 h-12 font-medium text-gray-700 text-center align-middle w-24">
                  {templateProfile.quantityLabel.toUpperCase()}
                </th>
                <th className="px-4 h-12 font-medium text-gray-700 text-center align-middle border-r border-gray-200" colSpan={3}>
                  {templateProfile.conditionLabel.toUpperCase()}
                </th>
                {tableAttributeFields.map((field) => (
                  <th key={`head-${field.key}`} rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">
                    {field.label.toUpperCase()}
                  </th>
                ))}
                <th rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">
                  {templateProfile.descriptionLabel.toUpperCase()}
                </th>
                {templateProfile.showPurchaseInfo ? (
                  <th rowSpan={2} className="px-4 h-12 font-medium text-gray-700 text-center align-middle">
                    {templateProfile.purchaseInfoLabel.toUpperCase()}
                  </th>
                ) : null}
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
                  <td colSpan={totalColumnCount} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={totalColumnCount} className="px-6 py-12 text-center text-gray-500">
                    Belum ada data inventaris
                  </td>
                </tr>
              ) : (
                filteredItems.map((item: InventoryItem) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors divide-x divide-gray-200">
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-gray-900 text-left">{item.name}</div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {templateProfile.showCode && item.code ? <div>{templateProfile.codeLabel}: {item.code}</div> : null}
                        {templateProfile.showBrand && item.brand ? <div>{templateProfile.brandLabel}: {item.brand}</div> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle text-center w-24">
                      <span className="font-medium">{item.quantity}</span>
                      <span className="text-gray-500 text-xs ml-1">
                        {templateProfile.key === 'LIBRARY' ? 'Eks' : 'Unit'}
                      </span>
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
                    {tableAttributeFields.map((field) => {
                      const attrs = normalizeItemAttributes(item);
                      const rawValue =
                        field.key === 'category'
                          ? attrs.category ?? attrs.shelfCode
                          : attrs[field.key];
                      return (
                        <td key={`${item.id}-${field.key}`} className="px-4 py-3 align-middle text-center">
                          <span className="text-gray-700">{toAttributeText(rawValue)}</span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 align-middle text-center">
                      {item.description ? (
                        <div className="text-gray-600 text-sm">{item.description}</div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">-</span>
                      )}
                    </td>
                    {templateProfile.showPurchaseInfo ? (
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
                    ) : null}
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
          roomId={normalizedRoomId}
          item={editingItem}
          templateProfile={templateProfile}
          onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
};

const InventoryModal = ({
  roomId,
  item,
  templateProfile,
  onClose,
}: {
  roomId: number;
  item: InventoryItem | null;
  templateProfile: InventoryTemplateProfile;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const isEditing = !!item;
  const attributeFields = templateProfile.attributeFields;
  const isLibraryTemplate = templateProfile.key === 'LIBRARY';
  const [isCategoryCreatorOpen, setIsCategoryCreatorOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const { data: allLibraryItemsData } = useQuery({
    queryKey: ['inventory', String(roomId)],
    queryFn: () => inventoryService.getInventoryByRoom(roomId),
    enabled: isLibraryTemplate,
  });
  
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
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>(() => {
    const current = normalizeItemAttributes(item);
    const result: Record<string, string> = {};
    for (const field of attributeFields) {
      const value = current[field.key];
      if (value !== undefined && value !== null) {
        result[field.key] = String(value);
      }
    }
    if (templateProfile.key === 'LIBRARY' && !result.author && item?.brand) {
      result.author = item.brand;
    }
    if (templateProfile.key === 'LIBRARY' && !result.category && current.shelfCode) {
      result.category = String(current.shelfCode);
    }
    return result;
  });

  const libraryCategoryOptions = useMemo(() => {
    if (!isLibraryTemplate) return [];
    const options = new Set<string>();
    const allItems: InventoryItem[] = allLibraryItemsData?.data || [];
    allItems.forEach((row) => {
      const attrs = normalizeItemAttributes(row);
      const category = String(attrs.category ?? attrs.shelfCode ?? '').trim();
      if (category) options.add(category);
    });
    const currentCategory = String(attributeValues.category || '').trim();
    if (currentCategory) options.add(currentCategory);
    return Array.from(options).sort((a, b) => a.localeCompare(b, 'id'));
  }, [allLibraryItemsData?.data, attributeValues.category, isLibraryTemplate]);

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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan item'));
    }
  });

  const removeCategoryMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      const normalizedTarget = categoryName.trim().toLowerCase();
      if (!normalizedTarget) {
        throw new Error('Pilih kategori yang ingin dihapus.');
      }

      const allItems: InventoryItem[] = allLibraryItemsData?.data || [];
      const affectedItems = allItems.filter((row) => {
        const attrs = normalizeItemAttributes(row);
        const rowCategory = String(attrs.category ?? attrs.shelfCode ?? '').trim().toLowerCase();
        return rowCategory === normalizedTarget;
      });

      if (affectedItems.length === 0) {
        return { updatedCount: 0 };
      }

      await Promise.all(
        affectedItems.map((row) => {
          const attrs = normalizeItemAttributes(row);
          const nextAttributes = Object.entries(attrs).reduce<Record<string, string | number>>((acc, [key, value]) => {
            if (key === 'category' || key === 'shelfCode') return acc;
            if (typeof value === 'number') {
              acc[key] = value;
              return acc;
            }
            const trimmed = String(value || '').trim();
            if (!trimmed) return acc;
            acc[key] = trimmed;
            return acc;
          }, {});
          return inventoryService.updateInventory(row.id, {
            attributes: nextAttributes,
          });
        }),
      );

      return { updatedCount: affectedItems.length };
    },
    onSuccess: (result, deletedCategory) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', String(roomId)] });
      if (String(attributeValues.category || '').trim().toLowerCase() === deletedCategory.trim().toLowerCase()) {
        setAttributeValues((prev) => ({ ...prev, category: '' }));
      }
      if (result.updatedCount > 0) {
        toast.success(`Kategori "${deletedCategory}" berhasil dihapus dari ${result.updatedCount} item.`);
      } else {
        toast.success(`Kategori "${deletedCategory}" sudah tidak digunakan.`);
      }
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menghapus kategori buku.'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure total quantity matches sum
    if (totalQuantity === 0) {
      toast.error('Total jumlah barang tidak boleh 0');
      return;
    }
    if (isLibraryTemplate && !String(attributeValues.category || '').trim()) {
      toast.error('Kategori buku wajib diisi.');
      return;
    }
    const cleanedAttributes = Object.entries(attributeValues).reduce<Record<string, string | number>>(
      (acc, [key, value]) => {
        const normalized = String(value || '').trim();
        if (!normalized) return acc;
        const field = attributeFields.find((item) => item.key === key);
        if (field?.type === 'number') {
          const asNumber = Number(normalized);
          acc[key] = Number.isFinite(asNumber) ? asNumber : normalized;
          return acc;
        }
        acc[key] = normalized;
        return acc;
      },
      {},
    );
    mutation.mutate({
      ...formData,
      quantity: totalQuantity,
      attributes: cleanedAttributes,
      brand: isLibraryTemplate ? undefined : formData.brand,
      purchaseDate: templateProfile.showPurchaseInfo ? formData.purchaseDate : undefined,
      price: templateProfile.showPurchaseInfo ? formData.price : undefined,
      source: templateProfile.showPurchaseInfo ? formData.source : undefined,
    } as CreateInventoryPayload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 m-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? 'Edit Item Inventaris' : 'Tambah Item Baru'}
            </h2>
            <p className="text-xs text-blue-700 mt-1">Template: {templateProfile.label}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {templateProfile.itemNameLabel} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={templateProfile.key === 'LIBRARY' ? 'Contoh: Laskar Pelangi' : 'Contoh: Meja Guru'}
              />
            </div>

            {templateProfile.showCode ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{templateProfile.codeLabel}</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={templateProfile.key === 'LIBRARY' ? 'Contoh: 9786020332956' : 'Opsional'}
                />
              </div>
            ) : null}

            {templateProfile.showBrand ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{templateProfile.brandLabel}</label>
                <input
                  type="text"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Opsional"
                />
              </div>
            ) : null}

            {attributeFields.map((field: InventoryAttributeField) => (
              <div key={field.key} className={field.type === 'textarea' ? 'col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                </label>
                {isLibraryTemplate && field.key === 'category' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={attributeValues.category || ''}
                        onChange={(e) =>
                          setAttributeValues((prev) => ({
                            ...prev,
                            category: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Pilih kategori buku</option>
                        {libraryCategoryOptions.map((categoryName) => (
                          <option key={categoryName} value={categoryName}>
                            {categoryName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        title="Hapus kategori terpilih"
                        disabled={!String(attributeValues.category || '').trim() || removeCategoryMutation.isPending}
                        onClick={() => {
                          const selected = String(attributeValues.category || '').trim();
                          if (!selected) {
                            toast.error('Pilih kategori yang ingin dihapus.');
                            return;
                          }
                          if (
                            !confirm(
                              `Hapus kategori "${selected}" dari daftar inventaris perpustakaan pada ruangan ini?`,
                            )
                          ) {
                            return;
                          }
                          removeCategoryMutation.mutate(selected);
                        }}
                        className="inline-flex items-center justify-center w-10 h-10 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCategoryCreatorOpen((prev) => !prev)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        <Plus size={12} className="mr-1" />
                        Tambah Kategori Baru
                      </button>
                      <span className="text-xs text-gray-500">
                        Daftar kategori mengikuti data inventaris yang sudah tersimpan.
                      </span>
                    </div>
                    {isCategoryCreatorOpen ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Contoh: Buku Referensi"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const value = newCategoryName.trim();
                            if (!value) {
                              toast.error('Nama kategori baru tidak boleh kosong.');
                              return;
                            }
                            setAttributeValues((prev) => ({ ...prev, category: value }));
                            setNewCategoryName('');
                            setIsCategoryCreatorOpen(false);
                          }}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          Simpan Kategori
                        </button>
                      </div>
                    ) : null}
                    {removeCategoryMutation.isPending ? (
                      <p className="text-xs text-gray-500">Menghapus kategori dari item terkait...</p>
                    ) : null}
                  </div>
                ) : field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={attributeValues[field.key] || ''}
                    onChange={(e) =>
                      setAttributeValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={field.placeholder || ''}
                  />
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={attributeValues[field.key] || ''}
                    onChange={(e) =>
                      setAttributeValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={field.placeholder || ''}
                  />
                )}
              </div>
            ))}

            <div className="col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-900 mb-3">{templateProfile.conditionLabel}</label>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-green-700 mb-1">Baik</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.goodQty}
                    onChange={(e) => setFormData({ ...formData, goodQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-yellow-700 mb-1">Rusak Ringan</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minorDamageQty}
                    onChange={(e) => setFormData({ ...formData, minorDamageQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">Rusak Berat</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.majorDamageQty}
                    onChange={(e) => setFormData({ ...formData, majorDamageQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end items-center gap-2 text-sm">
                <span className="text-gray-500">{templateProfile.quantityLabel}:</span>
                <span className="font-bold text-gray-900 text-lg">{totalQuantity}</span>
              </div>
            </div>

            {templateProfile.showPurchaseInfo ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Pembelian</label>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sumber Dana</label>
                  <input
                    type="text"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Contoh: BOS 2024, Hibah Alumni, dll"
                  />
                </div>
              </>
            ) : null}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{templateProfile.descriptionLabel}</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={
                  templateProfile.key === 'LIBRARY'
                    ? 'Contoh: Kondisi sampul baik, stok cukup'
                    : 'Keterangan tambahan...'
                }
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

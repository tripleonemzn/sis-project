import api from './api';

export interface RoomCategory {
  id: number;
  name: string;
  description?: string;
  inventoryTemplateKey?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    rooms: number;
  };
}

export interface CreateRoomCategoryPayload {
  name: string;
  description?: string;
  inventoryTemplateKey?: string;
}

export interface Room {
  id: number;
  categoryId: number;
  name: string;
  // type: 'CLASSROOM' | 'LAB' | 'SPORTS' | 'WORSHIP' | 'OFFICE' | 'OTHER'; // Deprecated
  capacity?: number;
  location?: string;
  condition?: 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT';
  description?: string;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: number;
    name: string;
    inventoryTemplateKey?: string | null;
  } | null;
  _count?: {
    items: number;
  };
}

export interface CreateRoomPayload {
  name: string;
  categoryId: number;
  capacity?: number;
  location?: string;
  condition?: string;
  description?: string;
}

export interface InventoryItem {
  id: number;
  roomId: number;
  name: string;
  code?: string;
  brand?: string;
  quantity: number;
  goodQty: number;
  minorDamageQty: number;
  majorDamageQty: number;
  condition?: 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT'; // Deprecated
  purchaseDate?: string;
  price?: number;
  source?: string;
  description?: string;
  attributes?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryPayload {
  roomId: number;
  name: string;
  code?: string;
  brand?: string;
  quantity?: number;
  goodQty: number;
  minorDamageQty: number;
  majorDamageQty: number;
  condition?: string;
  purchaseDate?: string;
  price?: number;
  source?: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

export type LibraryBorrowerStatus = 'TEACHER' | 'STUDENT';
export type LibraryReturnStatus = 'RETURNED' | 'NOT_RETURNED';
export type LibraryLoanDisplayStatus = 'BORROWED' | 'OVERDUE' | 'RETURNED';

export interface LibraryLoanClassOption {
  id: number;
  name: string;
  level: string;
  displayName: string;
  major?: {
    code?: string | null;
    name?: string | null;
  } | null;
}

export interface LibraryBookLoan {
  id: number;
  borrowDate: string;
  borrowerName: string;
  borrowerStatus: LibraryBorrowerStatus;
  classId?: number | null;
  bookTitle: string;
  publishYear?: number | null;
  returnDate?: string | null;
  returnStatus: LibraryReturnStatus;
  displayStatus?: LibraryLoanDisplayStatus;
  statusLabel?: string;
  overdueDays?: number;
  isOverdue?: boolean;
  finePerDay?: number;
  fineAmount?: number;
  phoneNumber?: string | null;
  createdById?: number | null;
  createdAt: string;
  updatedAt: string;
  class?: {
    id: number;
    name: string;
    level: string;
    major?: {
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
}

export interface LibraryLoanSettings {
  finePerDay: number;
  updatedAt?: string;
}

export const inventoryService = {
  // Categories
  getRoomCategories: async () => {
    const response = await api.get('/inventory/categories');
    return response.data;
  },

  createRoomCategory: async (data: CreateRoomCategoryPayload) => {
    const response = await api.post('/inventory/categories', data);
    return response.data;
  },

  updateRoomCategory: async (id: number, data: Partial<CreateRoomCategoryPayload>) => {
    const response = await api.put(`/inventory/categories/${id}`, data);
    return response.data;
  },

  deleteRoomCategory: async (id: number) => {
    const response = await api.delete(`/inventory/categories/${id}`);
    return response.data;
  },

  // Rooms
  getRooms: async (params?: { categoryId?: number }) => {
    const response = await api.get('/inventory/rooms', { params });
    return response.data;
  },

  getRoom: async (id: number) => {
    const response = await api.get(`/inventory/rooms/${id}`);
    return response.data;
  },

  createRoom: async (data: CreateRoomPayload) => {
    const response = await api.post('/inventory/rooms', data);
    return response.data;
  },

  updateRoom: async (id: number, data: Partial<CreateRoomPayload>) => {
    const response = await api.put(`/inventory/rooms/${id}`, data);
    return response.data;
  },

  deleteRoom: async (id: number) => {
    const response = await api.delete(`/inventory/rooms/${id}`);
    return response.data;
  },

  // Inventory Items
  getInventoryByRoom: async (roomId: number) => {
    const response = await api.get(`/inventory/rooms/${roomId}/inventory`);
    return response.data;
  },

  createInventory: async (data: CreateInventoryPayload) => {
    const response = await api.post('/inventory/inventory', data);
    return response.data;
  },

  updateInventory: async (id: number, data: Partial<CreateInventoryPayload>) => {
    const response = await api.put(`/inventory/inventory/${id}`, data);
    return response.data;
  },

  deleteInventory: async (id: number) => {
    const response = await api.delete(`/inventory/inventory/${id}`);
    return response.data;
  },

  listLibraryLoanClassOptions: async () => {
    const response = await api.get('/inventory/library-loans/classes');
    return response.data;
  },

  listLibraryBookLoans: async (params?: { q?: string }) => {
    const response = await api.get('/inventory/library-loans', { params });
    return response.data;
  },

  getLibraryLoanSettings: async () => {
    const response = await api.get('/inventory/library-loans/settings');
    return response.data;
  },

  updateLibraryLoanSettings: async (data: { finePerDay: number }) => {
    const response = await api.put('/inventory/library-loans/settings', data);
    return response.data;
  },

  createLibraryBookLoan: async (data: {
    borrowDate: string;
    borrowerName: string;
    borrowerStatus: LibraryBorrowerStatus;
    classId?: number | null;
    bookTitle: string;
    publishYear?: number;
    returnDate?: string | null;
    returnStatus?: LibraryReturnStatus;
    phoneNumber?: string;
  }) => {
    const response = await api.post('/inventory/library-loans', data);
    return response.data;
  },

  updateLibraryBookLoan: async (
    id: number,
    data: Partial<{
      borrowDate: string;
      borrowerName: string;
      borrowerStatus: LibraryBorrowerStatus;
      classId: number | null;
      bookTitle: string;
      publishYear: number;
      returnDate: string | null;
      returnStatus: LibraryReturnStatus;
      phoneNumber: string;
    }>,
  ) => {
    const response = await api.put(`/inventory/library-loans/${id}`, data);
    return response.data;
  },

  deleteLibraryBookLoan: async (id: number) => {
    const response = await api.delete(`/inventory/library-loans/${id}`);
    return response.data;
  },
};

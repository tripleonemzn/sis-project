import api from './api';

export interface RoomCategory {
  id: number;
  name: string;
  description?: string;
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
};

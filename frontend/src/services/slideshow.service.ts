import api from './api';

export interface SlideshowSlide {
  id: string;
  filename: string;
  url: string;
  description: string;
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type SlideshowListPayload = {
  slides: SlideshowSlide[];
  settings?: {
    slideIntervalMs?: number;
  };
};

type SlideshowWritePayload = {
  slide?: SlideshowSlide;
  slides: SlideshowSlide[];
};

export const slideshowService = {
  listSlides: async () => {
    const response = await api.get<ApiEnvelope<SlideshowListPayload>>('/gallery/slides');
    return response.data;
  },

  uploadSlide: async (
    file: File,
    payload?: {
      description?: string;
      isActive?: boolean;
    },
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (typeof payload?.description === 'string') {
      formData.append('description', payload.description);
    }
    if (typeof payload?.isActive === 'boolean') {
      formData.append('isActive', payload.isActive ? 'true' : 'false');
    }

    const response = await api.post<ApiEnvelope<SlideshowWritePayload>>('/gallery/slides/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  updateSlide: async (
    id: string,
    payload: Partial<Pick<SlideshowSlide, 'description' | 'isActive' | 'order'>>,
  ) => {
    const response = await api.patch<ApiEnvelope<SlideshowWritePayload>>(`/gallery/slides/${id}`, payload);
    return response.data;
  },

  reorderSlides: async (ids: string[]) => {
    const response = await api.patch<ApiEnvelope<SlideshowListPayload>>('/gallery/slides/reorder', { ids });
    return response.data;
  },

  deleteSlide: async (id: string) => {
    const response = await api.delete<ApiEnvelope<{ deletedId: string; slides: SlideshowSlide[] }>>(`/gallery/slides/${id}`);
    return response.data;
  },

  updateSettings: async (settings: { slideIntervalMs: number }) => {
    const response = await api.patch<ApiEnvelope<{ settings: { slideIntervalMs: number } }>>('/gallery/settings', settings);
    return response.data;
  },
};
